import type { CriterionId, RecurringWeakness, Rubric } from '@lld/contracts'

/**
 * Finds the criteria a learner keeps getting wrong.
 *
 * This is the smallest thing that turns a grader into a practice product. A single
 * low score is a bad day; the same low score three attempts running is a habit, and
 * naming the habit is feedback the learner cannot generate about themselves.
 */

/** Below this is "weak". 2 of 4 is the midpoint — a 2 is adequate, a 1 is not. */
const WEAK_BELOW = 2

/** Only the most recent attempts count. Improving on something should retire it. */
const WINDOW = 3

/**
 * Needs 2 hits inside the window, which means it cannot fire before the third
 * attempt. Calling something "recurring" off two data points is noise, and a product
 * that cries wolf early teaches people to ignore the callout entirely.
 */
const MIN_OCCURRENCES = 2

export type ScoredAttempt = {
  /** Criterion id → score for one completed attempt. */
  scores: Partial<Record<string, number>>
}

/**
 * @param attempts Completed attempts for one problem, newest first.
 */
export function detectRecurringWeaknesses(
  attempts: ScoredAttempt[],
  rubric: Rubric,
): RecurringWeakness[] {
  const window = attempts.slice(0, WINDOW)
  if (window.length < WINDOW) return []

  const out: RecurringWeakness[] = []

  for (const criterion of rubric.criteria) {
    const observed = window
      .map((a) => a.scores[criterion.id])
      .filter((s): s is number => typeof s === 'number')

    // A criterion the AI half never scored shouldn't look like a weakness.
    if (observed.length < MIN_OCCURRENCES) continue

    const weak = observed.filter((s) => s < WEAK_BELOW)
    if (weak.length < MIN_OCCURRENCES) continue

    out.push({
      criterionId: criterion.id satisfies CriterionId,
      criterionName: criterion.name,
      occurrences: weak.length,
      windowSize: observed.length,
      averageScore: Math.round((observed.reduce((a, b) => a + b, 0) / observed.length) * 10) / 10,
    })
  }

  // Worst first — if we surface only one, it should be the one that matters most.
  return out.sort((a, b) => a.averageScore - b.averageScore)
}
