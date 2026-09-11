'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { motion } from 'framer-motion'
import type { NextProblemSuggestion } from '@lld/contracts'
import { api } from '@/lib/api'
import { riseIn } from './motion'

/**
 * The recommendation card.
 *
 * When there is a recurring weakness on record, the suggestion names the criterion
 * and why this problem exercises it. That sentence is the whole point: the product
 * is choosing the next thing to practise on the learner's behalf, for a reason it
 * can state.
 */
export function NextForYou({ next }: { next: NextProblemSuggestion }) {
  const router = useRouter()
  const [starting, setStarting] = useState(false)

  async function start() {
    setStarting(true)
    try {
      const { attempt } = await api.startAttempt(next.problemId)
      router.push(`/practice/${attempt.id}`)
    } catch {
      setStarting(false)
    }
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={riseIn}
      className="card flex flex-wrap items-center justify-between gap-4 border-brand/25 bg-brand-soft/40 p-5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Next for you</p>
        <h2 className="mt-0.5 text-[17px] font-semibold tracking-tight">{next.title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{next.reason}</p>
      </div>
      <button onClick={start} disabled={starting} className="btn-primary shrink-0">
        {starting ? 'Starting…' : 'Start'}
      </button>
    </motion.div>
  )
}
