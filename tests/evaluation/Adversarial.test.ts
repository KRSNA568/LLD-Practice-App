import { describe, expect, it } from 'vitest'
import type { DesignModel } from '@lld/contracts'
import { RuleEvaluator } from '../../apps/api/src/evaluation/rules/RuleEvaluator.js'
import { changeCtx, designCtx, parkingLot, strongDesign } from '../fixtures.js'

/**
 * Can a learner score well without designing well?
 *
 * Study V4 in PRODUCT_PLAN.md. Every design below is an attack on a specific
 * mechanism, and the assertions record what the engine actually does — not what we
 * would like it to do. Where a design gets away with something, the test says so out
 * loud rather than being quietly omitted, because a known hole that is pinned by a
 * test cannot silently get worse.
 *
 * The product claim is about the composite, not any single criterion, so these
 * measure the whole rule set. The recurring finding is defence in depth: several
 * individual criteria are gameable on their own, and the attacks that beat one of
 * them are caught by another.
 */

const evaluator = new RuleEvaluator()

type Scores = Record<string, number>

async function measure(design: DesignModel, over: Parameters<typeof designCtx>[1] = {}): Promise<Scores> {
  const results = await evaluator.evaluate(designCtx(design, over))
  return Object.fromEntries(results.map((r) => [r.criterionId, r.score]))
}

/** The measured criteria, so a test can assert on the whole picture at once. */
const MEASURED = ['requirement-coverage', 'class-responsibilities', 'coupling-cohesion', 'abstraction-use', 'behaviour'] as const

function composite(scores: Scores): number {
  const values = MEASURED.map((c) => scores[c] ?? 0)
  return values.reduce((a, b) => a + b, 0) / values.length
}

/* ------------------------------------------------------------------ */
/* A. Vocabulary attacks — against RequirementCoverageCheck            */
/* ------------------------------------------------------------------ */

/**
 * Six classes, each named and described to hit one requirement's authored keywords,
 * each with a single honest-looking clause, chained so none is an orphan. Nothing
 * here is a design: no abstraction, no behaviour, no decision.
 */
const hollowVocabulary: DesignModel = {
  classes: [
    { name: 'EntryExitLog', stereotype: 'class', responsibility: 'Records when a vehicle enters', attributes: ['entry', 'exit'], methods: ['enter', 'exit'] },
    { name: 'VehicleCategory', stereotype: 'class', responsibility: 'Holds a vehicle category', attributes: ['motorcycle', 'car', 'truck'], methods: ['categoryOf'] },
    { name: 'SpotSize', stereotype: 'class', responsibility: 'Holds a spot size', attributes: ['size', 'compact', 'large'], methods: ['fits'] },
    { name: 'FeeRate', stereotype: 'class', responsibility: 'Holds the hourly rate', attributes: ['fee', 'rate', 'hourly'], methods: ['charge'] },
    { name: 'SpotFinder', stereotype: 'class', responsibility: 'Finds an available spot', attributes: ['available'], methods: ['allocate'] },
    { name: 'RefusalNotice', stereotype: 'class', responsibility: 'Reports that entry was refused', attributes: ['full'], methods: ['reject'] },
  ],
  relationships: [
    { from: 'EntryExitLog', to: 'VehicleCategory', kind: 'uses' },
    { from: 'EntryExitLog', to: 'SpotFinder', kind: 'uses' },
    { from: 'SpotFinder', to: 'SpotSize', kind: 'uses' },
    { from: 'SpotFinder', to: 'RefusalNotice', kind: 'uses' },
    { from: 'EntryExitLog', to: 'FeeRate', kind: 'uses' },
  ],
  assumptions: [],
  tradeoffs: [],
  decisions: [],
  walkthroughs: [],
}

