import type { CriterionResult, EvidenceRef, Score } from '@lld/contracts'
import type { DesignCheck, EvaluationContext } from '../../Evaluator.js'
import {
  concentration,
  resolveWalkthrough,
  unexercisedClasses,
  type ResolvedWalkthrough,
} from '../../../domain/design/Walkthrough.js'

/**
 * Does the design actually run its scenarios?
 *
 * A class list says what the learner *thinks* the objects are. A walkthrough says
 * what they *do* — which object receives the car, which decides the spot, who says
 * no when the lot is full. Checking each step against the declared classes and
 * methods catches the fault that 97% of novice designs carry: a class that exists
 * on paper and takes no part in anything.
 *
 * Three questions, in order of how much they cost the score: do the steps land on
 * real classes and real methods; does every scenario that should end in a refusal
 * actually end in one; and is the work spread across the design or piled onto one
 * class. The last is the god class seen from the behavioural side — a class whose
 * responsibility sentence is modest but which performs every step of every scenario
 * is a god class that wrote a good sentence.
 */

/** One class doing this share of all steps is doing everyone's job. */
const DOMINANT_SHARE = 0.7

export class WalkthroughCheck implements DesignCheck {
  readonly id = 'walkthrough'
  readonly criterionId = 'behaviour' as const
  readonly stage = 'design' as const
  readonly requires = ['structure', 'behaviour'] as const

