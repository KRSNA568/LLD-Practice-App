import type { CriterionResult, EvaluationSummary, Rubric, Stage } from '@lld/contracts'

/**
 * Turns per-criterion results into the one number the report header shows.
 *
 * The mean is presentation only and is never stored as the thing that matters. The
 * criterion results are the real output — an average of eight scores tells a learner
 * nothing about what to change, which is the whole failure mode this product exists
 * to avoid. It appears on screen because progress needs a scalar to move.
 */
export function summarise(
  results: readonly CriterionResult[],
  rubric: Rubric,
  stagesCompleted: readonly Stage[],
): EvaluationSummary {
  const total = rubric.criteria.length
  const scored = results.length

  const overall =
    scored === 0
      ? 0
      : Math.round((results.reduce((sum, r) => sum + r.score, 0) / scored) * 10) / 10

  /**
   * "AI unavailable" is derived from what actually came back rather than from a flag
   * someone remembered to set. If a completed stage expects LLM-judged criteria and
   * none are present for it, the AI half did not run, and the learner is told so.
   */
  const aiUnavailable = stagesCompleted.some((stage) => {
    const expectsLlm = rubric.criteria.some((c) => c.judgedBy === 'llm' && c.stage === stage)
    const hasLlm = results.some((r) => r.evaluatorKind === 'llm' && r.stage === stage)
    return expectsLlm && !hasLlm
  })

  return {
    overall,
    criteriaScored: scored,
    criteriaTotal: total,
    aiUnavailable,
  }
}

/** Score per criterion, for history rows and trend lines. */
export function scoresByCriterion(results: readonly CriterionResult[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of results) out[r.criterionId] = r.score
  return out
}
