'use client'

import { motion } from 'framer-motion'
import type { Stage } from '@lld/contracts'
import { STAGE_STEPS } from '@/lib/format'
import { EASE } from './motion'

/**
 * The four moves of one attempt, and where the learner is in them.
 *
 * Design and Run are one submission but two acts, so the rail shows both; the
 * "Run" step lights up as soon as a walkthrough exists. The current step carries a
 * shared-layout marker that slides when the stage advances — the one animation in
 * the product that exists purely to say "you moved forward".
 */
export function StageRail({
  current,
  completed,
  runStarted,
  compact = false,
}: {
  /** The stage that is open, or the last one if the attempt is finished. */
  current: Stage
  completed: readonly Stage[]
  /** Whether at least one scenario has been walked (for the Run step). */
  runStarted?: boolean
  compact?: boolean
}) {
  const stageOf = (id: (typeof STAGE_STEPS)[number]['id']): Stage => (id === 'run' ? 'design' : id)
  const order: Array<Stage | 'run'> = ['design', 'run', 'change', 'defend']
  const currentIndex = order.indexOf(current === 'design' && runStarted ? 'run' : current)

  return (
    <ol className={`flex items-stretch gap-1 ${compact ? '' : 'rounded-2xl border border-line bg-surface p-1.5'}`}>
      {STAGE_STEPS.map((step, i) => {
        const stage = stageOf(step.id)
        const done = completed.includes(stage) && (step.id !== 'run' || runStarted !== false)
        const active = i === currentIndex && !done
        const reached = i <= currentIndex || done
        return (
          <li key={step.id} className="relative flex min-w-0 flex-1">
            {active && (
              <motion.span
                layoutId="stage-rail-marker"
                transition={{ duration: 0.4, ease: EASE }}
                className="absolute inset-0 rounded-xl bg-brand-soft"
              />
            )}
            <div
              className={`relative flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 ${compact ? 'py-1' : 'py-2'}`}
              title={step.hint}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold transition-colors ${
                  done
                    ? 'bg-positive text-white'
                    : active
                      ? 'bg-brand text-white'
                      : reached
                        ? 'bg-raised text-ink-muted'
                        : 'bg-raised text-ink-faint'
                }`}
              >
                {done ? '✓' : i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={`block truncate text-[13px] font-semibold ${
                    active ? 'text-brand' : reached ? 'text-ink' : 'text-ink-faint'
                  }`}
                >
                  {step.label}
                </span>
                {!compact && (
                  <span className="hidden truncate text-[11px] text-ink-faint md:block">{step.hint}</span>
                )}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