/** Nothing but assumptions: three trivial classes, every requirement answered in prose. */
const rationaleOnly: DesignModel = {
  classes: [
    { name: 'Lot', stereotype: 'class', responsibility: 'Represents the lot', attributes: ['spots'], methods: ['open'] },
    { name: 'Thing', stereotype: 'class', responsibility: 'Represents a thing in the lot', attributes: ['id'], methods: ['describe'] },
    { name: 'Record', stereotype: 'class', responsibility: 'Represents a record', attributes: ['at'], methods: ['store'] },
  ],
  relationships: [
    { from: 'Lot', to: 'Thing', kind: 'has-a' },
    { from: 'Lot', to: 'Record', kind: 'has-a' },
  ],
  assumptions: [
    'A vehicle can enter, be assigned a spot, and later exit through the same gate.',
    'Motorcycle, car and truck are the three supported vehicle types.',
    'Spots come in sizes and a vehicle only fits certain sizes; a compact spot is small.',
    'Fees are charged by duration and the hourly rate differs by type.',
    'On entry the system allocates an available spot for the vehicle.',
    'Entry is refused when no suitable spot is free.',
  ],
  tradeoffs: [],
  decisions: [],
  walkthroughs: [],
}

describe('A. vocabulary attacks on requirement coverage', () => {
  it('KNOWN HOLE: naming classes after the requirement vocabulary scores full coverage', async () => {
    const scores = await measure(hollowVocabulary)
    // This is the limitation DESIGN.md §12 states plainly: coverage asks "is this
    // addressed somewhere", not "is it addressed well". Pinned so it cannot worsen.
    expect(scores['requirement-coverage']).toBe(4)
  })

  it('DEFENCE: but the rest of the rubric refuses to be fooled by it', async () => {
    const scores = await measure(hollowVocabulary)
    // No seam at any variation point, and not one scenario walked.
    expect(scores['abstraction-use']).toBeLessThanOrEqual(1)
    expect(scores['behaviour']).toBe(0)
    expect(composite(scores)).toBeLessThan(composite(await measure(strongDesign)))
  })

  it('KNOWN HOLE: requirements answered only in the assumptions still count as covered', async () => {
    const scores = await measure(rationaleOnly)
    // `RequirementCoverageCheck` searches assumptions as well as classes, on purpose:
    // "I am treating persistence as out of scope" is a legitimate answer. The cost is
    // that restating the brief in prose reads as coverage.
    expect(scores['requirement-coverage']).toBeGreaterThanOrEqual(3)
  })

  it('DEFENCE: prose-only coverage still cannot buy the criteria that need substance', async () => {
    const scores = await measure(rationaleOnly)
    expect(scores['abstraction-use']).toBe(0)
    expect(scores['behaviour']).toBe(0)
  })

  it('KNOWN HOLE: three meaningless classes still score full marks on the fault-absence criteria', async () => {
    const scores = await measure(rationaleOnly)
    // `Lot`, `Thing` and `Record` describe nothing, but no single one of them is
    // overloaded and the graph has no orphans or cycles — so both criteria that
    // measure the *absence* of a fault award 4. This is structural: fault-absence
    // rewards emptiness. Fixing it means deciding those criteria should require
    // evidence of substance, which is a rubric change with calibration risk.
    expect(scores['class-responsibilities']).toBe(4)
    expect(scores['coupling-cohesion']).toBe(4)
    expect(composite(scores)).toBeGreaterThan(2)
  })
})

/* ------------------------------------------------------------------ */
/* B. Borrowed work — a design from a different problem                */
/* ------------------------------------------------------------------ */

describe('B. a strong design pasted in from another problem', () => {
  it('DEFENCE: vending-machine work scores near zero against the parking-lot brief', async () => {
    const vending = JSON.parse(
      JSON.stringify(
        (await import('node:fs')).readFileSync(new URL('../../content/problems/vending-machine.json', import.meta.url), 'utf8'),
      ),
    ) as string
    const foreign = (JSON.parse(vending) as { goldDesigns: Record<string, DesignModel> }).goldDesigns['strong']!
    const scores = await measure(foreign)
    // Authored per-requirement keywords are what make this fail properly: the design
    // is genuinely good, just not about parking.
    // Not zero: generic commerce vocabulary (charge, price, type) leaks across
    // problems, so two of six parking requirements read as covered by a design
    // about vending. The authored keywords stop it being worse than that.
    expect(scores['requirement-coverage']).toBeLessThanOrEqual(2)
    expect(scores['abstraction-use']).toBeLessThanOrEqual(2)
    expect(composite(scores)).toBeLessThan(2.5)
  })
})

/* ------------------------------------------------------------------ */
/* C. Evading the god-class detector by naming                         */
/* ------------------------------------------------------------------ */

/**
 * One class does everything, but it is named to dodge the vague-suffix rule
 * (`Orchestrator` is not in the list) and its responsibility is a single tidy clause.
 * Both of GodClassCheck's signals are deliberately starved.
 */
