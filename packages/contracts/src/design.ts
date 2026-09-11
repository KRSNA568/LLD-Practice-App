import { z } from 'zod'

/**
 * The canonical design model — the intermediate representation every submission
 * format must produce.
 *
 * This is the load-bearing type in the system. A structured form produces it today;
 * a class-diagram editor or a code parser would produce the same thing tomorrow.
 * Nothing downstream of here — no rubric, no evaluator, no report — knows or cares
 * which frontend the learner used. That is the whole answer to Change Test A.
 *
 * The model has three facets, and the split matters:
 *
 *   structure  — classes and relationships. Every capture format can produce this.
 *   behaviour  — scenario walkthroughs: which object does what, in order. A form can
 *                capture it; a static class diagram cannot.
 *   rationale  — the decisions the learner made and the alternatives they rejected.
 *
 * Each deterministic check declares which facets it needs. A future parser that
 * cannot supply one simply causes those checks to be omitted, never scored zero.
 */

export const FACETS = ['structure', 'behaviour', 'rationale'] as const
export const facetSchema = z.enum(FACETS)
export type Facet = z.infer<typeof facetSchema>

export const STEREOTYPES = ['class', 'interface', 'abstract', 'enum'] as const
export const stereotypeSchema = z.enum(STEREOTYPES)
export type Stereotype = z.infer<typeof stereotypeSchema>

/**
 * `extends` and `implements` are kept distinct rather than collapsed into one
 * "inherits" kind: telling them apart is exactly what lets us say something useful
 * about composition-over-inheritance and about whether a declared abstraction is
 * actually being implemented by anything.
 */
export const RELATIONSHIP_KINDS = ['has-a', 'uses', 'extends', 'implements'] as const
export const relationshipKindSchema = z.enum(RELATIONSHIP_KINDS)
export type RelationshipKind = z.infer<typeof relationshipKindSchema>

export const designClassSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Class name is required')
    .max(60, 'Class name is too long to be a real name')
    .regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Use a plain identifier, e.g. PricingStrategy'),
  stereotype: stereotypeSchema,
  /**
   * Deliberately capped at one sentence. If a learner cannot describe a class
   * without stacking "and"s, they have found their own god class before any
   * evaluator touches it — the constraint teaches before the feedback does.
   */
  responsibility: z
    .string()
    .trim()
    .min(1, 'Say what this class is responsible for')
    .max(200, 'Keep the responsibility to one sentence'),
  attributes: z.array(z.string().trim().min(1)).default([]),
  methods: z.array(z.string().trim().min(1)).default([]),
})
export type DesignClass = z.infer<typeof designClassSchema>

export const relationshipSchema = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
  kind: relationshipKindSchema,
})
export type Relationship = z.infer<typeof relationshipSchema>

/**
 * A decision record: what was chosen, what was rejected, and why.
 *
 * The alternative is the part that matters. "I used an interface for pricing" is a
 * description; "…rather than a method on ParkingLot, because rates change more often
 * than the lot does" is reasoning, and reasoning is what a reviewer can engage with.
 */
export const decisionSchema = z.object({
  what: z.string().trim().min(1, 'Say what you decided').max(200),
  alternative: z.string().trim().max(200).default(''),
  why: z.string().trim().max(300).default(''),
})
export type Decision = z.infer<typeof decisionSchema>

/**
 * One step of a scenario walkthrough: this class, this method.
 *
 * This is a CRC-card role-play captured as a list. The learner "executes" a scenario
 * through their own design, and the evaluator can check that every step lands on a
 * class that exists and a method that class actually declares. The single most
 * common novice fault — a class that nothing ever talks to — is invisible in a class
 * list and obvious here.
 */
export const walkthroughStepSchema = z.object({
  className: z.string().trim().min(1, 'Pick the class that acts here'),
  method: z.string().trim().min(1, 'Name the method that runs'),
  note: z.string().trim().max(160).default(''),
})
export type WalkthroughStep = z.infer<typeof walkthroughStepSchema>

export const WALKTHROUGH_OUTCOMES = ['ok', 'refused', 'error'] as const
export const walkthroughOutcomeSchema = z.enum(WALKTHROUGH_OUTCOMES)
export type WalkthroughOutcome = z.infer<typeof walkthroughOutcomeSchema>

export const walkthroughSchema = z.object({
  scenarioId: z.string().trim().min(1),
  steps: z.array(walkthroughStepSchema).default([]),
  /** How the scenario ends. A "lot is full" scenario that ends `ok` has not been thought through. */
  outcome: walkthroughOutcomeSchema.default('ok'),
})
export type Walkthrough = z.infer<typeof walkthroughSchema>

export const designModelSchema = z.object({
  // structure
  assumptions: z.array(z.string().trim().min(1)).default([]),
  classes: z.array(designClassSchema).default([]),
  relationships: z.array(relationshipSchema).default([]),
  // rationale
  tradeoffs: z.string().trim().default(''),
  decisions: z.array(decisionSchema).max(5, 'Five decisions is plenty — keep the important ones').default([]),
  // behaviour
  walkthroughs: z.array(walkthroughSchema).default([]),
})
export type DesignModel = z.infer<typeof designModelSchema>

/**
 * What the learner typed, before parsing. The parser's job is to turn this into a
 * DesignModel or into a list of per-field errors — never into a half-valid model.
 */
export const rawStructuredSubmissionSchema = z.object({
  format: z.literal('structured-design'),
  assumptions: z.array(z.string()).default([]),
  classes: z
    .array(
      z.object({
        name: z.string().default(''),
        stereotype: z.string().default('class'),
        responsibility: z.string().default(''),
        attributes: z.array(z.string()).default([]),
        methods: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  relationships: z
    .array(
      z.object({
        from: z.string().default(''),
        to: z.string().default(''),
        kind: z.string().default('uses'),
      }),
    )
    .default([]),
  tradeoffs: z.string().default(''),
  decisions: z
    .array(
      z.object({
        what: z.string().default(''),
        alternative: z.string().default(''),
        why: z.string().default(''),
      }),
    )
    .default([]),
  walkthroughs: z
    .array(
      z.object({
        scenarioId: z.string().default(''),
        steps: z
          .array(
            z.object({
              className: z.string().default(''),
              method: z.string().default(''),
              note: z.string().default(''),
            }),
          )
          .default([]),
        outcome: z.string().default('ok'),
      }),
    )
    .default([]),
})
export type RawStructuredSubmission = z.infer<typeof rawStructuredSubmissionSchema>

/** A parse failure the UI can attach to the exact field that caused it. */
export type FieldError = {
  path: string
  message: string
}
