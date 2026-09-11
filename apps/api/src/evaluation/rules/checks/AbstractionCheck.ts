import type { CriterionResult, DesignClass, EvidenceRef, Score, VariationPoint } from '@lld/contracts'
import type { DesignCheck, EvaluationContext } from '../../Evaluator.js'
import { containsAny } from '../text.js'

/**
 * Is there a seam where this problem is known to change?
 *
 * Every problem file declares its variation points — the places a real system gets
 * edited over and over. Pricing rules change; spot-allocation strategy changes;
 * vehicle categories get added. A design that hardcodes those has to be reopened
 * every time, and that is what this check measures.
 *
 * The finding nobody else can make is the second one below: an abstraction that
 * exists but that nothing implements. Declaring `PricingStrategy` and then leaving
 * all the pricing inside a concrete class looks like good design in a class list and
 * is worth nothing in practice. The relationship rows are what expose it.
 */
export class AbstractionCheck implements DesignCheck {
  readonly id = 'abstraction'
  readonly criterionId = 'abstraction-use' as const
  readonly stage = 'design' as const
  readonly requires = ['structure'] as const

  run(ctx: EvaluationContext): CriterionResult {
    const { problem, graph } = ctx
    const expected = problem.variationPoints.filter((v) => v.expectAbstraction)

    const missing: Array<{ vp: VariationPoint; absorbedBy?: DesignClass }> = []
    const unimplemented: Array<{ vp: VariationPoint; abstraction: DesignClass }> = []
    const covered: DesignClass[] = []

    for (const vp of expected) {
      // Any shape the variation point accepts can be its seam — an enum is a
      // legitimate answer to "vehicle type", where an interface would be ceremony.
      const abstraction = graph
        .withStereotype(...vp.acceptableShapes)
        .find((c) => matches(c, vp) || containsAny(c.responsibility, vp.nameHints))

      if (!abstraction) {
        // Nothing abstract covers this seam. Find where the responsibility ended up
        // instead, so the feedback can point at a real class rather than an absence.
        const absorbedBy = graph.classes.find(
          (c) => matches(c, vp) || containsAny(c.responsibility, vp.nameHints),
        )
        missing.push({ vp, absorbedBy })
        continue
      }

      // An interface carries weight when something implements it; an enum carries
      // weight when something holds or uses it.
      const carriesWeight =
        abstraction.stereotype === 'enum'
          ? graph.inDegree(abstraction.name) > 0
          : graph.implementersOf(abstraction.name).length > 0

      if (!carriesWeight) {
        unimplemented.push({ vp, abstraction })
      } else {
        covered.push(abstraction)
      }
    }

    // Interfaces declared for no seam at all and implemented by nothing — usually
    // pattern vocabulary added to look thorough.
    const inert = graph
      .abstractions()
      .filter(
        (a) =>
          graph.implementersOf(a.name).length === 0 &&
          !unimplemented.some((u) => u.abstraction.name === a.name),
      )

    const faults = missing.length * 2 + unimplemented.length * 2 + inert.length
    const score: Score =
      expected.length === 0 ? 3 : faults === 0 ? 4 : faults === 1 ? 3 : faults <= 3 ? 2 : faults <= 5 ? 1 : 0

    const notes: string[] = []
    const evidence: EvidenceRef[] = []

    for (const { vp, absorbedBy } of missing) {
      notes.push(
        absorbedBy
          ? `${vp.name} has no interface or abstract type. It currently lives inside ${absorbedBy.name}, so ${vp.why.toLowerCase()} means editing that class every time.`
          : `${vp.name} has no seam in the design at all, and ${vp.why.toLowerCase()}.`,
      )
      if (absorbedBy) evidence.push({ kind: 'class', name: absorbedBy.name })
    }

    for (const { vp, abstraction } of unimplemented) {
      notes.push(
        abstraction.stereotype === 'enum'
          ? `${abstraction.name} is declared for ${vp.name} but nothing in the design holds or uses it.`
          : `${abstraction.name} is declared for ${vp.name} but nothing implements it, so the seam is not carrying any behaviour yet.`,
      )
      evidence.push({ kind: 'class', name: abstraction.name })
    }

    if (inert.length > 0) {
      notes.push(
        `${inert.map((i) => i.name).join(', ')} ${inert.length === 1 ? 'is an abstraction' : 'are abstractions'} with no implementers and no variation point behind ${inert.length === 1 ? 'it' : 'them'}.`,
      )
      evidence.push(...inert.slice(0, 2).map((i) => ({ kind: 'class' as const, name: i.name })))
    }

    if (notes.length === 0) {
      notes.push(
        covered.length > 0
          ? `Every declared variation point is behind an abstraction with at least one implementation: ${covered.map((c) => c.name).join(', ')}.`
          : 'No variation points are declared for this problem.',
      )
      evidence.push(...covered.slice(0, 3).map((c) => ({ kind: 'class' as const, name: c.name })))
    }

    const suggestion =
      missing.length > 0
        ? `Introduce an interface for ${missing[0]!.vp.name} and move the varying behaviour behind it.`
        : unimplemented.length > 0
          ? `Add at least one class implementing ${unimplemented[0]!.abstraction.name}, and have the caller depend on the interface rather than the concrete type.`
          : inert.length > 0
            ? 'Drop abstractions that nothing implements — an interface with no second implementation is indirection without benefit.'
            : 'Keep new variation behind the existing interfaces rather than adding branches.'

    return {
      criterionId: this.criterionId,
      stage: this.stage,
      score,
      evidence: evidence.slice(0, 5),
      concern: notes.join(' '),
      suggestion,
      confidence: 'high',
      evaluatorId: 'rule-evaluator',
      evaluatorKind: 'deterministic',
    }
  }
}

function matches(cls: DesignClass, vp: VariationPoint): boolean {
  if (!vp.acceptableShapes.includes(cls.stereotype as 'interface' | 'abstract' | 'enum')) {
    // Name still counts — a concrete class named PricingStrategy tells us where the
    // responsibility went, even though it is not a seam.
    return containsAny(cls.name, vp.nameHints)
  }
  return containsAny(cls.name, vp.nameHints)
}
