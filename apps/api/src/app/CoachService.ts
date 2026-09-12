import type { PrismaClient } from '@prisma/client'
import {
  type AttemptNotes,
  type CriterionResult,
  type MicroLesson,
  type Stage,
} from '@lld/contracts'
import type { EvaluationContext } from '../evaluation/Evaluator.js'
import type { LlmClient } from '../evaluation/llm/LlmClient.js'
import { NoteStore } from '../coach/NoteStore.js'
import { Reviewer } from '../coach/Reviewer.js'
import { LessonWriter } from '../coach/Lesson.js'
import { COACH_PROMPT_VERSION } from '../coach/prompts.js'
import type { ContentStore } from '../infra/content/ContentStore.js'

/** What the coach needs from an attempt: the same context the evaluators saw, plus their results. */
export type ContextLoader = (
  attemptId: string,
  stage: Stage,
) => Promise<{ ctx: EvaluationContext; results: CriterionResult[]; learnerId: string } | null>

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

  constructor(
    prisma: PrismaClient,
    private readonly content: ContentStore,
    private readonly loadContext: ContextLoader,
    private readonly llm: LlmClient,
  ) {
    this.notes = new NoteStore(prisma)
    this.reviewer = new Reviewer(llm)
    this.lessons = new LessonWriter(llm)
  }

  get live(): boolean {
    return !this.llm.id.startsWith('stub')
  }

  /** Called once a stage's evaluation has landed. Idempotent by content. */
  async reviewStage(attemptId: string, stage: Stage): Promise<{ text: string; modelId: string } | null> {
    const loaded = await this.loadContext(attemptId, stage)
    if (!loaded) return null
    const { ctx, results, learnerId } = loaded
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
  async lessonFor(attemptId: string, criterionId: string): Promise<(MicroLesson & { conceptId: string; modelId: string }) | null> {
    const stage = await this.stageOf(attemptId, criterionId)
    if (!stage) return null
    const loaded = await this.loadContext(attemptId, stage)
    if (!loaded) return null
    const { ctx, results, learnerId } = loaded

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
  async notesFor(attemptId: string, results: CriterionResult[]): Promise<AttemptNotes> {
    const rows = await this.notes.forAttempt(attemptId)
    const review: AttemptNotes['review'] = {}
    const lessons: AttemptNotes['lessons'] = {}
    for (const row of rows) {
      const json = JSON.parse(row.json) as Record<string, unknown>
      if (row.kind === 'review' && row.stage) {
        review[row.stage as Stage] = { text: String(json.text ?? ''), modelId: row.modelId }
      } else if (row.kind === 'lesson' && row.refId) {
        lessons[row.refId] = { ...(json as MicroLesson & { conceptId: string }), modelId: row.modelId }
      }
    }
    return {
      review,
      lessons,
      lessonable: results.filter((r) => r.score <= LESSON_THRESHOLD).map((r) => r.criterionId),
      live: this.live,
    }
  }

  private async stageOf(attemptId: string, criterionId: string): Promise<Stage | null> {
    // The criterion's stage is fixed by the rubric; the attempt only needs to have reached it.
    const problemRubric = this.content.rubricFor(this.content.listProblems()[0]!)
    const criterion = problemRubric.criteria.find((c) => c.id === criterionId)
    if (!criterion) return null
    const loaded = await this.loadContext(attemptId, criterion.stage)
    return loaded ? criterion.stage : null
  }
}
