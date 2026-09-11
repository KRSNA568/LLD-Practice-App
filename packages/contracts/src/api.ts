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
