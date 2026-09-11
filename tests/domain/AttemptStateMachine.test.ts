import { describe, expect, it } from 'vitest'
import type { AttemptState } from '@lld/contracts'
import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  isSettled,
  isTerminal,
  TRANSITIONS,
} from '../../apps/api/src/domain/attempt/AttemptStateMachine.js'

describe('AttemptStateMachine', () => {
  it('allows every transition in the table', () => {
    for (const [from, targets] of Object.entries(TRANSITIONS)) {
      for (const to of targets) {
        expect(canTransition(from as AttemptState, to)).toBe(true)
        expect(() => assertTransition(from as AttemptState, to)).not.toThrow()
      }
    }
  })

  it('rejects transitions that are not in the table', () => {
    // Skipping evaluation entirely would let a report exist with nothing behind it.
    expect(canTransition('DRAFT', 'COMPLETED')).toBe(false)
    expect(canTransition('SUBMITTED', 'COMPLETED')).toBe(false)
    // Attempts are append-only: a finished attempt is history, not a scratchpad.
    expect(canTransition('COMPLETED', 'DRAFT')).toBe(false)
    expect(canTransition('COMPLETED_PARTIAL', 'SUBMITTED')).toBe(false)
  })

  it('throws a named error identifying both states', () => {
    try {
      assertTransition('COMPLETED', 'DRAFT')
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTransitionError)
      const e = error as InvalidTransitionError
      expect(e.from).toBe('COMPLETED')
      expect(e.to).toBe('DRAFT')
      expect(e.code).toBe('INVALID_TRANSITION')
      expect(e.message).toContain('terminal')
    }
  })

  it('lets a failed evaluation be retried without re-collecting the submission', () => {
    expect(canTransition('FAILED', 'SUBMITTED')).toBe(true)
  })

  it('treats completed and partial as terminal, but failed as retryable', () => {
    expect(isTerminal('COMPLETED')).toBe(true)
    expect(isTerminal('COMPLETED_PARTIAL')).toBe(true)
    expect(isTerminal('FAILED')).toBe(false)
  })

  it('stops polling once evaluation has settled, including on failure', () => {
    expect(isSettled('SUBMITTED')).toBe(false)
    expect(isSettled('EVALUATING')).toBe(false)
    expect(isSettled('COMPLETED')).toBe(true)
    expect(isSettled('COMPLETED_PARTIAL')).toBe(true)
    expect(isSettled('FAILED')).toBe(true)
  })
})
