'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { BandPill, ConceptStack, Tag } from './Pills'
import { PASTEL_BG, PASTEL_DEEP, PASTEL_HEX, type Pastel } from '@/lib/tokens'

export type ProblemCardProps = {
  href: string
  title: string
  category: string
  icon: IconName
  pastel: Pastel | 'soon'
  meta: string
  /** Best overall band; null shows "New" or "Coming soon". */
  band: number | null
  tag?: { label: string; icon?: IconName }
  concepts?: Array<{ id: string; name: string }>
  size?: 'lg' | 'md'
  statusPill?: string
  /** Attempted but never scored — an abandoned draft. */
  started?: boolean
}

/**
 * The problem card, in the two sizes the design uses: 212px with a 28px title
 * on the dashboard, 196px with a 24px title in the three-up catalogue.
 * "soon" is the white, dashed catalogue state for problems not yet playable.
 */
export function ProblemCard(p: ProblemCardProps) {
  const soon = p.pastel === 'soon'
  const lg = p.size !== 'md'
  const shell = p.pastel === 'soon' ? 'border border-line bg-white' : `${PASTEL_BG[p.pastel]} shadow-soft`
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className={`grid flex-none place-items-center rounded-full ${soon ? 'bg-soft' : 'bg-white'} ${lg ? 'h-11 w-11' : 'h-10 w-10 border border-soft'}`}>
            {!soon && <Icon name={p.icon} size={lg ? 20 : 18} stroke="#222222" />}
          </span>
          {lg && !p.tag && <span className="truncate text-[14px] leading-none text-ink" title={p.category}>{p.category}</span>}
        </div>
        <div className="flex flex-none gap-2">
          {p.tag && lg && <Tag icon={p.tag.icon}>{p.tag.label}</Tag>}
          {p.statusPill ? (
            <Tag soft={soon}>{p.statusPill}</Tag>
          ) : p.band !== null ? (
            <BandPill score={p.band} onWhite size={lg ? 'md' : 'sm'} />
          ) : (
            <Tag soft={soon}>{soon ? 'Coming soon' : p.started ? 'Started' : 'New'}</Tag>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {!lg && <span className={`text-[13px] leading-none ${soon ? 'text-faint' : 'text-ink-3'}`}>{p.category}</span>}
        <h4 className={`${lg ? 'h-card' : 'h-card-sm'} ${soon ? '!text-faint' : ''}`}>{p.title}</h4>
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className={`leading-[1.3] ${lg ? 'text-[14px]' : 'text-[13px]'} ${soon ? 'text-faint' : 'text-ink-3'}`}>{p.meta}</span>
        {!soon && p.concepts && <ConceptStack items={p.concepts} size={lg ? 36 : 32} />}
      </div>
    </>
  )
  const cls = `flex flex-col justify-between gap-3 rounded-3xl ${shell} ${lg ? 'min-h-[212px] p-7' : 'min-h-[196px] p-[22px]'} transition-transform`
  if (soon) return <div className={cls} aria-disabled>{inner}</div>
  return <Link href={p.href} className={`${cls} hover:-translate-y-0.5`}>{inner}</Link>
}

/**
 * The right-panel variant: a pastel card with a deeper ellipse in the corner.
 * Used for the open attempt, the coach's pick, the recommended problem.
 */
export function TwoToneCard({ pastel, href, category, icon, tag, title, meta, concepts, children }: {
  pastel: Pastel
  href?: string
  category: string
  icon: IconName
  tag: ReactNode
  title: ReactNode
  meta: ReactNode
  concepts?: Array<{ id: string; name: string }>
  children?: ReactNode
}) {
  const body = (
    <>
      <span className="absolute inset-0" style={{ background: PASTEL_DEEP[pastel], clipPath: 'ellipse(78% 120% at 112% 108%)' }} />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-white"><Icon name={icon} size={20} stroke="#222222" /></span>
          <span className="text-[14px] leading-none text-ink">{category}</span>
        </div>
        {typeof tag === 'string' ? <Tag>{tag}</Tag> : tag}
      </div>
      <h4 className="h-card relative">{title}</h4>
      <div className="relative flex items-end justify-between">
        <span className="text-[14px] leading-none text-ink-2">{meta}</span>
        {concepts && <ConceptStack items={concepts} />}
        {children}
      </div>
    </>
  )
  const cls = 'relative flex h-[212px] flex-none flex-col justify-between overflow-hidden rounded-3xl p-7'
  return href ? (
    <Link href={href} className={`${cls} transition-transform hover:-translate-y-0.5`} style={{ background: PASTEL_HEX[pastel] }}>{body}</Link>
  ) : (
    <div className={cls} style={{ background: PASTEL_HEX[pastel] }}>{body}</div>
  )
}

/** "Continue where you left off" — the lavender bar with a black pill button. */
export function ContinueBar({ href, eyebrow, title, cta }: { href: string; eyebrow: string; title: string; cta: string }) {
  return (
    <Link href={href} className="flex h-[120px] items-center justify-between rounded-3xl bg-lilac p-7 transition-transform hover:-translate-y-0.5">
      <span className="flex flex-col gap-2">
        <span className="text-[14px] leading-none text-ink">{eyebrow}</span>
        <span className="h-card">{title}</span>
      </span>
      <span className="btn-primary btn-sm">{cta}</span>
    </Link>
  )
}

/** A white panel card with a 16px title. */
export function PanelCard({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`card flex flex-col gap-3 p-6 ${className}`}>
      {title && <span className="text-[16px] font-medium leading-none text-ink-strong">{title}</span>}
      {children}
    </div>
  )
}

/** Section heading row: 18px title, optional right-hand note. */
export function SectionHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="h-section">{title}</h3>
      {right && <span className="text-[14px] leading-none text-muted">{right}</span>}
    </div>
  )
}
