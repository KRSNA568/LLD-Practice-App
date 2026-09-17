'use client'

import type { Stage } from '@lld/contracts'
import { Icon } from './Icon'

/**
 * Design ✓ — Change — Defend, as pills joined by hairlines. Done is mint with a
 * check, current is black, upcoming is white outline.
 */
const STAGES: Array<{ id: Stage; label: string }> = [
  { id: 'design', label: 'Design' },
  { id: 'change', label: 'Change' },
  { id: 'defend', label: 'Defend' },
]

export function StageRail({ current, done }: { current: Stage; done: Stage[] }) {
  return (
    <div className="flex items-center" aria-label="Stages">
      {STAGES.map((s, i) => {
        const isDone = done.includes(s.id)
        const isCurrent = s.id === current && !isDone
        const cls = isDone ? 'bg-mint text-ink-strong' : isCurrent ? 'bg-ink-strong text-white' : 'border border-line bg-white text-muted'
        return (
          <div key={s.id} className="flex items-center">
            <span aria-current={isCurrent ? 'step' : undefined} className={`flex h-12 items-center gap-2 rounded-full px-[22px] text-[15px] font-medium leading-none ${cls}`}>
              {isDone && <Icon name="check" size={15} stroke="#111111" width={2.4} />}
              {s.label}
            </span>
            {i < STAGES.length - 1 && <span className="h-px w-11 bg-line" />}
          </div>
        )
      })}
    </div>
  )
}
