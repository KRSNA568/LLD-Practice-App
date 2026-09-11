import { describe, expect, it } from 'vitest'
import type { RawStructuredSubmission } from '@lld/contracts'
import { StructuredDesignParser } from '../../apps/api/src/submission/StructuredDesignParser.js'

const parser = new StructuredDesignParser()

function raw(over: Partial<RawStructuredSubmission> = {}): RawStructuredSubmission {
  return {
    format: 'structured-design',
    assumptions: ['One vehicle per spot'],
    classes: [
      { name: 'ParkingLot', stereotype: 'class', responsibility: 'Holds floors', attributes: [], methods: [] },
    ],
    relationships: [],
    tradeoffs: 'Kept pricing separate.',
    decisions: [],
    walkthroughs: [],
    ...over,
  }
}

describe('StructuredDesignParser', () => {
  it('produces a canonical design model from a valid form', () => {
    const result = parser.parse(raw())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.design.classes[0]!.name).toBe('ParkingLot')
    expect(result.design.decisions).toEqual([])
    expect(result.design.walkthroughs).toEqual([])
  })

  it('drops trailing blank rows instead of erroring on them', () => {
    // The workspace always renders an empty row for adding the next class, so a
    // blank tail is the normal state of the form rather than a mistake.
    const result = parser.parse(
      raw({
        classes: [
          { name: 'ParkingLot', stereotype: 'class', responsibility: 'Holds floors', attributes: [], methods: [] },
          { name: '', stereotype: 'class', responsibility: '', attributes: [], methods: [] },
        ],
        relationships: [{ from: '', to: '', kind: 'uses' }],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.design.classes).toHaveLength(1)
    expect(result.design.relationships).toHaveLength(0)
  })

  it('reports a half-filled row against the exact field', () => {
    const result = parser.parse(
      raw({
        classes: [
          { name: 'ParkingLot', stereotype: 'class', responsibility: '', attributes: [], methods: [] },
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContainEqual({
      path: 'classes.0.responsibility',
      message: 'Say what this class is responsible for',
    })
  })

  it('rejects duplicate class names, which would make evidence ambiguous', () => {
    const result = parser.parse(
      raw({
        classes: [
          { name: 'Spot', stereotype: 'class', responsibility: 'A space', attributes: [], methods: [] },
          { name: 'spot', stereotype: 'class', responsibility: 'Another space', attributes: [], methods: [] },
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]!.path).toBe('classes.1.name')
    expect(result.errors[0]!.message).toMatch(/duplicate/i)
  })

  it('rejects a self-referencing relationship', () => {
    const result = parser.parse(
      raw({ relationships: [{ from: 'ParkingLot', to: 'ParkingLot', kind: 'uses' }] }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0]!.message).toMatch(/cannot relate to itself/i)
  })

  it('rejects a design with no classes at all', () => {
    const result = parser.parse(raw({ classes: [] }))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toContainEqual({ path: 'classes', message: 'A design needs at least one class' })
  })

  it('falls back to safe defaults for unrecognised enum values', () => {
    const result = parser.parse(
      raw({
        classes: [{ name: 'Spot', stereotype: 'widget', responsibility: 'A space', attributes: [], methods: [] }],
        relationships: [{ from: 'Spot', to: 'ParkingLot', kind: 'uses' }],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.design.classes[0]!.stereotype).toBe('class')
  })

  it('collects every error rather than stopping at the first', () => {
    // Three distinct faults, so the workspace can mark three fields at once
    // instead of making the learner fix one, resubmit, and discover the next.
    const result = parser.parse(
      raw({
        classes: [
          { name: 'Spot', stereotype: 'class', responsibility: '', attributes: [], methods: [] },
        ],
        relationships: [{ from: 'Spot', to: '', kind: 'uses' }],
        walkthroughs: [{ scenarioId: 'sc-enter', steps: [{ className: 'Spot', method: '', note: '' }], outcome: 'ok' }],
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((e) => e.path).sort()).toEqual([
      'classes.0.responsibility',
      'relationships.0.to',
      'walkthroughs.0.steps.0.method',
    ])
  })

  it('treats an entirely blank class row as absent, not as an error', () => {
    const result = parser.parse(
      raw({ classes: [{ name: '', stereotype: 'class', responsibility: '', attributes: [], methods: [] }] }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    // The row vanished, so the complaint is about the design being empty rather
    // than about the blank row itself.
    expect(result.errors).toEqual([{ path: 'classes', message: 'A design needs at least one class' }])
  })

  it('keeps decisions and walkthroughs, dropping blank rows of each', () => {
    const result = parser.parse(
      raw({
        decisions: [
          { what: 'Pricing behind an interface', alternative: 'A method on the lot', why: 'Rates change' },
          { what: '', alternative: '', why: '' },
        ],
        walkthroughs: [
          {
            scenarioId: 'sc-enter',
            steps: [
              { className: 'ParkingLot', method: 'park', note: '' },
              { className: '', method: '', note: '' },
            ],
            outcome: 'refused',
          },
          { scenarioId: 'sc-full', steps: [], outcome: 'ok' },
        ],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.design.decisions).toHaveLength(1)
    // The scenario with no steps was not walked, so it is absent rather than empty.
    expect(result.design.walkthroughs).toHaveLength(1)
    expect(result.design.walkthroughs[0]!.steps).toHaveLength(1)
    expect(result.design.walkthroughs[0]!.outcome).toBe('refused')
  })

  it('rejects a decision that names an alternative but never says what was decided', () => {
    const result = parser.parse(
      raw({ decisions: [{ what: '', alternative: 'flags', why: 'simpler' }] }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.map((e) => e.path)).toContain('decisions.0.what')
  })
})
