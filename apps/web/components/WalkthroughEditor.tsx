'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { RawStructuredSubmission, Scenario } from '@lld/contracts'
import { EASE } from './motion'

/**
 * The Run section: walk each scenario through the design, one `Class ▸ method`
 * step at a time.
 *
 * This is a CRC-card role-play captured as a list. Two things do the teaching
 * before any evaluator runs: a step whose class or method the design does not
 * declare pulses immediately, and the chip strip shows which classes have not yet
 * had a turn. A learner who reaches the end of a scenario with three classes
 * still grey has found their own orphans.
 */

type Walkthrough = RawStructuredSubmission['walkthroughs'][number]
type Step = Walkthrough['steps'][number]
type ClassRow = RawStructuredSubmission['classes'][number]

const OUTCOMES = [
  { id: 'ok', label: 'Succeeds' },
  { id: 'refused', label: 'Refused' },
  { id: 'error', label: 'Errors' },
] as const

const norm = (s: string): string => s.trim().toLowerCase().replace(/\(.*$/, '').replace(/[^a-z0-9]/g, '')

export function WalkthroughEditor({
  scenarios,
  classes,
  value,
  onChange,
  disabled,
}: {
  scenarios: Scenario[]
  classes: ClassRow[]
  value: Walkthrough[]
  onChange: (next: Walkthrough[]) => void
  disabled?: boolean
}) {
  const [activeId, setActiveId] = useState<string>(scenarios[0]?.id ?? '')
  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0]
  if (!active) return null

  const declared = classes.filter((c) => c.name.trim().length > 0)
  const byKey = new Map(declared.map((c) => [c.name.trim().toLowerCase(), c]))

  const walkthroughFor = (id: string): Walkthrough =>
    value.find((w) => w.scenarioId === id) ?? { scenarioId: id, steps: [], outcome: 'ok' }

  const setWalkthrough = (next: Walkthrough) => {
    const others = value.filter((w) => w.scenarioId !== next.scenarioId)
    onChange([...others, next])
  }

  const current = walkthroughFor(active.id)
  const steps = current.steps.length > 0 ? current.steps : [{ className: '', method: '', note: '' }]

  const patchStep = (i: number, partial: Partial<Step>) => {
    const next = [...steps]
    next[i] = { ...steps[i]!, ...partial }
    setWalkthrough({ ...current, steps: next })
  }

  // Which declared classes have acted anywhere, across all scenarios.
  const touched = new Set(
    value.flatMap((w) => w.steps.map((s) => s.className.trim().toLowerCase())).filter(Boolean),
  )
  const idle = declared.filter(
    (c) => c.stereotype === 'class' && c.methods.length > 0 && !touched.has(c.name.trim().toLowerCase()),
  )

  const resolve = (step: Step) => {
    const cls = byKey.get(step.className.trim().toLowerCase())
    const classFound = !!cls
    const wanted = norm(step.method)
    const methodFound = !!cls && wanted.length > 0 && cls.methods.some((m) => norm(m) === wanted)
    return { classFound, methodFound, cls }
  }

  return (
    <div className="space-y-4">
      {/* Scenario tabs */}
      <div className="flex flex-wrap gap-1.5">
        {scenarios.map((s) => {
          const w = walkthroughFor(s.id)
          const walked = w.steps.some((st) => st.className.trim() && st.method.trim())
          const isActive = s.id === active.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              className={`chip transition-colors ${
                isActive ? '!border-brand/50 !bg-brand-soft !text-brand' : 'hover:bg-raised'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${walked ? 'bg-positive' : 'bg-line'}`}
                aria-hidden
              />
              {s.title}
              {s.expectsFailurePath && (
                <span className="text-[10px] uppercase tracking-wide text-ink-faint">· ends badly</span>
              )}
            </button>
          )
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={active.id}
          initial={{ opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          transition={{ duration: 0.2, ease: EASE }}
          className="rounded-xl border border-line bg-raised/40 p-4"
        >
          <p className="text-[13px] leading-relaxed text-ink-muted">{active.description || active.title}</p>

          <ol className="mt-3 space-y-1.5">
            {steps.map((step, i) => {
              const { classFound, methodFound, cls } = resolve(step)
              const filled = step.className.trim().length > 0 || step.method.trim().length > 0
              const bad = filled && step.className.trim().length > 0 && (!classFound || (step.method.trim().length > 0 && !methodFound))
              return (
                <motion.li
                  key={i}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="flex items-start gap-2"
                >
                  <span className="mt-2 w-5 shrink-0 select-none text-right font-mono text-[11px] text-ink-faint">
                    {i + 1}
                  </span>
                  <div className="grid flex-1 gap-2 sm:grid-cols-[1.1fr_1fr_1.4fr]">
                    <motion.div
                      animate={bad && !classFound ? { x: [0, -3, 3, -2, 0] } : { x: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <input
                        className={`field font-mono text-[13px] ${
                          filled && step.className.trim() && !classFound ? 'border-machine/70 ring-1 ring-machine/30' : ''
                        }`}
                        placeholder="Class"
                        list="lld-walk-classes"
                        value={step.className}
                        disabled={disabled}
                        onChange={(e) => patchStep(i, { className: e.target.value })}
                      />
                    </motion.div>
                    <div>
                      <input
                        className={`field font-mono text-[13px] ${
                          classFound && step.method.trim() && !methodFound ? 'border-machine/70 ring-1 ring-machine/30' : ''
                        }`}
                        placeholder="method"
                        list={`lld-walk-methods-${i}`}
                        value={step.method}
                        disabled={disabled}
                        onChange={(e) => patchStep(i, { method: e.target.value })}
                      />
                      <datalist id={`lld-walk-methods-${i}`}>
                        {(cls?.methods ?? []).map((m) => (
                          <option key={m} value={m} />
                        ))}
                      </datalist>
                    </div>
                    <input
                      className="field text-[13px]"
                      placeholder="what happens here (optional)"
                      value={step.note}
                      disabled={disabled}
                      onChange={(e) => patchStep(i, { note: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Remove step"
                    disabled={disabled || steps.length === 1}
                    onClick={() => setWalkthrough({ ...current, steps: steps.filter((_, j) => j !== i) })}
                    className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-raised hover:text-critical disabled:opacity-25"
                  >
                    ×
                  </button>
                </motion.li>
              )
            })}
          </ol>

          {steps.some((s) => {
            const r = resolve(s)
            return s.className.trim() && (!r.classFound || (s.method.trim() && !r.methodFound))
          }) && (
            <p className="mt-2 text-xs text-machine">
              A highlighted step calls something the design does not declare. Either add the method to
              the class, or move the step to the class that really owns it.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setWalkthrough({ ...current, steps: [...steps, { className: '', method: '', note: '' }] })}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand-soft disabled:opacity-40"
            >
              + Add step
            </button>

            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-ink-faint">Ends</span>
              <div className="flex rounded-lg border border-line bg-surface p-0.5">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setWalkthrough({ ...current, steps, outcome: o.id })}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      current.outcome === o.id
                        ? o.id === 'ok'
                          ? 'bg-positive/15 text-positive'
                          : 'bg-caution/15 text-caution'
                        : 'text-ink-faint hover:text-ink'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <datalist id="lld-walk-classes">
        {declared.map((c) => (
          <option key={c.name} value={c.name.trim()} />
        ))}
      </datalist>

      {/* Which classes have not acted yet */}
      {declared.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink-faint">Not yet exercised</span>
          <AnimatePresence initial={false}>
            {idle.length === 0 ? (
              <motion.span
                key="none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-positive"
              >
                every class with behaviour has a turn
              </motion.span>
            ) : (
              idle.map((c) => (
                <motion.span
                  key={c.name}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="chip !py-0.5 font-mono !text-[11px]"
                >
                  {c.name.trim()}
                </motion.span>
              ))
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
