import { describe, expect, it } from 'vitest'
import type { CriterionResult } from '@lld/contracts'
import { DesignGraph } from '../../apps/api/src/domain/design/DesignGraph.js'
import { groundEvidence } from '../../apps/api/src/evaluation/llm/EvidenceGroundingValidator.js'
import { strongDesign } from '../fixtures.js'

const graph = new DesignGraph(strongDesign)

function result(over: Partial<CriterionResult> = {}): CriterionResult {
  return {
    criterionId: 'reasoning',
    stage: 'defend',
    score: 3,
    evidence: [],
    concern: 'c',
    suggestion: 's',
    confidence: 'high',
    evaluatorId: 'llm-evaluator:test',
    evaluatorKind: 'llm',
    ...over,
  }
}

describe('EvidenceGroundingValidator', () => {
  it('drops a class the learner never wrote', () => {
    // The exact failure this exists for: a confident citation of a plausible-sounding
    // class that does not appear anywhere in the submission.
    const { results, report } = groundEvidence(
      [result({ evidence: [{ kind: 'class', name: 'PaymentProcessor' }] })],
      graph,
    )
    expect(results[0]!.evidence).toHaveLength(0)
    expect(report.dropped).toHaveLength(1)
    expect(report.dropped[0]!.reason).toContain('PaymentProcessor')
  })

  it('keeps a real class and rewrites it to the learner spelling', () => {
    const { results, report } = groundEvidence(
      [result({ evidence: [{ kind: 'class', name: 'pricingstrategy' }] })],
      graph,
    )
    expect(results[0]!.evidence).toEqual([{ kind: 'class', name: 'PricingStrategy' }])
    expect(report.kept).toBe(1)
  })

  it('downgrades confidence to low when every citation was invented', () => {
    const { results } = groundEvidence(
      [
        result({
          confidence: 'high',
          evidence: [
            { kind: 'class', name: 'Ghost' },
            { kind: 'class', name: 'Phantom' },
          ],
        }),
      ],
      graph,
    )
    expect(results[0]!.confidence).toBe('low')
  })

  it('downgrades one step when some citations survive', () => {
    const { results } = groundEvidence(
      [
        result({
          confidence: 'high',
          evidence: [
            { kind: 'class', name: 'PricingStrategy' },
            { kind: 'class', name: 'Ghost' },
          ],
        }),
      ],
      graph,
    )
    expect(results[0]!.evidence).toHaveLength(1)
    expect(results[0]!.confidence).toBe('medium')
  })

  it('leaves confidence alone when nothing was dropped', () => {
    const { results } = groundEvidence(
      [result({ confidence: 'high', evidence: [{ kind: 'class', name: 'Ticket' }] })],
      graph,
    )
    expect(results[0]!.confidence).toBe('high')
  })

  it('validates relationships against declared edges', () => {
    const { results } = groundEvidence(
      [
        result({
          evidence: [
            { kind: 'relationship', from: 'ParkingLot', to: 'PricingStrategy' },
            { kind: 'relationship', from: 'Ticket', to: 'PricingStrategy' },
          ],
        }),
      ],
      graph,
    )
    expect(results[0]!.evidence).toEqual([
      { kind: 'relationship', from: 'ParkingLot', to: 'PricingStrategy' },
    ])
  })

  it('rejects an out-of-range assumption index', () => {
    const { results } = groundEvidence([result({ evidence: [{ kind: 'assumption', index: 99 }] })], graph)
    expect(results[0]!.evidence).toHaveLength(0)
  })

  it('accepts a quote that differs only in punctuation and case', () => {
    const { results } = groundEvidence(
      [
        result({
          evidence: [{ kind: 'prose', field: 'tradeoffs', quote: 'RATE RULES CHANGE, far more often' }],
        }),
      ],
      graph,
    )
    expect(results[0]!.evidence).toHaveLength(1)
  })

  it('rejects a quote that is not in the submission', () => {
    const { results } = groundEvidence(
      [result({ evidence: [{ kind: 'prose', field: 'tradeoffs', quote: 'I used the Visitor pattern' }] })],
      graph,
    )
    expect(results[0]!.evidence).toHaveLength(0)
  })

  describe('the behaviour and rationale evidence kinds', () => {
    it('keeps a step that exists and drops one past the end of the walkthrough', () => {
      const { results, report } = groundEvidence(
        [
          result({
            evidence: [
              { kind: 'step', scenarioId: 'sc-enter', index: 0 },
              { kind: 'step', scenarioId: 'sc-enter', index: 99 },
              { kind: 'step', scenarioId: 'sc-nope', index: 0 },
            ],
          }),
        ],
        graph,
      )
      expect(results[0]!.evidence).toEqual([{ kind: 'step', scenarioId: 'sc-enter', index: 0 }])
      expect(report.dropped).toHaveLength(2)
    })

    it('verifies decision indexes against the recorded decisions', () => {
      const { results } = groundEvidence(
        [result({ evidence: [{ kind: 'decision', index: 0 }, { kind: 'decision', index: 40 }] })],
        graph,
      )
      expect(results[0]!.evidence).toEqual([{ kind: 'decision', index: 0 }])
    })

    it('checks answer quotes against the answers, scoped by probe when given', () => {
      const answers = [
        { probeId: 'p-pricing', response: 'A WeekendPricing class implementing PricingStrategy.' },
        { probeId: 'p-split', response: 'I would cut between allocation and pricing.' },
      ]
      const { results, report } = groundEvidence(
        [
          result({
            evidence: [
              { kind: 'prose', field: 'answer', probeId: 'p-pricing', quote: 'weekendpricing class' },
              { kind: 'prose', field: 'answer', probeId: 'p-pricing', quote: 'cut between allocation' },
              { kind: 'prose', field: 'answer', quote: 'cut between allocation' },
            ],
          }),
        ],
        graph,
        { answers },
      )
      // The second quote is real but from a different probe than claimed.
      expect(results[0]!.evidence).toHaveLength(2)
      expect(report.dropped[0]!.reason).toMatch(/answer/)
    })

    it('checks rationale quotes against the change rationale', () => {
      const { results } = groundEvidence(
        [result({ evidence: [{ kind: 'prose', field: 'rationale', quote: 'only the composition root' }] })],
        graph,
        { rationale: 'I touched only the composition root to wire EnergyPricing in.' },
      )
      expect(results[0]!.evidence).toHaveLength(1)
    })
  })
})
