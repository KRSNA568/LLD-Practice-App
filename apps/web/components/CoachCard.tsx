'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { motion } from 'framer-motion'
import type { NextProblemSuggestion } from '@lld/contracts'
import { api } from '@/lib/api'
import { riseIn } from './motion'

/**
 * The coach across problems. The note is the AI's; the next problem is chosen by
 * `NextProblem`, deterministically, from the weakest criterion — the coach only
 * explains the choice. When no model wrote a note, the card is `NextForYou`.
 */
export function CoachCard({ note, next }: { note: { text: string; modelId: string } | null; next: NextProblemSuggestion | null }) {
  const router = useRouter()
  const [starting, setStarting] = useState(false)

  async function start() {
    if (!next) return
    setStarting(true)
    try {
      const { attempt } = await api.startAttempt(next.problemId)
      router.push(`/practice/${attempt.id}`)
    } catch {
      setStarting(false)
    }
  }

  if (!note && !next) return null

  return (
    <motion.div initial="hidden" animate="show" variants={riseIn} className="card overflow-hidden border-brand/25">
      {note && (
        <div className="border-l-[3px] border-judged bg-judged/[0.04] px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-judged">
            <span aria-hidden>◈ </span>Your coach{note.modelId.startsWith('stub') && ' · stand-in'}
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed">{note.text}</p>
        </div>
      )}
      {next && (
        <div className="flex flex-wrap items-center justify-between gap-4 bg-brand-soft/40 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Next for you</p>
            <h2 className="mt-0.5 text-[17px] font-semibold tracking-tight">{next.title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{next.reason}</p>
          </div>
          <button onClick={start} disabled={starting} className="btn-primary shrink-0">
            {starting ? 'Starting…' : 'Start'}
          </button>
        </div>
      )}
    </motion.div>
  )
}
