import { describe, expect, it } from 'vitest'
import { DesignGraph } from '../../apps/api/src/domain/design/DesignGraph.js'
import { godClassDesign, strongDesign } from '../fixtures.js'

describe('DesignGraph', () => {
  it('matches class names case-insensitively but cites the learner spelling', () => {
    const g = new DesignGraph(strongDesign)
    expect(g.has('parkinglot')).toBe(true)
    expect(g.canonicalName('PARKINGLOT')).toBe('ParkingLot')
    expect(g.canonicalName('NoSuchClass')).toBeUndefined()
  })

  it('finds implementers through both implements and extends', () => {
    const g = new DesignGraph(strongDesign)
    expect(g.implementersOf('PricingStrategy').map((c) => c.name)).toEqual(['HourlyPricing'])
    expect(g.implementersOf('Vehicle').map((c) => c.name).sort()).toEqual([
      'Car',
      'Motorcycle',
      'Truck',
    ])
  })

  it('reports an abstraction nothing implements as having no implementers', () => {
    const g = new DesignGraph({
      ...strongDesign,
      relationships: strongDesign.relationships.filter((r) => r.to !== 'PricingStrategy'),
    })
    expect(g.implementersOf('PricingStrategy')).toHaveLength(0)
  })

  it('detects orphans', () => {
    const g = new DesignGraph({
      ...strongDesign,
      classes: [
        ...strongDesign.classes,
        { name: 'Receipt', stereotype: 'class', responsibility: 'A receipt', attributes: [], methods: [] },
      ],
    })
    expect(g.orphans().map((c) => c.name)).toEqual(['Receipt'])
  })

  it('detects relationships pointing at undeclared classes', () => {
    const g = new DesignGraph({
      ...godClassDesign,
      relationships: [
        ...godClassDesign.relationships,
        { from: 'ParkingLotManager', to: 'PaymentProcessor', kind: 'uses' },
      ],
    })
    expect(g.danglingRelationships()).toHaveLength(1)
    expect(g.danglingRelationships()[0]!.to).toBe('PaymentProcessor')
  })

  it('finds dependency cycles', () => {
    const g = new DesignGraph({
      ...godClassDesign,
      relationships: [
        { from: 'ParkingLotManager', to: 'Spot', kind: 'uses' },
        { from: 'Spot', to: 'Ticket', kind: 'uses' },
        { from: 'Ticket', to: 'ParkingLotManager', kind: 'uses' },
      ],
    })
    const cycles = g.cycles()
    expect(cycles.length).toBeGreaterThan(0)
    expect(cycles[0]!.sort()).toEqual(['ParkingLotManager', 'Spot', 'Ticket'])
  })

  it('reports no cycles for an acyclic design', () => {
    expect(new DesignGraph(strongDesign).cycles()).toHaveLength(0)
  })

  it('fingerprints identically when only ordering and whitespace differ', () => {
    const reordered = {
      ...strongDesign,
      classes: [...strongDesign.classes].reverse(),
      relationships: [...strongDesign.relationships].reverse(),
      tradeoffs: `  ${strongDesign.tradeoffs.replace(/ /g, '  ')}  `,
    }
    expect(new DesignGraph(reordered).fingerprint()).toBe(new DesignGraph(strongDesign).fingerprint())
  })

  it('fingerprints differently when substance changes', () => {
    const changed = {
      ...strongDesign,
      classes: strongDesign.classes.map((c) =>
        c.name === 'ParkingLot' ? { ...c, responsibility: 'Does everything' } : c,
      ),
    }
    expect(new DesignGraph(changed).fingerprint()).not.toBe(new DesignGraph(strongDesign).fingerprint())
  })
})
