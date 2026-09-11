'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { HiddenChange } from '@lld/contracts'
import type { LiveDiff } from '@/lib/diff'
import { EASE } from './motion'

/**
 * The moment the requirements move.
 *
 * The card flips once, on first view, because this is the one place the product
 * is allowed a little theatre: the learner designed without knowing this was
 * coming, and the reveal should feel like the interviewer leaning forward. After
 * that it is a plain card with a live counter of how much of the design the
 * learner has had to reopen.
 */
export function ChangeReveal({
  change,
  diff,
}: {
  change: HiddenChange
  diff: LiveDiff
}) {
  const [flipped, setFlipped] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setFlipped(true), 350)
    return () => clearTimeout(t)
  }, [])

  const touched = diff.modified.length + diff.removed.length

  return (
    <div className="[perspective:1400px]">
      <motion.div
        initial={{ rotateX: -90, opacity: 0 }}
        animate={flipped ? { rotateX: 0, opacity: 1 } : {}}
        transition={{ duration: 0.6, ease: EASE }}
        style={{ transformOrigin: 'top center' }}
        className="card border-brand/30 bg-brand-soft/60 p-5"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand text-sm font-bold text-white">
            !
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
              The requirements changed
            </p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{change.prompt}</p>
            <p className="mt-2.5 text-xs leading-relaxed text-ink-muted">
              Your design below is exactly as you froze it. Revise it to absorb the change. What is
              measured is not whether you can — it is how much of what already worked you had to
              reopen to do it.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-brand/15 pt-3.5">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint">Blast radius</span>
          <Counter n={touched} label="reopened" tone={touched === 0 ? 'quiet' : touched === 1 ? 'caution' : 'critical'} />
          <Counter n={diff.added.length} label="added" tone={diff.added.length > 0 ? 'positive' : 'quiet'} />
          <AnimatePresence initial={false}>
            {[...diff.modified.map((n) => ({ n, kind: 'modified' as const })), ...diff.added.map((n) => ({ n, kind: 'added' as const }))]
              .slice(0, 6)
              .map(({ n, kind }) => (
                <motion.span
                  key={`${kind}:${n}`}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={`chip !py-0.5 font-mono !text-[11px] ${
                    kind === 'added' ? '!border-positive/40 !text-positive' : '!border-caution/40 !text-caution'
                  }`}
                >
                  {n}
                </motion.span>
              ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}

function Counter({ n, label, tone }: { n: number; label: string; tone: 'quiet' | 'caution' | 'critical' | 'positive' }) {
  const color =
    tone === 'positive' ? 'text-positive' : tone === 'caution' ? 'text-caution' : tone === 'critical' ? 'text-critical' : 'text-ink-muted'
  return (
    <span className="inline-flex items-baseline gap-1 rounded-lg bg-surface px-2 py-1">
      <motion.span key={n} initial={{ y: -4, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={`font-mono text-sm font-semibold tabular-nums ${color}`}>
        {n}
      </motion.span>
      <span className="text-[11px] text-ink-faint">{label}</span>
    </span>
  )
}
