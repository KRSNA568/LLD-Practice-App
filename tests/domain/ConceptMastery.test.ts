import { describe, expect, it } from 'vitest'
import { conceptMastery, levelFor, streakDays, MASTERY_WINDOW } from '../../apps/api/src/domain/feedback/ConceptMastery.js'
import { rubric } from '../fixtures.js'
import type { Concept } from '@lld/contracts'

const concepts: Concept[] = [
  { id: 'open-closed', tier: 'principle', name: 'Open/closed', plain: 'p', tell: 't', prerequisites: [] },
  { id: 'srp', tier: 'principle', name: 'SRP', plain: 'p', tell: 't', prerequisites: [] },
  { id: 'concurrency-safety', tier: 'practice', name: 'Concurrency', plain: 'p', tell: 't', prerequisites: [] },
]

describe('conceptMastery', () => {
  it('folds every criterion that names a concept into that concept', () => {
    // abstraction-use and change-resilience both speak to open-closed.
    const m = conceptMastery([{ scores: { 'abstraction-use': 4, 'change-resilience': 2 } }], rubric, concepts)
    const oc = m.find((x) => x.conceptId === 'open-closed')!
    expect(oc.evidenceCount).toBe(2)
    expect(oc.average).toBe(3)
    expect(oc.level).toBe('solid')
  })

  it('reports a concept nothing has scored as new, not zero', () => {
    const m = conceptMastery([{ scores: { 'abstraction-use': 0 } }], rubric, concepts)
    const cs = m.find((x) => x.conceptId === 'concurrency-safety')!
    expect(cs).toEqual({ conceptId: 'concurrency-safety', level: 'new', average: null, evidenceCount: 0 })
  })

  it('only looks at the most recent attempts', () => {
    const old = Array.from({ length: 3 }, () => ({ scores: { 'class-responsibilities': 0 } }))
    const fresh = Array.from({ length: MASTERY_WINDOW }, () => ({ scores: { 'class-responsibilities': 4 } }))
    const m = conceptMastery([...fresh, ...old], rubric, concepts)
    expect(m.find((x) => x.conceptId === 'srp')!.average).toBe(4)
  })

  it('bands the average', () => {
    expect(levelFor(3.2)).toBe('solid')
    expect(levelFor(2)).toBe('developing')
    expect(levelFor(1)).toBe('new')
  })
})

describe('streakDays', () => {
  const day = (offset: number) => {
    const d = new Date(2026, 8, 13, 12)
    d.setDate(d.getDate() - offset)
    return d
  }
  const now = day(0)

  it('counts consecutive days ending today', () => {
    expect(streakDays([day(0), day(1), day(2), day(5)], now)).toBe(3)
  })

  it('survives a day not yet practised, but not two', () => {
    expect(streakDays([day(1), day(2)], now)).toBe(2)
    expect(streakDays([day(2), day(3)], now)).toBe(0)
  })

  it('is zero with nothing submitted', () => {
    expect(streakDays([], now)).toBe(0)
  })
})
