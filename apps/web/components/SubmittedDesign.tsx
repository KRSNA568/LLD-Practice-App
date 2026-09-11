'use client'

import { motion } from 'framer-motion'
import type { DesignModel, EvidenceRef, Scenario } from '@lld/contracts'

/**
 * The learner's own submission, rendered next to the feedback.
 *
 * This panel is what makes evidence chips mean anything: clicking a citation
 * highlights the exact row being discussed — a class, an assumption, a decision,
 * or step 3 of the exit scenario. Feedback you cannot locate in your own work is
 * the vague scoring this product exists to replace.
 */
export function SubmittedDesign({
  design,
  highlight,
  scenarios = [],
  title = 'Your design',
  compact = false,
}: {
  design: DesignModel
  highlight: EvidenceRef | null
  scenarios?: Scenario[]
  title?: string
  compact?: boolean
}) {
  const litClass = highlight?.kind === 'class' ? highlight.name.toLowerCase() : null
  const isLit = (name: string) => litClass !== null && name.toLowerCase() === litClass
  const litEdge =
    highlight?.kind === 'relationship'
      ? `${highlight.from.toLowerCase()}|${highlight.to.toLowerCase()}`
      : null
  const litStep = highlight?.kind === 'step' ? `${highlight.scenarioId}:${highlight.index}` : null

  const H = ({ children }: { children: React.ReactNode }) => (
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{children}</h3>
  )

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      </div>

      <div className={`${compact ? 'max-h-[60vh]' : 'max-h-[72vh]'} overflow-y-auto p-4`}>
        {design.assumptions.length > 0 && (
          <section className="mb-5">
            <H>Assumptions</H>
            <ul className="space-y-1">
              {design.assumptions.map((a, i) => (
                <li
                  key={i}
                  id={`assumption-${i}`}
                  className={`rounded-lg px-2 py-1 text-[13px] leading-relaxed transition-colors ${
                    highlight?.kind === 'assumption' && highlight.index === i
                      ? 'bg-brand-soft text-ink ring-1 ring-brand/40'
                      : 'text-ink-muted'
                  }`}
                >
                  {a}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mb-5">
          <H>Classes</H>
          <ul className="space-y-1.5">
            {design.classes.map((c) => (
              <motion.li
                key={c.name}
                id={`class-${c.name.toLowerCase()}`}
                animate={
                  isLit(c.name)
                    ? { scale: [1, 1.015, 1], transition: { duration: 0.45 } }
                    : { scale: 1 }
                }
                className={`rounded-xl border px-3 py-2.5 transition-colors ${
                  isLit(c.name) ? 'border-brand/50 bg-brand-soft' : 'border-line bg-raised/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-medium">{c.name}</span>
                  {c.stereotype !== 'class' && (
                    <span className="chip !border-none !bg-surface !py-0 !text-[10px]">{c.stereotype}</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{c.responsibility}</p>
                {(c.methods.length > 0 || c.attributes.length > 0) && (
                  <p className="mt-1 font-mono text-[11px] leading-relaxed text-ink-faint">
                    {c.attributes.length > 0 && <span>{c.attributes.join(', ')}</span>}
                    {c.attributes.length > 0 && c.methods.length > 0 && <span> · </span>}
                    {c.methods.length > 0 && <span>{c.methods.map((m) => `${m}()`).join(' ')}</span>}
                  </p>
                )}
              </motion.li>
            ))}
          </ul>
        </section>

        {design.relationships.length > 0 && (
          <section className="mb-5">
            <H>Relationships</H>
            <ul className="space-y-1">
              {design.relationships.map((r, i) => {
                const lit = litEdge === `${r.from.toLowerCase()}|${r.to.toLowerCase()}`
                return (
                  <li
                    key={i}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1 font-mono text-xs transition-colors ${
                      lit ? 'bg-brand-soft ring-1 ring-brand/40' : ''
                    }`}
                  >
                    <span className={isLit(r.from) ? 'text-brand' : ''}>{r.from}</span>
                    <span className="text-ink-faint">—{r.kind}→</span>
                    <span className={isLit(r.to) ? 'text-brand' : ''}>{r.to}</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {design.walkthroughs.length > 0 && (
          <section className="mb-5">
            <H>Walkthroughs</H>
            <div className="space-y-3">
              {design.walkthroughs.map((w) => {
                const scenario = scenarios.find((s) => s.id === w.scenarioId)
                return (
                  <div key={w.scenarioId} className="rounded-xl border border-line bg-raised/40 p-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{scenario?.title ?? w.scenarioId}</span>
                      <span
                        className={`text-[10px] font-medium uppercase tracking-wide ${
                          w.outcome === 'ok' ? 'text-positive' : 'text-caution'
                        }`}
                      >
                        {w.outcome === 'ok' ? 'succeeds' : w.outcome}
                      </span>
                    </div>
                    <ol className="space-y-0.5">
                      {w.steps.map((s, i) => {
                        const lit = litStep === `${w.scenarioId}:${i}`
                        return (
                          <li
                            key={i}
                            id={`step-${w.scenarioId}-${i}`}
                            className={`flex gap-2 rounded-md px-1.5 py-0.5 font-mono text-[11.5px] transition-colors ${
                              lit ? 'bg-brand-soft ring-1 ring-brand/40' : ''
                            }`}
                          >
                            <span className="w-3 shrink-0 text-ink-faint">{i + 1}</span>
                            <span className={isLit(s.className) ? 'text-brand' : ''}>{s.className}</span>
                            <span className="text-ink-faint">▸</span>
                            <span>{s.method}</span>
                            {s.note && <span className="truncate font-sans text-ink-faint">— {s.note}</span>}
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {design.decisions.length > 0 && (
          <section className="mb-5">
            <H>Decisions</H>
            <ol className="space-y-1.5">
              {design.decisions.map((d, i) => (
                <li
                  key={i}
                  id={`decision-${i}`}
                  className={`rounded-lg px-2 py-1.5 text-[12.5px] leading-relaxed transition-colors ${
                    highlight?.kind === 'decision' && highlight.index === i
                      ? 'bg-brand-soft ring-1 ring-brand/40'
                      : 'text-ink-muted'
                  }`}
                >
                  <span className="font-medium text-ink">{d.what}</span>
                  {d.alternative && <span> — instead of {d.alternative}</span>}
                  {d.why && <span className="text-ink-faint"> · {d.why}</span>}
                </li>
              ))}
            </ol>
          </section>
        )}

        {design.tradeoffs && (
          <section>
            <H>Trade-offs</H>
            <p
              id="prose-tradeoffs"
              className={`rounded-lg px-2 py-1.5 text-[13px] leading-relaxed transition-colors ${
                highlight?.kind === 'prose' && highlight.field === 'tradeoffs'
                  ? 'bg-brand-soft ring-1 ring-brand/40'
                  : 'text-ink-muted'
              }`}
            >
              {design.tradeoffs}
            </p>
          </section>
        )}
      </div>
    </div>
  )
}