const politeGodClass: DesignModel = {
  classes: [
    { name: 'ParkingLotOrchestrator', stereotype: 'class', responsibility: 'Runs the lot', attributes: ['spots', 'rates', 'tickets'], methods: ['enter', 'exit', 'allocate', 'charge', 'refuse'] },
    { name: 'Vehicle', stereotype: 'class', responsibility: 'A vehicle of some type', attributes: ['type'], methods: ['sizeNeeded'] },
    { name: 'Spot', stereotype: 'class', responsibility: 'A single parking spot', attributes: ['size'], methods: ['isFree'] },
    { name: 'Ticket', stereotype: 'class', responsibility: 'A record of one stay', attributes: ['issuedAt'], methods: ['duration'] },
  ],
  relationships: [
    { from: 'ParkingLotOrchestrator', to: 'Vehicle', kind: 'uses' },
    { from: 'ParkingLotOrchestrator', to: 'Spot', kind: 'has-a' },
    { from: 'ParkingLotOrchestrator', to: 'Ticket', kind: 'has-a' },
  ],
  assumptions: [],
  tradeoffs: [],
  decisions: [],
  walkthroughs: [
    {
      scenarioId: 'sc-enter',
      outcome: 'ok',
      steps: [
        { className: 'ParkingLotOrchestrator', method: 'enter', note: 'takes the vehicle' },
        { className: 'ParkingLotOrchestrator', method: 'allocate', note: 'picks a spot' },
        { className: 'ParkingLotOrchestrator', method: 'charge', note: 'notes the rate' },
      ],
    },
    {
      scenarioId: 'sc-exit-pay',
      outcome: 'ok',
      steps: [
        { className: 'ParkingLotOrchestrator', method: 'exit', note: 'takes the ticket' },
        { className: 'ParkingLotOrchestrator', method: 'charge', note: 'charges the fee' },
      ],
    },
    {
      scenarioId: 'sc-full',
      outcome: 'refused',
      steps: [
        { className: 'ParkingLotOrchestrator', method: 'enter', note: 'takes the vehicle' },
        { className: 'ParkingLotOrchestrator', method: 'refuse', note: 'nothing fits' },
      ],
    },
  ],
}

describe('C. a god class with a good haircut', () => {
  it('DEFENCE: the behavioural side catches what the naming rule misses', async () => {
    const scores = await measure(politeGodClass)
    // The class-responsibilities check is genuinely evaded — one clause, no vague
    // suffix. The walkthrough is where it shows: one class performs every step.
    expect(scores['behaviour']).toBeLessThanOrEqual(1)
  })

  it('DEFENCE: and so does the absent seam at every variation point', async () => {
    const scores = await measure(politeGodClass)
    expect(scores['abstraction-use']).toBeLessThanOrEqual(1)
    expect(composite(scores)).toBeLessThan(2.5)
  })
})

/* ------------------------------------------------------------------ */
/* D. Abstractions that exist only in the class list                   */
/* ------------------------------------------------------------------ */

/** Interfaces named exactly after every variation point hint, implemented by nobody. */
const inertAbstractions: DesignModel = {
  ...strongDesign,
  classes: [
    ...strongDesign.classes.filter((c) => !['PricingStrategy', 'HourlyPricing', 'SpotAllocator', 'NearestFirstAllocator'].includes(c.name)),
    { name: 'PricingStrategy', stereotype: 'interface', responsibility: 'Prices a stay', attributes: [], methods: ['feeFor'] },
    { name: 'AllocationStrategy', stereotype: 'interface', responsibility: 'Allocates a spot', attributes: [], methods: ['allocate'] },
  ],
  relationships: strongDesign.relationships.filter(
    (r) => !['PricingStrategy', 'HourlyPricing', 'SpotAllocator', 'NearestFirstAllocator'].includes(r.from) &&
      !['PricingStrategy', 'HourlyPricing', 'SpotAllocator', 'NearestFirstAllocator'].includes(r.to),
  ),
  walkthroughs: [],
}

