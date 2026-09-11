import type { Confidence, CriterionResult, EvidenceRef, ProbeAnswer } from '@lld/contracts'
import type { DesignGraph } from '../../domain/design/DesignGraph.js'

/**
 * Checks that every citation an LLM makes actually exists in the learner's design.
 *
 * This is the smallest piece of code in the system and the one that does the most
 * for trust. Models confabulate specifics: asked to justify a score about coupling,
 * one will cheerfully cite a `PaymentProcessor` the learner never wrote. Left alone
 * that is corrosive — the feedback sounds authoritative, the learner cannot find the
 * class, and they stop believing any of it.
 *
 * So citations are verified against the submitted graph before anyone sees them.
 * Invented references are dropped, and a result that loses evidence loses confidence
 * with it: a claim nobody can point at is a weaker claim, and the report should say so.
 *
 * Note this is only possible because submissions are structured. Against a prose
 * essay there is nothing to check a citation against — which is a large part of why
 * the submission format is a form rather than a text box.
 */

export type GroundingReport = {
  kept: number
  dropped: Array<{ criterionId: string; ref: EvidenceRef; reason: string }>
}

export type GroundingOutcome = {
  results: CriterionResult[]
  report: GroundingReport
}

/** Prose that lives outside the design model but is still citable. */
export type GroundingExtras = {
  rationale?: string
  answers?: readonly ProbeAnswer[]
}

export function groundEvidence(
  results: readonly CriterionResult[],
  graph: DesignGraph,
  extras: GroundingExtras = {},
): GroundingOutcome {
  const dropped: GroundingReport['dropped'] = []
  let kept = 0

  const grounded = results.map((result) => {
    const survivors: EvidenceRef[] = []

    for (const ref of result.evidence) {
      const verdict = verify(ref, graph, extras)
      if (verdict.ok) {
        survivors.push(verdict.ref)
        kept += 1
      } else {
        dropped.push({ criterionId: result.criterionId, ref, reason: verdict.reason })
      }
    }

    const lost = result.evidence.length - survivors.length

    return {
      ...result,
      evidence: survivors,
      confidence: adjustConfidence(result.confidence, result.evidence.length, lost),
    }
  })

  return { results: grounded, report: { kept, dropped } }
}

type Verdict = { ok: true; ref: EvidenceRef } | { ok: false; reason: string }

function verify(ref: EvidenceRef, graph: DesignGraph, extras: GroundingExtras): Verdict {
  const model = graph.model

  switch (ref.kind) {
    case 'class': {
      // Resolve to the learner's own spelling so the UI can highlight the right row
      // even when the model tidied the casing.
      const canonical = graph.canonicalName(ref.name)
      return canonical
        ? { ok: true, ref: { kind: 'class', name: canonical } }
        : { ok: false, reason: `No class named "${ref.name}" in the submission` }
    }

    case 'relationship': {
      const exists = graph.relationships.some(
        (r) =>
          r.from.trim().toLowerCase() === ref.from.trim().toLowerCase() &&
          r.to.trim().toLowerCase() === ref.to.trim().toLowerCase(),
      )
      return exists
        ? { ok: true, ref }
        : { ok: false, reason: `No relationship from "${ref.from}" to "${ref.to}"` }
    }

    case 'assumption': {
      const inRange = ref.index >= 0 && ref.index < model.assumptions.length
      return inRange
        ? { ok: true, ref }
        : { ok: false, reason: `Assumption ${ref.index} does not exist` }
    }

    case 'decision': {
      const inRange = ref.index >= 0 && ref.index < model.decisions.length
      return inRange
        ? { ok: true, ref }
        : { ok: false, reason: `Decision ${ref.index} does not exist` }
    }

    case 'step': {
      const walkthrough = model.walkthroughs.find((w) => w.scenarioId === ref.scenarioId)
      if (!walkthrough) return { ok: false, reason: `No walkthrough for scenario "${ref.scenarioId}"` }
      const inRange = ref.index >= 0 && ref.index < walkthrough.steps.length
      return inRange
        ? { ok: true, ref }
        : { ok: false, reason: `Step ${ref.index} of "${ref.scenarioId}" does not exist` }
    }

    case 'prose': {
      const sources =
        ref.field === 'tradeoffs'
          ? [model.tradeoffs]
          : ref.field === 'rationale'
            ? [extras.rationale ?? '']
            : (extras.answers ?? [])
                .filter((a) => !ref.probeId || a.probeId === ref.probeId)
                .map((a) => a.response)
      // Compared loosely: models re-punctuate and re-case quotes even when the
      // substance is verbatim, and rejecting on a smart quote would be pedantry.
      const needle = loose(ref.quote)
      return needle.length > 0 && sources.some((s) => loose(s).includes(needle))
        ? { ok: true, ref }
        : { ok: false, reason: `Quote not found in ${ref.field}` }
    }
  }
}

function loose(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * Losing citations costs confidence, and losing all of them costs more.
 *
 * A result that cited three classes and kept one is shakier than it claimed. A result
 * that cited three and kept none is a claim with nothing behind it, and is marked low
 * so the report can present it accordingly.
 */
function adjustConfidence(current: Confidence, claimed: number, lost: number): Confidence {
  if (claimed === 0 || lost === 0) return current
  if (lost === claimed) return 'low'
  return current === 'high' ? 'medium' : 'low'
}
