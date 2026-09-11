import { createHash, randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import {
  ADVANCEABLE_STATES,
  nextStage,
  STAGES,
  submissionPayloadSchema,
  type Attempt,
  type AttemptState,
  type AttemptSummary,
  type CriterionResult,
  type CritiqueVerdict,
  type DesignModel,
  type EvaluationReport,
  type FieldError,
  type HiddenChange,
  type NextProblemSuggestion,
  type Probe,
  type ProbeAnswer,
  type Problem,
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
import { resolveLlmClient } from '../evaluation/llm/index.js'
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

  constructor(
    private readonly prisma: PrismaClient,
    private readonly content: ContentStore,
    private readonly queue: JobQueue,
  ) {
    this.pipeline = new EvaluationPipeline([
      new RuleEvaluator(),
      new LlmEvaluator(resolveLlmClient()),
    ])
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

  async saveDraft(attemptId: string, input: RawStageInput): Promise<void> {
    const row = await this.prisma.attempt.findUnique({ where: { id: attemptId } })
    if (!row) throw new NotFoundError('Attempt')
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
  async getDraft(attemptId: string): Promise<RawStageInput | null> {
    const row = await this.prisma.attempt.findUnique({ where: { id: attemptId } })
    if (!row) return null
    return parseDrafts(row.draftsJson)[row.stage as Stage] ?? null
  }

  /* --------------------------------------------------------------------- */
  /* Submitting                                                             */
  /* --------------------------------------------------------------------- */

  async submit(attemptId: string, input: RawStageInput, idempotencyKey: string): Promise<Attempt> {
    const row = await this.prisma.attempt.findUnique({ where: { id: attemptId }, include: WITH_ALL })
    if (!row) throw new NotFoundError('Attempt')
    const problem = this.requireProblem(row.problemId)
    const stage = row.stage as Stage

    if (input.stage !== stage) throw new WrongStageError(stage, input.stage)

    // A replayed key returns what already happened. A double-tapped button, a retry
    // after a dropped connection and an impatient refresh must cost one evaluation.
    const existing = row.submissions.find((s) => s.stage === stage)
    if (existing && existing.idempotencyKey === idempotencyKey) {
      return this.toAttempt(row, problem)
    }

    const payload = this.parseInput(input, row, problem)
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
  async retry(attemptId: string): Promise<Attempt> {
    const row = await this.prisma.attempt.findUnique({ where: { id: attemptId }, include: WITH_ALL })
    if (!row) throw new NotFoundError('Attempt')

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
  async advance(attemptId: string): Promise<Attempt> {
    const row = await this.prisma.attempt.findUnique({ where: { id: attemptId }, include: WITH_ALL })
    if (!row) throw new NotFoundError('Attempt')
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

  private parseInput(input: RawStageInput, row: AttemptRow, problem: Problem): SubmissionPayload {
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
        // Only answers to probes this learner was actually asked survive.
        const asked = new Set(this.probesFor(row, problem).map((p) => p.id))
        const answers = input.answers.filter((a) => asked.has(a.probeId))
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
      },
      update: {
        resultsJson: JSON.stringify(outcome.results),
        summaryJson: JSON.stringify(summary),
        unchangedFromPrevious: unchanged,
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

  async getAttempt(attemptId: string): Promise<Attempt> {
    const row = await this.prisma.attempt.findUnique({ where: { id: attemptId }, include: WITH_ALL })
    if (!row) throw new NotFoundError('Attempt')
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

  async listProblems(learnerId: string): Promise<{ problems: ReturnType<ContentStore['toSummary']>[]; next: NextProblemSuggestion | null }> {
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
      return this.content.toSummary(
        problem,
        mine.length,
        scores.length > 0 ? Math.max(...scores) : null,
        critiques.filter((c) => c.problemId === problem.id && c.correct).length,
      )
    })

    // "Next for you" follows the most recently practised problem's weaknesses.
    const recent = rows.find((r) => r.evaluations.length > 0)
    const next = recent ? (await this.getHistory(learnerId, recent.problemId)).next : null

    return { problems, next }
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

  private toAttempt(row: AttemptRow, problem: Problem): Attempt {
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
