'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { motion } from 'framer-motion'
import type { ConceptMastery, ProblemSummary } from '@lld/contracts'
import { api } from '@/lib/api'
import { TIER_LABEL, scoreTone } from '@/lib/format'
import { MasteryDot } from './Mastery'
import { riseIn } from './motion'

const TONE_TEXT = {
  critical: 'text-critical',
  caution: 'text-caution',
  positive: 'text-positive',
} as const

export function ProblemCard({
  problem,
  mastery,
  conceptNames,
}: {
  problem: ProblemSummary
  /** When present, each concept tag carries the learner's standing on it. */
  mastery?: Map<string, ConceptMastery>
  conceptNames?: Map<string, string>
}) {
  const router = useRouter()
  const [starting, setStarting] = useState(false)

  async function start() {
    setStarting(true)
    try {
      const { attempt } = await api.startAttempt(problem.id)
      router.push(`/practice/${attempt.id}`)
    } catch {
      setStarting(false)
    }
  }

  const warmedUp = problem.critiquePairCount > 0 && problem.critiquesCorrect >= problem.critiquePairCount

  return (
    <motion.li variants={riseIn} className="list-none">
      <motion.div
        whileHover={{ y: -3 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className="card flex h-full flex-col p-5 hover:shadow-lift"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[17px] font-semibold tracking-tight">{problem.title}</h3>
            <p className="mt-0.5 text-xs text-ink-faint">
              {TIER_LABEL[problem.tier]} · {problem.minutes} min
            </p>
          </div>

          {problem.bestOverall !== null ? (
            <div className="shrink-0 text-right">
              <div className={`text-xl font-semibold tabular-nums ${TONE_TEXT[scoreTone(problem.bestOverall)]}`}>
                {problem.bestOverall.toFixed(1)}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-ink-faint">best</div>
            </div>
          ) : (
            <span className="chip shrink-0">New</span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {problem.conceptTags.slice(0, 4).map((tag) => (
            <span key={tag} className="chip !py-0.5 !text-[11px]">
              {mastery && <MasteryDot level={mastery.get(tag)?.level ?? 'new'} />}
              {conceptNames?.get(tag) ?? tag.replace(/-/g, ' ')}
            </span>
          ))}
        </div>

        {problem.critiquePairCount > 0 && (
          <Link
            href={`/critique/${problem.id}`}
            className="mt-4 flex items-center justify-between rounded-xl bg-raised px-3 py-2 text-xs transition-colors hover:bg-brand-soft"
          >
            <span className="font-medium text-ink-muted">
              {problem.attemptCount === 0 && !warmedUp ? 'Warm up first' : 'Critique warm-up'}
            </span>
            <span className={`font-mono ${warmedUp ? 'text-positive' : 'text-ink-faint'}`}>
              {problem.critiquesCorrect}/{problem.critiquePairCount} {warmedUp ? '✓' : '· ~4 min'}
            </span>
          </Link>
        )}

        <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
          <button onClick={start} disabled={starting} className="btn-primary flex-1">
            {starting ? 'Starting…' : problem.attemptCount > 0 ? 'Try again' : 'Start'}
          </button>
          {problem.attemptCount > 0 && (
            <Link href={`/history/${problem.id}`} className="btn-quiet px-3">
              {problem.attemptCount} {problem.attemptCount === 1 ? 'try' : 'tries'}
            </Link>
          )}
        </div>
      </motion.div>
    </motion.li>
  )
}
