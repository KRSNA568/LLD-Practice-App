import { type AttemptState } from '@lld/contracts'

/**
 * The attempt lifecycle, as an explicit transition table.
 *
 * Written as data rather than as scattered `if (attempt.state === ...)` checks for
 * one reason: an illegal transition should be impossible to express, not merely
 * unlikely. Every route that moves an attempt goes through `assertTransition`, so
 * "can a FAILED attempt jump straight to COMPLETED?" has exactly one answer, in one
 * place, that a test can pin down.
 */

export const TRANSITIONS: Readonly<Record<AttemptState, readonly AttemptState[]>> = {
  /** Work in progress. Autosaves land here without changing state. */
  DRAFT: ['SUBMITTED'],

  /** Submission is persisted and queued. Nothing has been evaluated yet. */
  SUBMITTED: ['EVALUATING', 'FAILED'],

  /** An evaluator is running. All four outcomes are reachable from here. */
  EVALUATING: ['COMPLETED', 'COMPLETED_PARTIAL', 'FAILED'],

  /**
   * Terminal. A learner who wants another go starts a new attempt rather than
   * mutating this one — history is the product, so attempts are append-only.
   */
  COMPLETED: [],
  COMPLETED_PARTIAL: [],

  /**
   * Retry re-enters the queue by returning to SUBMITTED. The submission itself was
   * persisted before evaluation ever started, so there is nothing to re-collect.
   */
  FAILED: ['SUBMITTED'],
} as const

export class InvalidTransitionError extends Error {
  readonly code = 'INVALID_TRANSITION' as const

  constructor(
    readonly from: AttemptState,
    readonly to: AttemptState,
  ) {
    super(
      `Cannot move an attempt from ${from} to ${to}. ` +
        `Legal moves from ${from}: ${TRANSITIONS[from].join(', ') || 'none — this state is terminal'}.`,
    )
    this.name = 'InvalidTransitionError'
  }
}

export function canTransition(from: AttemptState, to: AttemptState): boolean {
  return TRANSITIONS[from].includes(to)
}

/** Throws rather than returning false: callers are performing a transition, not asking about one. */
export function assertTransition(from: AttemptState, to: AttemptState): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to)
}

export function isTerminal(state: AttemptState): boolean {
  return TRANSITIONS[state].length === 0
}

/** True once evaluation has finished, successfully or not — i.e. stop polling. */
export function isSettled(state: AttemptState): boolean {
  return state === 'COMPLETED' || state === 'COMPLETED_PARTIAL' || state === 'FAILED'
}
