import { createHash } from 'node:crypto'
import type { DesignClass, DesignModel, Relationship, Stereotype } from '@lld/contracts'

/**
 * A queryable view over a submitted DesignModel.
 *
 * The model itself is a flat record — good for storage and for the wire, useless for
 * asking "does anything actually depend on this interface?". DesignGraph owns the
 * structural questions so that individual checks stay one-idea-each and never
 * re-implement traversal. Every deterministic check reads from here.
 *
 * Class names are matched case-insensitively. Learners type `parkingLot` in one row
 * and `ParkingLot` in the next, and punishing that would be grading typing, not design.
 */
export class DesignGraph {
  private readonly byKey = new Map<string, DesignClass>()
  private readonly outgoing = new Map<string, Relationship[]>()
  private readonly incoming = new Map<string, Relationship[]>()

  constructor(readonly model: DesignModel) {
    for (const cls of model.classes) {
      this.byKey.set(DesignGraph.key(cls.name), cls)
    }
    for (const rel of model.relationships) {
      const from = DesignGraph.key(rel.from)
      const to = DesignGraph.key(rel.to)
      if (!this.outgoing.has(from)) this.outgoing.set(from, [])
      if (!this.incoming.has(to)) this.incoming.set(to, [])
      this.outgoing.get(from)!.push(rel)
      this.incoming.get(to)!.push(rel)
    }
  }

  private static key(name: string): string {
    return name.trim().toLowerCase()
  }

  get classes(): readonly DesignClass[] {
    return this.model.classes
  }

  get relationships(): readonly Relationship[] {
    return this.model.relationships
  }

  has(name: string): boolean {
    return this.byKey.has(DesignGraph.key(name))
  }

  find(name: string): DesignClass | undefined {
    return this.byKey.get(DesignGraph.key(name))
  }

  /** Resolves to the canonical spelling the learner used, for citing in evidence. */
  canonicalName(name: string): string | undefined {
    return this.find(name)?.name
  }

  outgoingFrom(name: string): readonly Relationship[] {
    return this.outgoing.get(DesignGraph.key(name)) ?? []
  }

  incomingTo(name: string): readonly Relationship[] {
    return this.incoming.get(DesignGraph.key(name)) ?? []
  }

  /** How many other classes point at this one. A rough proxy for "how central is it". */
  inDegree(name: string): number {
    return this.incomingTo(name).length
  }

  outDegree(name: string): number {
    return this.outgoingFrom(name).length
  }

  withStereotype(...kinds: Stereotype[]): DesignClass[] {
    return this.model.classes.filter((c) => kinds.includes(c.stereotype))
  }

  /** Interfaces and abstract classes — the places a design can absorb change. */
  abstractions(): DesignClass[] {
    return this.withStereotype('interface', 'abstract')
  }

  /** Classes that declare `implements` or `extends` against the given type. */
  implementersOf(name: string): DesignClass[] {
    return this.incomingTo(name)
      .filter((r) => r.kind === 'implements' || r.kind === 'extends')
      .map((r) => this.find(r.from))
      .filter((c): c is DesignClass => c !== undefined)
  }

  /**
   * Declared but wired to nothing — no inbound edges, no outbound edges.
   *
   * Usually means the learner listed a noun from the brief without deciding what it
   * does, which is worth surfacing precisely because it looks like progress.
   */
  orphans(): DesignClass[] {
    return this.model.classes.filter(
      (c) => this.inDegree(c.name) === 0 && this.outDegree(c.name) === 0,
    )
  }

  /** Relationships naming a class that was never declared — almost always a typo. */
  danglingRelationships(): Relationship[] {
    return this.model.relationships.filter((r) => !this.has(r.from) || !this.has(r.to))
  }

  /**
   * Dependency cycles, as lists of canonical class names.
   *
   * Iterative DFS with an explicit stack — a learner can declare a surprising number
   * of classes, and blowing the call stack inside an evaluator would surface as a
   * failed evaluation rather than as the design smell it is.
   */
  cycles(): string[][] {
    const found: string[][] = []
    const seen = new Set<string>()
    const onPath = new Set<string>()
    const path: string[] = []

    const walk = (start: string): void => {
      const stack: Array<{ node: string; edgeIndex: number }> = [{ node: start, edgeIndex: 0 }]
      onPath.add(start)
      path.push(start)

      while (stack.length > 0) {
        const frame = stack[stack.length - 1]!
        const edges = this.outgoing.get(frame.node) ?? []

        if (frame.edgeIndex >= edges.length) {
          onPath.delete(frame.node)
          seen.add(frame.node)
          path.pop()
          stack.pop()
          continue
        }

        const next = DesignGraph.key(edges[frame.edgeIndex]!.to)
        frame.edgeIndex += 1

        if (onPath.has(next)) {
          const at = path.indexOf(next)
          if (at !== -1) {
            found.push(path.slice(at).map((k) => this.byKey.get(k)?.name ?? k))
          }
          continue
        }
        if (seen.has(next) || !this.byKey.has(next)) continue

        onPath.add(next)
        path.push(next)
        stack.push({ node: next, edgeIndex: 0 })
      }
    }

    for (const key of this.byKey.keys()) {
      if (!seen.has(key)) walk(key)
    }
    return found
  }

  /**
   * A stable fingerprint of the design's substance.
   *
   * Sorted and whitespace-normalised so that reordering rows or fixing spacing does
   * not read as a new design. Used to tell a real revision from a resubmit of the
   * same thing — the latter should not cost another evaluation.
   */
  fingerprint(): string {
    const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase()
    const payload = JSON.stringify({
      assumptions: [...this.model.assumptions].map(norm).sort(),
      classes: [...this.model.classes]
        .map((c) => ({
          n: norm(c.name),
          s: c.stereotype,
          r: norm(c.responsibility),
          a: [...c.attributes].map(norm).sort(),
          m: [...c.methods].map(norm).sort(),
        }))
        .sort((a, b) => a.n.localeCompare(b.n)),
      relationships: [...this.model.relationships]
        .map((r) => `${norm(r.from)}|${r.kind}|${norm(r.to)}`)
        .sort(),
      tradeoffs: norm(this.model.tradeoffs),
      decisions: [...this.model.decisions]
        .map((d) => `${norm(d.what)}|${norm(d.alternative)}|${norm(d.why)}`)
        .sort(),
      walkthroughs: [...this.model.walkthroughs]
        .map((w) => ({
          s: w.scenarioId,
          o: w.outcome,
          t: w.steps.map((st) => `${norm(st.className)}.${norm(st.method)}`),
        }))
        .sort((a, b) => a.s.localeCompare(b.s)),
    })
    return createHash('sha256').update(payload).digest('hex')
  }
}
