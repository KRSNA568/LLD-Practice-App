import type {
  CriterionId,
  CriterionResult,
  DesignModel,
  EvaluatorKind,
  Facet,
  HiddenChange,
  Probe,
  ProbeAnswer,
  Problem,
  Rubric,
  Stage,
} from '@lld/contracts'
import type { DesignGraph } from '../domain/design/DesignGraph.js'

/**
 * The seam that answers Change Test B: "today feedback comes from one evaluator,
 * later you add a rule-based one or human review — can you add it without rewriting
 * the practice flow?"
 *
 * Answer: an evaluator declares which criteria it is competent to judge and returns
 * results for those. Adding human review means implementing this interface and
 * registering it. The attempt lifecycle, the report and the history screen are
 * untouched, because none of them know how many evaluators exist.
 *
 * `criteria` is a claim of competence, not a request. The pipeline uses it to work
 * out what is missing when an evaluator fails, which is what makes honest partial
 * reports possible instead of silently short reports.
 */

export type EvaluationContext = {
  /** Which pass of the loop this is. Evaluators only score criteria for this stage. */
  stage: Stage
  problem: Problem
  rubric: Rubric
  /**
   * The facets the capture format was able to supply. A future diagram parser
   * cannot produce walkthroughs; the checks that need them are omitted, not zeroed.
   */
  facets: readonly Facet[]
  /** The design being judged: the original at the design stage, the revision at the change stage. */
  design: DesignModel
  /** Pre-built so every evaluator shares one traversal rather than each doing its own. */
  graph: DesignGraph
  /** Change stage only: the design as it was before the requirement change. */
  previousDesign?: DesignModel
  /** Change stage only: the change the learner was shown. */
  change?: HiddenChange
  /** Change stage only: what the learner said they touched and why. */
  rationale?: string
  /** Defend stage only: the probes asked and what the learner answered. */
  probes?: readonly Probe[]
  answers?: readonly ProbeAnswer[]
  /** Defend stage only: every result from earlier stages, for context. */
  priorResults?: readonly CriterionResult[]
}

export interface Evaluator {
  readonly id: string
  readonly kind: EvaluatorKind
  readonly criteria: readonly CriterionId[]
  evaluate(ctx: EvaluationContext): Promise<CriterionResult[]>
  /**
   * What the last `evaluate` cost, for evaluators that call a model. Retries
   * included: a rejected first reply was a real call. Undefined on the rules.
   */
  readonly lastUsage?: { inputTokens: number; outputTokens: number } | null
}

/**
 * One deterministic check — a single structural question about a design.
 *
 * Kept separate from Evaluator so that adding a check is adding a file with one idea
 * in it, rather than growing a method. Each returns a score plus the evidence that
 * justifies it, so no finding can be made without pointing at something.
 *
 * `stage` and `requires` are what let the same rule evaluator serve every pass of
 * the loop and every capture format: a check runs only at its stage, and only when
 * the facets it reads were actually captured.
 */
export interface DesignCheck {
  readonly id: string
  readonly criterionId: CriterionId
  readonly stage: Stage
  readonly requires: readonly Facet[]
  run(ctx: EvaluationContext): CriterionResult
}
