import type { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import {
  MAX_LEARNER_TURNS,
  type AttemptNotes,
  type CriterionResult,
  type DialogueTurn,
  type MicroLesson,
  type Probe,
  type Stage,
} from '@lld/contracts'
import { Dialogue } from '../coach/Dialogue.js'
import { Explainer } from '../coach/Explainer.js'
import { Coach, type CoachInput } from '../coach/Coach.js'
import type { EvaluationContext } from '../evaluation/Evaluator.js'
import type { LlmClient } from '../evaluation/llm/LlmClient.js'
import { NoteStore } from '../coach/NoteStore.js'
import { Reviewer } from '../coach/Reviewer.js'
import { LessonWriter } from '../coach/Lesson.js'
import { COACH_PROMPT_VERSION } from '../coach/prompts.js'
import { errorFields, log } from '../infra/log.js'
import type { ContentStore } from '../infra/content/ContentStore.js'

/** What the coach needs from an attempt: the same context the evaluators saw, plus their results. */
export type ContextLoader = (
  learnerId: string,
  attemptId: string,
  stage: Stage,
) => Promise<{ ctx: EvaluationContext; results: CriterionResult[]; learnerId: string } | null>

/** The defend stage while it is open: which probes were asked, on what design. */
export type DefendLoader = (learnerId: string, attemptId: string) => Promise<{ ctx: EvaluationContext; probes: Probe[] } | null>

export class DialogueClosedError extends Error {
  readonly code = 'DIALOGUE_CLOSED' as const
  constructor(message: string) {
    super(message)
    this.name = 'DialogueClosedError'
  }
}

export const LESSON_THRESHOLD = 2

/**
 * The mentor, as the application sees it: notes after each stage, lessons on
 * request. Nothing here touches a score. Every generated text goes through the
 * NoteStore, so the second read of anything is free, and a model failure leaves
 * an absence the UI can show honestly rather than an error the attempt inherits.
 */
export class CoachService {
  private readonly notes: NoteStore
  private readonly reviewer: Reviewer
  private readonly lessons: LessonWriter
  private readonly dialogue: Dialogue
  private readonly explainer: Explainer
  private readonly coach: Coach

  constructor(
    private readonly prisma: PrismaClient,
    private readonly content: ContentStore,
    private readonly loadContext: ContextLoader,
    private readonly llm: LlmClient,
    private readonly loadDefend: DefendLoader = async () => null,
  ) {
    this.notes = new NoteStore(prisma)
    this.reviewer = new Reviewer(llm)
    this.lessons = new LessonWriter(llm)
    this.dialogue = new Dialogue(llm)
    this.explainer = new Explainer(llm)
    this.coach = new Coach(llm)
  }

  /* --------------------------------------------------------------------- */
  /* Explain a finding                                                      */
  /* --------------------------------------------------------------------- */

  async explain(learnerId: string, attemptId: string, criterionId: string): Promise<{ text: string; modelId: string } | null> {
    const stage = await this.stageOf(learnerId, attemptId, criterionId)
    if (!stage) return null
    const loaded = await this.loadContext(learnerId, attemptId, stage)
    if (!loaded) return null
    const result = loaded.results.find((r) => r.criterionId === criterionId)
    if (!result) return null
    const key = NoteStore.key('explain', COACH_PROMPT_VERSION, {
      criterionId,
      design: loaded.ctx.design,
      score: result.score,
      concern: result.concern,
    })
    return this.notes.getOrGenerate({ kind: 'explain', key, learnerId: loaded.learnerId, attemptId, stage, refId: criterionId }, () =>
      this.explainer.explain(loaded.ctx, result),
    )
  }

  /* --------------------------------------------------------------------- */
  /* The coach across problems                                              */
  /* --------------------------------------------------------------------- */

  async coachNote(learnerId: string, input: CoachInput): Promise<{ text: string; modelId: string } | null> {
    if (input.attempts === 0) return null
    // Keyed by the numbers the note is about, so it regenerates exactly when a
    // new evaluation could change what it should say.
    const key = NoteStore.key('coach', COACH_PROMPT_VERSION, {
      learnerId,
      attempts: input.attempts,
      averages: input.criterionAverages,
      weaknesses: input.weaknesses.map((w) => [w.criterionId, w.occurrences]),
      next: input.next?.problemId ?? null,
    })
    return this.notes.getOrGenerate({ kind: 'coach', key, learnerId }, () => this.coach.note(input))
  }

  /* --------------------------------------------------------------------- */
  /* Defend as a dialogue                                                   */
  /* --------------------------------------------------------------------- */

  async transcripts(attemptId: string): Promise<Record<string, DialogueTurn[]>> {
    const rows = await this.prisma.dialogueTurn.findMany({ where: { attemptId }, orderBy: [{ probeId: 'asc' }, { turn: 'asc' }] })
    const out: Record<string, DialogueTurn[]> = {}
    for (const row of rows) {
      ;(out[row.probeId] ??= []).push({ role: row.role as DialogueTurn['role'], text: row.text })
    }
    return out
  }

  /**
   * The learner speaks; the mentor may answer with one question. Turn limits are
   * enforced here, not in the client: after the second learner turn the probe is
   * closed and a third is refused.
   */
  async turn(learnerId: string, attemptId: string, probeId: string, text: string): Promise<{ transcript: DialogueTurn[]; closed: boolean }> {
    const loaded = await this.loadDefend(learnerId, attemptId)
    if (!loaded) throw new DialogueClosedError('The defend stage is not open on this attempt')
    const probe = loaded.probes.find((p) => p.id === probeId)
    if (!probe) throw new DialogueClosedError(`Probe "${probeId}" was not asked on this attempt`)

    const existing = (await this.transcripts(attemptId))[probeId] ?? []
    const learnerTurns = existing.filter((t) => t.role === 'learner').length
    if (learnerTurns >= MAX_LEARNER_TURNS) throw new DialogueClosedError('This question is finished')

    const transcript = [...existing, { role: 'learner' as const, text: text.trim() }]
    await this.prisma.dialogueTurn.create({
      data: { id: randomUUID(), attemptId, probeId, turn: existing.length, role: 'learner', text: text.trim() },
    })

    // One follow-up, after the first answer only. A follow-up that fails its own
    // rules is simply not asked; the probe ends at one turn.
    if (learnerTurns === 0) {
      const followUp = await this.dialogue.followUp(loaded.ctx, probe, transcript).catch((error: unknown) => {
        log('warn', 'no follow-up', { attemptId, probeId, ...errorFields(error) })
        return null
      })
      if (followUp) {
        await this.prisma.dialogueTurn.create({
          data: {
            id: randomUUID(),
            attemptId,
            probeId,
            turn: transcript.length,
            role: 'mentor',
            text: followUp.question,
            inputTokens: followUp.usage?.inputTokens ?? null,
            outputTokens: followUp.usage?.outputTokens ?? null,
          },
        })
        transcript.push({ role: 'mentor', text: followUp.question })
        return { transcript, closed: false }
      }
    }
    return { transcript, closed: true }
  }

  get live(): boolean {
    return !this.llm.id.startsWith('stub')
  }

  /** Called once a stage's evaluation has landed. Idempotent by content. */
  async reviewStage(learnerId: string, attemptId: string, stage: Stage): Promise<{ text: string; modelId: string } | null> {
    const loaded = await this.loadContext(learnerId, attemptId, stage)
    if (!loaded) return null
    const { ctx, results } = loaded
    const key = NoteStore.key('review', COACH_PROMPT_VERSION, {
      stage,
      design: ctx.design,
      results: results.map((r) => [r.criterionId, r.score, r.concern]),
    })
    return this.notes.getOrGenerate({ kind: 'review', key, learnerId, attemptId, stage }, () =>
      this.reviewer.note(ctx, results),
    )
  }

  /** A lesson on the concept behind one low-scoring criterion. */
  async lessonFor(learnerId: string, attemptId: string, criterionId: string): Promise<(MicroLesson & { conceptId: string; modelId: string }) | null> {
    const stage = await this.stageOf(learnerId, attemptId, criterionId)
    if (!stage) return null
    const loaded = await this.loadContext(learnerId, attemptId, stage)
    if (!loaded) return null
    const { ctx, results } = loaded

    const result = results.find((r) => r.criterionId === criterionId)
    if (!result || result.score > LESSON_THRESHOLD) return null
    const criterion = ctx.rubric.criteria.find((c) => c.id === criterionId)
    const concept = this.content.listConcepts().find((c) => c.id === criterion?.conceptIds[0])
    if (!concept) return null

    const key = NoteStore.key('lesson', COACH_PROMPT_VERSION, {
      conceptId: concept.id,
      criterionId,
      design: ctx.design,
      concern: result.concern,
    })
    const lesson = await this.notes.getOrGenerate<MicroLesson & { conceptId: string; modelId: string }>(
      { kind: 'lesson', key, learnerId, attemptId, stage, refId: criterionId },
      async () => {
        const written = await this.lessons.write(ctx, concept, result)
        return written ? { ...written, conceptId: concept.id } : null
      },
    )
    return lesson
  }

  /** Everything the report can show, from the cache only — never triggers a call. */
  async notesFor(learnerId: string, attemptId: string, results: CriterionResult[]): Promise<AttemptNotes> {
    const rows = await this.notes.forAttempt(learnerId, attemptId)
    const review: AttemptNotes['review'] = {}
    const lessons: AttemptNotes['lessons'] = {}
    const explanations: AttemptNotes['explanations'] = {}
    for (const row of rows) {
      const json = JSON.parse(row.json) as Record<string, unknown>
      if (row.kind === 'review' && row.stage) {
        review[row.stage as Stage] = { text: String(json.text ?? ''), modelId: row.modelId }
      } else if (row.kind === 'lesson' && row.refId) {
        lessons[row.refId] = { ...(json as MicroLesson & { conceptId: string }), modelId: row.modelId }
      } else if (row.kind === 'explain' && row.refId) {
        explanations[row.refId] = { text: String(json.text ?? ''), modelId: row.modelId }
      }
    }
    return {
      review,
      lessons,
      explanations,
      lessonable: results.filter((r) => r.score <= LESSON_THRESHOLD).map((r) => r.criterionId),
      live: this.live,
    }
  }

  private async stageOf(learnerId: string, attemptId: string, criterionId: string): Promise<Stage | null> {
    // The criterion's stage is fixed by the rubric; the attempt only needs to have reached it.
    const problemRubric = this.content.rubricFor(this.content.listProblems()[0]!)
    const criterion = problemRubric.criteria.find((c) => c.id === criterionId)
    if (!criterion) return null
    const loaded = await this.loadContext(learnerId, attemptId, criterion.stage)
    return loaded ? criterion.stage : null
  }
}
