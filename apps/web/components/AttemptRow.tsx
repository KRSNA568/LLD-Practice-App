'use client'

import Link from 'next/link'
import type { AttemptSummary, Stage } from '@lld/contracts'
import { PASTEL_BG, bandPastel, daysAgo, starred } from '@/lib/tokens'
import { Icon, Star } from '@/components/ui/Icon'

const STAGES: Stage[] = ['design', 'change', 'defend']

/**
 * One attempt as the design's history row: title and when, three stage dots,
 * a band pill or "Incomplete", a chevron. Open attempts go to the workspace,
 * finished ones to the report.
 */
export function AttemptRow({ a, title, subtitle }: { a: AttemptSummary; title: string; subtitle?: string }) {
  const open = a.state === 'DRAFT' || !(a.stage === 'defend' && a.stagesCompleted.includes('defend'))
  const href = a.overall === null && a.stagesCompleted.length === 0 ? `/practice/${a.id}` : open && a.state === 'DRAFT' ? `/practice/${a.id}` : `/report/${a.id}`
  return (
    <Link href={href} className="card-lined flex items-center gap-5 px-[22px] py-[18px] transition-colors hover:bg-soft">
      <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <span className="truncate text-[18px] font-medium leading-[1.2] tracking-[-0.01em] text-ink-strong">{title}</span>
        <span className="text-[13px] leading-none text-muted">{subtitle ?? `Attempt ${a.attemptNumber} · ${daysAgo(a.createdAt)}`}</span>
      </span>
      <span className="flex flex-none gap-2" aria-label={`${a.stagesCompleted.length} of 3 stages`}>
        {STAGES.map((s) => {
          const done = a.stagesCompleted.includes(s)
          return <span key={s} className={`h-3 w-3 rounded-full border-[1.5px] ${done ? 'border-ink-strong bg-ink-strong' : 'border-dashed bg-transparent'}`} />
        })}
      </span>
      {a.overall === null ? (
        <span className="grid h-[34px] w-[110px] flex-none place-items-center rounded-full bg-soft text-[13px] font-medium leading-none text-ink-strong">Incomplete</span>
      ) : (
        <span className={`flex h-[34px] w-[110px] flex-none items-center justify-center gap-1.5 rounded-full text-[13px] font-medium leading-none text-ink-strong ${PASTEL_BG[bandPastel(a.overall)]}`}>
          <Star filled={starred(a.overall)} />Band {a.overall.toFixed(1)}
        </span>
      )}
      <Icon name="chevron" size={18} stroke="#6E6E6E" width={1.8} className="flex-none" />
    </Link>
  )
}
