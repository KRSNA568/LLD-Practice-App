import { describe, expect, it } from 'vitest'
import { buildStudyExport, toCsv, type ExportInput } from '../../apps/api/src/study/StudyExport.js'

/**
 * The export is what the validity study is computed on, so its derivations are
 * pinned here on synthetic rows: timings from the three timestamps that already
 * exist, abandonment as "no submission", and cost split evaluator / mentor.
 */

const t = (s: number) => new Date(Date.UTC(2026, 8, 16, 10, 0, s))
const result = (criterionId: string, score: number, evidence = 1) =>
  ({ criterionId, score, confidence: 'high', evaluatorId: 'rule-evaluator', evaluatorKind: 'deterministic', evidence: Array(evidence).fill({ kind: 'class', name: 'X' }), concern: '', suggestion: '', stage: 'design' })

const learner = { id: 'l-1', name: 'Priya, P1' }

const full: ExportInput = {
  attempt: { id: 'a-1', problemId: 'parking-lot', attemptNumber: 1, stage: 'defend', state: 'COMPLETED', createdAt: t(0), learner },
  submissions: [
    { stage: 'design', submittedAt: t(600) },
    { stage: 'change', submittedAt: t(1000) },
    { stage: 'defend', submittedAt: t(1500) },
  ],
  evaluations: [
    { stage: 'design', completedAt: t(610), resultsJson: JSON.stringify([result('requirement-coverage', 4, 3), result('behaviour', 2)]), evaluatorIds: 'rule', rubricVersion: '2', promptVersion: '2.1.0', inputTokens: 2000, outputTokens: 500, unchangedFromPrevious: false },
    { stage: 'change', completedAt: t(1005), resultsJson: JSON.stringify([result('change-resilience', 4)]), evaluatorIds: 'rule', rubricVersion: '2', promptVersion: '2.1.0', inputTokens: null, outputTokens: null, unchangedFromPrevious: false },
    { stage: 'defend', completedAt: t(1520), resultsJson: JSON.stringify([result('reasoning', 3)]), evaluatorIds: 'rule', rubricVersion: '2', promptVersion: '2.1.0', inputTokens: 3000, outputTokens: 900, unchangedFromPrevious: false },
  ],
  notes: [
    { stage: 'design', kind: 'review', inputTokens: 1500, outputTokens: 150 },
    { stage: 'design', kind: 'lesson', inputTokens: null, outputTokens: null }, // cache hit
  ],
  turns: [
    { role: 'learner', inputTokens: null, outputTokens: null },
    { role: 'mentor', inputTokens: 600, outputTokens: 120 },
  ],
}

const abandoned: ExportInput = {
  attempt: { id: 'a-2', problemId: 'parking-lot', attemptNumber: 1, stage: 'design', state: 'DRAFT', createdAt: t(0), learner: { id: 'l-2', name: 'Dev' } },
  submissions: [],
  evaluations: [],
  notes: [],
  turns: [],
}

describe('buildStudyExport', () => {
  const { scores, attempts } = buildStudyExport([full, abandoned])

  it('emits one score row per criterion per evaluated stage', () => {
    expect(scores).toHaveLength(4)
    expect(scores.map((s) => `${s.stage}:${s.criterionId}=${s.score}`)).toEqual([
      'design:requirement-coverage=4',
      'design:behaviour=2',
      'change:change-resilience=4',
      'defend:reasoning=3',
    ])
    expect(scores[0]).toMatchObject({ learnerId: 'l-1', attemptId: 'a-1', evidenceCount: 3, promptVersion: '2.1.0' })
  })

  it('derives stage timings from the timestamps that already exist', () => {
    const a = attempts.find((x) => x.attemptId === 'a-1')!
    expect(a.secondsDesigning).toBe(600) // start → design frozen
    expect(a.secondsRevising).toBe(390) // design report (610) → change frozen (1000)
    expect(a.secondsDefending).toBe(495) // change report (1005) → defend submitted (1500)
    expect(a.secondsWaitingForLastReport).toBe(20) // defend submitted (1500) → report (1520)
    expect(a.stagesSubmitted).toBe(3)
    expect(a.stagesEvaluated).toBe(3)
    expect(a.abandoned).toBe(false)
  })

  it('splits cost into evaluator and mentor, counting only what was actually generated', () => {
    const a = attempts.find((x) => x.attemptId === 'a-1')!
    expect(a.evaluatorInputTokens).toBe(5000)
    expect(a.evaluatorOutputTokens).toBe(1400)
    // The cached lesson and the learner's own turn cost nothing; the note and the follow-up did.
    expect(a.mentorInputTokens).toBe(2100)
    expect(a.mentorOutputTokens).toBe(270)
    expect(a.mentorNotes).toBe(2)
    expect(a.mentorFollowUps).toBe(1)
  })

  it('an attempt with no submission is an abandon, with null timings rather than zeros', () => {
    const a = attempts.find((x) => x.attemptId === 'a-2')!
    expect(a.abandoned).toBe(true)
    expect(a.secondsDesigning).toBeNull()
    expect(a.secondsWaitingForLastReport).toBeNull()
    expect(a.stagesSubmitted).toBe(0)
    expect(scores.some((s) => s.attemptId === 'a-2')).toBe(false)
  })
})

describe('toCsv', () => {
  it('quotes the cells that need it and writes nulls as empty', () => {
    const csv = toCsv([{ name: 'Priya, P1', n: 1, none: null, quote: 'said "hi"' }])
    expect(csv).toBe('name,n,none,quote\n"Priya, P1",1,,"said ""hi"""\n')
  })

  it('writes a header even with no rows, so an empty study is still a valid file', () => {
    expect(toCsv([], ['a', 'b'])).toBe('a,b\n')
  })
})
