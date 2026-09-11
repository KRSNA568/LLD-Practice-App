import type { NextProblemSuggestion, Problem, RecurringWeakness, Rubric } from '@lld/contracts'

/**
 * Picks the problem a learner should try next.
 *
 * Deliberate practice means practising the thing you are worst at, on new material.
 * A recurring weakness names a criterion; the rubric maps that criterion to concepts;
 * problems are tagged with the concepts they exercise. Follow the chain and the
 * recommendation is *"Vending Machine — it exercises the abstraction you keep
 * hardcoding"* rather than *"here is the next one in the list"*.
 *
 * With no weakness on record it falls back to the authored `nextProblems` edge, and
 * then to the first problem the learner has not attempted.
 */
export function suggestNextProblem(args: {
  current: Problem | null
  problems: readonly Problem[]
  rubric: Rubric
  weaknesses: readonly RecurringWeakness[]
  attemptedIds: ReadonlySet<string>
}): NextProblemSuggestion | null {
  const { current, problems, rubric, weaknesses, attemptedIds } = args
  const candidates = problems.filter((p) => p.id !== current?.id)
  if (candidates.length === 0) return null

  const weakest = weaknesses[0]
  if (weakest) {
    const criterion = rubric.criteria.find((c) => c.id === weakest.criterionId)
    const concepts = new Set(criterion?.conceptIds ?? [])

    const targeted = candidates
      .filter((p) => p.conceptTags.some((t) => concepts.has(t)))
      // Untried first, then the authored path, then easiest.
      .sort(
        (a, b) =>
          Number(attemptedIds.has(a.id)) - Number(attemptedIds.has(b.id)) ||
          Number(!current?.nextProblems.includes(a.id)) - Number(!current?.nextProblems.includes(b.id)) ||
          a.tier - b.tier,
      )

    const pick = targeted[0]
    if (pick && criterion) {
      const overlap = pick.conceptTags.filter((t) => concepts.has(t))
      return {
        problemId: pick.id,
        title: pick.title,
        criterionId: criterion.id,
        criterionName: criterion.name,
        reason: `${criterion.name} has scored below 2 in ${weakest.occurrences} of your last ${weakest.windowSize} attempts. ${pick.title} exercises ${overlap.join(' and ')} in a different domain.`,
      }
    }
  }

  const authored = current?.nextProblems
    .map((id) => candidates.find((p) => p.id === id))
    .find((p): p is Problem => !!p && !attemptedIds.has(p.id))
  const untried = candidates.find((p) => !attemptedIds.has(p.id))
  const pick = authored ?? untried ?? candidates[0]!

  return {
    problemId: pick.id,
    title: pick.title,
    criterionId: null,
    criterionName: null,
    reason: authored
      ? `A natural next step after ${current!.title}: same shape of problem, different domain.`
      : untried
        ? `You have not tried ${pick.title} yet.`
        : `Another pass at ${pick.title} would test whether the last feedback stuck.`,
  }
}
