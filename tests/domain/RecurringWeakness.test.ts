import { describe, expect, it } from 'vitest'
import { detectRecurringWeaknesses } from '../../apps/api/src/domain/feedback/RecurringWeakness.js'
import { rubric } from '../fixtures.js'

const weak = { scores: { 'abstraction-use': 1, 'coupling-cohesion': 3 } }
const alsoWeak = { scores: { 'abstraction-use': 0, 'coupling-cohesion': 4 } }
const fine = { scores: { 'abstraction-use': 4, 'coupling-cohesion': 4 } }

describe('detectRecurringWeaknesses', () => {
  it('says nothing before the third attempt', () => {
    // One bad score is a bad day. Calling it a pattern off two data points teaches
    // learners to ignore the callout.
    expect(detectRecurringWeaknesses([weak], rubric)).toEqual([])
    expect(detectRecurringWeaknesses([weak, alsoWeak], rubric)).toEqual([])
  })

  it('fires on the third attempt when the same criterion keeps failing', () => {
    const found = detectRecurringWeaknesses([weak, alsoWeak, fine], rubric)
    expect(found).toHaveLength(1)
    expect(found[0]!.criterionId).toBe('abstraction-use')
    expect(found[0]!.occurrences).toBe(2)
    expect(found[0]!.criterionName).toBe('Use of Abstraction')
  })

  it('retires a weakness once the learner improves', () => {
    // Newest first: two good attempts push the old failure out of the window.
    expect(detectRecurringWeaknesses([fine, fine, weak], rubric)).toEqual([])
  })

  it('only looks at the last three attempts', () => {
    const history = [fine, fine, fine, weak, alsoWeak, weak]
    expect(detectRecurringWeaknesses(history, rubric)).toEqual([])
  })

  it('ignores criteria the AI half never scored', () => {
    // A partial report leaves gaps. Absent is not the same as bad, and treating it
    // as bad would invent a weakness out of a provider outage.
    const partial = { scores: { 'coupling-cohesion': 4 } }
    expect(detectRecurringWeaknesses([partial, partial, partial], rubric)).toEqual([])
  })

  it('puts the worst weakness first', () => {
    const twoBad = [
      { scores: { 'abstraction-use': 1, 'change-resilience': 0 } },
      { scores: { 'abstraction-use': 1, 'change-resilience': 0 } },
      { scores: { 'abstraction-use': 1, 'change-resilience': 0 } },
    ]
    const found = detectRecurringWeaknesses(twoBad, rubric)
    expect(found.map((f) => f.criterionId)).toEqual(['change-resilience', 'abstraction-use'])
  })
})
