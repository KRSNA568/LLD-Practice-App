'use client'

import type { ReactNode } from 'react'
import { Icon, Star, type IconName } from './Icon'
import { PASTEL_BG, abbrev, bandLabel, bandPastel, initials, starred } from '@/lib/tokens'

/** "Band 3.2" on its tint, with the star from 3.5. `soft` is the grey variant for pills on coloured cards. */
export function BandPill({ score, decimals = 1, onWhite = false, size = 'md' }: { score: number; decimals?: 0 | 1; onWhite?: boolean; size?: 'sm' | 'md' }) {
  const h = size === 'sm' ? 'h-[30px] px-3 text-[12px]' : 'h-[34px] px-3.5 text-[13px]'
  const bg = onWhite ? 'bg-white' : PASTEL_BG[bandPastel(score)]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium leading-none text-ink-strong ${bg} ${h}`}>
      <Star filled={starred(score)} size={size === 'sm' ? 12 : 13} />
      {bandLabel(score, decimals)}
    </span>
  )
}

/** A plain white pill, for tags on coloured cards ("Recommended", "In progress"). */
export function Tag({ children, icon, soft = false }: { children: ReactNode; icon?: IconName; soft?: boolean }) {
  return (
    <span className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium leading-none ${soft ? 'bg-soft font-normal text-muted' : 'bg-white text-ink-strong'}`}>
      {icon && <Icon name={icon} size={14} stroke="#6E6E6E" width={1.8} />}
      {children}
    </span>
  )
}

/** The "Year ▾" control. A real select underneath, styled as the design's pill. */
export function Dropdown<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <label className="relative inline-flex h-9 items-center gap-2 rounded-full border border-line px-3.5 text-[14px] font-medium leading-none text-ink">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {options.find((o) => o.value === value)?.label}
      <Icon name="chevdown" size={14} stroke="#6E6E6E" width={2} />
    </label>
  )
}

/** The mono "→ ParkingLot.assignSpot" evidence link. */
export function EvidenceLink({ children, onClick, active = false }: { children: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-2 rounded-full px-3.5 font-mono text-[13px] font-medium leading-none text-ink-strong transition-colors ${active ? 'bg-ink-strong text-white' : 'bg-white hover:bg-soft'} ${onClick ? '' : 'cursor-default'}`}
    >
      → {children}
    </button>
  )
}

/** Overlapping two-letter concept avatars. */
export function ConceptStack({ items, size = 36 }: { items: Array<{ id: string; name: string }>; size?: 32 | 36 }) {
  if (items.length === 0) return null
  const dim = size === 36 ? 'h-9 w-9 -ml-2.5 text-[12px]' : 'h-8 w-8 -ml-[9px] text-[11px]'
  return (
    <div className="flex pl-2.5">
      {items.slice(0, 3).map((c) => (
        <span key={c.id} title={c.name} className={`grid place-items-center rounded-full border-2 border-white bg-ground font-medium leading-none text-ink ${dim}`}>
          {abbrev(c.name)}
        </span>
      ))}
    </div>
  )
}

/** The 64px pill row: a tinted disc, a label, and a chevron or trailing slot. */
export function StatPill({ value, label, pastel, href, trailing, icon }: { value?: ReactNode; label: ReactNode; pastel: string; href?: string; trailing?: ReactNode; icon?: IconName }) {
  const body = (
    <>
      <span className={`grid h-11 w-11 flex-none place-items-center rounded-full text-[14px] font-medium leading-none text-ink-strong ${pastel}`}>
        {icon ? <Icon name={icon} size={20} stroke="#222222" /> : value}
      </span>
      <span className="text-[15px] font-medium leading-none text-ink-strong">{label}</span>
      <span className="flex-1" />
      {trailing}
      {href && <Icon name="chevron" size={18} stroke="#6E6E6E" width={1.8} />}
    </>
  )
  const cls = 'flex h-16 items-center gap-3.5 rounded-full bg-white pl-2.5 pr-5'
  if (href) return <a href={href} className={`${cls} transition-colors hover:bg-soft`}>{body}</a>
  return <div className={cls}>{body}</div>
}

/** 44px ring showing a 0–4 average; "—" when there is no evidence yet. */
export function MasteryRing({ value, pastel }: { value: number | null; pastel: string }) {
  const C = 2 * Math.PI * 19
  const dash = value === null ? 0 : C * (Math.min(4, Math.max(0, value)) / 4)
  return (
    <span className="relative inline-block h-11 w-11">
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
        <circle cx="22" cy="22" r="19" fill="none" stroke={pastel} strokeWidth="4" />
        {value !== null && (
          <circle cx="22" cy="22" r="19" fill="none" stroke="#111111" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${dash.toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 22 22)" />
        )}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[13px] font-medium leading-none text-ink-strong">
        {value === null ? '—' : value.toFixed(1)}
      </span>
    </span>
  )
}

/** Circle initials on lavender with the pale ring. */
export function Avatar({ name, size = 80 }: { name: string; size?: 44 | 64 | 80 }) {
  const cls = size === 80 ? 'h-20 w-20 border-4 text-[24px]' : size === 64 ? 'h-16 w-16 border-[3px] text-[18px]' : 'h-11 w-11 border-[3px] text-[14px]'
  return (
    <span className={`grid place-items-center rounded-full border-lilac-ring bg-lilac font-medium leading-none text-ink-strong ${cls}`} aria-label={name}>
      {initials(name)}
    </span>
  )
}

/** Dashed-border empty state with a CTA. */
export function EmptyState({ icon = 'clock', title, body, cta, href }: { icon?: IconName; title: string; body: string; cta?: string; href?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-dashed bg-white p-7 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-panel">
        <Icon name={icon} size={24} stroke="#9A9A9A" width={1.6} />
      </span>
      <span className="text-[18px] font-medium leading-tight text-ink-strong">{title}</span>
      <span className="text-[14px] leading-relaxed text-muted">{body}</span>
      {cta && href && <a href={href} className="btn-primary btn-sm mt-1">{cta}</a>}
    </div>
  )
}

/** Card skeleton in the design's proportions. */
export function CardSkeleton({ h = 180 }: { h?: number }) {
  return (
    <div className="flex flex-col justify-between rounded-3xl bg-panel p-[22px]" style={{ height: h }}>
      <div className="flex items-center justify-between"><span className="h-10 w-10 rounded-full bg-skel" /><span className="h-[30px] w-[84px] rounded-full bg-skel" /></div>
      <div className="flex flex-col gap-2"><span className="h-[18px] w-4/5 rounded-full bg-skel" /><span className="h-[18px] w-[55%] rounded-full bg-skel" /></div>
      <span className="h-3.5 w-2/5 rounded-full bg-skel" />
    </div>
  )
}
