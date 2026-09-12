import { describe, expect, it } from 'vitest'
import type { DesignModel } from '@lld/contracts'
import { BlastRadiusCheck } from '../../apps/api/src/evaluation/rules/checks/BlastRadiusCheck.js'
import { changeCtx, godClassDesign, strongDesign } from '../fixtures.js'

const check = new BlastRadiusCheck()
const run = (before: DesignModel, after: DesignModel, rationale = '') =>
  check.run(changeCtx(before, after, { rationale }))

/** The textbook absorption: one new class behind an existing seam, one wiring touch. */
const energyPricing: DesignModel = {
  ...strongDesign,
  classes: [
    ...strongDesign.classes.map((c) =>
      c.name === 'ParkingLot' ? { ...c, attributes: [...c.attributes, 'pricingByCapability'] } : c,
    ),
    { name: 'EnergyPricing', stereotype: 'class', responsibility: 'Prices a stay by kilowatt-hours consumed', attributes: ['ratePerKwh'], methods: ['feeFor'] },
  ],
  relationships: [...strongDesign.relationships, { from: 'EnergyPricing', to: 'PricingStrategy', kind: 'implements' }],
}

describe('BlastRadiusCheck — the change-resilience bands', () => {
  it('scores 4 for a new class behind an existing seam with one wiring touch', () => {
    const r = run(strongDesign, energyPricing)
    expect(r.score).toBe(4)
    expect(r.concern).toContain('EnergyPricing')
    expect(r.concern).toContain('PricingStrategy')
    expect(r.evidence).toContainEqual({ kind: 'class', name: 'EnergyPricing' })
  })

  it('scores 0 when the revision is identical — the change was not absorbed', () => {
    const r = run(strongDesign, structuredClone(strongDesign))
    expect(r.score).toBe(0)
    expect(r.concern).toMatch(/resubmitted unchanged/i)
  })

  it('scores 0 when classes changed but none of them owns the new behaviour', () => {
    const unrelated: DesignModel = {
      ...strongDesign,
      classes: strongDesign.classes.map((c) => (c.name === 'Ticket' ? { ...c, methods: [...c.methods, 'print'] } : c)),
    }
    const r = run(strongDesign, unrelated)
    expect(r.score).toBe(0)
    expect(r.concern).toMatch(/none of them speaks to the requirement/i)
  })

  it('scores 1 for a flag added to an existing class, and names the flag', () => {
    const flagged: DesignModel = {
      ...godClassDesign,
      classes: godClassDesign.classes.map((c) =>
        c.name === 'Spot'
          ? { ...c, attributes: [...c.attributes, 'isElectric'] }
          : c.name === 'ParkingLotManager'
            ? { ...c, methods: [...c.methods, 'calculateKwhFee'] }
            : c,
      ),
    }
    const r = run(godClassDesign, flagged)
    expect(r.score).toBe(1)
    expect(r.concern).toContain('isElectric')
    expect(r.evidence).toContainEqual({ kind: 'class', name: 'Spot' })
  })

  it('scores 2 when only existing classes were edited, without a flag', () => {
    const edited: DesignModel = {
      ...strongDesign,
      classes: strongDesign.classes.map((c) =>
        c.name === 'HourlyPricing' ? { ...c, methods: [...c.methods, 'energyFee'], responsibility: 'Prices a stay by duration or by kwh' } : c,
      ),
    }
    const r = run(strongDesign, edited)
    expect(r.score).toBe(2)
    expect(r.concern).toMatch(/No class was added/)
  })

  it('scores 3 when a class was added but too much had to change around it', () => {
    const noisy: DesignModel = {
      ...energyPricing,
      classes: energyPricing.classes.map((c) =>
        c.name === 'Spot' || c.name === 'Ticket'
          ? { ...c, methods: [...c.methods, 'kwhUsed'] }
          : c,
      ),
    }
    const r = run(strongDesign, noisy)
    expect(r.score).toBe(3)
    expect(r.concern).toMatch(/3 existing classes were reopened/)
  })

  it('scores 3, not 4, when the new class extends a concrete class rather than a seam', () => {
    const subclassed: DesignModel = {
      ...strongDesign,
      classes: [
        ...strongDesign.classes,
        { name: 'EnergyPricing', stereotype: 'class', responsibility: 'Prices a stay by kwh', attributes: [], methods: ['feeFor'] },
      ],
      relationships: [...strongDesign.relationships, { from: 'EnergyPricing', to: 'HourlyPricing', kind: 'extends' }],
    }
    const r = run(strongDesign, subclassed)
    expect(r.score).toBe(3)
    expect(r.concern).toMatch(/concrete class/)
  })

  it('accepts the new vocabulary in the rationale, not only in class names', () => {
    // The learner may reasonably keep the class named PricingStrategy2 and explain.
    const vague: DesignModel = {
      ...strongDesign,
      classes: [
        ...strongDesign.classes,
        { name: 'MeteredPricing', stereotype: 'class', responsibility: 'Prices a stay by metered usage', attributes: [], methods: ['feeFor'] },
      ],
      relationships: [...strongDesign.relationships, { from: 'MeteredPricing', to: 'PricingStrategy', kind: 'implements' }],
    }
    const r = run(strongDesign, vague, 'MeteredPricing bills per kWh for charging spots.')
    expect(r.score).toBe(4)
  })

  it('mentions removals and asks whether they were renames', () => {
    const renamed: DesignModel = {
      ...energyPricing,
      classes: energyPricing.classes.map((c) => (c.name === 'Ticket' ? { ...c, name: 'ParkingTicket' } : c)),
    }
    const r = run(strongDesign, renamed)
    expect(r.concern).toMatch(/Ticket was removed/)
    expect(r.concern).toMatch(/rename/i)
  })
})

describe('the added class has to be about the change', () => {
  it('scores 3, not 4, when a class is added behind a seam for some other reason', async () => {
    const { parkingLot } = await import('../fixtures.js')
    const strong = parkingLot.goldDesigns['strong']!
    // A second allocator, behind SpotAllocator — real seam reuse, wrong change (EV kWh pricing).
    const unrelated: DesignModel = {
      ...strong,
      classes: [...strong.classes, { name: 'NearestAllocator', stereotype: 'class', responsibility: 'Allocates the nearest free spot', attributes: [], methods: ['allocate'] }],
      relationships: [...strong.relationships, { from: 'NearestAllocator', to: 'SpotAllocator', kind: 'implements' }],
    }
    const r = run(strong, unrelated, 'Added a nearest-first allocator.')
    expect(r.score).toBe(0)
    expect(r.concern).toMatch(/none of them speaks to the requirement/)
  })

  it('does not credit vocabulary the first design already had', async () => {
    const { parkingLot } = await import('../fixtures.js')
    const strong = parkingLot.goldDesigns['strong']!
    const withWord: DesignModel = { ...strong, assumptions: [...strong.assumptions, 'EV charging spots may exist later'] }
    const unrelated: DesignModel = {
      ...withWord,
      classes: [...withWord.classes, { name: 'NearestAllocator', stereotype: 'class', responsibility: 'Allocates the nearest free spot', attributes: [], methods: ['allocate'] }],
      relationships: [...withWord.relationships, { from: 'NearestAllocator', to: 'SpotAllocator', kind: 'implements' }],
    }
    expect(run(withWord, unrelated, '').score).toBe(0)
  })
})
