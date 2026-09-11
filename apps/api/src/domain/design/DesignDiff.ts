import type { DesignClass, DesignModel, Relationship } from '@lld/contracts'

/**
 * What changed between two versions of a design.
 *
 * This is the evidence for the change stage. The learner froze a design, was then
 * shown a requirement change, and revised. The interesting question — did the
 * design absorb the change by *adding*, or by *reopening* what already worked? — is
 * answered by counting, not by reading. A new class behind a seam that already
 * existed is the open-closed principle happening; three edited classes and a new
 * boolean is the thing it exists to prevent.
 *
 * Classes are matched by canonical name. A rename therefore shows up as one removal
 * and one addition, which is honest: the evaluator cannot tell a rename from a
 * replacement, and the report says so rather than guessing.
 */

export type ClassChange = {
  name: string
  before: DesignClass
  after: DesignClass
  /** Which fields differ — so a finding can say "methods changed", not just "changed". */
  fields: Array<'stereotype' | 'responsibility' | 'attributes' | 'methods'>
  /** Attributes that were added, in the learner's own spelling — for spotting `isElectric`. */
  attributesAdded: string[]
  methodsAdded: string[]
}

export type DesignDiff = {
  added: DesignClass[]
  removed: DesignClass[]
  modified: ClassChange[]
  unchanged: DesignClass[]
  relationshipsAdded: Relationship[]
  relationshipsRemoved: Relationship[]
}

const key = (name: string): string => name.trim().toLowerCase()
const list = (xs: readonly string[]): string[] => [...xs].map(key).sort()
const same = (a: readonly string[], b: readonly string[]): boolean =>
  list(a).join(' ') === list(b).join(' ')
const edge = (r: Relationship): string => `${key(r.from)}|${key(r.to)}|${r.kind}`

export function diffDesigns(before: DesignModel, after: DesignModel): DesignDiff {
  const beforeByKey = new Map(before.classes.map((c) => [key(c.name), c]))
  const afterByKey = new Map(after.classes.map((c) => [key(c.name), c]))

  const added = after.classes.filter((c) => !beforeByKey.has(key(c.name)))
  const removed = before.classes.filter((c) => !afterByKey.has(key(c.name)))

  const modified: ClassChange[] = []
  const unchanged: DesignClass[] = []

  for (const prior of before.classes) {
    const now = afterByKey.get(key(prior.name))
    if (!now) continue

    const fields: ClassChange['fields'] = []
    if (prior.stereotype !== now.stereotype) fields.push('stereotype')
    if (prior.responsibility.trim() !== now.responsibility.trim()) fields.push('responsibility')
    if (!same(prior.attributes, now.attributes)) fields.push('attributes')
    if (!same(prior.methods, now.methods)) fields.push('methods')

    if (fields.length === 0) {
      unchanged.push(now)
      continue
    }

    const priorAttrs = new Set(list(prior.attributes))
    const priorMethods = new Set(list(prior.methods))
    modified.push({
      name: now.name,
      before: prior,
      after: now,
      fields,
      attributesAdded: now.attributes.filter((a) => !priorAttrs.has(key(a))),
      methodsAdded: now.methods.filter((m) => !priorMethods.has(key(m))),
    })
  }

  const beforeEdges = new Set(before.relationships.map(edge))
  const afterEdges = new Set(after.relationships.map(edge))

  return {
    added,
    removed,
    modified,
    unchanged,
    relationshipsAdded: after.relationships.filter((r) => !beforeEdges.has(edge(r))),
    relationshipsRemoved: before.relationships.filter((r) => !afterEdges.has(edge(r))),
  }
}

/**
 * Of the classes added in the revision, which ones plug into an abstraction that
 * already existed before the change? That is the shape of a change absorbed at a
 * seam, and it is the difference between a 3 and a 4 on change-resilience.
 */
export function seamsReused(diff: DesignDiff, before: DesignModel, after: DesignModel): string[] {
  const priorAbstractions = new Set(
    before.classes
      .filter((c) => c.stereotype === 'interface' || c.stereotype === 'abstract')
      .map((c) => key(c.name)),
  )
  const addedNames = new Set(diff.added.map((c) => key(c.name)))

  const seams = new Set<string>()
  for (const r of after.relationships) {
    const plugsIn = r.kind === 'implements' || r.kind === 'extends'
    if (plugsIn && addedNames.has(key(r.from)) && priorAbstractions.has(key(r.to))) {
      seams.add(r.to)
    }
  }
  return [...seams]
}

/** Blast radius: how many classes that already worked had to be reopened. */
export function blastRadius(diff: DesignDiff): number {
  return diff.modified.length + diff.removed.length
}
