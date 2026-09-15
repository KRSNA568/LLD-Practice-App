import type { CriterionResult, Stage } from '@lld/contracts'

/**
 * What the validity study reads.
 *
 * Two grains, because two questions. `scores` is one row per criterion per
 * evaluated stage per attempt — the thing the senior-vs-junior comparison and the
 * expert-agreement study are computed on. `attempts` is one row per attempt with
 * how far it got, how long each stage took, what it cost, and whether it was
 * abandoned — the thing activation and drop-off are computed on.
 *
 * Nothing here needed a schema change: attempt creation, each stage's submission
 * and each stage's evaluation are already timestamped, and an attempt with no
 * submission is an abandon by definition. Pure so it can be tested on synthetic
 * rows; the script wraps it in a database query.
 */

export type ExportInput = {
  attempt: {
    id: string
    problemId: string
    attemptNumber: number
    stage: string
    state: string
    createdAt: Date
    learner: { id: string; name: string }
  }
  submissions: Array<{ stage: string; submittedAt: Date }>
  evaluations: Array<{
    stage: string
    completedAt: Date
    resultsJson: string
    evaluatorIds: string
    rubricVersion: string
    promptVersion: string
    inputTokens: number | null
    outputTokens: number | null
    unchangedFromPrevious: boolean
  }>
  notes: Array<{ stage: string | null; kind: string; inputTokens: number | null; outputTokens: number | null }>
  turns: Array<{ role: string; inputTokens: number | null; outputTokens: number | null }>
}

export type ScoreRow = {
  learnerId: string
  learnerName: string
  problemId: string
  attemptNumber: number
  attemptId: string
  stage: string
  criterionId: string
  score: number
  confidence: string
  evaluatorId: string
  evaluatorKind: string
  rubricVersion: string
  promptVersion: string
  unchangedFromPrevious: boolean
  evidenceCount: number
}

export type AttemptRow = {
  learnerId: string
  learnerName: string
  problemId: string
  attemptNumber: number
  attemptId: string
  startedAt: string
  finalStage: string
  finalState: string
  abandoned: boolean
  stagesSubmitted: number
  stagesEvaluated: number
  /** Seconds from starting the attempt to freezing the design. */
  secondsDesigning: number | null
  /** Seconds from the design report landing to freezing the revision. */
  secondsRevising: number | null
  /** Seconds from the change report landing to submitting the defend answers. */
  secondsDefending: number | null
  /** Seconds from the last submission to its report — how long the learner waited. */
  secondsWaitingForLastReport: number | null
  evaluatorInputTokens: number
  evaluatorOutputTokens: number
  mentorInputTokens: number
  mentorOutputTokens: number
  mentorNotes: number
  mentorFollowUps: number
}

const STAGES: Stage[] = ['design', 'change', 'defend']

const seconds = (from: Date | undefined, to: Date | undefined): number | null =>
  from && to ? Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000)) : null

export function buildStudyExport(inputs: ExportInput[]): { scores: ScoreRow[]; attempts: AttemptRow[] } {
  const scores: ScoreRow[] = []
  const attempts: AttemptRow[] = []

  for (const { attempt, submissions, evaluations, notes, turns } of inputs) {
    const base = {
      learnerId: attempt.learner.id,
      learnerName: attempt.learner.name,
      problemId: attempt.problemId,
      attemptNumber: attempt.attemptNumber,
      attemptId: attempt.id,
    }

    for (const evaluation of evaluations) {
      const results = JSON.parse(evaluation.resultsJson) as CriterionResult[]
      for (const r of results) {
        scores.push({
          ...base,
          stage: evaluation.stage,
          criterionId: r.criterionId,
          score: r.score,
          confidence: r.confidence,
          evaluatorId: r.evaluatorId,
          evaluatorKind: r.evaluatorKind,
          rubricVersion: evaluation.rubricVersion,
          promptVersion: evaluation.promptVersion,
          unchangedFromPrevious: evaluation.unchangedFromPrevious,
          evidenceCount: r.evidence.length,
        })
      }
    }

    const submittedAt = (stage: Stage) => submissions.find((s) => s.stage === stage)?.submittedAt
    const reportAt = (stage: Stage) => evaluations.find((e) => e.stage === stage)?.completedAt
    const lastSubmitted = [...STAGES].reverse().find((s) => submittedAt(s))

    const sum = (rows: Array<{ inputTokens: number | null; outputTokens: number | null }>) =>
      rows.reduce((a, r) => ({ i: a.i + (r.inputTokens ?? 0), o: a.o + (r.outputTokens ?? 0) }), { i: 0, o: 0 })
    const evalTokens = sum(evaluations)
    const mentorTurns = turns.filter((t) => t.role === 'mentor')
    const mentorTokens = sum([...notes, ...mentorTurns])

    attempts.push({
      ...base,
      startedAt: attempt.createdAt.toISOString(),
      finalStage: attempt.stage,
      finalState: attempt.state,
      abandoned: submissions.length === 0,
      stagesSubmitted: submissions.length,
      stagesEvaluated: evaluations.length,
      secondsDesigning: seconds(attempt.createdAt, submittedAt('design')),
      secondsRevising: seconds(reportAt('design'), submittedAt('change')),
      secondsDefending: seconds(reportAt('change'), submittedAt('defend')),
      secondsWaitingForLastReport: lastSubmitted ? seconds(submittedAt(lastSubmitted), reportAt(lastSubmitted)) : null,
      evaluatorInputTokens: evalTokens.i,
      evaluatorOutputTokens: evalTokens.o,
      mentorInputTokens: mentorTokens.i,
      mentorOutputTokens: mentorTokens.o,
      mentorNotes: notes.length,
      mentorFollowUps: mentorTurns.length,
    })
  }

  return { scores, attempts }
}

/** RFC-4180-enough: quote anything with a comma, quote or newline; booleans and nulls as text. */
export function toCsv<T extends Record<string, unknown>>(rows: T[], columns?: Array<keyof T & string>): string {
  if (rows.length === 0) return (columns ?? []).join(',') + '\n'
  const cols = columns ?? (Object.keys(rows[0]!) as Array<keyof T & string>)
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n'
}
