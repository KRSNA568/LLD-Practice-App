'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { CritiqueVerdict, DesignModel, PublicCritiquePair } from '@lld/contracts'
import { EASE } from './motion'

/**
 * Two designs, one question, one click.
 *
 * Contrasting cases prepare a learner to learn from what comes next; erroneous
 * examples build the habit of looking for the flaw. This board is both. The
 * learner clicks the class that decides the matter, the right one pulses, and the
 * telling slides in — the explanation they are now ready to hear.
 */
export function CritiqueBoard({
  pair,
  verdict,
  onAnswer,
  busy,
}: {
  pair: PublicCritiquePair
  verdict: CritiqueVerdict | null
  onAnswer: (choice: { design: string; className: string }) => void
  busy: boolean
}) {
  const [picked, setPicked] = useState<{ design: string; className: string } | null>(
    pair.answered ? { design: pair.answered.design, className: pair.answered.className } : null,
  )
  const answered = verdict ?? (pair.answered ? null : null)
  const revealed = !!verdict || !!pair.answered

  function choose(design: string, className: string) {
    if (revealed || busy) return
    setPicked({ design, className })
    onAnswer({ design, className })
  }

  const correctKey = verdict
    ? `${verdict.answer.design}:${verdict.answer.className.toLowerCase()}`
    : null

  return (
    <div className="space-y-4">
      <motion.p
        key={pair.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-[17px] font-medium leading-relaxed"
      >
        {pair.question}
      </motion.p>

      <div className="grid gap-4 md:grid-cols-2">
        {[pair.left, pair.right].map((sideDesign, i) => (
          <DesignColumn
            key={sideDesign.id}
            label={i === 0 ? 'A' : 'B'}
            design={sideDesign.design}
            designId={sideDesign.id}
            picked={picked}
            correctKey={correctKey}
            revealed={revealed}
            onPick={(className) => choose(sideDesign.id, className)}
          />
        ))}
      </div>

      <AnimatePresence>
        {(verdict || pair.answered) && (
          <motion.div
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            transition={{ duration: 0.35, ease: EASE }}
            className={`card overflow-hidden border-2 p-5 ${
              (verdict?.correct ?? pair.answered?.correct)
                ? 'border-positive/40 bg-positive/[0.05]'
                : 'border-caution/40 bg-caution/[0.05]'
            }`}
          >
            <p className={`text-sm font-semibold ${(verdict?.correct ?? pair.answered?.correct) ? 'text-positive' : 'text-caution'}`}>
              {(verdict?.correct ?? pair.answered?.correct) ? 'That is the one.' : 'Not that one.'}
              {verdict && !verdict.correct && (
                <span className="ml-2 font-mono text-xs font-medium text-ink-muted">
                  It was {verdict.answer.className} in design {verdict.answer.design === pair.left.id ? 'A' : 'B'}.
                </span>
              )}
            </p>
            {verdict?.telling ? (
              <p className="mt-2 text-[14px] leading-relaxed text-ink">{verdict.telling}</p>
            ) : (
              <p className="mt-2 text-[13px] text-ink-muted">You answered this one earlier.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      {answered && null}
    </div>
  )
}

function DesignColumn({
  label,
  design,
  designId,
  picked,
  correctKey,
  revealed,
  onPick,
}: {
  label: string
  design: DesignModel
  designId: string
  picked: { design: string; className: string } | null
  correctKey: string | null
  revealed: boolean
  onPick: (className: string) => void
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-sm font-semibold">Design {label}</span>
        <span className="text-[11px] text-ink-faint">{design.classes.length} classes</span>
      </div>
      <ul className="grid gap-1.5 p-3 sm:grid-cols-2">
        {design.classes.map((c) => {
          const key = `${designId}:${c.name.toLowerCase()}`
          const isPicked = picked?.design === designId && picked.className.toLowerCase() === c.name.toLowerCase()
          const isCorrect = correctKey === key
          const state = revealed
            ? isCorrect
              ? 'correct'
              : isPicked
                ? 'wrong'
                : 'idle'
            : isPicked
              ? 'picked'
              : 'idle'
          return (
            <motion.li key={c.name} layout>
              <motion.button
                type="button"
                onClick={() => onPick(c.name)}
                disabled={revealed}
                whileHover={revealed ? {} : { y: -2 }}
                animate={state === 'correct' ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                transition={{ duration: 0.45 }}
                className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                  state === 'correct'
                    ? 'border-positive bg-positive/10 ring-2 ring-positive/40'
                    : state === 'wrong'
                      ? 'border-caution bg-caution/10'
                      : state === 'picked'
                        ? 'border-brand bg-brand-soft'
                        : 'border-line bg-raised/50 hover:border-brand/40 hover:bg-brand-soft/50'
                } disabled:cursor-default`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-mono text-[12.5px] font-medium">{c.name}</span>
                  {c.stereotype !== 'class' && (
                    <span className="chip !border-none !bg-surface !px-1.5 !py-0 !text-[10px]">{c.stereotype}</span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-ink-muted">{c.responsibility}</p>
              </motion.button>
            </motion.li>
          )
        })}
      </ul>
      {design.relationships.length > 0 && (
        <div className="border-t border-line px-4 py-2.5">
          <p className="font-mono text-[10.5px] leading-relaxed text-ink-faint">
            {design.relationships.map((r) => `${r.from} —${r.kind}→ ${r.to}`).join(' · ')}
          </p>
        </div>
      )}
    </div>
  )
}
