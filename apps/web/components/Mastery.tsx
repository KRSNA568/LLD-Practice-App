'use client'

import type { ConceptMastery, MasteryLevel } from '@lld/contracts'
import { MASTERY_LABEL } from '@/lib/format'

const DOT: Record<MasteryLevel, string> = {
  new: 'bg-line',
  developing: 'bg-caution',
  solid: 'bg-positive',
}
const TEXT: Record<MasteryLevel, string> = {
  new: 'text-ink-faint',
  developing: 'text-caution',
  solid: 'text-positive',
}

/** One small dot: the standing on one concept, at a glance. */
export function MasteryDot({ level, className = '' }: { level: MasteryLevel; className?: string }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[level]} ${className}`} aria-hidden />
}

/**
 * A ring that fills with the average — the conventional mastery affordance, drawn
 * so that "not yet" is an empty ring rather than a red one. Nothing here is a
 * score; it is a picture of recent evidence.
 */
export function MasteryRing({ mastery, size = 44 }: { mastery: ConceptMastery; size?: number }) {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const fraction = mastery.average === null ? 0 : mastery.average / 4
  const stroke =
    mastery.level === 'solid' ? 'rgb(var(--positive))' : mastery.level === 'developing' ? 'rgb(var(--caution))' : 'rgb(var(--line))'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-label={MASTERY_LABEL[mastery.level]}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth="3" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.22,1,0.36,1)' }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className={`fill-current text-[11px] font-semibold ${TEXT[mastery.level]}`}>
        {mastery.average === null ? '·' : mastery.average.toFixed(1)}
      </text>
    </svg>
  )
}

/** A concept name with its dot — the unit the dashboard and cards are built from. */
export function ConceptChip({ id, name, level }: { id: string; name?: string; level: MasteryLevel }) {
  return (
    <span className="chip !py-0.5 !text-[11px]" title={MASTERY_LABEL[level]}>
      <MasteryDot level={level} />
      {name ?? id.replace(/-/g, ' ')}
    </span>
  )
}