  run(ctx: EvaluationContext): CriterionResult {
    const { problem, design, graph } = ctx
    const scenarios = problem.scenarios

    const resolved: ResolvedWalkthrough[] = design.walkthroughs
      .filter((w) => w.steps.length > 0)
      .map((w) =>
        resolveWalkthrough(w, scenarios.find((s) => s.id === w.scenarioId), graph),
      )

    const evidence: EvidenceRef[] = []
    const notes: string[] = []

    const allSteps = resolved.flatMap((w) => w.steps)
    const dangling = allSteps.filter((s) => !s.classFound)
    const undeclared = allSteps.filter((s) => s.classFound && !s.methodFound)

    if (resolved.length === 0 || allSteps.length === 0) {
      return this.result(0, [], [
        scenarios.length > 0
          ? `No scenario was walked through the design. Until ${scenarios[0]!.title.toLowerCase()} has been traced step by step, the classes are a list rather than a system.`
          : 'No scenarios are declared for this problem.',
      ], 'Pick the first scenario and write the steps: which class receives the request, which one decides, which one records the result.')
    }

    // Steps that point at nothing.
    if (dangling.length > 0 || undeclared.length > 0) {
      const worst = resolved
        .map((w) => ({ w, bad: w.steps.filter((s) => !s.classFound || !s.methodFound) }))
        .filter((x) => x.bad.length > 0)
        .sort((a, b) => b.bad.length - a.bad.length)[0]!
      const first = worst.bad[0]!
      const title = worst.w.scenario?.title ?? worst.w.scenarioId

      if (!first.classFound) {
        notes.push(
          `Step ${first.index + 1} of "${title}" calls ${first.step.className}.${first.step.method}, but no class named ${first.step.className} is declared.`,
        )
      } else {
        notes.push(
          `Step ${first.index + 1} of "${title}" calls ${first.className}.${first.step.method}, but ${first.className} does not declare a method called ${first.step.method}. The walkthrough and the class disagree about what ${first.className} can do.`,
        )
      }
      const more = dangling.length + undeclared.length - 1
      if (more > 0) notes.push(`${more} more step${more === 1 ? '' : 's'} ${more === 1 ? 'has' : 'have'} the same problem.`)
      evidence.push({ kind: 'step', scenarioId: worst.w.scenarioId, index: first.index })
      if (first.className) evidence.push({ kind: 'class', name: first.className })
    }

    // Failure paths that end happily.
    const silent = resolved.filter((w) => w.silentFailure)
    for (const w of silent.slice(0, 1)) {
      const last = w.steps[w.steps.length - 1]
      notes.push(
        `"${w.scenario?.title ?? w.scenarioId}" is a scenario where the request cannot be satisfied, but the walkthrough ends as if it succeeded. Nothing in the trace says no${last?.className ? ` — ${last.className}.${last.step.method} is the last step and it returns normally` : ''}.`,
      )
      if (last?.className) evidence.push({ kind: 'class', name: last.className })
      evidence.push({ kind: 'step', scenarioId: w.scenarioId, index: Math.max(0, w.steps.length - 1) })
    }

    // Scenarios that never touch the class that should own them.
    const misses = resolved.filter((w) => w.missesRequiredClass)
    for (const w of misses.slice(0, 1)) {
      const hints = w.scenario?.mustInvolve ?? []
      notes.push(
        `"${w.scenario?.title ?? w.scenarioId}" never touches anything ${hints.slice(0, 2).join('- or ')}-shaped, so it is not clear where that part of the work happens.`,
      )
    }

    // Scenarios not walked at all.
    const walkedIds = new Set(resolved.map((w) => w.scenarioId))
    const unwalked = scenarios.filter((s) => !walkedIds.has(s.id))
    if (unwalked.length > 0) {
      notes.push(
        `${unwalked.length === 1 ? 'One scenario was' : `${unwalked.length} scenarios were`} not walked: ${unwalked.map((s) => `"${s.title}"`).join(', ')}.`,
      )
    }

    // One class doing everything.
    const dominant = concentration(resolved)
    const hub =
      dominant && dominant.share >= DOMINANT_SHARE && graph.classes.length >= 3 ? dominant : null
    if (hub) {
      notes.push(
        `${hub.className} performs ${Math.round(hub.share * 100)}% of every step in every scenario. The other classes hold data; this one does the work.`,
      )
      evidence.push({ kind: 'class', name: hub.className })
    }

    // Classes that never get a turn.
    const idle = unexercisedClasses(resolved, graph)
    if (idle.length > 0 && unwalked.length === 0) {
      notes.push(
        `${idle.slice(0, 3).join(', ')} ${idle.length === 1 ? 'takes' : 'take'} no part in any scenario. Either a scenario is missing a step, or the class is not needed.`,
      )
      evidence.push(...idle.slice(0, 2).map((name) => ({ kind: 'class' as const, name })))
    }

    const badShare = (dangling.length + undeclared.length) / allSteps.length
    const score: Score =
      badShare > 0.5
        ? 0
        : resolved.length === 1 && scenarios.length > 1
          ? 1
          : hub
            ? 1
            : unwalked.length > 0 || silent.length > 0 || badShare > 0 || misses.length > 0
              ? 2
              : idle.length > 0
                ? 3
                : 4

    if (notes.length === 0) {
      const actors = new Set(allSteps.map((s) => s.className).filter(Boolean)).size
      notes.push(
        `All ${resolved.length} scenarios walked, every step lands on a declared class and method, and the work is spread across ${actors} classes.${silent.length === 0 && scenarios.some((s) => s.expectsFailurePath) ? ' The refusal path is traced explicitly.' : ''}`,
      )
      const decider = resolved.find((w) => w.outcome !== 'ok')?.steps.at(-1)
      if (decider?.className) evidence.push({ kind: 'class', name: decider.className })
    }

    const suggestion =
      dangling.length > 0 || undeclared.length > 0
        ? 'Either add the method to the class or move the step to the class that really owns it — the mismatch is telling you which.'
        : silent.length > 0
          ? 'End the refusal scenario with the class that says no, and mark the outcome as refused. That class is the one that needs a result type instead of a null.'
          : hub
            ? `Give at least two of the steps ${hub.className} performs to the classes that hold the data those steps read.`
            : unwalked.length > 0
              ? `Walk "${unwalked[0]!.title}" — it is the scenario most likely to expose a missing class.`
              : idle.length > 0
                ? `Find a scenario step that ${idle[0]} should own, or drop it.`
                : 'Keep walkthroughs alongside the design as it grows; they are the cheapest test you have.'

    return this.result(score, evidence.slice(0, 5), notes, suggestion)
  }

  private result(score: Score, evidence: EvidenceRef[], notes: string[], suggestion: string): CriterionResult {
    return {
      criterionId: this.criterionId,
      stage: this.stage,
      score,
      evidence,
      concern: notes.join(' '),
      suggestion,
      confidence: 'high',
      evaluatorId: 'rule-evaluator',
      evaluatorKind: 'deterministic',
    }
  }
}
