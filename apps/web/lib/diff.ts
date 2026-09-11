import type { RawStructuredSubmission } from '@lld/contracts'

/**
 * A live, presentation-only diff between the frozen design and the form as the
 * learner edits it during the change stage.
 *
 * This is the counter that ticks while they work — "2 touched · 1 added". The
 * measurement that scores the attempt is the server's DesignDiff; this only has to
 * agree with it closely enough that the number on screen is not a surprise later.
 */

export type LiveDiff = {
  added: string[]
  removed: string[]
  modified: string[]
}

type Row = RawStructuredSubmission['classes'][number]

const key = (s: string): string => s.trim().toLowerCase()
const list = (xs: readonly string[]): string =>
  xs.map(key).filter(Boolean).sort().join('|')

function sameRow(a: Row, b: Row): boolean {
  return (
    a.stereotype === b.stereotype &&
    a.responsibility.trim() === b.responsibility.trim() &&
    list(a.attributes) === list(b.attributes) &&
    list(a.methods) === list(b.methods)
  )
}

export function liveDiff(before: RawStructuredSubmission, after: RawStructuredSubmission): LiveDiff {
  const beforeRows = new Map(before.classes.filter((c) => key(c.name)).map((c) => [key(c.name), c]))
  const afterRows = new Map(after.classes.filter((c) => key(c.name)).map((c) => [key(c.name), c]))

  const added: string[] = []
  const removed: string[] = []
  const modified: string[] = []

  for (const [k, row] of afterRows) {
    const prior = beforeRows.get(k)
    if (!prior) added.push(row.name.trim())
    else if (!sameRow(prior, row)) modified.push(row.name.trim())
  }
  for (const [k, row] of beforeRows) {
    if (!afterRows.has(k)) removed.push(row.name.trim())
  }

  return { added, removed, modified }
}
