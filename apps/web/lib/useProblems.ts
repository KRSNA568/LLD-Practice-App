'use client'

import { useEffect, useState } from 'react'
import type { Concept, NextProblemSuggestion, ProblemSummary, ProgressPayload, UpcomingProblem } from '@lld/contracts'
import { api } from '@/lib/api'
import { conceptIcon, type IconName } from '@/components/ui/Icon'
import { CHIP_TINTS } from '@/lib/tokens'
import type { ChipItem } from '@/components/ui/Chips'

/**
 * The three payloads most screens need, fetched together, plus the derived
 * bits every card wants: a concept's name, the problem's primary concept, the
 * chip row. Concept names are cached for the session — the graph does not change.
 */
let conceptCache: Concept[] | null = null

export type Library = {
  problems: ProblemSummary[]
  upcoming: UpcomingProblem[]
  next: NextProblemSuggestion | null
  concepts: Concept[]
  progress: ProgressPayload | null
}

export function useLibrary(withProgress = true): { data: Library | null; error: string | null } {
  const [data, setData] = useState<Library | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    Promise.all([
      api.listProblems(),
      conceptCache ? Promise.resolve({ concepts: conceptCache }) : api.getConcepts().then((c) => { conceptCache = c.concepts; return c }),
      withProgress ? api.getProgress() : Promise.resolve(null),
    ])
      .then(([lib, c, progress]) => {
        if (!alive) return
        setData({ problems: lib.problems, upcoming: lib.upcoming, next: lib.next, concepts: c.concepts, progress })
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : 'Could not load'))
    return () => { alive = false }
  }, [withProgress])
  return { data, error }
}

export function conceptName(concepts: Concept[], id: string): string {
  return concepts.find((c) => c.id === id)?.name ?? id
}

/**
 * The design labels problems with short themes — "Structure", "State machines",
 * "Concurrency". The concept graph's full names are the curriculum's; these are
 * the same ideas at card length. Anything not listed uses its full name.
 */
const SHORT: Record<string, string> = {
  srp: 'Responsibility',
  'association-modeling': 'Associations',
  'domain-modeling': 'Domain model',
  'interface-design': 'Interfaces',
  'open-closed': 'Open/closed',
  'state-modeling': 'State machines',
  'concurrency-safety': 'Concurrency',
  'composition-over-inheritance': 'Composition',
  immutability: 'Immutability',
  'error-modeling': 'Error handling',
  collaboration: 'Collaboration',
  'design-rationale': 'Rationale',
  dip: 'Inversion',
  isp: 'Segregation',
  lsp: 'Substitution',
}
export function shortName(concepts: Concept[], id: string): string {
  return SHORT[id] ?? conceptName(concepts, id)
}

/** A problem's category label and glyph: its first concept. */
export function primaryConcept(concepts: Concept[], tags: string[]): { label: string; icon: IconName } {
  const id = tags[0] ?? ''
  return { label: shortName(concepts, id), icon: conceptIcon(id) }
}

export function conceptItems(concepts: Concept[], tags: string[]): Array<{ id: string; name: string }> {
  return tags.map((id) => ({ id, name: conceptName(concepts, id) }))
}

/** "All" plus every concept some playable problem exercises, most common first. */
export function chipsFor(concepts: Concept[], problems: ProblemSummary[]): ChipItem[] {
  const count = new Map<string, number>()
  for (const p of problems) for (const t of p.conceptTags) count.set(t, (count.get(t) ?? 0) + 1)
  const ordered = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return [
    { id: 'all', label: 'All', icon: 'all', tint: '#111111' },
    ...ordered.map(([id], i) => ({ id, label: shortName(concepts, id), icon: conceptIcon(id), tint: CHIP_TINTS[i % CHIP_TINTS.length]! })),
  ]
}
