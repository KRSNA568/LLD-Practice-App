'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { CritiqueVerdict, DesignModel, PublicCritiquePair } from '@lld/contracts'

/**
 * Two designs, one question, one click — then Submit.
 *
 * Contrasting cases prepare a learner for what comes next; erroneous examples
 * build the habit of looking for the flaw. The learner picks the class that
 * decides the matter, confirms, and the telling appears: the explanation they
 * are now ready to hear.
 */
export function CritiqueBoard({ pair, verdict, onAnswer, busy }: {
  pair: PublicCritiquePair
  verdict: CritiqueVerdict | null
  onAnswer: (choice: { design: string; className: string }) => void
  busy: boolean
}) {
  const [picked, setPicked] = useState<{ design: string; className: string } | null>(
    pair.answered ? { design: pair.answered.design, className: pair.answered.className } : null,
  )
  const revealed = !!verdict || !!pair.answered
  const correctKey = verdict ? `${verdict.answer.design}:${verdict.answer.className.toLowerCase()}` : null
  const wasRight = verdict?.correct ?? pair.answered?.correct

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[pair.left, pair.right].map((side, i) => (
          <DesignTree
            key={side.id}
            label={i === 0 ? 'Design A' : 'Design B'}
            design={side.design}
            designId={side.id}
            picked={picked}
            correctKey={correctKey}
            revealed={revealed}
            onPick={(className) => !revealed && !busy && setPicked({ design: side.id, className })}
          />
        ))}
      </div>

      {!revealed && (
        <div className="flex items-center justify-end gap-3.5">
          <span className="text-[14px] leading-none text-muted">{picked ? `${picked.className} selected` : 'Pick a class'}</span>
          <button type="button" className="btn-primary" disabled={!picked || busy} onClick={() => picked && onAnswer(picked)}>
            {busy ? 'Checking…' : 'Submit'}
          </button>
        </div>
      )}

      <AnimatePresence>
        {revealed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`rounded-3xl p-6 ${wasRight ? 'bg-mint' : 'bg-apricot'}`}
          >
            <p className="text-[16px] font-medium leading-none text-ink-strong">
              {wasRight ? 'That is the one.' : 'Not that one.'}
              {verdict && !verdict.correct && (
                <span className="ml-2 font-mono text-[13px] font-medium text-ink-2">
                  It was {verdict.answer.className} in design {verdict.answer.design === pair.left.id ? 'A' : 'B'}.
                </span>
              )}
            </p>
            {verdict?.telling ? (
              <p className="mt-3 text-[15px] leading-[1.55] text-ink">{verdict.telling}</p>
            ) : (
              <p className="mt-3 text-[14px] text-ink-2">You answered this one earlier.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * The design as three rows joined by hairlines, the way the artboard draws it:
 * the classes nothing points at on top, the concrete collaborators in the
 * middle, the seams — interfaces, abstracts, enums — at the bottom. A real
 * design is rarely a tree; this is its shape, not its graph.
 */
function DesignTree({ label, design, designId, picked, correctKey, revealed, onPick }: {
  label: string
  design: DesignModel
  designId: string
  picked: { design: string; className: string } | null
  correctKey: string | null
  revealed: boolean
  onPick: (className: string) => void
}) {
  const rows = useMemo(() => {
    const incoming = new Map<string, number>()
    for (const c of design.classes) incoming.set(c.name, 0)
    for (const r of design.relationships) if (r.kind !== 'implements' && r.kind !== 'extends') incoming.set(r.to, (incoming.get(r.to) ?? 0) + 1)
    const seams = design.classes.filter((c) => c.stereotype !== 'class')
    const roots = design.classes.filter((c) => c.stereotype === 'class' && (incoming.get(c.name) ?? 0) === 0)
    const middle = design.classes.filter((c) => c.stereotype === 'class' && (incoming.get(c.name) ?? 0) > 0)
    return [roots, middle, seams].filter((r) => r.length > 0)
  }, [design])

  const chip = (name: string, stereotype: string) => {
    const key = `${designId}:${name.toLowerCase()}`
    const isPicked = picked?.design === designId && picked.className.toLowerCase() === name.toLowerCase()
    const isCorrect = correctKey === key
    const state = revealed ? (isCorrect ? 'correct' : isPicked ? 'wrong' : 'idle') : isPicked ? 'picked' : 'idle'
    const seam = stereotype !== 'class'
    const cls =
      state === 'correct' ? 'border-2 border-ink-strong bg-mint' :
      state === 'wrong' ? 'border-2 border-tint-rose bg-blush' :
      state === 'picked' ? 'border-2 border-ink-strong bg-lilac' :
      seam ? 'border border-line bg-lilac/60 hover:bg-lilac' : 'border border-line bg-ground hover:bg-soft'
    return (
      <motion.button
        key={name}
        type="button"
        onClick={() => onPick(name)}
        disabled={revealed}
        whileHover={revealed ? {} : { y: -1 }}
        animate={state === 'correct' ? { scale: [1, 1.04, 1] } : { scale: 1 }}
        title={design.classes.find((c) => c.name === name)?.responsibility}
        className={`rounded-[14px] px-3.5 py-3 text-[13px] font-medium leading-[1.2] text-ink-strong transition-colors disabled:cursor-default ${cls}`}
      >
        {name}
        {seam && <span className="ml-1.5 text-[11px] font-normal text-muted">{stereotype}</span>}
      </motion.button>
    )
  }

  return (
    <div className="card-lined flex flex-col gap-[18px] p-6">
      <div className="flex items-center justify-between">
        <span className="h-section">{label}</span>
        <span className="pill-soft h-[30px] text-[12px]">{design.classes.length} classes</span>
      </div>
      <div className="flex flex-col items-center">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-col items-center">
            {i > 0 && <span className="h-[22px] w-px bg-line" />}
            <div className="flex flex-wrap justify-center gap-3">{row.map((c) => chip(c.name, c.stereotype))}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
