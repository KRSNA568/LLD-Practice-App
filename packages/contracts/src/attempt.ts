import { z } from 'zod'
import { criterionResultSchema, stageSchema, STAGES, type Stage } from './rubric.js'
import { designModelSchema } from './design.js'
import type { HiddenChange, Probe } from './problem.js'

/**
 * The attempt lifecycle.
 *
 * `COMPLETED_PARTIAL` is the state that matters most. When the AI evaluator fails,
 * the deterministic findings are still real and still useful, so the learner gets a
 * report with an honest banner rather than an error page. Collapsing that case into
 * FAILED would throw away work we already did.
 *
 * This lifecycle runs once per stage. An attempt moves design → change → defend, and
 * each stage is a full submit → evaluate → report pass with the same guarantees:
 * persisted before evaluation, idempotent on replay, retryable on failure. The
 * stage is a second axis, not a second state machine.
 */
export const ATTEMPT_STATES = [
  'DRAFT',
  'SUBMITTED',
  'EVALUATING',
  'COMPLETED',
  'COMPLETED_PARTIAL',
  'FAILED',
] as const
export const attemptStateSchema = z.enum(ATTEMPT_STATES)
export type AttemptState = z.infer<typeof attemptStateSchema>

/** States where evaluation is done and a report exists to read. */
export const TERMINAL_STATES: readonly AttemptState[] = [
  'COMPLETED',
  'COMPLETED_PARTIAL',
  'FAILED',
]

/** States from which the next stage may begin. */
export const ADVANCEABLE_STATES: readonly AttemptState[] = ['COMPLETED', 'COMPLETED_PARTIAL']

/** States the web app should keep polling through. */
export const IN_FLIGHT_STATES: readonly AttemptState[] = ['SUBMITTED', 'EVALUATING']

export { STAGES, stageSchema }
export type { Stage }

export function nextStage(stage: Stage): Stage | null {
  const i = STAGES.indexOf(stage)
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1]! : null
}

/* ------------------------------------------------------------------------- */
/* What each stage submits                                                    */
/* ------------------------------------------------------------------------- */

export const designSubmissionSchema = z.object({
  stage: z.literal('design'),
  design: designModelSchema,
})
export type DesignSubmission = z.infer<typeof designSubmissionSchema>

/**
 * The change stage submits the whole design again, edited. Evaluation diffs it
 * against the design stage's frozen model — that diff *is* the evidence.
 */
export const changeSubmissionSchema = z.object({
  stage: z.literal('change'),
  changeId: z.string().min(1),
  design: designModelSchema,
  /** One paragraph: what was touched and why. Read, not measured. */
  rationale: z.string().trim().default(''),
})
export type ChangeSubmission = z.infer<typeof changeSubmissionSchema>

export const probeAnswerSchema = z.object({
  probeId: z.string().min(1),
  response: z.string().trim().default(''),
})
export type ProbeAnswer = z.infer<typeof probeAnswerSchema>

export const defendSubmissionSchema = z.object({
  stage: z.literal('defend'),
  answers: z.array(probeAnswerSchema),
})
export type DefendSubmission = z.infer<typeof defendSubmissionSchema>

export const submissionPayloadSchema = z.discriminatedUnion('stage', [
  designSubmissionSchema,
  changeSubmissionSchema,
  defendSubmissionSchema,
])
export type SubmissionPayload = z.infer<typeof submissionPayloadSchema>

/* ------------------------------------------------------------------------- */
/* The report                                                                 */
/* ------------------------------------------------------------------------- */

export const evaluationSummarySchema = z.object({
  /** Mean of all criterion scores so far, 0–4, one decimal. Presentation only. */
  overall: z.number().min(0).max(4),
  criteriaScored: z.number().int().nonnegative(),
  criteriaTotal: z.number().int().nonnegative(),
  /** True when an LLM-judged criterion was expected at a completed stage and none came back. */
  aiUnavailable: z.boolean(),
})
export type EvaluationSummary = z.infer<typeof evaluationSummarySchema>

/**
 * One report per attempt, growing as stages complete. Results carry their stage so
 * the UI can group them, and so a criterion is never scored twice by accident.
 */
export const evaluationReportSchema = z.object({
  attemptId: z.string(),
  rubricId: z.string(),
  rubricVersion: z.string(),
  results: z.array(criterionResultSchema),
  summary: evaluationSummarySchema,
  stagesCompleted: z.array(stageSchema),
  completedAt: z.string(),
  /** Set when the learner's design-stage submission was identical to their previous attempt's. */
  unchangedFromPrevious: z.boolean().default(false),
})
export type EvaluationReport = z.infer<typeof evaluationReportSchema>

/* ------------------------------------------------------------------------- */
/* The attempt as the web app sees it                                         */
/* ------------------------------------------------------------------------- */

/** The design-stage model and the change-stage revision, once each exists. */
export type Revision = {
  changeId: string
  design: z.infer<typeof designModelSchema>
  rationale: string
}

export type Attempt = {
  id: string
  problemId: string
  learnerId: string
  attemptNumber: number
  /** The stage currently open (or the last one, once the attempt is finished). */
  stage: Stage
  /** Lifecycle state of the current stage's submission. */
  state: AttemptState
  design: z.infer<typeof designModelSchema> | null
  revision: Revision | null
  answers: ProbeAnswer[] | null
  /**
   * The requirement change, exposed only once the design stage has been evaluated.
   * Before that it is null on the wire — the whole point is that the learner designs
   * without knowing what is about to change.
   */
  revealedChange: HiddenChange | null
  /** The probes chosen for this learner, exposed once the defend stage opens. */
  probes: Probe[] | null
  /**
   * One strong authored design for this problem, exposed only once the learner's
   * own design has been evaluated. A contrasting case shown *after* the attempt —
   * never a reference solution shown before it.
   */
  exemplar: z.infer<typeof designModelSchema> | null
  report: EvaluationReport | null
  failureReason: string | null
  createdAt: string
  updatedAt: string
}

/** Compact row for the history screen — no design or report payload. */
export type AttemptSummary = {
  id: string
  problemId: string
  attemptNumber: number
  stage: Stage
  state: AttemptState
  stagesCompleted: Stage[]
  overall: number | null
  scores: Partial<Record<string, number>>
  createdAt: string
}

/**
 * A criterion the learner keeps scoring badly on.
 *
 * Threshold is "below 2 in at least 2 of the last 3 attempts" — deliberately needing
 * three attempts before it fires. Calling something recurring after two data points
 * is noise, and a product that cries wolf on attempt two teaches learners to ignore it.
 */
export type RecurringWeakness = {
  criterionId: string
  criterionName: string
  occurrences: number
  windowSize: number
  averageScore: number
}

/** Why a problem is being recommended next. */
export type NextProblemSuggestion = {
  problemId: string
  title: string
  /** The criterion driving the recommendation, if any. */
  criterionId: string | null
  criterionName: string | null
  reason: string
}
