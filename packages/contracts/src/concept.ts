import { z } from 'zod'

/**
 * The concept graph — the curriculum behind the rubric. Every criterion produces
 * evidence about one or more of these, so a learner's scores can be folded into a
 * per-concept picture without a second grading pass.
 */

export const CONCEPT_TIERS = ['foundation', 'principle', 'structure', 'behaviour', 'practice'] as const
export type ConceptTier = (typeof CONCEPT_TIERS)[number]

export const conceptSchema = z.object({
  id: z.string().min(1),
  tier: z.enum(CONCEPT_TIERS),
  name: z.string().min(1),
  /** One sentence a learner can read. */
  plain: z.string().min(1),
  /** What it looks like when it is missing. */
  tell: z.string().min(1),
  prerequisites: z.array(z.string()).default([]),
})
export type Concept = z.infer<typeof conceptSchema>

export const conceptGraphSchema = z.object({
  version: z.string(),
  concepts: z.array(conceptSchema),
})
export type ConceptGraph = z.infer<typeof conceptGraphSchema>

export const MASTERY_LEVELS = ['new', 'developing', 'solid'] as const
export type MasteryLevel = (typeof MASTERY_LEVELS)[number]

/**
 * How a learner stands on one concept, derived from the criteria that speak to it.
 * `evidenceCount` is how many criterion scores went into it — one score is a bad
 * day, five is a picture.
 */
export type ConceptMastery = {
  conceptId: string
  level: MasteryLevel
  average: number | null
  evidenceCount: number
}
