import { createHash, randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import {
  ADVANCEABLE_STATES,
  nextStage,
  STAGES,
  submissionPayloadSchema,
  type ActivityMonth,
  type Attempt,
  type AttemptState,
  type AttemptSummary,
  type ConceptsPayload,
  type CriterionResult,
  type CritiqueVerdict,
  type DesignModel,
  type DialogueTurn,
  type EvaluationReport,
  type FieldError,
  type HiddenChange,
  type NextProblemSuggestion,
  type Probe,
  type ProbeAnswer,
  type Problem,
  type ProgressPayload,
  type PublicCritiquePair,
  type RawStageInput,
  type RecurringWeakness,
  type Stage,
  type SubmissionPayload,
} from '@lld/contracts'
import { assertTransition } from '../domain/attempt/AttemptStateMachine.js'
import { DesignGraph } from '../domain/design/DesignGraph.js'
import { scoresByCriterion, summarise } from '../domain/feedback/ScoreAggregator.js'
import { detectRecurringWeaknesses } from '../domain/feedback/RecurringWeakness.js'
import { conceptMastery, streakDays } from '../domain/feedback/ConceptMastery.js'
import { selectProbes } from '../domain/feedback/ProbeSelector.js'
import { suggestNextProblem } from '../domain/feedback/NextProblem.js'
import {
  StructuredDesignParser,
  toRawStructuredSubmission,
} from '../submission/StructuredDesignParser.js'
import { EvaluationPipeline } from '../evaluation/EvaluationPipeline.js'
import type { EvaluationContext } from '../evaluation/Evaluator.js'
import { RuleEvaluator } from '../evaluation/rules/RuleEvaluator.js'
import { LlmEvaluator } from '../evaluation/llm/LlmEvaluator.js'
import { resolveLlmClient, type LlmClient } from '../evaluation/llm/index.js'
import { PROMPT_VERSION } from '../evaluation/llm/PromptBuilder.js'
import type { ContentStore } from '../infra/content/ContentStore.js'
import type { JobQueue } from '../infra/queue/InProcessQueue.js'

/**
 * Orchestrates the practice loop.
 *
 * One attempt runs the loop up to three times — design, change, defend — and each
 * pass has the same shape: a draft, a frozen submission written before anything is
 * queued, an evaluation, a report. The state machine is per pass; the stage is the
 * second axis. Nothing about persistence, idempotency or partial failure had to
 * change to add stages, which is the point of keeping those concerns in one place.
 *
 * Note there is no repository interface between this and Prisma. The domain is
 * already pure and framework-free; wrapping a single database behind a port we
 * would never swap would be indirection with nothing on the other side of it —
 * the abstraction has to earn its place, and this one does not.
 */

export class InvalidSubmissionError extends Error {
  readonly code = 'INVALID_SUBMISSION' as const
  constructor(readonly fields: FieldError[]) {
    super('The submission has errors')
    this.name = 'InvalidSubmissionError'
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const
  constructor(what: string) {
    super(`${what} not found`)
    this.name = 'NotFoundError'
  }
}

export class WrongStageError extends Error {
  readonly code = 'WRONG_STAGE' as const
  constructor(expected: Stage, got: Stage) {
    super(`This attempt is at the ${expected} stage; cannot accept ${got} input`)
    this.name = 'WrongStageError'
  }
}

type AttemptRow = Prisma.AttemptGetPayload<{ include: { submissions: true; evaluations: true } }>
const WITH_ALL = { submissions: true, evaluations: true } as const

const STAGE_ORDER = new Map(STAGES.map((s, i) => [s, i]))

export class PracticeService {
  private readonly parser = new StructuredDesignParser()
  private readonly pipeline: EvaluationPipeline

  /**
   * Fires after a stage's evaluation is stored. The coach hangs off this; it is a
   * callback rather than a dependency so the practice loop knows nothing about
   * mentoring and a coach failure can never touch an attempt's state.
   */
  onEvaluated: ((learnerId: string, attemptId: string, stage: Stage) => void) | null = null

  constructor(
    private readonly prisma: PrismaClient,
    private readonly content: ContentStore,
    private readonly queue: JobQueue,
    llm: LlmClient = resolveLlmClient(),
  ) {
    this.pipeline = new EvaluationPipeline([new RuleEvaluator(), new LlmEvaluator(llm)])
  }

  /* --------------------------------------------------------------------- */
  /* Starting and drafting                                                  */
  /* --------------------------------------------------------------------- */

  async startAttempt(learnerId: string, problemId: string): Promise<Attempt> {
    const problem = this.requireProblem(problemId)

    const priorCount = await this.prisma.attempt.count({ where: { learnerId, problemId } })

    // Prefill from the last attempt's final design: the learner is revising, not
    // retyping fifteen rows, and friction here is where practice habits die.
    const previous = await this.prisma.attempt.findFirst({
      where: { learnerId, problemId, submissions: { some: {} } },
      orderBy: { attemptNumber: 'desc' },
      include: WITH_ALL,
    })
    const seed = previous ? latestDesign(previous) : null

    // Deal a change now, reveal it later. Rotating by attempt number means a second
    // attempt at the same problem meets a different change.
    const change = problem.hiddenChanges[priorCount % problem.hiddenChanges.length]!

    const row = await this.prisma.attempt.create({
      data: {
        id: randomUUID(),
        problemId: problem.id,
        learnerId,
        stage: 'design' satisfies Stage,
        state: 'DRAFT' satisfies AttemptState,
        attemptNumber: priorCount + 1,
        changeId: change.id,
        draftsJson: seed
          ? JSON.stringify({ design: { stage: 'design', submission: toRawStructuredSubmission(seed) } })
          : null,
      },
      include: WITH_ALL,
    })

    return this.toAttempt(row, problem)
  }

  /**
   * Every attempt-addressed operation loads its row through here, scoped to the
   * learner asking. A row that exists but belongs to someone else is not found —
   * not forbidden — so an attempt id cannot be probed for existence. There is no
   * other way to load an attempt by id on a learner's behalf, on purpose.
   */
  private async owned(learnerId: string, attemptId: string): Promise<AttemptRow> {
    const row = await this.prisma.attempt.findFirst({ where: { id: attemptId, learnerId }, include: WITH_ALL })
    if (!row) throw new NotFoundError('Attempt')
    return row
  }

  async saveDraft(learnerId: string, attemptId: string, input: RawStageInput): Promise<void> {
    const row = await this.owned(learnerId, attemptId)
    if (row.state !== 'DRAFT') return // Autosave after submit is a no-op, not an error.
    if (row.stage !== input.stage) throw new WrongStageError(row.stage as Stage, input.stage)

    const drafts = parseDrafts(row.draftsJson)
    drafts[input.stage] = input
    await this.prisma.attempt.update({
      where: { id: attemptId },
      data: { draftsJson: JSON.stringify(drafts) },
    })
  }

  /** The raw draft for the current stage, for prefilling the workspace. */
  async getDraft(learnerId: string, attemptId: string): Promise<RawStageInput | null> {
    const row = await this.owned(learnerId, attemptId)
    return parseDrafts(row.draftsJson)[row.stage as Stage] ?? null
  }

  /* --------------------------------------------------------------------- */
  /* Submitting                                                             */
  /* --------------------------------------------------------------------- */

  async submit(learnerId: string, attemptId: string, input: RawStageInput, idempotencyKey: string): Promise<Attempt> {
    const row = await this.owned(learnerId, attemptId)
    const problem = this.requireProblem(row.problemId)
    const stage = row.stage as Stage

    if (input.stage !== stage) throw new WrongStageError(stage, input.stage)

    // A replayed key returns what already happened. A double-tapped button, a retry
    // after a dropped connection and an impatient refresh must cost one evaluation.
    const existing = row.submissions.find((s) => s.stage === stage)
    if (existing && existing.idempotencyKey === idempotencyKey) {
      return this.toAttempt(row, problem)
    }

    const payload = await this.parseInput(input, row, problem)
    assertTransition(row.state as AttemptState, 'SUBMITTED')

    const fingerprint = fingerprintOf(payload)
    let unchanged = false
    if (stage === 'design') {
      const previous = await this.prisma.submission.findFirst({
        where: {
          stage: 'design',
          attempt: { learnerId: row.learnerId, problemId: row.problemId, attemptNumber: { lt: row.attemptNumber } },
        },
        orderBy: { attempt: { attemptNumber: 'desc' } },
      })
      unchanged = previous?.fingerprint === fingerprint
    }

    // Written BEFORE anything is queued. If every evaluator dies, the learner's
    // work is still here and the attempt is retryable.
    await this.prisma.submission.upsert({
      where: { attemptId_stage: { attemptId, stage } },
      create: {
        id: randomUUID(),
        attemptId,
        stage,
        format: this.parser.format,
        payloadJson: JSON.stringify(payload),
        fingerprint,
        idempotencyKey,
      },
      update: {
        payloadJson: JSON.stringify(payload),
        fingerprint,
        idempotencyKey,
        submittedAt: new Date(),
      },
    })

    const updated = await this.prisma.attempt.update({
      where: { id: attemptId },
      data: { state: 'SUBMITTED' satisfies AttemptState, failureReason: null },
      include: WITH_ALL,
    })

    this.queue.enqueue(() => this.evaluate(attemptId, stage, unchanged), { id: `${attemptId}:${stage}` })

    return this.toAttempt(updated, problem)
  }

  /** Re-queues a failed stage. The submission was persisted, so nothing is re-collected. */
  async retry(learnerId: string, attemptId: string): Promise<Attempt> {
    const row = await this.owned(learnerId, attemptId)

    assertTransition(row.state as AttemptState, 'SUBMITTED')

    const updated = await this.prisma.attempt.update({
      where: { id: attemptId },
      data: { state: 'SUBMITTED' satisfies AttemptState, failureReason: null },
      include: WITH_ALL,
    })
    const stage = row.stage as Stage
    this.queue.enqueue(() => this.evaluate(attemptId, stage, false), { id: `${attemptId}:${stage}` })
    return this.toAttempt(updated, this.requireProblem(row.problemId))
  }

  /**
   * Opens the next stage. Only allowed once the current stage has a report — the
   * change must not be revealed before the design is frozen and evaluated.
   */
  async advance(learnerId: string, attemptId: string): Promise<Attempt> {
    const row = await this.owned(learnerId, attemptId)
    const problem = this.requireProblem(row.problemId)

    const stage = row.stage as Stage
    const next = nextStage(stage)
    if (!next) throw new WrongStageError(stage, stage)
    if (!ADVANCEABLE_STATES.includes(row.state as AttemptState)) {
      assertTransition(row.state as AttemptState, 'DRAFT') // throws with the right message
    }

    const drafts = parseDrafts(row.draftsJson)
    if (next === 'change') {
      const design = latestDesign(row)
      drafts.change = {
        stage: 'change',
        submission: design ? toRawStructuredSubmission(design) : { format: 'structured-design' } as never,
        rationale: '',
      }
    } else {
      drafts.defend = { stage: 'defend', answers: [] }
    }

    const updated = await this.prisma.attempt.update({
      where: { id: attemptId },
      data: {
        stage: next,
        state: 'DRAFT' satisfies AttemptState,
        attempts: 0,
        failureReason: null,
        draftsJson: JSON.stringify(drafts),
      },
      include: WITH_ALL,
    })
    return this.toAttempt(updated, problem)
  }

  private async parseInput(input: RawStageInput, row: AttemptRow, problem: Problem): Promise<SubmissionPayload> {
    switch (input.stage) {
      case 'design': {
        const parsed = this.parser.parse(input.submission)
        if (!parsed.ok) throw new InvalidSubmissionError(parsed.errors)
        return { stage: 'design', design: parsed.design }
      }
      case 'change': {
        const parsed = this.parser.parse(input.submission)
        if (!parsed.ok) throw new InvalidSubmissionError(parsed.errors)
        return {
          stage: 'change',
          changeId: row.changeId ?? problem.hiddenChanges[0]!.id,
          design: parsed.design,
          rationale: input.rationale.trim(),
        }
      }
      case 'defend': {
        // Only answers to probes this learner was actually asked survive. Where a
        // dialogue happened, it is the answer: the learner's turns joined, with the
        // full exchange kept for the evaluator to read.
        const asked = new Set(this.probesFor(row, problem).map((p) => p.id))
        const dialogue = (await this.transcriptsOf?.(row.id)) ?? {}
        const answers = input.answers
          .filter((a) => asked.has(a.probeId))
          .map((a) => ({ ...a, transcript: a.transcript ?? [] }))
        for (const probeId of asked) {
          const transcript = dialogue[probeId]
          if (!transcript || transcript.length === 0) continue
          const response = transcript.filter((t) => t.role === 'learner').map((t) => t.text).join('\n\n')
          const i = answers.findIndex((a) => a.probeId === probeId)
          const merged = { probeId, response, transcript }
          if (i === -1) answers.push(merged)
          else answers[i] = merged
        }
        return { stage: 'defend', answers }
      }
    }
  }

  /* --------------------------------------------------------------------- */
  /* Evaluating                                                             */
  /* --------------------------------------------------------------------- */

  private async evaluate(attemptId: string, stage: Stage, unchanged: boolean): Promise<void> {
    const row = await this.prisma.attempt.findUnique({ where: { id: attemptId }, include: WITH_ALL })
    if (!row || row.stage !== stage) return
    const submission = row.submissions.find((s) => s.stage === stage)
    if (!submission) return

    if (row.state === 'SUBMITTED') {
      assertTransition('SUBMITTED', 'EVALUATING')
      await this.prisma.attempt.update({
        where: { id: attemptId },
        data: { state: 'EVALUATING' satisfies AttemptState, attempts: { increment: 1 } },
      })
    }

    const problem = this.requireProblem(row.problemId)
    const rubric = this.content.rubricFor(problem)
    const ctx = this.contextFor(stage, row, problem)
    const outcome = await this.pipeline.run({ ...ctx, rubric })

    // Nothing scored at all is a real failure. Anything scored is a report worth
    // showing, with an honest note about what is missing.
    if (outcome.results.length === 0) {
      await this.prisma.attempt.update({
        where: { id: attemptId },
        data: {
          state: 'FAILED' satisfies AttemptState,
          failureReason: outcome.failures.map((f) => f.reason).join('; ') || 'No evaluator produced a result',
        },
      })
      throw new Error('Evaluation produced no results')
    }

    const summary = summarise(outcome.results, rubric, [stage])

    await this.prisma.evaluation.upsert({
      where: { attemptId_stage: { attemptId, stage } },
      create: {
        id: randomUUID(),
        attemptId,
        stage,
        rubricId: rubric.id,
        rubricVersion: rubric.version,
        promptVersion: PROMPT_VERSION,
        evaluatorIds: [...new Set(outcome.results.map((r) => r.evaluatorId))].join(','),
        resultsJson: JSON.stringify(outcome.results),
        summaryJson: JSON.stringify(summary),
        unchangedFromPrevious: unchanged,
        inputTokens: outcome.usage?.inputTokens ?? null,
        outputTokens: outcome.usage?.outputTokens ?? null,
      },
      update: {
        resultsJson: JSON.stringify(outcome.results),
        summaryJson: JSON.stringify(summary),
        unchangedFromPrevious: unchanged,
        inputTokens: outcome.usage?.inputTokens ?? null,
        outputTokens: outcome.usage?.outputTokens ?? null,
        completedAt: new Date(),
      },
    })

    await this.prisma.attempt.update({
      where: { id: attemptId },
      data: {
        state: (summary.aiUnavailable ? 'COMPLETED_PARTIAL' : 'COMPLETED') satisfies AttemptState,
        failureReason: outcome.failures.map((f) => f.reason).join('; ') || null,
      },
    })

    this.onEvaluated?.(row.learnerId, attemptId, stage)
  }

  /** The defend stage while it is open — for the dialogue. Null before or after. */
  async loadDefend(learnerId: string, attemptId: string): Promise<{ ctx: EvaluationContext; probes: Probe[] } | null> {
    // Not-found for someone else's attempt; null only for the owner's attempt
    // when the defend stage is not open. The two must stay distinguishable, or
    // a non-owner learns what stage the attempt is at from the status code.
    const row = await this.owned(learnerId, attemptId)
    if (row.stage !== 'defend' || row.state !== 'DRAFT') return null
    const problem = this.requireProblem(row.problemId)
    const ctx = { ...this.contextFor('defend', row, problem), rubric: this.content.rubricFor(problem) }
    return { ctx, probes: [...(ctx.probes ?? [])] }
  }

  /** Supplied by the coach so the defend submission can be built from the dialogue. */
  transcriptsOf: ((attemptId: string) => Promise<Record<string, DialogueTurn[]>>) | null = null

  /**
   * The context an evaluator saw for a completed stage, with its results — what
   * the coach reads. Null until that stage has been evaluated.
   */
  async loadContext(
    learnerId: string,
    attemptId: string,
    stage: Stage,
  ): Promise<{ ctx: EvaluationContext; results: CriterionResult[]; learnerId: string } | null> {
    const row = await this.owned(learnerId, attemptId)
    const evaluation = row.evaluations.find((e) => e.stage === stage)
    if (!evaluation) return null
    const problem = this.requireProblem(row.problemId)
    const rubric = this.content.rubricFor(problem)
    return {
      ctx: { ...this.contextFor(stage, row, problem), rubric },
      results: JSON.parse(evaluation.resultsJson) as CriterionResult[],
      learnerId: row.learnerId,
    }
  }

  /** Assembles what each stage's evaluators are allowed to see. */
  private contextFor(stage: Stage, row: AttemptRow, problem: Problem): Omit<EvaluationContext, 'rubric'> {
    const payloads = payloadsOf(row)
    const design = payloads.design?.design
    if (!design) throw new Error('Cannot evaluate: no design-stage submission')

    const change = this.changeFor(row, problem)
    const base = { stage, problem, facets: this.parser.facets }

    switch (stage) {
      case 'design':
        return { ...base, design, graph: new DesignGraph(design) }
      case 'change': {
        const revision = payloads.change
        if (!revision) throw new Error('Cannot evaluate: no change-stage submission')
        return {
          ...base,
          design: revision.design,
          graph: new DesignGraph(revision.design),
          previousDesign: design,
          change,
          rationale: revision.rationale,
        }
      }
      case 'defend': {
        const current = payloads.change?.design ?? design
        const priorResults = resultsOf(row)
        return {
          ...base,
          design: current,
          graph: new DesignGraph(current),
          change,
          rationale: payloads.change?.rationale,
          probes: selectProbes(problem.probes, priorResults),
          answers: payloads.defend?.answers ?? [],
          priorResults,
        }
      }
    }
  }

  /* --------------------------------------------------------------------- */
  /* Reading                                                                */
  /* --------------------------------------------------------------------- */

  async getAttempt(learnerId: string, attemptId: string): Promise<Attempt> {
    const row = await this.owned(learnerId, attemptId)
    return this.toAttempt(row, this.requireProblem(row.problemId))
  }

  async getHistory(
    learnerId: string,
    problemId: string,
  ): Promise<{
    attempts: AttemptSummary[]
    recurringWeaknesses: RecurringWeakness[]
    critique: { answered: number; correct: number; total: number }
    next: NextProblemSuggestion | null
  }> {
    const problem = this.requireProblem(problemId)
    const rubric = this.content.rubricFor(problem)

    const rows = await this.prisma.attempt.findMany({
      where: { learnerId, problemId },
      include: { evaluations: true },
      orderBy: { attemptNumber: 'desc' },
    })

    const attempts: AttemptSummary[] = rows.map((row) => {
      const results = row.evaluations.flatMap((e) => JSON.parse(e.resultsJson) as CriterionResult[])
      const stagesCompleted = stagesOf(row.evaluations)
      return {
        id: row.id,
        problemId: row.problemId,
        attemptNumber: row.attemptNumber,
        stage: row.stage as Stage,
        state: row.state as AttemptState,
        stagesCompleted,
        overall: results.length > 0 ? summarise(results, rubric, stagesCompleted).overall : null,
        scores: scoresByCriterion(results),
        createdAt: row.createdAt.toISOString(),
      }
    })

    const scored = attempts.filter((a) => a.overall !== null).map((a) => ({ scores: a.scores }))
    const recurringWeaknesses = detectRecurringWeaknesses(scored, rubric)

    const critiques = await this.prisma.critique.findMany({ where: { learnerId, problemId } })
    const attempted = await this.attemptedProblemIds(learnerId)

    return {
      attempts,
      recurringWeaknesses,
      critique: {
        answered: critiques.length,
        correct: critiques.filter((c) => c.correct).length,
        total: problem.critiquePairs.length,
      },
      next: suggestNextProblem({
        current: problem,
        problems: this.content.listProblems(),
        rubric,
        weaknesses: recurringWeaknesses,
        attemptedIds: attempted,
      }),
    }
  }

  async listProblems(learnerId: string): Promise<{
    problems: ReturnType<ContentStore['toSummary']>[]
    upcoming: ReturnType<ContentStore['listUpcoming']>
    next: NextProblemSuggestion | null
  }> {
    const rows = await this.prisma.attempt.findMany({
      where: { learnerId },
      include: { evaluations: true },
      orderBy: { updatedAt: 'desc' },
    })
    const critiques = await this.prisma.critique.findMany({ where: { learnerId } })

    const problems = this.content.listProblems().map((problem) => {
      const rubric = this.content.rubricFor(problem)
      const mine = rows.filter((r) => r.problemId === problem.id)
      const scores = mine
        .map((r) => {
          const results = r.evaluations.flatMap((e) => JSON.parse(e.resultsJson) as CriterionResult[])
          return results.length > 0 ? summarise(results, rubric, stagesOf(r.evaluations)).overall : null
        })
        .filter((s): s is number => s !== null)
      const here = critiques.filter((c) => c.problemId === problem.id)
      return this.content.toSummary(
        problem,
        mine.length,
        scores.length > 0 ? Math.max(...scores) : null,
        here.filter((c) => c.correct).length,
        {
          lastAttemptAt: mine[0]?.updatedAt.toISOString() ?? null,
          critiquesAnswered: here.length,
        },
      )
    })

    // "Next for you" follows the most recently practised problem's weaknesses.
    const recent = rows.find((r) => r.evaluations.length > 0)
    const next = recent ? (await this.getHistory(learnerId, recent.problemId)).next : null

    return { problems, upcoming: this.content.listUpcoming(), next }
  }

  /* --------------------------------------------------------------------- */
  /* Progress across problems                                               */
  /* --------------------------------------------------------------------- */

  /**
   * One read for the dashboard and the progress page. Everything here is a fold
   * over data the per-problem history already exposes; the point is to show the
   * learner a curriculum, not a list of problems.
   */
  async getProgress(learnerId: string): Promise<Omit<ProgressPayload, 'coach'>> {
    const rows = await this.prisma.attempt.findMany({
      where: { learnerId },
      include: { evaluations: true, submissions: { select: { stage: true, submittedAt: true } } },
      orderBy: { createdAt: 'desc' },
    })
    const critiques = await this.prisma.critique.findMany({ where: { learnerId } })

    const recent: ProgressPayload['recent'] = []
    const activity = emptyActivity(12)
    const bucket = (at: Date) => activity.find((m) => m.month === monthKey(at))
    let practiceSeconds = 0
    const stagesCompleted = { design: 0, change: 0, defend: 0 }
    const perCriterion = new Map<string, number[]>()
    let rubric = this.content.rubricFor(this.content.listProblems()[0]!)

    for (const row of rows) {
      const problem = this.content.getProblem(row.problemId)
      if (!problem) continue
      rubric = this.content.rubricFor(problem)
      const results = resultsOf(row)
      const done = stagesOf(row.evaluations)
      for (const s of done) stagesCompleted[s] += 1
      // Activity: each stage lands in the month it was evaluated; time lands in
      // the month the attempt started. An attempt with no submission cost nothing.
      for (const e of row.evaluations) {
        const m = bucket(e.completedAt)
        if (m && (e.stage === 'design' || e.stage === 'change' || e.stage === 'defend')) m[e.stage] += 1
      }
      const seconds = attemptSeconds(row.createdAt, row.submissions.map((s) => s.submittedAt))
      practiceSeconds += seconds
      const started = bucket(row.createdAt)
      if (started) {
        started.seconds += seconds
        const split = stageSeconds(row.createdAt, row.submissions, row.evaluations)
        started.designSeconds += split.design
        started.changeSeconds += split.change
        started.defendSeconds += split.defend
      }
      const scores = scoresByCriterion(results)
      for (const [id, score] of Object.entries(scores)) {
        if (score !== undefined) perCriterion.set(id, [...(perCriterion.get(id) ?? []), score])
      }
      recent.push({
        id: row.id,
        problemId: row.problemId,
        problemTitle: problem.title,
        attemptNumber: row.attemptNumber,
        stage: row.stage as Stage,
        state: row.state as AttemptState,
        stagesCompleted: done,
        overall: results.length > 0 ? summarise(results, rubric, done).overall : null,
        scores,
        createdAt: row.createdAt.toISOString(),
      })
    }

    for (const c of critiques) {
      const m = bucket(c.createdAt)
      if (m) m.critique += 1
    }

    const scored = recent.filter((a) => a.overall !== null).map((a) => ({ scores: a.scores }))
    const overalls = recent.map((a) => a.overall).filter((o): o is number => o !== null).sort((a, b) => a - b)
    const medianOverall =
      overalls.length === 0 ? null : overalls.length % 2 ? overalls[(overalls.length - 1) / 2]! : (overalls[overalls.length / 2 - 1]! + overalls[overalls.length / 2]!) / 2
    const criterionAverages: Record<string, number> = {}
    for (const [id, list] of perCriterion) {
      criterionAverages[id] = list.reduce((a, b) => a + b, 0) / list.length
    }
    const recurringWeaknesses = detectRecurringWeaknesses(scored, rubric)

    const open = rows.find((r) => r.state === 'DRAFT' || ADVANCEABLE_STATES.includes(r.state as AttemptState))
    const openProblem = open ? this.content.getProblem(open.problemId) : undefined
    const openAttempt =
      open && openProblem && !(open.stage === 'defend' && open.state !== 'DRAFT')
        ? {
            attemptId: open.id,
            problemId: open.problemId,
            problemTitle: openProblem.title,
            stage: open.stage as Stage,
            attemptNumber: open.attemptNumber,
            startedAt: open.createdAt.toISOString(),
          }
        : null

    const mostRecentScored = rows.find((r) => r.evaluations.length > 0)
    const next = mostRecentScored ? (await this.getHistory(learnerId, mostRecentScored.problemId)).next : null

    return {
      attempts: rows.length,
      problemsTried: new Set(rows.map((r) => r.problemId)).size,
      stagesCompleted,
      criterionAverages,
      criteriaAtPar: Object.values(criterionAverages).filter((v) => v >= 3).length,
      conceptMastery: conceptMastery(scored, rubric, this.content.listConcepts()),
      streakDays: streakDays(rows.flatMap((r) => r.submissions.map((s) => s.submittedAt))),
      activity,
      practiceSeconds,
      medianOverall,
      recurringWeaknesses,
      critique: { answered: critiques.length, correct: critiques.filter((c) => c.correct).length },
      openAttempt,
      recent,
      next,
    }
  }

  async getConcepts(learnerId: string): Promise<ConceptsPayload> {
    const progress = await this.getProgress(learnerId)
    const practice: ConceptsPayload['practice'] = {}
    for (const problem of this.content.listProblems()) {
      for (const tag of problem.conceptTags) {
        practice[tag] = [...(practice[tag] ?? []), { id: problem.id, title: problem.title }]
      }
    }
    return { concepts: this.content.listConcepts(), mastery: progress.conceptMastery, practice }
  }

  /* --------------------------------------------------------------------- */
  /* Critique                                                               */
  /* --------------------------------------------------------------------- */

  async getCritique(learnerId: string, problemId: string): Promise<PublicCritiquePair[]> {
    const problem = this.requireProblem(problemId)
    const answered = await this.prisma.critique.findMany({ where: { learnerId, problemId } })

    return problem.critiquePairs.map((pair) => {
      const prior = answered.find((a) => a.pairId === pair.id)
      return {
        id: pair.id,
        question: pair.question,
        targetsConcept: pair.targetsConcept,
        left: { id: pair.left, design: problem.goldDesigns[pair.left]! },
        right: { id: pair.right, design: problem.goldDesigns[pair.right]! },
        answered: prior
          ? { design: prior.choiceDesign, className: prior.choiceClass, correct: prior.correct }
          : null,
      }
    })
  }

  async answerCritique(
    learnerId: string,
    problemId: string,
    pairId: string,
    choice: { design: string; className: string },
  ): Promise<CritiqueVerdict> {
    const problem = this.requireProblem(problemId)
    const pair = problem.critiquePairs.find((p) => p.id === pairId)
    if (!pair) throw new NotFoundError(`Critique pair "${pairId}"`)

    // The first answer is the one that counts — once the telling has been shown,
    // a second click is not a judgement.
    const prior = await this.prisma.critique.findUnique({
      where: { learnerId_problemId_pairId: { learnerId, problemId, pairId } },
    })
    if (prior) {
      return { pairId, correct: prior.correct, answer: pair.answer, telling: pair.telling }
    }

    const correct =
      choice.design === pair.answer.design &&
      choice.className.toLowerCase() === pair.answer.className.toLowerCase()

    await this.prisma.critique.create({
      data: {
        id: randomUUID(),
        learnerId,
        problemId,
        pairId,
        choiceDesign: choice.design,
        choiceClass: choice.className,
        correct,
      },
    })

    return { pairId, correct, answer: pair.answer, telling: pair.telling }
  }

  /* --------------------------------------------------------------------- */
  /* Helpers                                                                */
  /* --------------------------------------------------------------------- */

  private requireProblem(problemId: string): Problem {
    const problem = this.content.getProblem(problemId)
    if (!problem) throw new NotFoundError(`Problem "${problemId}"`)
    return problem
  }

  private changeFor(row: { changeId: string | null }, problem: Problem): HiddenChange {
    return problem.hiddenChanges.find((c) => c.id === row.changeId) ?? problem.hiddenChanges[0]!
  }

  private probesFor(row: AttemptRow, problem: Problem): Probe[] {
    return selectProbes(problem.probes, resultsOf(row))
  }

  private async attemptedProblemIds(learnerId: string): Promise<Set<string>> {
    const rows = await this.prisma.attempt.findMany({
      where: { learnerId, submissions: { some: {} } },
      select: { problemId: true },
      distinct: ['problemId'],
    })
    return new Set(rows.map((r) => r.problemId))
  }

  private async toAttempt(row: AttemptRow, problem: Problem): Promise<Attempt> {
    const payloads = payloadsOf(row)
    const stage = row.stage as Stage
    const rubric = this.content.rubricFor(problem)

    const designEvaluated = row.evaluations.some((e) => e.stage === 'design')
    const results = resultsOf(row)
    const stagesCompleted = stagesOf(row.evaluations)

    const report: EvaluationReport | null =
      row.evaluations.length > 0
        ? {
            attemptId: row.id,
            rubricId: row.evaluations[0]!.rubricId,
            rubricVersion: row.evaluations[0]!.rubricVersion,
            results,
            summary: summarise(results, rubric, stagesCompleted),
            stagesCompleted,
            completedAt: row.evaluations
              .map((e) => e.completedAt)
              .sort((a, b) => b.getTime() - a.getTime())[0]!
              .toISOString(),
            unchangedFromPrevious: row.evaluations.find((e) => e.stage === 'design')?.unchangedFromPrevious ?? false,
          }
        : null

    return {
      id: row.id,
      problemId: row.problemId,
      learnerId: row.learnerId,
      attemptNumber: row.attemptNumber,
      stage,
      state: row.state as AttemptState,
      design: payloads.design?.design ?? null,
      revision: payloads.change
        ? { changeId: payloads.change.changeId, design: payloads.change.design, rationale: payloads.change.rationale }
        : null,
      answers: payloads.defend?.answers ?? null,
      // The change is on the wire only once the design it tests has been evaluated.
      revealedChange: designEvaluated ? this.changeFor(row, problem) : null,
      probes: stage === 'defend' ? this.probesFor(row, problem) : null,
      dialogue: stage === 'defend' ? ((await this.transcriptsOf?.(row.id)) ?? {}) : null,
      exemplar: designEvaluated ? (problem.goldDesigns['strong'] ?? null) : null,
      report,
      failureReason: row.failureReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Row helpers — pure, so they can be reasoned about without a database       */
/* ------------------------------------------------------------------------- */

type Payloads = {
  design?: Extract<SubmissionPayload, { stage: 'design' }>
  change?: Extract<SubmissionPayload, { stage: 'change' }>
  defend?: Extract<SubmissionPayload, { stage: 'defend' }>
}

function payloadsOf(row: { submissions: Array<{ stage: string; payloadJson: string }> }): Payloads {
  const out: Payloads = {}
  for (const s of row.submissions) {
    const parsed = submissionPayloadSchema.parse(JSON.parse(s.payloadJson))
    if (parsed.stage === 'design') out.design = parsed
    else if (parsed.stage === 'change') out.change = parsed
    else out.defend = parsed
  }
  return out
}

/** Every result from every completed stage, in stage order then rubric order. */
function resultsOf(row: { evaluations: Array<{ stage: string; resultsJson: string }> }): CriterionResult[] {
  return [...row.evaluations]
    .sort((a, b) => (STAGE_ORDER.get(a.stage as Stage) ?? 0) - (STAGE_ORDER.get(b.stage as Stage) ?? 0))
    .flatMap((e) => JSON.parse(e.resultsJson) as CriterionResult[])
}

function stagesOf(evaluations: Array<{ stage: string }>): Stage[] {
  return STAGES.filter((s) => evaluations.some((e) => e.stage === s))
}

/** The design as the learner last left it — the revision if there is one. */
function latestDesign(row: { submissions: Array<{ stage: string; payloadJson: string }> }): DesignModel | null {
  const p = payloadsOf(row)
  return p.change?.design ?? p.design?.design ?? null
}

function parseDrafts(json: string | null): Partial<Record<Stage, RawStageInput>> {
  if (!json) return {}
  try {
    return JSON.parse(json) as Partial<Record<Stage, RawStageInput>>
  } catch {
    return {}
  }
}

function fingerprintOf(payload: SubmissionPayload): string {
  if (payload.stage === 'defend') {
    const canonical = [...payload.answers]
      .sort((a, b) => a.probeId.localeCompare(b.probeId))
      .map((a: ProbeAnswer) => `${a.probeId}:${a.response.trim().toLowerCase()}`)
      .join('|')
    return createHash('sha256').update(canonical).digest('hex')
  }
  return new DesignGraph(payload.design).fingerprint()
}

/* ------------------------------------------------------------------------- */
/* Activity helpers                                                           */
/* ------------------------------------------------------------------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** The last `n` months, oldest first, ending with the current one. */
function emptyActivity(n: number): ActivityMonth[] {
  const out: ActivityMonth[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ month: monthKey(d), label: MONTHS[d.getMonth()]!, design: 0, change: 0, defend: 0, critique: 0, seconds: 0, designSeconds: 0, changeSeconds: 0, defendSeconds: 0 })
  }
  return out
}

/**
 * Time in one attempt: start to last submission. Capped, because a draft left
 * open overnight is not eight hours of practice. Three hours is above any
 * attempt's budget and below any plausible walk-away.
 */
const ATTEMPT_CAP_SECONDS = 3 * 3600

/**
 * Per stage, the same derivation the study export uses: designing runs from
 * the attempt's start to the design submission; revising from the design
 * report landing to the change submission; defending from the change report
 * to the defend submission. Each leg is capped like the whole.
 */
function stageSeconds(
  startedAt: Date,
  submissions: Array<{ stage: string; submittedAt: Date }>,
  evaluations: Array<{ stage: string; completedAt: Date }>,
): { design: number; change: number; defend: number } {
  const sub = (s: string) => submissions.find((x) => x.stage === s)?.submittedAt
  const rep = (s: string) => evaluations.find((x) => x.stage === s)?.completedAt
  const leg = (from?: Date, to?: Date) => (from && to ? Math.min(ATTEMPT_CAP_SECONDS, Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000))) : 0)
  return { design: leg(startedAt, sub('design')), change: leg(rep('design'), sub('change')), defend: leg(rep('change'), sub('defend')) }
}

function attemptSeconds(startedAt: Date, submittedAt: Date[]): number {
  if (submittedAt.length === 0) return 0
  const last = Math.max(...submittedAt.map((d) => d.getTime()))
  return Math.min(ATTEMPT_CAP_SECONDS, Math.max(0, Math.round((last - startedAt.getTime()) / 1000)))
}
