'use client'

import { motion } from 'framer-motion'
import type { Criterion, CriterionResult, EvidenceRef } from '@lld/contracts'
import { SCORE_LABEL, STAGE_LABEL, scoreTone } from '@/lib/format'
import { riseIn } from './motion'

/**
 * One rubric finding.
 *
 * Two things are deliberate here. Rule findings and AI findings are visually
 * distinct — the learner should always know whether something was *proved* or
 * *judged*, and quietly blending them would be the most dishonest thing this
 * product could do. And every citation is a button: feedback that cannot point at
 * the thing it is talking about is the vague scoring this exists to replace.
 */

const TONE = {
  critical: { text: 'text-critical', bg: 'bg-critical', ring: 'bg-critical/15' },
  caution: { text: 'text-caution', bg: 'bg-caution', ring: 'bg-caution/15' },
  positive: { text: 'text-positive', bg: 'bg-positive', ring: 'bg-positive/15' },
} as const

export function CriterionCard({
  result,
  criterion,
  onCite,
  onLearn,
  learnLabel,
  onExplain,
  explanation,
  explaining,
}: {
  result: CriterionResult
  criterion: Criterion | undefined
  onCite: (ref: EvidenceRef) => void
  /** When set, a low score offers a lesson on the concept behind it. */
  onLearn?: () => void
  learnLabel?: string
  /** When set, any finding can be explained on request. */
  onExplain?: () => void
  explanation?: { text: string; modelId: string } | null
  explaining?: boolean
}) {
  const tone = TONE[scoreTone(result.score)]
  const isMachine = result.evaluatorKind === 'deterministic'

  return (
    <motion.li variants={riseIn} className="list-none">
      <div className="card overflow-hidden">
        <div className="flex items-start gap-4 p-5 pb-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold tracking-tight">
                {criterion?.name ?? result.criterionId}
              </h3>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  isMachine ? 'bg-machine/12 text-machine' : 'bg-judged/12 text-judged'
                }`}
                title={
                  isMachine
                    ? 'Proved from the structure of your submission — same design, same result, every time.'
                    : 'Judged by an AI reviewer against the rubric.'
                }
              >
                <span aria-hidden>{isMachine ? '⌗' : '◈'}</span>
                {isMachine ? 'Structural check' : 'AI review'}
              </span>
              {!isMachine && result.confidence === 'low' && (
                <span className="chip !py-0.5 !text-[10px]">low confidence</span>
              )}
              <span className="chip !border-none !bg-transparent !px-0 !py-0.5 !text-[10px] uppercase tracking-wide !text-ink-faint">
                {STAGE_LABEL[result.stage]} stage
              </span>
            </div>
            {criterion && (
              <p className="mt-1 text-xs leading-relaxed text-ink-faint">{criterion.question}</p>
            )}
          </div>

          <div className="shrink-0 text-right">
            <div className={`text-2xl font-semibold tabular-nums ${tone.text}`}>
              {result.score}
              <span className="text-sm text-ink-faint">/4</span>
            </div>
            <div className={`text-[10px] font-medium uppercase tracking-wide ${tone.text}`}>
              {SCORE_LABEL[result.score]}
            </div>
          </div>
        </div>

        <div className="px-5">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <motion.div
                key={i}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.35, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                className={`h-1 flex-1 origin-left rounded-full ${
                  i < result.score ? tone.bg : 'bg-line'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3 p-5 pt-4">
          <p className="text-[14px] leading-relaxed text-ink">{result.concern}</p>

          {result.suggestion && (
            <div className="flex gap-2.5 rounded-xl bg-raised px-3.5 py-3">
              <span className="mt-0.5 shrink-0 text-brand" aria-hidden>
                →
              </span>
              <p className="text-[13px] leading-relaxed text-ink-muted">{result.suggestion}</p>
            </div>
          )}

          {(onLearn || onExplain) && (
            <div className="flex flex-wrap gap-2">
              {onExplain && !explanation && (
                <button
                  onClick={onExplain}
                  disabled={explaining}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-muted transition-colors hover:border-judged/40 hover:text-judged disabled:opacity-60"
                >
                  <span aria-hidden className="text-judged">◈</span>
                  {explaining ? 'Thinking…' : 'Why does this matter here?'}
                </button>
              )}
              {onLearn && (
                <button
                  onClick={onLearn}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-judged/30 bg-judged/[0.06] px-3 py-1.5 text-[12px] font-medium text-judged transition-colors hover:bg-judged/[0.12]"
                >
                  <span aria-hidden>◈</span>
                  {learnLabel ?? 'Learn the concept'}
                </button>
              )}
            </div>
          )}

          {explanation && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-judged/25 bg-judged/[0.04] px-3.5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-judged">
                <span aria-hidden>◈ </span>Why it matters here{explanation.modelId.startsWith('stub') && ' · stand-in'}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed">{explanation.text}</p>
            </motion.div>
          )}

          {result.evidence.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[11px] uppercase tracking-wide text-ink-faint">In your design</span>
              {result.evidence.map((ref, i) => (
                <button
                  key={i}
                  onClick={() => onCite(ref)}
                  className="chip max-w-full transition-colors hover:border-brand/50 hover:bg-brand-soft hover:text-brand"
                >
                  <span className="truncate">{labelFor(ref)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.li>
  )
}

function labelFor(ref: EvidenceRef): string {
  switch (ref.kind) {
    case 'class':
      return ref.name
    case 'relationship':
      return `${ref.from} → ${ref.to}`
    case 'assumption':
      return `Assumption ${ref.index + 1}`
    case 'decision':
      return `Decision ${ref.index + 1}`
    case 'step':
      return `Step ${ref.index + 1} · ${ref.scenarioId.replace(/^sc-/, '')}`
    case 'prose':
      return ref.quote.length > 48 ? `“${ref.quote.slice(0, 48)}…”` : `“${ref.quote}”`
  }
}
