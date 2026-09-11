import { describe, expect, it } from 'vitest'
import type { DesignModel } from '@lld/contracts'
import { DesignGraph } from '../../apps/api/src/domain/design/DesignGraph.js'
import { concentration, resolveWalkthrough, unexercisedClasses } from '../../apps/api/src/domain/design/Walkthrough.js'
import { WalkthroughCheck } from '../../apps/api/src/evaluation/rules/checks/WalkthroughCheck.js'
import { designCtx, godClassDesign, parkingLot, strongDesign } from '../fixtures.js'

const check = new WalkthroughCheck()
const run = (design: DesignModel) => check.run(designCtx(design))
const scenario = (id: string) => parkingLot.scenarios.find((s) => s.id === id)

describe('resolveWalkthrough', () => {
  it('resolves class and method case-insensitively and ignores call parentheses', () => {
    const graph = new DesignGraph(strongDesign)
    const resolved = resolveWalkthrough(
      { scenarioId: 'sc-enter', outcome: 'ok', steps: [{ className: 'parkinglot', method: 'Park(vehicle)', note: '' }] },
      scenario('sc-enter'),
      graph,
    )
    expect(resolved.steps[0]).toMatchObject({ className: 'ParkingLot', classFound: true, methodFound: true })
  })

  it('reports a method the class does not declare — the intent/realisation gap', () => {
    const graph = new DesignGraph(strongDesign)
    const resolved = resolveWalkthrough(
      { scenarioId: 'sc-enter', outcome: 'ok', steps: [{ className: 'Ticket', method: 'calculateFee', note: '' }] },
      scenario('sc-enter'),
      graph,
    )
    expect(resolved.steps[0]).toMatchObject({ classFound: true, methodFound: false })
  })

  it('flags a refusal scenario that ends ok as a silent failure', () => {
    const graph = new DesignGraph(strongDesign)
    const resolved = resolveWalkthrough(
      { scenarioId: 'sc-full', outcome: 'ok', steps: [{ className: 'ParkingLot', method: 'park', note: '' }] },
      scenario('sc-full'),
      graph,
    )
    expect(resolved.silentFailure).toBe(true)
  })

  it('finds classes no scenario ever exercises, skipping interfaces and enums', () => {
    const graph = new DesignGraph(strongDesign)
    const resolved = strongDesign.walkthroughs
      .filter((w) => w.scenarioId !== 'sc-exit-pay')
      .map((w) => resolveWalkthrough(w, scenario(w.scenarioId), graph))
    const idle = unexercisedClasses(resolved, graph)
    expect(idle).toContain('HourlyPricing')
    expect(idle).not.toContain('PricingStrategy')
  })

  it('measures how concentrated the work is', () => {
    const graph = new DesignGraph(godClassDesign)
    const resolved = godClassDesign.walkthroughs.map((w) => resolveWalkthrough(w, scenario(w.scenarioId), graph))
    expect(concentration(resolved)).toMatchObject({ className: 'ParkingLotManager', share: 1 })
  })
})

describe('WalkthroughCheck — the behaviour bands', () => {
  it('scores 4 for the strong design: every step resolves, refusal traced, work spread', () => {
    const r = run(strongDesign)
    expect(r.score).toBe(4)
    expect(r.concern).toMatch(/All 3 scenarios walked/)
  })

  it('scores 0 when nothing was walked', () => {
    const r = run({ ...strongDesign, walkthroughs: [] })
    expect(r.score).toBe(0)
    expect(r.concern).toMatch(/No scenario was walked/)
  })

  it('scores 1 for the god class: one class performs every step', () => {
    const r = run(godClassDesign)
    expect(r.score).toBe(1)
    expect(r.concern).toContain('ParkingLotManager performs 100%')
    expect(r.evidence).toContainEqual({ kind: 'class', name: 'ParkingLotManager' })
  })

  it('scores 2 and cites the exact step when a step calls an undeclared method', () => {
    const broken: DesignModel = {
      ...strongDesign,
      walkthroughs: strongDesign.walkthroughs.map((w) =>
        w.scenarioId === 'sc-exit-pay'
          ? { ...w, steps: w.steps.map((s, i) => (i === 1 ? { ...s, method: 'computeFee' } : s)) }
          : w,
      ),
    }
    const r = run(broken)
    expect(r.score).toBe(2)
    expect(r.concern).toContain('Ticket does not declare a method called computeFee')
    expect(r.evidence).toContainEqual({ kind: 'step', scenarioId: 'sc-exit-pay', index: 1 })
  })

  it('scores 2 when the refusal scenario ends as if it succeeded', () => {
    const silent: DesignModel = {
      ...strongDesign,
      walkthroughs: strongDesign.walkthroughs.map((w) => (w.scenarioId === 'sc-full' ? { ...w, outcome: 'ok' } : w)),
    }
    const r = run(silent)
    expect(r.score).toBe(2)
    expect(r.concern).toMatch(/ends as if it succeeded/)
  })

  it('scores 0 when most steps point at classes that do not exist', () => {
    const phantom: DesignModel = {
      ...strongDesign,
      walkthroughs: [
        { scenarioId: 'sc-enter', outcome: 'ok', steps: [
          { className: 'Gate', method: 'open', note: '' },
          { className: 'Sensor', method: 'detect', note: '' },
          { className: 'ParkingLot', method: 'park', note: '' },
        ] },
      ],
    }
    expect(run(phantom).score).toBe(0)
  })

  it('scores 3 when everything resolves but one class never gets a turn', () => {
    const idle: DesignModel = {
      ...strongDesign,
      classes: [...strongDesign.classes, { name: 'Receipt', stereotype: 'class', responsibility: 'A printed record of payment', attributes: [], methods: ['print'] }],
      relationships: [...strongDesign.relationships, { from: 'ParkingLot', to: 'Receipt', kind: 'uses' }],
    }
    const r = run(idle)
    expect(r.score).toBe(3)
    expect(r.concern).toContain('Receipt')
  })
})
