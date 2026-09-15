import type { CriterionResult, EvidenceRef, Score } from '@lld/contracts'
import type { DesignCheck, EvaluationContext } from '../../Evaluator.js'

/**
 * Structural health of the object graph.
 *
 * Four faults, all provable from the graph rather than judged:
 *
 *  - dangling edges  — a relationship naming a class that was never declared
 *  - orphans         — a class wired to nothing at all
 *  - cycles          — A depends on B depends on C depends on A
 *  - hubs            — one class that most of the design points at
 *
 * Dangling edges are weighted hardest because they mean the design does not describe
 * a coherent system: the learner is referring to something they never defined.
 */
export class CouplingCheck implements DesignCheck {
  readonly id = 'coupling'
  readonly criterionId = 'coupling-cohesion' as const
  readonly stage = 'design' as const
  readonly requires = ['structure'] as const

  run(ctx: EvaluationContext): CriterionResult {
    const { graph } = ctx

    const dangling = graph.danglingRelationships()
    const orphans = graph.orphans()
    const cycles = graph.cycles()

    /**
     * Two shapes of hub, and both need care.
     *
     * A *depended-on* hub counts only `uses` and `has-a` edges. Inheritance edges
     * are excluded deliberately: an interface with five implementers is the design
     * working, not a bottleneck, and counting those would penalise exactly the
     * abstraction we spend another check rewarding.
     *
     * A *coordinator* hub is the god-class star — one class holding most of the
     * outgoing edges while everything else is inert. That is the common shape in
     * small designs, where a raw in-degree threshold never fires because there are
     * not enough classes for anything to look central.
     */
    const dependencyEdges = graph.relationships.filter(
      (r) => r.kind === 'uses' || r.kind === 'has-a',
    )

    const dependedOn =
      graph.classes.length >= 6
        ? graph.classes.filter(
            (c) =>
              graph.incomingTo(c.name).filter((r) => r.kind === 'uses' || r.kind === 'has-a')
                .length >= Math.ceil(graph.classes.length / 2),
          )
        : []

    const coordinators =
      dependencyEdges.length >= 3 && graph.classes.length >= 3
        ? graph.classes.filter((c) => {
            const out = graph.outgoingFrom(c.name).filter(
              (r) => r.kind === 'uses' || r.kind === 'has-a',
            ).length
            return out >= 3 && out / dependencyEdges.length >= 0.7
          })
        : []

    const hubs = [...new Set([...dependedOn, ...coordinators])]

    // One orphan is a loose end; several is a design that was never connected.
    const faults =
      (dangling.length > 0 ? 2 : 0) +
      (cycles.length > 0 ? 2 : 0) +
      (orphans.length >= 2 ? 2 : orphans.length === 1 ? 1 : 0) +
      (hubs.length > 0 ? 1 : 0)

    // As in GodClassCheck: an empty graph has no orphans, no cycles and no dangling
    // edges, and was scoring 4 with "the graph holds together". It does not hold
    // together; there is no graph.
    if (graph.classes.length === 0) {
      return {
        criterionId: this.criterionId,
        stage: this.stage,
        score: 0,
        evidence: [],
        concern: 'There are no classes in this design, so there is no structure to assess.',
        suggestion: 'Start by naming the objects in this problem and how they are connected.',
        confidence: 'high',
        evaluatorId: 'rule-evaluator',
        evaluatorKind: 'deterministic',
      }
    }

    const score: Score = faults === 0 ? 4 : faults === 1 ? 3 : faults === 2 ? 2 : faults <= 4 ? 1 : 0

    const notes: string[] = []
    const evidence: EvidenceRef[] = []

    if (dangling.length > 0) {
      const names = [...new Set(dangling.flatMap((r) => [r.from, r.to]))]
        .filter((n) => !graph.has(n))
        .slice(0, 3)
      notes.push(
        `${dangling.length} relationship${dangling.length === 1 ? '' : 's'} point at classes that were never declared: ${names.join(', ')}.`,
      )
      evidence.push(
        ...dangling.slice(0, 3).map((r) => ({ kind: 'relationship' as const, from: r.from, to: r.to })),
      )
    }

    if (cycles.length > 0) {
      notes.push(
        `Dependency cycle: ${cycles[0]!.join(' -> ')} -> ${cycles[0]![0]}. Neither class can be understood, changed or tested without the other.`,
      )
      evidence.push(...cycles[0]!.slice(0, 3).map((name) => ({ kind: 'class' as const, name })))
    }

    if (orphans.length > 0) {
      notes.push(
        `${orphans.map((o) => o.name).join(', ')} ${orphans.length === 1 ? 'is' : 'are'} declared but connected to nothing — usually a noun taken from the brief before deciding what it does.`,
      )
      evidence.push(...orphans.slice(0, 3).map((o) => ({ kind: 'class' as const, name: o.name })))
    }

    if (hubs.length > 0) {
      const isCoordinator = coordinators.length > 0
      notes.push(
        isCoordinator
          ? `${coordinators.map((h) => h.name).join(', ')} holds almost every dependency in the design, so the other classes are data and one class is the program.`
          : `${hubs.map((h) => h.name).join(', ')} ${hubs.length === 1 ? 'is' : 'are'} referenced by at least half the design, which concentrates change in one place.`,
      )
      evidence.push(...hubs.slice(0, 2).map((h) => ({ kind: 'class' as const, name: h.name })))
    }

    const suggestion =
      dangling.length > 0
        ? 'Declare the missing classes, or correct the names in those relationships.'
        : cycles.length > 0
          ? 'Break the cycle by having one side depend on an interface the other implements.'
          : orphans.length > 0
            ? 'Either connect each orphan to the classes that use it, or drop it.'
            : hubs.length > 0
              ? 'Move behaviour out of the hub and into the classes that own the data it operates on.'
              : 'Keep an eye on fan-in as the design grows.'

    return {
      criterionId: this.criterionId,
      stage: this.stage,
      score,
      evidence: evidence.slice(0, 5),
      concern: notes.length > 0 ? notes.join(' ') : 'No orphans, cycles or dangling references. The graph holds together.',
      suggestion,
      confidence: 'high',
      evaluatorId: 'rule-evaluator',
      evaluatorKind: 'deterministic',
    }
  }
}
