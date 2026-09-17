'use client'

import { Icon, type IconName } from './Icon'

export type ChipItem = { id: string; label: string; icon: IconName; tint: string }

/**
 * The 64px filter chips: a white disc with a tinted glyph, the active one black.
 * The row scrolls sideways rather than wrapping, as in the design, and the
 * scrollbar is hidden.
 */
export function ChipRow({ items, active, onChange }: { items: ChipItem[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter">
      {items.map((c) => {
        const on = c.id === active
        return (
          <button
            key={c.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(c.id)}
            className={`flex h-16 flex-none items-center gap-3 rounded-full border pl-2.5 pr-[26px] transition-colors ${on ? 'border-ink-strong bg-ink-strong' : 'border-line bg-white hover:bg-soft'}`}
          >
            <span className="grid h-11 w-11 flex-none place-items-center rounded-full border border-line bg-white">
              <Icon name={c.icon} size={20} stroke={on ? '#111111' : c.tint} />
            </span>
            <span className={`whitespace-nowrap text-[14px] font-medium leading-none ${on ? 'text-white' : 'text-ink'}`}>{c.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Small dotted chip: "● Structure". */
export function DotChip({ label, color, href }: { label: string; color: string; href?: string }) {
  const cls = 'inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[13px] font-medium leading-none text-ink'
  const body = (<><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{label}</>)
  return href ? <a href={href} className={`${cls} transition-colors hover:bg-soft`}>{body}</a> : <span className={cls}>{body}</span>
}
