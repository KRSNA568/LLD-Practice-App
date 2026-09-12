'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

/**
 * The mentor's paragraph over one stage. Visibly AI — the `judged` rule and the
 * mark — because the learner must always be able to tell a note that was written
 * from a score that was measured. The trust line is the whole contract in one
 * sentence: every class named here exists in your design.
 */
export function MentorNote({
  text,
  pending,
  live,
}: {
  text: string | null
  /** True while a note may still arrive. */
  pending: boolean
  live: boolean
}) {
  const [why, setWhy] = useState(false)

  if (!text && !pending) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 rounded-2xl border border-judged/25 bg-judged/[0.04] pl-1"
    >
      <div className="rounded-r-2xl border-l-[3px] border-judged px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-judged/15 text-[12px] text-judged" aria-hidden>
            ◈
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-judged">Your mentor</span>
          {!live && <span className="chip !py-0 !text-[10px]">stand-in · no model configured</span>}
          <button onClick={() => setWhy((w) => !w)} className="ml-auto text-[11px] text-ink-faint hover:text-ink">
            {why ? 'ok' : 'why trust this?'}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {why && (
            <motion.p
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden text-[12px] leading-relaxed text-ink-faint"
            >
              <span className="block pt-2">
                Every class named in this note was checked against your design; a sentence that mentioned
                something you never wrote was removed before you saw it. The scores were measured
                separately and this note cannot change them.
              </span>
            </motion.p>
          )}
        </AnimatePresence>

        {text ? (
          <p className="mt-2 text-[14px] leading-relaxed">{text}</p>
        ) : (
          <div className="mt-2.5 space-y-2">
            <div className="skeleton h-3.5 w-full" />
            <div className="skeleton h-3.5 w-11/12" />
            <div className="skeleton h-3.5 w-2/3" />
          </div>
        )}
      </div>
    </motion.div>
  )
}
