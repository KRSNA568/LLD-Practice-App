'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MAX_LEARNER_TURNS, type DialogueTurn, type AskedProbe } from '@lld/contracts'
import { riseIn, stagger } from './motion'

/**
 * The defend stage as an interview. Each probe is a short exchange: the question,
 * your answer, one follow-up from the mentor that presses on the weakest part of
 * what you said, your reply. Two turns and the question is done — an interviewer
 * gets a minute of you, not a chat.
 *
 * The mentor's turn is generated server-side and grounded to your design; it is
 * never scored, and it is visibly AI.
 */

const MAX_WORDS = 120

export function ProbePanel({
  probes,
  dialogue,
  onTurn,
  disabled,
  live,
}: {
  probes: AskedProbe[]
  dialogue: Record<string, DialogueTurn[]>
  onTurn: (probeId: string, text: string) => Promise<void>
  disabled?: boolean
  live: boolean
}) {
  return (
    <motion.ol initial="hidden" animate="show" variants={stagger} className="space-y-4">
      {probes.map((probe, i) => (
        <ProbeThread key={probe.id} index={i} probe={probe} transcript={dialogue[probe.id] ?? []} onTurn={onTurn} disabled={disabled} live={live} />
      ))}
    </motion.ol>
  )
}

function ProbeThread({
  index,
  probe,
  transcript,
  onTurn,
  disabled,
  live,
}: {
  index: number
  probe: AskedProbe
  transcript: DialogueTurn[]
  onTurn: (probeId: string, text: string) => Promise<void>
  disabled?: boolean
  live: boolean
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const learnerTurns = transcript.filter((t) => t.role === 'learner').length
  const lastIsLearner = transcript.at(-1)?.role === 'learner'
  const done = learnerTurns >= MAX_LEARNER_TURNS || (learnerTurns === 1 && lastIsLearner)
  const words = draft.trim().split(/\s+/).filter(Boolean).length
  const over = words > MAX_WORDS

  async function send() {
    if (!draft.trim() || over || sending) return
    setSending(true)
    try {
      await onTurn(probe.id, draft.trim())
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  return (
    <motion.li variants={riseIn} className="card list-none p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-judged/12 font-mono text-xs font-semibold text-judged">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium leading-relaxed">{probe.prompt}</p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-ink-faint">
            {probe.targetsConcept.replace(/-/g, ' ')}
            {done && <span className="ml-2 text-positive">· answered</span>}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        <AnimatePresence initial={false}>
          {transcript.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex ${t.role === 'learner' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed ${
                  t.role === 'learner'
                    ? 'rounded-br-md bg-raised'
                    : 'rounded-bl-md border border-judged/25 bg-judged/[0.05]'
                }`}
              >
                {t.role === 'mentor' && (
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-judged">
                    <span aria-hidden>◈ </span>Interviewer{!live && ' · stand-in'}
                  </p>
                )}
                <p className="whitespace-pre-line">{t.text}</p>
              </div>
            </motion.div>
          ))}
          {sending && learnerTurns === 0 && (
            <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md border border-judged/25 bg-judged/[0.05] px-4 py-2.5">
                <span className="text-[12px] text-judged">thinking of a follow-up…</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!done && (
        <div className="mt-3">
          <textarea
            className={`field min-h-[84px] resize-y leading-relaxed ${over ? 'border-caution/60' : ''}`}
            placeholder={
              learnerTurns === 0
                ? 'Name the class. Say what you rejected and why. Say what would change your mind.'
                : 'Answer the follow-up. This is your last word on this question.'
            }
            value={draft}
            disabled={disabled || sending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void send()
            }}
          />
          <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-ink-faint">
            <span>
              {learnerTurns === 0
                ? 'Strong answers name a class, weigh an alternative, and say when they would choose differently.'
                : 'One reply left on this question.'}
            </span>
            <span className="flex items-center gap-3">
              <span className={over ? 'text-caution' : ''}>
                {words}/{MAX_WORDS}
              </span>
              <button onClick={send} disabled={disabled || sending || !draft.trim() || over} className="btn-quiet !px-3 !py-1.5 !text-xs">
                {sending ? 'Sending…' : learnerTurns === 0 ? 'Answer' : 'Reply'}
              </button>
            </span>
          </div>
        </div>
      )}
    </motion.li>
  )
}
