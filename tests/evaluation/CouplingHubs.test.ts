import { describe, expect, it } from 'vitest'
import type { DesignModel } from '@lld/contracts'
import { CouplingCheck } from '../../apps/api/src/evaluation/rules/checks/CouplingCheck.js'
import { designCtx, godClassDesign, strongDesign } from '../fixtures.js'

const check = new CouplingCheck()
const run = (design: DesignModel) => check.run(designCtx(design))

describe('CouplingCheck hub detection', () => {
  it('flags the god-class star even in a small design', () => {
    // Four classes is too few for an in-degree threshold to fire, but one class
    // holding every dependency is the exact shape we care about.
    const r = run(godClassDesign)
    expect(r.score).toBeLessThan(4)
    expect(r.concern).toContain('ParkingLotManager')
    expect(r.concern).toMatch(/one class is the program/i)
  })

  it('does not punish an interface for having many implementers', () => {
    // The trap this guards: counting `implements` edges as coupling would penalise
    // exactly the abstraction the rubric rewards elsewhere.
    const manyImplementers: DesignModel = {
      ...strongDesign,
      classes: [
        ...strongDesign.classes,
        { name: 'DailyCapPricing', stereotype: 'class', responsibility: 'Caps a stay at a daily rate', attributes: [], methods: ['feeFor'] },
        { name: 'WeekendPricing', stereotype: 'class', responsibility: 'Prices weekend stays', attributes: [], methods: ['feeFor'] },
        { name: 'EventPricing', stereotype: 'class', responsibility: 'Prices stays during events', attributes: [], methods: ['feeFor'] },
      ],
      relationships: [
        ...strongDesign.relationships,
        { from: 'DailyCapPricing', to: 'PricingStrategy', kind: 'implements' },
        { from: 'WeekendPricing', to: 'PricingStrategy', kind: 'implements' },
        { from: 'EventPricing', to: 'PricingStrategy', kind: 'implements' },
      ],
    }
    const r = run(manyImplementers)
    expect(r.score).toBe(4)
    expect(r.concern).toMatch(/holds together/i)
  })
})
