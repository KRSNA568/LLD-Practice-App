import { z } from 'zod'
import { designModelSchema } from './design.js'
import { criterionIdSchema } from './rubric.js'

/**
 * Problems are content, not code. Adding one is dropping a JSON file into
 * `content/problems/` — never a deploy of new logic.
 *
 * The brief is the smallest part of a problem. The value is the instrumentation
 * around it: the requirements so coverage can be checked, the variation points a
 * good design should have a seam for, the scenarios the design must be walked
 * through, the change that gets sprung on the learner after their design is frozen,
 * and the probes that make them defend it. That metadata is what lets a
 * deterministic evaluator say something specific instead of something vague.
 */

export const requirementSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** Concepts this requirement exercises. Metadata for the concept graph, not matching. */
  conceptHints: z.array(z.string()).default([]),
  /**
   * Words whose presence in the design means this requirement was addressed —
   * matched by stem and prefix against class names, responsibilities, members and
   * assumptions. Authored per requirement, because "vehicle" appears in five of the
   * six parking-lot requirements and proves nothing about any of them.
   */
  keywords: z.array(z.string()).default([]),
})
export type Requirement = z.infer<typeof requirementSchema>

export const variationPointSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Shown to the learner in feedback — why this is a place change actually happens. */
  why: z.string(),
  expectAbstraction: z.boolean().default(true),
  acceptableShapes: z.array(z.enum(['interface', 'abstract', 'enum'])).default(['interface']),
  /** Substrings that identify a class as covering this seam. Matched case-insensitively. */
  nameHints: z.array(z.string()).default([]),
})
export type VariationPoint = z.infer<typeof variationPointSchema>

/**
 * A scenario the learner walks through their design, step by step.
 *
 * `mustInvolve` are name hints for the class that ought to appear somewhere in the
 * walkthrough — a "car exits and pays" scenario that never touches anything
 * pricing-shaped has computed the fee nowhere. `expectsFailurePath` marks the
 * scenarios whose honest ending is a refusal, not a success.
 */
export const scenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().default(''),
  expectsFailurePath: z.boolean().default(false),
  mustInvolve: z.array(z.string()).default([]),
})
export type Scenario = z.infer<typeof scenarioSchema>

/**
 * The requirement change sprung on the learner after their design is frozen.
 *
 * It is hidden until then on purpose: the interview version of this is the
 * follow-up question, and the whole test is whether the design *as it stands*
 * absorbs the change or has to be reopened. `mustIntroduce` lets the evaluator tell
 * "absorbed the change" apart from "ignored it"; `expectedSeam` names the variation
 * point whose abstraction should carry the new behaviour.
 */
export const hiddenChangeSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  targetsConcept: z.string(),
  mustIntroduce: z.array(z.string()).default([]),
  expectedSeam: z.string().optional(),
  goodSignal: z.array(z.string()).default([]),
  badSignal: z.array(z.string()).default([]),
})
export type HiddenChange = z.infer<typeof hiddenChangeSchema>

/**
 * A question the learner has to answer about their own design.
 *
 * Probes are authored, not generated — and selected by what the evaluator actually
 * found. `triggerWhen` says "ask this one if abstraction-use scored 2 or below", and
 * `{{class}}` in the prompt is replaced with the class the finding cited, so the
 * question is about *their* `ParkingLotManager`, not a hypothetical one.
 */
export const probeSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  targetsConcept: z.string(),
  triggerWhen: z
    .object({
      criterionId: criterionIdSchema,
      maxScore: z.number().int().min(0).max(4),
    })
    .optional(),
  goodSignal: z.array(z.string()).default([]),
  badSignal: z.array(z.string()).default([]),
})
export type Probe = z.infer<typeof probeSchema>

export const commonFailureModeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  concept: z.string(),
  frequency: z.enum(['low', 'medium', 'high', 'very-high']),
})
export type CommonFailureMode = z.infer<typeof commonFailureModeSchema>

/**
 * A contrasting pair for the critique warm-up: two authored designs, one question,
 * one click. The answer names a design and the class in it that decides the matter.
 */
export const critiquePairSchema = z.object({
  id: z.string(),
  left: z.string(),
  right: z.string(),
  question: z.string(),
  targetsConcept: z.string(),
  answer: z.object({ design: z.string(), className: z.string() }),
  /** Shown after the click — the explanation the comparison has prepared the learner for. */
  telling: z.string(),
})
export type CritiquePair = z.infer<typeof critiquePairSchema>

/** Expected score band per criterion for one gold design. */
export const calibrationEntrySchema = z.object({
  designId: z.string(),
  label: z.string(),
  expectedBands: z.record(z.string(), z.tuple([z.number(), z.number()])),
})
export type CalibrationEntry = z.infer<typeof calibrationEntrySchema>

export const problemSchema = z.object({
  id: z.string(),
  version: z.string(),
  rubricId: z.string(),
  rubricVersion: z.string(),
  title: z.string(),
  tier: z.number().int().min(1).max(4),
  minutes: z.number().int().positive(),
  domain: z.string(),
  brief: z.string(),
  requirements: z.array(requirementSchema),
  constraints: z.array(z.string()).default([]),
  variationPoints: z.array(variationPointSchema).default([]),
  scenarios: z.array(scenarioSchema).default([]),
  hiddenChanges: z.array(hiddenChangeSchema).default([]),
  probes: z.array(probeSchema).default([]),
  conceptTags: z.array(z.string()).default([]),
  commonFailureModes: z.array(commonFailureModeSchema).default([]),
  /** Authored full designs, keyed by label. Used by critique pairs and calibration. */
  goldDesigns: z.record(z.string(), designModelSchema).default({}),
  critiquePairs: z.array(critiquePairSchema).default([]),
  calibrationSet: z.array(calibrationEntrySchema).default([]),
  nextProblems: z.array(z.string()).default([]),
})
export type Problem = z.infer<typeof problemSchema>

/**
 * What the web app is allowed to see before the design is frozen. Hidden changes,
 * probes, gold designs and critique answers are stripped — the change must stay a
 * surprise, and a critique answer visible in the network tab is not a critique.
 */
export type PublicProblem = Omit<
  Problem,
  'hiddenChanges' | 'probes' | 'goldDesigns' | 'critiquePairs' | 'calibrationSet'
> & {
  hiddenChangeCount: number
  critiquePairCount: number
}

/** Card row for the problem list — no brief or instrumentation payload. */
export type ProblemSummary = {
  id: string
  title: string
  tier: number
  minutes: number
  domain: string
  conceptTags: string[]
  attemptCount: number
  bestOverall: number | null
  /** When this learner last touched an attempt here; null if never. */
  lastAttemptAt: string | null
  critiquePairCount: number
  critiquesAnswered: number
  critiquesCorrect: number
}

/** A catalogued problem that is not yet playable — shown so the shape of the library is honest. */
export type UpcomingProblem = {
  id: string
  title: string
  tier: number
  minutes: number
  domain: string
  conceptTags: string[]
}

/** A critique pair as served to the learner — designs inlined, answer withheld. */
export type PublicCritiquePair = Omit<CritiquePair, 'answer' | 'telling' | 'left' | 'right'> & {
  left: { id: string; design: z.infer<typeof designModelSchema> }
  right: { id: string; design: z.infer<typeof designModelSchema> }
  /** The learner's previous answer to this pair, if any. */
  answered: { design: string; className: string; correct: boolean } | null
}

export type CritiqueVerdict = {
  pairId: string
  correct: boolean
  answer: { design: string; className: string }
  telling: string
}
