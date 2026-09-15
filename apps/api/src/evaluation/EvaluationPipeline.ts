import type { CriterionId, CriterionResult } from '@lld/contracts'
import type { EvaluationContext, Evaluator } from './Evaluator.js'

/**
 * Runs every registered evaluator and assembles their findings.
 *
 * The design rule here is that one evaluator failing must not cost the learner the
 * findings from the others. The deterministic checks are cheap, local and reliable;
 * the LLM call is slow and occasionally fails. Treating the whole evaluation as
 * atomic would mean a flaky API call throws away work that already succeeded, so
 * failures are collected rather than propagated.
 */

export type PipelineOutcome = {
  results: CriterionResult[]
  /** Evaluators that threw, with the reason. Drives the "AI review unavailable" banner. */
  failures: Array<{ evaluatorId: string; reason: string }>
  /** Criteria nobody managed to score, so the report can say so rather than imply a zero. */
  unscored: CriterionId[]
  /** What this run cost across every evaluator that reported it. Null when none did (the rules, the stub). */
  usage: { inputTokens: number; outputTokens: number } | null
}

export class EvaluationPipeline {
  constructor(private readonly evaluators: readonly Evaluator[]) {}

  async run(ctx: EvaluationContext): Promise<PipelineOutcome> {
    const settled = await Promise.allSettled(
      this.evaluators.map(async (e) => ({ evaluator: e, results: await e.evaluate(ctx) })),
    )

    const results: CriterionResult[] = []
    const failures: PipelineOutcome['failures'] = []

    settled.forEach((outcome, i) => {
      const evaluator = this.evaluators[i]!
      if (outcome.status === 'fulfilled') {
        results.push(...outcome.value.results)
      } else {
        failures.push({
          evaluatorId: evaluator.id,
          reason: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        })
      }
    })

    // Only this stage's criteria can be missing from this stage's run.
    const scored = new Set(results.map((r) => r.criterionId))
    const unscored = ctx.rubric.criteria
      .filter((c) => c.stage === ctx.stage)
      .map((c) => c.id)
      .filter((id) => !scored.has(id))

    // Report order follows the rubric, not the order evaluators happened to finish in.
    const rubricOrder = new Map(ctx.rubric.criteria.map((c, i) => [c.id, i]))
    results.sort(
      (a, b) => (rubricOrder.get(a.criterionId) ?? 0) - (rubricOrder.get(b.criterionId) ?? 0),
    )

    // Cost is summed across evaluators; a failed evaluator still spent its tokens.
    let usage: PipelineOutcome['usage'] = null
    for (const e of this.evaluators) {
      if (!e.lastUsage) continue
      usage = {
        inputTokens: (usage?.inputTokens ?? 0) + e.lastUsage.inputTokens,
        outputTokens: (usage?.outputTokens ?? 0) + e.lastUsage.outputTokens,
      }
    }

    return { results, failures, unscored, usage }
  }
}
