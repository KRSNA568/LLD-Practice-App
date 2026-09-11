'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import type { PublicProblem, Rubric } from '@lld/contracts'
import { api, type HistoryPayload } from '@/lib/api'
import { relativeTime, scoreTone, STAGE_LABEL } from '@/lib/format'
import { NextForYou } from '@/components/NextForYou'
import { riseIn, stagger } from '@/components/motion'

const TONE_TEXT = {
  critical: 'text-critical',
  caution: 'text-caution',
  positive: 'text-positive',
} as const
const TONE_BG = {
  critical: 'bg-critical',
  caution: 'bg-caution',
  positive: 'bg-positive',
} as const

export default function HistoryPage() {
  const { problemId } = useParams<{ problemId: string }>()
  const router = useRouter()

  const [problem, setProblem] = useState<PublicProblem | null>(null)
  const [rubric, setRubric] = useState<Rubric | null>(null)
  const [history, setHistory] = useState<HistoryPayload | null>(null)

  useEffect(() => {
    void (async () => {
      const [{ problem, rubric }, history] = await Promise.all([api.getProblem(problemId), api.getHistory(problemId)])
      setProblem(problem)
      setRubric(rubric)
      setHistory(history)
    })()
  }, [problemId])

  async function tryAgain() {
    const { attempt } = await api.startAttempt(problemId)
    router.push(`/practice/${attempt.id}`)
  }

  const attempts = history?.attempts ?? []
  const weaknesses = history?.recurringWeaknesses ?? []
  const scored = attempts.filter((a) => a.overall !== null).reverse()

  return (
    <div>
      <motion.header initial="hidden" animate="show" variants={riseIn} className="mb-6 mt-2">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/" className="text-xs text-ink-faint hover:text-ink">
              ← All problems
            </Link>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight">{problem?.title ?? 'History'}</h1>
            <p className="mt-1 text-sm text-ink-muted">
              {attempts.length} {attempts.length === 1 ? 'attempt' : 'attempts'}
              {history && history.critique.total > 0 && (
                <>
                  {' '}
                  · critique {history.critique.correct}/{history.critique.total}
                  {history.critique.answered < history.critique.total && (
                    <Link href={`/critique/${problemId}`} className="ml-1 text-brand hover:underline">
                      finish the warm-up
                    </Link>
                  )}
                </>
              )}
            </p>
          </div>
          <button onClick={tryAgain} className="btn-primary">
            Try again
          </button>
        </div>
      </motion.header>

      {weaknesses.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card mb-4 border-caution/30 bg-caution/[0.06] p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-caution/15 text-caution">!</span>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Recurring weakness</h2>
              <p className="mt-1.5 text-[14px] leading-relaxed">
                <strong className="font-semibold">{weaknesses[0]!.criterionName}</strong> has scored below par in{' '}
                {weaknesses[0]!.occurrences} of your last {weaknesses[0]!.windowSize} attempts, averaging{' '}
                {weaknesses[0]!.averageScore.toFixed(1)} out of 4.
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
                One low score is a bad day. The same one three attempts running is a habit — and that
                is the thing worth working on next.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {history?.next && attempts.length > 0 && (
        <div className="mb-6">
          <NextForYou next={history.next} />
        </div>
      )}

      {scored.length >= 2 && rubric && (
        <motion.section initial="hidden" animate="show" variants={riseIn} className="card mb-6 p-5">
          <h2 className="mb-4 text-sm font-semibold tracking-tight">Per-criterion trend</h2>
          <div className="space-y-3">
            {rubric.criteria.map((criterion) => {
              const series = scored.map((a) => a.scores[criterion.id])
              if (series.every((s) => s === undefined)) return null
              const weak = weaknesses.some((w) => w.criterionId === criterion.id)
              return (
                <div key={criterion.id} className="flex items-center gap-3">
                  <span className={`w-44 shrink-0 truncate text-[13px] ${weak ? 'font-medium text-caution' : 'text-ink-muted'}`}>
                    {criterion.name}
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide text-ink-faint">{STAGE_LABEL[criterion.stage]}</span>
                  </span>
                  <div className="flex flex-1 items-end gap-1.5">
                    {series.map((score, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 4 }}
                        animate={{ height: score === undefined ? 4 : 6 + score * 7 }}
                        transition={{ duration: 0.4, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                        title={score === undefined ? 'Not scored on this attempt' : `Attempt ${i + 1}: ${score}/4`}
                        className={`w-6 rounded ${score === undefined ? 'bg-line' : TONE_BG[scoreTone(score)]}`}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-4 text-xs text-ink-faint">
            Oldest attempt on the left. Grey means that criterion was not scored on that attempt —
            usually because the attempt stopped before that stage.
          </p>
        </motion.section>
      )}

      <motion.ul initial="hidden" animate="show" variants={stagger} className="space-y-2.5">
        {attempts.map((attempt) => (
          <motion.li key={attempt.id} variants={riseIn} className="list-none">
            <Link href={attempt.state === 'DRAFT' ? `/practice/${attempt.id}` : `/report/${attempt.id}`} className="block">
              <motion.div
                whileHover={{ x: 3 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="card flex items-center gap-4 p-4 hover:shadow-lift"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-raised font-mono text-sm">
                  {attempt.attemptNumber}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {attempt.state === 'DRAFT'
                      ? `Draft — ${STAGE_LABEL[attempt.stage].toLowerCase()} stage open`
                      : attempt.state === 'FAILED'
                        ? `${STAGE_LABEL[attempt.stage]} stage failed`
                        : attempt.state === 'COMPLETED_PARTIAL'
                          ? 'Reviewed — measured checks only'
                          : attempt.stagesCompleted.length === 3
                            ? 'Fully reviewed'
                            : 'Reviewed'}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    {(['design', 'change', 'defend'] as const).map((s) => (
                      <span
                        key={s}
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          attempt.stagesCompleted.includes(s) ? 'bg-positive/12 text-positive' : 'bg-raised text-ink-faint'
                        }`}
                      >
                        {STAGE_LABEL[s]}
                      </span>
                    ))}
                    <span className="ml-1 text-xs text-ink-faint">{relativeTime(attempt.createdAt)}</span>
                  </div>
                </div>
                {attempt.overall !== null ? (
                  <span className={`text-lg font-semibold tabular-nums ${TONE_TEXT[scoreTone(attempt.overall)]}`}>
                    {attempt.overall.toFixed(1)}
                  </span>
                ) : (
                  <span className="text-xs text-ink-faint">—</span>
                )}
              </motion.div>
            </Link>
          </motion.li>
        ))}
      </motion.ul>

      {history && attempts.length === 0 && (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-muted">No attempts yet.</p>
          <div className="mt-4 flex justify-center gap-2">
            {history.critique.total > 0 && (
              <Link href={`/critique/${problemId}`} className="btn-quiet">
                Warm up first
              </Link>
            )}
            <button onClick={tryAgain} className="btn-primary">
              Start the first one
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
