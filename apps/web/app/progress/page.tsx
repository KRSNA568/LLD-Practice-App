'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import type { ProgressPayload, Rubric } from '@lld/contracts'
import { api } from '@/lib/api'
import { averageTone, CRITERION_ORDER, relativeTime, scoreTone, STAGE_LABEL, pluralise } from '@/lib/format'
import { CoachCard } from '@/components/CoachCard'
import { StatStrip } from '@/components/StatStrip'
import { riseIn, stagger } from '@/components/motion'

const TONE_TEXT = { critical: 'text-critical', caution: 'text-caution', positive: 'text-positive' } as const
const TONE_BG = { critical: 'bg-critical', caution: 'bg-caution', positive: 'bg-positive' } as const

/**
 * Progress across every problem. The per-problem history page keeps the trend
 * bars; this one answers "how is it going overall" — per-criterion averages, the
 * habit worth breaking, and everything you have attempted in one list.
 */
export default function ProgressPage() {
  const [progress, setProgress] = useState<ProgressPayload | null>(null)
  const [rubric, setRubric] = useState<Rubric | null>(null)

  useEffect(() => {
    void (async () => {
      const [p, list] = await Promise.all([api.getProgress(), api.listProblems()])
      setProgress(p)
      const first = list.problems[0]
      if (first) setRubric((await api.getProblem(first.id)).rubric)
    })()
  }, [])

  if (!progress) {
    return (
      <div className="mt-4 space-y-4">
        <div className="skeleton h-8 w-48" />
        <div className="card h-40" />
      </div>
    )
  }

  const weakness = progress.recurringWeaknesses[0]
  const byId = new Map((rubric?.criteria ?? []).map((c) => [c.id, c]))

  return (
    <div>
      <motion.header initial="hidden" animate="show" variants={riseIn} className="mb-6 mt-4">
        <h1 className="text-[28px] font-semibold tracking-tight">Progress</h1>
        <p className="mt-1.5 text-[15px] text-ink-muted">
          {progress.attempts === 0
            ? 'Nothing yet. The first attempt is where the picture starts.'
            : `${pluralise(progress.attempts, 'attempt')} · ${pluralise(progress.problemsTried, 'problem')} · critique ${progress.critique.correct}/${progress.critique.answered}`}
        </p>
      </motion.header>

      {progress.attempts === 0 && (
        <div className="card p-10 text-center">
          <p className="text-sm text-ink-muted">No attempts yet.</p>
          <Link href="/learn" className="btn-primary mt-4 inline-flex">
            Pick a problem
          </Link>
        </div>
      )}

      {progress.attempts > 0 && (
        <div className="space-y-4">
          <StatStrip
            stats={[
              { label: 'Designs reviewed', value: progress.stagesCompleted.design },
              { label: 'Changes absorbed', value: progress.stagesCompleted.change },
              { label: 'Defended', value: progress.stagesCompleted.defend },
              { label: 'Streak', value: pluralise(progress.streakDays, 'day') },
            ]}
          />

          {weakness && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card border-caution/30 bg-caution/[0.06] p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-caution/15 text-caution">!</span>
                <div>
                  <h2 className="text-sm font-semibold tracking-tight">The habit worth breaking</h2>
                  <p className="mt-1.5 text-[14px] leading-relaxed">
                    <strong className="font-semibold">{weakness.criterionName}</strong> has scored below par in {weakness.occurrences} of your
                    last {weakness.windowSize} attempts, averaging {weakness.averageScore.toFixed(1)} out of 4.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          <CoachCard note={progress.coach} next={progress.next} />

          <motion.section initial="hidden" animate="show" variants={riseIn} className="card p-5">
            <h2 className="text-sm font-semibold tracking-tight">By criterion</h2>
            <p className="mt-1 text-[13px] text-ink-muted">Average across every scored attempt. Par is 3.</p>
            <ul className="mt-4 space-y-2.5">
              {CRITERION_ORDER.filter((id) => progress.criterionAverages[id] !== undefined).map((id) => {
                const avg = progress.criterionAverages[id]!
                const c = byId.get(id)
                const weak = weakness?.criterionId === id
                return (
                  <li key={id} className="flex items-center gap-3">
                    <span className={`w-48 shrink-0 truncate text-[13px] ${weak ? 'font-medium text-caution' : 'text-ink-muted'}`}>
                      {c?.name ?? id}
                      {c && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-ink-faint">{STAGE_LABEL[c.stage]}</span>}
                    </span>
                    <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-raised">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(avg / 4) * 100}%` }}
                        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                        className={`h-full rounded-full ${TONE_BG[averageTone(avg)]}`}
                      />
                      <span className="absolute left-3/4 top-0 h-full w-px bg-line" title="par" />
                    </div>
                    <span className={`w-8 text-right text-sm font-semibold tabular-nums ${TONE_TEXT[averageTone(avg)]}`}>{avg.toFixed(1)}</span>
                  </li>
                )
              })}
            </ul>
          </motion.section>

          <section>
            <h2 className="mb-2.5 text-sm font-semibold tracking-tight">Every attempt</h2>
            <motion.ul initial="hidden" animate="show" variants={stagger} className="space-y-2">
              {progress.recent.map((a) => (
                <motion.li key={a.id} variants={riseIn} className="list-none">
                  <Link href={a.state === 'DRAFT' ? `/practice/${a.id}` : `/report/${a.id}`} className="card flex items-center gap-4 p-3.5 hover:shadow-lift">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-raised font-mono text-sm">{a.attemptNumber}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.problemTitle}</p>
                      <div className="mt-1 flex items-center gap-1.5">
                        {(['design', 'change', 'defend'] as const).map((s) => (
                          <span
                            key={s}
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                              a.stagesCompleted.includes(s) ? 'bg-positive/12 text-positive' : 'bg-raised text-ink-faint'
                            }`}
                          >
                            {STAGE_LABEL[s]}
                          </span>
                        ))}
                        <span className="ml-1 text-xs text-ink-faint">{relativeTime(a.createdAt)}</span>
                      </div>
                    </div>
                    {a.overall !== null ? (
                      <span className={`text-lg font-semibold tabular-nums ${TONE_TEXT[scoreTone(a.overall)]}`}>{a.overall.toFixed(1)}</span>
                    ) : (
                      <span className="text-xs text-ink-faint">open</span>
                    )}
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          </section>
        </div>
      )}
    </div>
  )
}
