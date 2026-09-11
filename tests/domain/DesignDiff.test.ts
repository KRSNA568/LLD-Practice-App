import { describe, expect, it } from 'vitest'
import type { DesignModel } from '@lld/contracts'
import { blastRadius, diffDesigns, seamsReused } from '../../apps/api/src/domain/design/DesignDiff.js'
import { strongDesign } from '../fixtures.js'

const withClass = (d: DesignModel, cls: DesignModel['classes'][number], rels: DesignModel['relationships'] = []): DesignModel => ({
  ...d,
  classes: [...d.classes, cls],
  relationships: [...d.relationships, ...rels],
})

describe('diffDesigns', () => {
  it('reports an identical design as entirely unchanged', () => {
    const diff = diffDesigns(strongDesign, structuredClone(strongDesign))
    expect(diff.added).toHaveLength(0)
    expect(diff.removed).toHaveLength(0)
    expect(diff.modified).toHaveLength(0)
    expect(diff.unchanged).toHaveLength(strongDesign.classes.length)
    expect(blastRadius(diff)).toBe(0)
  })

  it('ignores ordering and whitespace when deciding whether a class changed', () => {
    const shuffled: DesignModel = {
      ...strongDesign,
      classes: [...strongDesign.classes].reverse().map((c) => ({ ...c, methods: [...c.methods].reverse().map((m) => ` ${m} `) })),
    }
    expect(diffDesigns(strongDesign, shuffled).modified).toHaveLength(0)
  })

  it('names which fields of a class changed and what was added', () => {
    const after: DesignModel = {
      ...strongDesign,
      classes: strongDesign.classes.map((c) =>
        c.name === 'Spot' ? { ...c, attributes: [...c.attributes, 'isElectric'], methods: [...c.methods, 'chargeKwh'] } : c,
      ),
    }
    const [change] = diffDesigns(strongDesign, after).modified
    expect(change!.name).toBe('Spot')
    expect(change!.fields).toEqual(['attributes', 'methods'])
    expect(change!.attributesAdded).toEqual(['isElectric'])
    expect(change!.methodsAdded).toEqual(['chargeKwh'])
  })

  it('shows a rename as one removal and one addition, honestly', () => {
    const renamed: DesignModel = {
      ...strongDesign,
      classes: strongDesign.classes.map((c) => (c.name === 'Ticket' ? { ...c, name: 'ParkingTicket' } : c)),
    }
    const diff = diffDesigns(strongDesign, renamed)
    expect(diff.removed.map((c) => c.name)).toEqual(['Ticket'])
    expect(diff.added.map((c) => c.name)).toEqual(['ParkingTicket'])
  })

  it('diffs relationships by endpoint and kind', () => {
    const after: DesignModel = {
      ...strongDesign,
      relationships: [
        ...strongDesign.relationships.filter((r) => r.from !== 'Ticket'),
        { from: 'EnergyPricing', to: 'PricingStrategy', kind: 'implements' },
      ],
    }
    const diff = diffDesigns(strongDesign, after)
    expect(diff.relationshipsAdded).toEqual([{ from: 'EnergyPricing', to: 'PricingStrategy', kind: 'implements' }])
    expect(diff.relationshipsRemoved).toEqual([{ from: 'Ticket', to: 'Spot', kind: 'uses' }])
  })
})

describe('seamsReused', () => {
  it('finds the pre-existing abstraction a new class plugs into', () => {
    const after = withClass(
      strongDesign,
      { name: 'EnergyPricing', stereotype: 'class', responsibility: 'Prices a stay by energy used', attributes: [], methods: ['feeFor'] },
      [{ from: 'EnergyPricing', to: 'PricingStrategy', kind: 'implements' }],
    )
    const diff = diffDesigns(strongDesign, after)
    expect(seamsReused(diff, strongDesign, after)).toEqual(['PricingStrategy'])
  })

  it('does not count an abstraction that was itself added in the revision', () => {
    // Adding the interface and its implementation together is a refactor, not a
    // change absorbed at a seam that already existed.
    const after: DesignModel = {
      ...strongDesign,
      classes: [
        ...strongDesign.classes,
        { name: 'Charger', stereotype: 'interface', responsibility: 'Meters energy', attributes: [], methods: ['kwh'] },
        { name: 'FastCharger', stereotype: 'class', responsibility: 'A fast charger', attributes: [], methods: ['kwh'] },
      ],
      relationships: [...strongDesign.relationships, { from: 'FastCharger', to: 'Charger', kind: 'implements' }],
    }
    const diff = diffDesigns(strongDesign, after)
    expect(seamsReused(diff, strongDesign, after)).toEqual([])
  })
})
