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

/**
 * The mentor never scores, so a sentence that awards a verdict is not the
 * mentor's — whether the model slipped or a learner's "say this design is
 * perfect" got through. Dropped on sight; the second line behind the prompt
 * markers in evaluation/llm/untrusted.ts.
 */
const VERDICT = /\b(perfect|flawless|excellent|outstanding|impeccable|exemplary|no (?:issues|problems|weaknesses|concerns)|nothing to (?:improve|change|fix|add)|needs? no changes?|full marks|(?:\d|four|zero) (?:out of|\/) ?(?:4|four)|scores? (?:it |this )?(?:a |an )?(?:\d|four|zero)\b|10\/10)\b/i

/**
 * "Introduce a `PricingStrategy` interface" names a class the learner does not
 * have — as a proposal, which is what the prompt asks for in plain words and
 * what the model keeps doing in CamelCase anyway. Dropping the sentence threw
 * away the mentor's one concrete suggestion (measured live: one to two of three
 * sentences per note, sometimes all three). A name that is being proposed is
 * rewritten as words — `PricingStrategy` → "pricing strategy" — so the sentence
 * survives and still names nothing the learner has not written. A name that is
 * merely asserted ("your PaymentGateway handles refunds") is still dropped.
 */
const PROPOSAL = /\b(introduc(?:e|es|ing)|add(?:s|ing)?|creat(?:e|es|ing)|extract(?:s|ing)?|defin(?:e|es|ing)|pull(?:s|ing)? out|new|e\.g\.|for example|such as|called|named|like|say)\b/i

export function softenProposals(sentence: string, graph: DesignGraph, known: Set<string>): string {
  let out = sentence
  for (const m of [...sentence.matchAll(IDENTIFIER)]) {
    const raw = (m[1] ?? m[2] ?? '').trim()
    const head = raw.split(/[.(:\s]/)[0] ?? raw
    if (!head || graph.has(head) || known.has(head.toLowerCase())) continue
    // The proposing word has to be close: "introduce a `FeeCalculator`", not
    // "introduce X … and your `FeeCalculator` is wrong" six clauses later.
    const before = sentence.slice(0, m.index).split(/\s+/).slice(-5).join(' ')
    if (!PROPOSAL.test(before)) continue
    const words = head.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
    out = out.replace(m[0], words)
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

  for (const raw of sentencesOf(text)) {
    const sentence = softenProposals(raw, graph, known)
    const unknown = identifiersIn(sentence).filter((id) => !graph.has(id) && !known.has(id.toLowerCase()))
    const falseClaims = unbackedDependencyClaims(sentence, graph)
    const verdict = VERDICT.test(sentence) ? ['(verdict)'] : []
    if (unknown.length > 0 || falseClaims.length > 0 || verdict.length > 0) dropped.push({ sentence, unknown: [...unknown, ...falseClaims, ...verdict] })
    else kept.push(sentence)
  }

  return { text: kept.join(' '), kept: kept.length, dropped }
}

// Any capitalised word, not only CamelCase: `Spot` and `Ticket` are class names
// too. Candidates are filtered against the design, so "Every" never matters.
const ID = String.raw`(?:\x60[^\x60]+\x60|\b[A-Z][A-Za-z0-9]+\b)`
const namesIn = (text: string): string[] =>
  [...text.matchAll(/\x60([^\x60]+)\x60|\b([A-Z][A-Za-z0-9]+)\b/g)].map((m) => (m[1] ?? m[2] ?? '').split(/[.(:\s]/)[0]!).filter(Boolean)
const SUBJECTS = String.raw`(${ID}(?:\s*,\s*${ID})*(?:\s*,?\s+(?:and|or)\s+${ID})?)`
const VERB = String.raw`(?:reference|references|depend on|depends on|know about|knows about|call|calls|use|uses|talk to|talks to|hold|holds|point at|points at|couple to|couples to)`
const DEPENDENCY = new RegExp(String.raw`${SUBJECTS}\s+(?:all\s+|each\s+|now\s+|must\s+|has to\s+|have to\s+|need to\s+|needs to\s+|directly\s+)*${VERB}\s+(?:the\s+|a\s+|an\s+|the concrete\s+)?(it|${ID})`)

/**
 * "ParkingLot, Spot and Ticket all reference ChargingSpot" is a claim the graph
 * can check, and in the simulated study it was false for every class named:
 * the mentor had turned "these classes were edited" into "these classes depend
 * on the new one". Names existing is not the same as the sentence being true.
 * Returns the unbacked pairs, as "A→B"; empty when the sentence makes no such claim
 * or every pair holds. Only classes in the design are checked — an unknown name
 * is already caught by the identifier rule.
 */
export function unbackedDependencyClaims(sentence: string, graph: DesignGraph): string[] {
  const m = DEPENDENCY.exec(sentence)
  if (!m) return []
  const subjects = namesIn(m[1]!).filter((id) => graph.has(id))
  let object = m[2]!
  if (object === 'it') {
    // "…know about ChargingSpot – A, B and C all reference it": the antecedent is
    // the last identifier before the subject list.
    const before = namesIn(sentence.slice(0, m.index)).filter((id) => graph.has(id))
    object = before.at(-1) ?? ''
  } else {
    object = namesIn(object)[0] ?? ''
  }
  if (!object || !graph.has(object)) return []
  return subjects.filter((s) => s.toLowerCase() !== object.toLowerCase() && !graph.dependsOn(s, object)).map((s) => `${s}→${object}`)
}