describe('D. abstractions nothing implements', () => {
  it('DEFENCE: a declared interface with no implementer is caught and named', async () => {
    const results = await evaluator.evaluate(designCtx(inertAbstractions))
    const abstraction = results.find((r) => r.criterionId === 'abstraction-use')!
    expect(abstraction.score).toBeLessThanOrEqual(2)
    // The finding has to be specific enough to act on, or it is just a low number.
    expect(abstraction.concern.length).toBeGreaterThan(0)
  })
})

/* ------------------------------------------------------------------ */
/* E. A walkthrough that resolves but describes nonsense               */
/* ------------------------------------------------------------------ */

/** Every step lands on a real class and a real method, in an order that makes no sense. */
const nonsenseOrder: DesignModel = {
  ...strongDesign,
  walkthroughs: [
    {
      scenarioId: 'sc-enter',
      outcome: 'ok',
      steps: [
        { className: 'Ticket', method: 'duration', note: 'measures a stay that has not started' },
        { className: 'HourlyPricing', method: 'feeFor', note: 'prices it before the car exists' },
        { className: 'NearestFirstAllocator', method: 'allocate', note: 'allocates afterwards' },
        { className: 'ParkingLot', method: 'park', note: 'and only now does the car arrive' },
      ],
    },
    ...strongDesign.walkthroughs.filter((w) => w.scenarioId !== 'sc-enter'),
  ],
}

describe('E. a walkthrough in the wrong order', () => {
  it('KNOWN HOLE: step order is not judged, so a reversed scenario still scores well', async () => {
    const scores = await measure(nonsenseOrder)
    // Every step lands on a declared class and one of ITS declared methods, so the
    // only thing wrong is the sequence — and DESIGN.md §12 says plainly that order
    // is not judged. Judging it would need a model of causality the form does not
    // capture. Note this attack must use real methods: an invented one is caught
    // immediately, which is why the first draft of this test passed for the wrong
    // reason.
    expect(scores['behaviour']).toBeGreaterThanOrEqual(3)
  })
})

/* ------------------------------------------------------------------ */
/* F. Change stage — revision that absorbs nothing                     */
/* ------------------------------------------------------------------ */

describe('F. a change-stage revision that only renames', () => {
  it('DEFENCE: renaming classes without absorbing the change scores zero blast radius', async () => {
    const renamed: DesignModel = {
      ...strongDesign,
      classes: strongDesign.classes.map((c) => ({ ...c, name: c.name === 'Ticket' ? 'StayRecord' : c.name })),
      relationships: strongDesign.relationships.map((r) => ({
        ...r,
        from: r.from === 'Ticket' ? 'StayRecord' : r.from,
        to: r.to === 'Ticket' ? 'StayRecord' : r.to,
      })),
      walkthroughs: [],
    }
    const results = await evaluator.evaluate(changeCtx(strongDesign, renamed))
    const blast = results.find((r) => r.criterionId === 'change-resilience')
    expect(blast).toBeDefined()
    expect(blast!.score).toBeLessThanOrEqual(1)
  })
})

/* ------------------------------------------------------------------ */
/* G. The floor: an empty design must not crash or flatter             */
/* ------------------------------------------------------------------ */

describe('G. degenerate submissions', () => {
  const empty: DesignModel = { classes: [], relationships: [], assumptions: [], tradeoffs: [], decisions: [], walkthroughs: [] }

  it('scores an empty design at the floor and says why', async () => {
    const results = await evaluator.evaluate(designCtx(empty))
    const scores = Object.fromEntries(results.map((r) => [r.criterionId, r.score]))
    for (const criterion of MEASURED) expect(scores[criterion]).toBe(0)
    // Before this corpus existed, an empty submission scored 4 on two criteria and
    // was told "every class describes a single job" and "the graph holds together".
    // Praise for an empty form is worse than a low score.
    const responsibilities = results.find((r) => r.criterionId === 'class-responsibilities')!
    expect(responsibilities.concern).toMatch(/no classes/i)
    expect(responsibilities.concern).not.toMatch(/single job/i)
  })

  it('survives a design whose relationships name classes that do not exist', async () => {
    const dangling: DesignModel = {
      ...empty,
      classes: [{ name: 'A', stereotype: 'class', responsibility: 'Does a thing', attributes: [], methods: ['go'] }],
      relationships: [{ from: 'A', to: 'Ghost', kind: 'uses' }],
    }
    const scores = await measure(dangling)
    expect(scores['coupling-cohesion']).toBeLessThanOrEqual(2)
  })
})
