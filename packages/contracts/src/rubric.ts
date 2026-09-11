import { z } from 'zod'

/**
 * The eight rubric criteria. Deliberately few, and each owned by exactly one
 * evaluator at exactly one stage.
 *
 * An earlier draft had twelve, and the overlap was the problem: a single god class
 * would lose points under "responsibilities", "cohesion", "abstraction" and
 * "extensibility" all at once, so one flaw looked like four and the learner could
 * not tell what to actually fix.
 *
 * Six of the eight are measured — from the class graph, the scenario walkthroughs,
 * or the diff between the design before and after a requirement change. The two
 * that need reading go to the LLM. AI reads; math measures.
 */
export const CRITERION_IDS = [
  'requirement-coverage',
  'class-responsibilities',
  'coupling-cohesion',
  'abstraction-use',
  'behaviour',
  'change-resilience',
  'edge-cases',
  'reasoning',
] as const
export const criterionIdSchema = z.enum(CRITERION_IDS)
export type CriterionId = z.infer<typeof criterionIdSchema>

/**
 * The practice loop runs three times inside one attempt, and each pass produces a
 * different kind of evidence. A criterion belongs to the stage that produces the
 * evidence it needs.
 */
export const STAGES = ['design', 'change', 'defend'] as const
export const stageSchema = z.enum(STAGES)
export type Stage = z.infer<typeof stageSchema>

/**
 * 0–4, not 0–100.
 *
 * A 100-point scale invites false precision — nobody can defend the difference
 * between 71 and 74, and an LLM will happily invent one. Five bands are defensible,
 * and each band has a written descriptor in the rubric content file.
 */
export const scoreSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
])
export type Score = z.infer<typeof scoreSchema>

export const confidenceSchema = z.enum(['low', 'medium', 'high'])
export type Confidence = z.infer<typeof confidenceSchema>

/**
 * Evidence is a pointer into the learner's own submission — never free text.
 *
 * Two things fall out of that choice. The UI can highlight the exact row a piece of
 * feedback is about, and the grounding validator can check that every reference
 * actually exists before the learner ever sees it. An LLM citing a `PaymentProcessor`
 * the learner never wrote gets caught here rather than quietly eroding trust.
 *
 * `step` and `decision` exist so that behaviour and rationale findings can be just
 * as precise as structural ones: "step 3 of the exit scenario calls a method Ticket
 * does not declare" is a finding the learner can act on in ten seconds.
 */
export const PROSE_FIELDS = ['tradeoffs', 'rationale', 'answer'] as const

export const evidenceRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('class'), name: z.string().min(1) }),
  z.object({
    kind: z.literal('relationship'),
    from: z.string().min(1),
    to: z.string().min(1),
  }),
  z.object({ kind: z.literal('assumption'), index: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('decision'), index: z.number().int().nonnegative() }),
  z.object({
    kind: z.literal('step'),
    scenarioId: z.string().min(1),
    index: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('prose'),
    field: z.enum(PROSE_FIELDS),
    /** For `answer`, which probe the quote comes from. */
    probeId: z.string().optional(),
    quote: z.string().min(1),
  }),
])
export type EvidenceRef = z.infer<typeof evidenceRefSchema>

export const evaluatorKindSchema = z.enum(['deterministic', 'llm', 'human'])
export type EvaluatorKind = z.infer<typeof evaluatorKindSchema>

/**
 * One criterion, judged by one evaluator.
 *
 * The shape is criterion → score → evidence → concern → suggestion → confidence.
 * `concern` says what is wrong; `suggestion` says what to do next. Keeping them
 * separate stops feedback collapsing into a restatement of the score.
 */
export const criterionResultSchema = z.object({
  criterionId: criterionIdSchema,
  stage: stageSchema,
  score: scoreSchema,
  evidence: z.array(evidenceRefSchema).default([]),
  concern: z.string().default(''),
  suggestion: z.string().default(''),
  confidence: confidenceSchema.default('medium'),
  evaluatorId: z.string().min(1),
  evaluatorKind: evaluatorKindSchema,
})
export type CriterionResult = z.infer<typeof criterionResultSchema>

/** What the LLM is asked to return, before grounding and schema validation. */
export const llmCriterionResponseSchema = z.object({
  criterionId: criterionIdSchema,
  score: z.number().int().min(0).max(4),
  evidence: z.array(evidenceRefSchema).default([]),
  concern: z.string().default(''),
  suggestion: z.string().default(''),
  confidence: confidenceSchema.default('medium'),
})
export const llmEvaluationResponseSchema = z.object({
  results: z.array(llmCriterionResponseSchema),
})
export type LlmEvaluationResponse = z.infer<typeof llmEvaluationResponseSchema>

export type Criterion = {
  id: CriterionId
  name: string
  /** One line the learner sees on the report card. */
  question: string
  /** Which evaluator kind owns this criterion. */
  judgedBy: EvaluatorKind
  /** Which stage of the attempt produces the evidence this criterion needs. */
  stage: Stage
  /** Concepts this criterion produces evidence about — drives next-problem selection. */
  conceptIds: string[]
  /** Written descriptor per band, so a score is defensible rather than vibes. */
  bands: Record<'0' | '1' | '2' | '3' | '4', string>
  /**
   * One line per band showing what that band *looks like*, for the LLM-judged
   * criteria. Models score more consistently against a contrasting example than
   * against a bare descriptor.
   */
  anchors?: Partial<Record<'0' | '1' | '2' | '3' | '4', string>>
}

export type Rubric = {
  id: string
  version: string
  name: string
  criteria: Criterion[]
}
