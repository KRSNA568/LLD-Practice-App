'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import type { ProgressPayload } from '@lld/contracts'
import { STAGE_LABEL } from '@/lib/format'
import { riseIn } from './motion'

const STAGES = ['design', 'change', 'defend'] as const

/**
 * The one thing a returning learner most often wants: back into the attempt they
 * left. Shows where in the three stages it is, and nothing else.
 */
export function ContinueCard({ open }: { open: NonNullable<ProgressPayload['openAttempt']> }) {
  const idx = STAGES.indexOf(open.stage)
  return (
    <motion.div initial="hidden" animate="show" variants={riseIn} className="card flex flex-wrap items-center gap-4 p-5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Pick up where you left off</p>
        <h2 className="mt-0.5 text-[17px] font-semibold tracking-tight">
          {open.problemTitle} <span className="font-normal text-ink-muted">· attempt {open.attemptNumber}</span>
        </h2>
        <div className="mt-2.5 flex items-center gap-1.5">
          {STAGES.map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  i < idx ? 'bg-positive/12 text-positive' : i === idx ? 'bg-brand text-white' : 'bg-raised text-ink-faint'
                }`}
              >
                {STAGE_LABEL[s]}
              </span>
              {i < STAGES.length - 1 && <span className="h-px w-3 bg-line" />}
            </span>
          ))}
        </div>
      </div>
      <Link href={`/practice/${open.attemptId}`} className="btn-primary shrink-0">
        Continue {STAGE_LABEL[open.stage].toLowerCase()}
      </Link>
    </motion.div>
  )
}
