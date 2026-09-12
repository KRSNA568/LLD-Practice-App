import type { DesignGraph } from '../domain/design/DesignGraph.js'

/**
 * Grounding for prose, the mentor's equivalent of EvidenceGroundingValidator.
 *
 * A score cites evidence by reference and a reference either resolves or is
 * dropped. Prose cannot be checked that precisely, so the rule is coarser and
 * applied per sentence: any sentence that names an identifier the learner never
 * wrote is removed. What survives is guaranteed to talk about *this* design.
 *
 * "Identifier" is anything the model wrote in backticks or in CamelCase — the two
 * ways a class name shows up in prose. Ordinary words are never checked, so a
 * sentence about "the pricing rule" is fine; a sentence about `PricingEngine`
 * is fine only if the learner has a PricingEngine.
 */

const IDENTIFIER = /`([^`]+)`|\b([A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+)\b/g

/** Identifiers mentioned in a piece of text, deduplicated, in order. */
export function identifiersIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(IDENTIFIER)) {
    const raw = (m[1] ?? m[2] ?? '').trim()
    // `Spot.allocate()` cites Spot; `Spot::x` likewise.
    const head = raw.split(/[.(:\s]/)[0] ?? raw
    if (head && !out.includes(head)) out.push(head)
  }
  return out
}

export type GroundedProse = {
  text: string
  kept: number
  dropped: Array<{ sentence: string; unknown: string[] }>
}

/** Splits on sentence ends while keeping abbreviations like "e.g." intact enough. */
export function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z`"'(])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function groundProse(text: string, graph: DesignGraph, extraKnown: string[] = []): GroundedProse {
  const known = new Set(extraKnown.map((k) => k.toLowerCase()))
  const kept: string[] = []
  const dropped: GroundedProse['dropped'] = []

  for (const sentence of sentencesOf(text)) {
    const unknown = identifiersIn(sentence).filter((id) => !graph.has(id) && !known.has(id.toLowerCase()))
    if (unknown.length > 0) dropped.push({ sentence, unknown })
    else kept.push(sentence)
  }

  return { text: kept.join(' '), kept: kept.length, dropped }
}
