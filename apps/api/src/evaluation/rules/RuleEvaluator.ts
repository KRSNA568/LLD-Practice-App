import type { CriterionId, CriterionResult } from '@lld/contracts'
import type { DesignCheck, EvaluationContext, Evaluator } from '../Evaluator.js'
import { RequirementCoverageCheck } from './checks/RequirementCoverageCheck.js'
import { GodClassCheck } from './checks/GodClassCheck.js'
import { CouplingCheck } from './checks/CouplingCheck.js'
import { AbstractionCheck } from './checks/AbstractionCheck.js'
import { WalkthroughCheck } from './checks/WalkthroughCheck.js'
import { BlastRadiusCheck } from './checks/BlastRadiusCheck.js'

/**
 * The measured half of evaluation.
 *
 * Everything here is provable from what the learner submitted, which has two
 * consequences worth stating plainly. The same design always produces the same
 * findings — no temperature, no drift, no re-run roulette. And it costs nothing per
 * attempt, so it keeps working when the AI half is down, out of budget, or not
 * configured at all.
 *
 * Six criteria are genuinely the ones a machine can settle: whether a requirement
 * was addressed, whether a class describes one job, whether the graph holds
 * together, whether there is a seam where the problem is known to change, whether
 * the scenarios actually run through the design, and how much of the design had to
 * be reopened when the requirements changed. Judgement lives next door.
 */
export class RuleEvaluator implements Evaluator {
  readonly id = 'rule-evaluator'
  readonly kind = 'deterministic' as const

  private readonly checks: readonly DesignCheck[]

  constructor(checks?: readonly DesignCheck[]) {
    this.checks = checks ?? [
      new RequirementCoverageCheck(),
      new GodClassCheck(),
      new CouplingCheck(),
      new AbstractionCheck(),
      new WalkthroughCheck(),
      new BlastRadiusCheck(),
    ]
  }

  get criteria(): readonly CriterionId[] {
    return [...new Set(this.checks.map((c) => c.criterionId))]
  }

  async evaluate(ctx: EvaluationContext): Promise<CriterionResult[]> {
    const owned = new Set(
      ctx.rubric.criteria.filter((c) => c.stage === ctx.stage).map((c) => c.id),
    )
    const captured = new Set(ctx.facets)

    return (
      this.checks
        // Only this stage's criteria, and only criteria in the active rubric version.
        .filter((check) => check.stage === ctx.stage && owned.has(check.criterionId))
        // A check that reads a facet the capture format could not supply is omitted,
        // never scored zero — the learner was never asked for it.
        .filter((check) => check.requires.every((f) => captured.has(f)))
        .map((check) => check.run(ctx))
    )
  }
}
