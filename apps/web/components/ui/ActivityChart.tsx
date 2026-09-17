'use client'

import type { ActivityMonth } from '@lld/contracts'
import { PASTEL_HEX } from '@/lib/tokens'

/**
 * Stacked bars, one per month: stages evaluated (Design, Change, Defend) and
 * critique pairs answered, all counts. The current month wears the black ring
 * and the black label. Segment heights are proportional to the busiest month
 * so the tallest bar always fills the chart.
 *
 * Counts rather than time, because critiques have no duration and mixing units
 * in one stack would lie. Total time is the number beside the chart.
 */
const SEGMENTS: Array<{ key: 'design' | 'change' | 'defend' | 'critique'; label: string; color: string }> = [
  { key: 'design', label: 'Design', color: PASTEL_HEX.pink },
  { key: 'change', label: 'Change', color: PASTEL_HEX.peach },
  { key: 'defend', label: 'Defend', color: PASTEL_HEX.lav },
  { key: 'critique', label: 'Critique', color: PASTEL_HEX.mint },
]

const TIME_SEGMENTS: Array<{ key: 'designSeconds' | 'changeSeconds' | 'defendSeconds'; label: string; color: string }> = [
  { key: 'designSeconds', label: 'Design', color: PASTEL_HEX.pink },
  { key: 'changeSeconds', label: 'Change', color: PASTEL_HEX.peach },
  { key: 'defendSeconds', label: 'Defend', color: PASTEL_HEX.lav },
]

/** `mode="time"` stacks seconds per stage instead of counts — the progress page's "Time on stages". */
export function ActivityChart({ months, height = 180, big = false, empty = false, mode = 'counts' }: { months: ActivityMonth[]; height?: number; big?: boolean; empty?: boolean; mode?: 'counts' | 'time' }) {
  const segs: Array<{ key: keyof ActivityMonth; label: string; color: string }> = mode === 'time' ? TIME_SEGMENTS : SEGMENTS
  const totalOf = (m: ActivityMonth) => segs.reduce((a, s) => a + (m[s.key] as number), 0)
  const max = Math.max(1, ...months.map(totalOf))
  const usable = height - 26 // label row
  const gapPx = 4
  return (
    <div className="flex flex-col gap-4">
      <div className={`flex items-end ${big ? 'gap-4' : 'gap-2.5'}`} style={{ height }}>
        {months.map((m, i) => {
          const total = totalOf(m)
          const current = i === months.length - 1
          if (empty) {
            return (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-2.5">
                <span className="w-full rounded-xl bg-soft" style={{ height: 18 + (i % 3) * 8 }} />
                <span className="text-[12px] leading-none text-muted">{m.label}</span>
              </div>
            )
          }
          return (
            <div key={m.month} className="flex flex-1 flex-col items-center gap-2.5" title={mode === 'time' ? `${m.label}: ${Math.round(total / 60)} min` : `${m.label}: ${total} done`}>
              <div
                className={`flex w-full flex-col justify-end ${big ? 'rounded-[18px]' : 'rounded-2xl'}`}
                style={{ gap: gapPx, padding: current ? 5 : 0, border: current ? '2px solid #111111' : '2px solid transparent', minHeight: current ? 24 : 0 }}
              >
                {segs.map((s) => {
                  const v = m[s.key] as number
                  if (!v) return null
                  const h = Math.max(6, Math.round((v / max) * (usable - 14)))
                  return <span key={s.key} style={{ height: h, background: s.color, borderRadius: '12px 12px 4px 4px' }} />
                })}
              </div>
              <span
                className={`rounded-full leading-none ${big ? 'text-[13px]' : 'text-[12px]'} ${current ? 'bg-ink-strong px-3 py-[5px] text-white' : 'px-1 py-[5px] text-muted'}`}
              >
                {m.label}
              </span>
            </div>
          )
        })}
      </div>
      {!empty && <div className="flex flex-wrap gap-4">
        {segs.map((s) => (
          <span key={s.key} className="flex items-center gap-[7px]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className={`leading-none text-muted ${big ? 'text-[13px]' : 'text-[12px]'}`}>{s.label}</span>
          </span>
        ))}
      </div>}
    </div>
  )
}
