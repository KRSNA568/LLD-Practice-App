'use client'

import { motion } from 'framer-motion'
import type { Probe, ProbeAnswer } from '@lld/contracts'
import { riseIn, stagger } from './motion'

/**
 * The defend stage: up to three questions about the learner's own decisions.
 *
 * Each probe was chosen because of something the evaluator found, and its text
 * names the class it found it in. The answer box is deliberately short — an
 * interviewer gets a minute of you, not an essay — and the hint under each one
 * is the shape of a good answer, not the answer.
 */

const MAX_WORDS = 120

export function ProbePanel({
  probes,
  answers,
  onChange,
  disabled,
}: {
  probes: Probe[]
  answers: ProbeAnswer[]
  onChange: (next: ProbeAnswer[]) => void
  disabled?: boolean
}) {
  const answerFor = (id: string): string => answers.find((a) => a.probeId === id)?.response ?? ''
  const set = (id: string, response: string) =>
    onChange([...answers.filter((a) => a.probeId !== id), { probeId: id, response }])

  return (
    <motion.ol initial="hidden" animate="show" variants={stagger} className="space-y-4">
      {probes.map((probe, i) => {
        const value = answerFor(probe.id)
        const words = value.trim().split(/\s+/).filter(Boolean).length
        const over = words > MAX_WORDS
        return (
          <motion.li key={probe.id} variants={riseIn} className="card list-none p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-judged/12 font-mono text-xs font-semibold text-judged">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium leading-relaxed">{probe.prompt}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-ink-faint">
                  {probe.targetsConcept.replace(/-/g, ' ')}
                </p>
              </div>
            </div>

            <textarea
              className={`field mt-3 min-h-[92px] resize-y leading-relaxed ${over ? 'border-caution/60' : ''}`}
              placeholder="Name the class. Say what you rejected and why. Say what would change your mind."
              value={value}
              disabled={disabled}
              onChange={(e) => set(probe.id, e.target.value)}
            />
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-faint">
              <span>
                Strong answers name a class, weigh an alternative, and say when they would choose
                differently.
              </span>
              <span className={over ? 'text-caution' : ''}>
                {words}/{MAX_WORDS}
              </span>
            </div>
          </motion.li>
        )
      })}
    </motion.ol>
  )
}
