import type { Concept, ConceptMastery, MasteryLevel, Rubric } from '@lld/contracts'

/**
 * Folds criterion scores into a per-concept standing.
 *
 * A criterion is evidence about every concept it names (`conceptIds` in the rubric),
 * so a learner's abstraction-use score speaks to open-closed, DIP and interface
 * design at once. Only the most recent scored attempts count — a habit is what you
 * do now, not what you did the first time — and a concept nothing has scored yet is
 * `new`, never zero. Pure: no I/O, no framework.
 */

export const MASTERY_WINDOW = 5
const SOLID_AT = 3.0
const DEVELOPING_AT = 1.5

export type ScoredAttempt = { scores: Record<string, number | undefined> }

export function conceptMastery(
  attempts: ScoredAttempt[],
  rubric: Rubric,
  concepts: Concept[],
): ConceptMastery[] {
  const window = attempts.slice(0, MASTERY_WINDOW)
  const byConcept = new Map<string, number[]>()
  for (const concept of concepts) byConcept.set(concept.id, [])

  for (const attempt of window) {
    for (const criterion of rubric.criteria) {
      const score = attempt.scores[criterion.id]
      if (score === undefined) continue
      for (const conceptId of criterion.conceptIds) {
        byConcept.get(conceptId)?.push(score)
      }
    }
  }

  return concepts.map((concept) => {
    const scores = byConcept.get(concept.id) ?? []
    if (scores.length === 0) {
      return { conceptId: concept.id, level: 'new', average: null, evidenceCount: 0 }
    }
    const average = scores.reduce((a, b) => a + b, 0) / scores.length
    return { conceptId: concept.id, level: levelFor(average), average, evidenceCount: scores.length }
  })
}

export function levelFor(average: number): MasteryLevel {
  if (average >= SOLID_AT) return 'solid'
  if (average >= DEVELOPING_AT) return 'developing'
  return 'new'
}

/**
 * Consecutive days ending today (or yesterday — a streak is not broken until a
 * whole day passes) with at least one timestamp.
 */
export function streakDays(timestamps: Date[], now = new Date()): number {
  const days = new Set(timestamps.map((t) => dayKey(t)))
  if (days.size === 0) return 0
  let cursor = new Date(now)
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!days.has(dayKey(cursor))) return 0
  }
  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak += 1
    cursor = new Date(cursor)
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
