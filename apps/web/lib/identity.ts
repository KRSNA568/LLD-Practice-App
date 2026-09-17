import type { LearnerPayload } from '@lld/contracts'

/**
 * Who this browser is. The Phase 2 stand-in for accounts: a name creates a learner
 * on the API, the id lives here, and every request carries it. No secret — this
 * keeps study participants apart on one instance and nothing more. Phase 4 replaces
 * it with real sessions and this file goes away.
 */

/** `createdAt` is optional only because a learner stored before it existed has none; the gate refreshes it. */
export type Learner = Omit<LearnerPayload['learner'], 'createdAt'> & { createdAt?: string }

const KEY = 'lld.learner'

export function readLearner(): Learner | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Learner>
    return typeof parsed.id === 'string' && typeof parsed.name === 'string'
      ? { id: parsed.id, name: parsed.name, ...(typeof parsed.createdAt === 'string' ? { createdAt: parsed.createdAt } : {}) }
      : null
  } catch {
    return null
  }
}

export function storeLearner(learner: Learner): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(learner))
  } catch {
    // Private mode or blocked storage: the session still works, it just will not survive a reload.
  }
}

export function clearLearner(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // nothing to clear
  }
}
