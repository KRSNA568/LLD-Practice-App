import type { Scenario, Walkthrough, WalkthroughStep } from '@lld/contracts'
import type { DesignGraph } from './DesignGraph.js'

/**
 * Resolves a scenario walkthrough against the design it claims to run through.
 *
 * A walkthrough is the learner "executing" their design by hand — CRC-card
 * role-play as a list of steps. Each step names a class and a method. This module
 * checks that the class exists, that the class actually declares the method, and
 * then looks at the walkthroughs as a whole: which classes never get a turn, and
 * whether one class is doing everything.
 *
 * The most common novice design fault — a class that is declared but never talks
 * to anything — is invisible in a class list and obvious here.
 */

export type ResolvedStep = {
  index: number
  step: WalkthroughStep
  /** The learner's own spelling of the class, when it exists. */
  className: string | null
  classFound: boolean
  methodFound: boolean
}

export type ResolvedWalkthrough = {
  scenarioId: string
  scenario: Scenario | undefined
  outcome: Walkthrough['outcome']
  steps: ResolvedStep[]
  /** True when the scenario expects a refusal and the walkthrough ends `ok`. */
  silentFailure: boolean
  /** True when the scenario has `mustInvolve` hints and no step touches a matching class. */
  missesRequiredClass: boolean
}

const CONSTRUCTOR_WORDS = new Set(['init', 'new', 'constructor', 'ctor'])

/**
 * `feeFor(ticket)` and `feeFor` are the same method; so are `fee_for` and `FeeFor`.
 * So is `Receipt exitVehicle(String ticketId)` — the name is the identifier before
 * the parenthesis, whatever return type or visibility marker sits in front of it.
 * A Java-style class was scoring 0 on behaviour because every step "called a
 * method the class does not declare".
 */
function normMethod(s: string): string {
  const beforeParen = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(s)
  const name = beforeParen
    ? beforeParen[1]!
    : (s.replace(/:.*$/, '').match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).at(-1) ?? ''
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function resolveWalkthrough(
  walkthrough: Walkthrough,
  scenario: Scenario | undefined,
  graph: DesignGraph,
): ResolvedWalkthrough {
  const steps: ResolvedStep[] = walkthrough.steps.map((step, index) => {
    const canonical = graph.canonicalName(step.className)
    const cls = canonical ? graph.find(canonical) : undefined
    const wanted = normMethod(step.method)
    // Every class has a constructor whether or not it is listed. `Ticket.<init>`,
    // `Ticket.new`, `Ticket.constructor` and `Ticket.Ticket` all mean "a Ticket is
    // created here" — a step a careful learner writes, and one the walkthrough
    // check was calling a method the class does not declare.
    const isConstructor = !!cls && (CONSTRUCTOR_WORDS.has(wanted) || wanted === normMethod(cls.name))
    const methodFound = !!cls && (isConstructor || cls.methods.some((m) => normMethod(m) === wanted))
    return {
      index,
      step,
      className: canonical ?? null,
      classFound: !!canonical,
      methodFound,
    }
  })

  const silentFailure = !!scenario?.expectsFailurePath && walkthrough.outcome === 'ok'

  const hints = (scenario?.mustInvolve ?? []).map((h) => h.toLowerCase())
  const touched = steps.filter((s) => s.className).map((s) => s.className!.toLowerCase())
  const missesRequiredClass =
    hints.length > 0 &&
    steps.length > 0 &&
    !touched.some((name) => hints.some((h) => name.includes(h)))

  return {
    scenarioId: walkthrough.scenarioId,
    scenario,
    outcome: walkthrough.outcome,
    steps,
    silentFailure,
    missesRequiredClass,
  }
}

/** Classes in the design that no walkthrough ever gives a turn to. */
export function unexercisedClasses(
  resolved: readonly ResolvedWalkthrough[],
  graph: DesignGraph,
): string[] {
  const touched = new Set<string>()
  for (const w of resolved) {
    for (const s of w.steps) if (s.className) touched.add(s.className.toLowerCase())
  }

  // Only concrete classes that declare behaviour are expected to act. An
  // interface's or abstract class's turn is taken by its implementer, an enum has
  // nothing to run, and a value class with no methods (Car, Coin) is data.
  return graph.classes
    .filter((c) => c.stereotype === 'class' && c.methods.length > 0)
    .filter((c) => !touched.has(c.name.toLowerCase()))
    .map((c) => c.name)
}

/** The class that takes the largest share of all steps, and that share. */
export function concentration(
  resolved: readonly ResolvedWalkthrough[],
): { className: string; share: number; steps: number } | null {
  const counts = new Map<string, number>()
  let total = 0
  for (const w of resolved) {
    for (const s of w.steps) {
      if (!s.className) continue
      counts.set(s.className, (counts.get(s.className) ?? 0) + 1)
      total += 1
    }
  }
  if (total === 0) return null

  let best: { className: string; share: number; steps: number } | null = null
  for (const [className, n] of counts) {
    const share = n / total
    if (!best || share > best.share) best = { className, share, steps: total }
  }
  return best
}
