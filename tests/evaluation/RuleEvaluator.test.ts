import { describe, expect, it } from 'vitest'
import type { DesignModel } from '@lld/contracts'
import { DesignGraph } from '../../apps/api/src/domain/design/DesignGraph.js'
import { RuleEvaluator } from '../../apps/api/src/evaluation/rules/RuleEvaluator.js'
import { actionVerbs, responsibilityClauses } from '../../apps/api/src/evaluation/rules/text.js'
import { designCtx, godClassDesign, strongDesign } from '../fixtures.js'

const context = designCtx

const evaluator = new RuleEvaluator()
const score = async (design: DesignModel, criterionId: string): Promise<number> => {
  const results = await evaluator.evaluate(context(design))
  return results.find((r) => r.criterionId === criterionId)!.score
}

describe('RuleEvaluator', () => {
  it('scores the five measured design-stage criteria, leaving judgement to the LLM half', async () => {
    const results = await evaluator.evaluate(context(strongDesign))
    expect(results.map((r) => r.criterionId).sort()).toEqual([
      'abstraction-use',
      'behaviour',
      'class-responsibilities',
      'coupling-cohesion',
      'requirement-coverage',
    ])
    expect(results.every((r) => r.evaluatorKind === 'deterministic')).toBe(true)
  })

  it('omits a check whose facet the capture format could not supply, rather than scoring zero', async () => {
    // Change Test A in miniature: a class-diagram parser produces structure only.
    const results = await evaluator.evaluate(context(strongDesign, { facets: ['structure'] }))
    expect(results.map((r) => r.criterionId)).not.toContain('behaviour')
    expect(results).toHaveLength(4)
  })

  it('runs only the checks for the stage being evaluated', async () => {
    const results = await evaluator.evaluate(context(strongDesign, { stage: 'change' }))
    expect(results.map((r) => r.criterionId)).toEqual(['change-resilience'])
  })

  it('is deterministic — the same design scores identically every run', async () => {
    const a = await evaluator.evaluate(context(godClassDesign))
    const b = await evaluator.evaluate(context(godClassDesign))
    expect(a.map((r) => r.score)).toEqual(b.map((r) => r.score))
  })

  it('separates a strong design from a god class on the criteria that measure structure', async () => {
    const strong = await evaluator.evaluate(context(strongDesign))
    const weak = await evaluator.evaluate(context(godClassDesign))
    const at = (rs: typeof strong, id: string): number => rs.find((r) => r.criterionId === id)!.score

    for (const id of ['class-responsibilities', 'coupling-cohesion', 'abstraction-use']) {
      expect(at(strong, id), `${id} should favour the strong design`).toBeGreaterThan(at(weak, id))
    }

    const mean = (rs: typeof strong): number => rs.reduce((a, r) => a + r.score, 0) / rs.length
    expect(mean(strong)).toBeGreaterThan(mean(weak))
  })

  it('does not penalise requirement coverage for a badly structured design', async () => {
    // The god class genuinely does account for every requirement — it just does so
    // in one class. Coverage asks 'was this addressed', not 'was this addressed
    // well'. Letting it double-penalise structure is exactly the overlap that made
    // the twelve-criterion draft unusable.
    const weak = await evaluator.evaluate(context(godClassDesign))
    expect(weak.find((r) => r.criterionId === 'requirement-coverage')!.score).toBeGreaterThanOrEqual(3)
  })

  it('never makes a finding without pointing at something in the submission', async () => {
    const results = await evaluator.evaluate(context(godClassDesign))
    const withFindings = results.filter((r) => r.score < 4)
    expect(withFindings.length).toBeGreaterThan(0)
    for (const r of withFindings) {
      expect(r.concern.length, `${r.criterionId} needs a concern`).toBeGreaterThan(10)
      expect(r.suggestion.length, `${r.criterionId} needs a suggestion`).toBeGreaterThan(10)
    }
  })

  it('cites only classes that exist, so the UI can always highlight the target', async () => {
    const graph = new DesignGraph(godClassDesign)
    const results = await evaluator.evaluate(context(godClassDesign))
    for (const r of results) {
      for (const ref of r.evidence) {
        if (ref.kind === 'class') expect(graph.has(ref.name)).toBe(true)
      }
    }
  })

  describe('god class detection', () => {
    it('names the overloaded class and quotes its own responsibility back', async () => {
      const results = await evaluator.evaluate(context(godClassDesign))
      const r = results.find((x) => x.criterionId === 'class-responsibilities')!
      expect(r.score).toBeLessThanOrEqual(1)
      expect(r.concern).toContain('ParkingLotManager')
      expect(r.evidence).toContainEqual({ kind: 'class', name: 'ParkingLotManager' })
    })

    it('passes a design where every class describes one job', async () => {
      expect(await score(strongDesign, 'class-responsibilities')).toBe(4)
    })

    it('does not read an "and" between two nouns as a second job', async () => {
      // From the simulated study: these three sentences scored a careful design 0/4.
      const [lot, cashier, vehicle] = [
        'Manages floors and coordinates entry and exit operations.',
        'Calculates fee based on vehicle type and duration, receives cash.',
        'Base type for all vehicles, provides size and rate information.',
      ]
      expect(responsibilityClauses(lot)).toHaveLength(2)
      expect(responsibilityClauses(cashier)).toHaveLength(2)
      expect(responsibilityClauses(vehicle)).toHaveLength(2)
      // Three verbs joined by conjunctions are still three jobs.
      expect(responsibilityClauses('Finds spots, calculates fees and prints tickets')).toHaveLength(3)
      expect(responsibilityClauses('Manages floors, owns pricing, records every ticket')).toHaveLength(3)
      expect(responsibilityClauses('Manages floors and overall entry/exit flow')).toHaveLength(1)
      // "payment" is a noun, not a third action.
      expect(actionVerbs('Calculates fees and processes cash payment')).toHaveLength(2)
      const worded: DesignModel = {
        ...strongDesign,
        classes: strongDesign.classes.map((c) => (c.name === 'ParkingLot' ? { ...c, responsibility: lot } : c)),
      }
      expect(await score(worded, 'class-responsibilities')).toBe(4)
    })

    it('flags a class list with no relationships at all', async () => {
      const listNotDesign: DesignModel = { ...strongDesign, relationships: [] }
      expect(await score(listNotDesign, 'class-responsibilities')).toBeLessThanOrEqual(1)
    })
  })

  describe('missing abstraction at a declared variation point', () => {
    it('points at the concrete class that absorbed the responsibility', async () => {
      const results = await evaluator.evaluate(context(godClassDesign))
      const r = results.find((x) => x.criterionId === 'abstraction-use')!
      expect(r.score).toBeLessThanOrEqual(1)
      expect(r.concern.toLowerCase()).toContain('pricing')
    })

    it('catches an abstraction that exists but that nothing implements', async () => {
      // The finding a class list alone cannot produce: the seam is declared, and
      // the relationships prove nothing is going through it.
      const declaredNotWired: DesignModel = {
        ...strongDesign,
        relationships: strongDesign.relationships.filter(
          (r) => !(r.to === 'PricingStrategy' && r.kind === 'implements'),
        ),
      }
      const results = await evaluator.evaluate(context(declaredNotWired))
      const r = results.find((x) => x.criterionId === 'abstraction-use')!
      expect(r.concern).toContain('PricingStrategy')
      expect(r.concern).toMatch(/nothing implements it/i)
      expect(r.score).toBeLessThan(4)
    })

    it('rewards seams that carry real implementations', async () => {
      expect(await score(strongDesign, 'abstraction-use')).toBe(4)
    })
  })

  describe('requirement coverage', () => {
    it('scores full coverage when the design speaks to every requirement', async () => {
      expect(await score(strongDesign, 'requirement-coverage')).toBeGreaterThanOrEqual(3)
    })

    it('names the requirements nothing addresses', async () => {
      const thin: DesignModel = {
        ...strongDesign,
        assumptions: [],
        classes: [strongDesign.classes[0]!],
        relationships: [],
      }
      const results = await evaluator.evaluate(context(thin))
      const r = results.find((x) => x.criterionId === 'requirement-coverage')!
      expect(r.score).toBeLessThanOrEqual(2)
      expect(r.concern).toMatch(/requirements have nothing/i)
    })
  })

  describe('structural faults', () => {
    it('flags a relationship pointing at an undeclared class', async () => {
      const dangling: DesignModel = {
        ...strongDesign,
        relationships: [
          ...strongDesign.relationships,
          { from: 'ParkingLot', to: 'PaymentProcessor', kind: 'uses' },
        ],
      }
      const results = await evaluator.evaluate(context(dangling))
      const r = results.find((x) => x.criterionId === 'coupling-cohesion')!
      expect(r.concern).toContain('PaymentProcessor')
      expect(r.score).toBeLessThan(4)
    })

    it('flags a dependency cycle and shows the loop', async () => {
      const cyclic: DesignModel = {
        ...strongDesign,
        relationships: [
          ...strongDesign.relationships,
          { from: 'ParkingLot', to: 'Ticket', kind: 'uses' },
          { from: 'Ticket', to: 'ParkingLot', kind: 'uses' },
        ],
      }
      const results = await evaluator.evaluate(context(cyclic))
      const r = results.find((x) => x.criterionId === 'coupling-cohesion')!
      expect(r.concern).toMatch(/cycle/i)
      expect(r.concern).toContain('->')
    })

    it('passes a graph that holds together', async () => {
      expect(await score(strongDesign, 'coupling-cohesion')).toBe(4)
    })
  })
})
