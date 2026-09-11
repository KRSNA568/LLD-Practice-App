import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Problem } from '@lld/contracts'
import { suggestNextProblem } from '../../apps/api/src/domain/feedback/NextProblem.js'
import { parkingLot, rubric } from '../fixtures.js'

const load = (id: string): Problem =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../content/problems/${id}.json`, import.meta.url)), 'utf8'))

const problems = [parkingLot, load('vending-machine'), load('logging-framework'), load('shopping-cart-discounts')]

describe('suggestNextProblem', () => {
  it('follows the weakest criterion to a problem tagged with its concept', () => {
    const next = suggestNextProblem({
      current: parkingLot,
      problems,
      rubric,
      weaknesses: [{ criterionId: 'abstraction-use', criterionName: 'Use of Abstraction', occurrences: 2, windowSize: 3, averageScore: 1 }],
      attemptedIds: new Set(['parking-lot']),
    })
    expect(next).not.toBeNull()
    // abstraction-use → open-closed / dip / interface-design → logging or cart, never parking-lot again
    expect(['logging-framework', 'shopping-cart-discounts']).toContain(next!.problemId)
    expect(next!.criterionId).toBe('abstraction-use')
    expect(next!.reason).toMatch(/Use of Abstraction has scored below 2/)
  })

  it('prefers a problem the learner has not tried', () => {
    const next = suggestNextProblem({
      current: parkingLot,
      problems,
      rubric,
      weaknesses: [{ criterionId: 'abstraction-use', criterionName: 'Use of Abstraction', occurrences: 2, windowSize: 3, averageScore: 1 }],
      attemptedIds: new Set(['parking-lot', 'logging-framework']),
    })
    expect(next!.problemId).toBe('shopping-cart-discounts')
  })

  it('falls back to the authored path when there is no weakness on record', () => {
    const next = suggestNextProblem({ current: parkingLot, problems, rubric, weaknesses: [], attemptedIds: new Set(['parking-lot']) })
    expect(next!.problemId).toBe('vending-machine')
    expect(next!.criterionId).toBeNull()
  })

  it('returns null when there is nothing else to suggest', () => {
    expect(suggestNextProblem({ current: parkingLot, problems: [parkingLot], rubric, weaknesses: [], attemptedIds: new Set() })).toBeNull()
  })
})
