import { z } from 'zod'
import { rawStructuredSubmissionSchema, type FieldError } from './design.js'
import {
  stageSchema,
  type Attempt,
  type AttemptSummary,
  type EvaluationReport,
  type NextProblemSuggestion,
  type RecurringWeakness,
} from './attempt.js'
import { probeAnswerSchema } from './attempt.js'
import type { CritiqueVerdict, PublicCritiquePair, PublicProblem, ProblemSummary } from './problem.js'
import type { Rubric } from './rubric.js'
import type { Concept, ConceptMastery } from './concept.js'

/** Wire shapes for the HTTP boundary. The API speaks these; the domain never does. */

export const startAttemptRequestSchema = z.object({
  problemId: z.string().min(1),
})
export type StartAttemptRequest = z.infer<typeof startAttemptRequestSchema>

/**
 * The raw form for the design and change stages, and the answers for defend. The
 * server decides which stage a draft or submission belongs to from the attempt's
 * current stage — the client cannot submit to a stage it has not reached.
 */
export const rawStageInputSchema = z.discriminatedUnion('stage', [
  z.object({ stage: z.literal('design'), submission: rawStructuredSubmissionSchema }),
  z.object({
    stage: z.literal('change'),
    submission: rawStructuredSubmissionSchema,
    rationale: z.string().default(''),
  }),
  z.object({ stage: z.literal('defend'), answers: z.array(probeAnswerSchema) }),
])
export type RawStageInput = z.infer<typeof rawStageInputSchema>

export const saveDraftRequestSchema = z.object({ input: rawStageInputSchema })
export type SaveDraftRequest = z.infer<typeof saveDraftRequestSchema>

/**
 * `idempotencyKey` is generated once by the client when the learner opens a stage,
 * not per click. A double-tapped submit button, a flaky connection retry and an
 * impatient refresh all carry the same key and therefore cost one evaluation.
 */
export const submitAttemptRequestSchema = z.object({
  input: rawStageInputSchema,
  idempotencyKey: z.string().min(8),
})
export type SubmitAttemptRequest = z.infer<typeof submitAttemptRequestSchema>

export const critiqueAnswerRequestSchema = z.object({
  design: z.string().min(1),
  className: z.string().min(1),
})
export type CritiqueAnswerRequest = z.infer<typeof critiqueAnswerRequestSchema>

export const dialogueTurnRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
})
export type DialogueTurnRequest = z.infer<typeof dialogueTurnRequestSchema>

export { stageSchema }

export type ProblemListResponse = {
  problems: ProblemSummary[]
  next: NextProblemSuggestion | null
}
export type ProblemDetailResponse = { problem: PublicProblem; rubric: Rubric }
export type AttemptResponse = { attempt: Attempt; draft: RawStageInput | null }
export type ReportResponse = { attempt: Attempt; report: EvaluationReport | null }
export type CritiqueResponse = { problemId: string; pairs: PublicCritiquePair[] }

export type HistoryResponse = {
  problemId: string
  attempts: AttemptSummary[]
  recurringWeaknesses: RecurringWeakness[]
  critique: { answered: number; correct: number; total: number }
  next: NextProblemSuggestion | null
}

/**
 * Errors carry a machine-readable code plus optional per-field detail, so the
 * workspace can attach a parse failure to the row that caused it rather than
 * showing one banner for eleven problems.
 */
export type ApiErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_SUBMISSION'
  | 'INVALID_TRANSITION'
  | 'WRONG_STAGE'
  | 'DIALOGUE_CLOSED'
  | 'EVALUATION_FAILED'
  | 'INTERNAL'

export type ApiError = {
  error: {
    code: ApiErrorCode
    message: string
    fields?: FieldError[]
  }
}
export type { CritiqueVerdict }

/** The learner's standing across every problem — what the dashboard and progress pages read. */
export type ProgressPayload = {
  attempts: number
  problemsTried: number
  /** Stages completed across all attempts, e.g. 7 design, 4 change, 2 defend. */
  stagesCompleted: Record<'design' | 'change' | 'defend', number>
  /** Mean score per criterion over every scored attempt; absent if never scored. */
  criterionAverages: Record<string, number>
  criteriaAtPar: number
  conceptMastery: ConceptMastery[]
  /** Consecutive calendar days (ending today) with at least one submission. */
  streakDays: number
  recurringWeaknesses: RecurringWeakness[]
  critique: { answered: number; correct: number }
  /** The most recent attempt still open, if any — the "continue" affordance. */
  openAttempt: {
    attemptId: string
    problemId: string
    problemTitle: string
    stage: 'design' | 'change' | 'defend'
    attemptNumber: number
  } | null
  /** Every attempt across problems, newest first. */
  recent: Array<AttemptSummary & { problemTitle: string }>
  next: NextProblemSuggestion | null
  /** The coach's note over everything above; null when no model wrote one. */
  coach: { text: string; modelId: string } | null
}

export type ConceptsPayload = {
  concepts: Concept[]
  mastery: ConceptMastery[]
  /** Playable problem ids per concept, so the map can point at practice. */
  practice: Record<string, Array<{ id: string; title: string }>>
}
