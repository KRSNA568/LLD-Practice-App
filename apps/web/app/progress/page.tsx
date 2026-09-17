'use client'

import { useMemo, useState } from 'react'
import { useLibrary, conceptItems, primaryConcept } from '@/lib/useProblems'
import { PASTEL_BG, bandPastel, hoursLabel, pastelAt, starred } from '@/lib/tokens'
import { CRITERION_ORDER } from '@/lib/format'
import { ActivityChart } from '@/components/ui/ActivityChart'
import { Dropdown, Tag } from '@/components/ui/Pills'
import { Star } from '@/components/ui/Icon'
import { PanelCard, TwoToneCard } from '@/components/ui/Cards'
import { Panel, PanelHeader, PanelIdentity } from '@/components/shell/Panel'
import { api } from '@/lib/api'
import { useEffect } from 'react'
import type { Rubric } from '@lld/contracts'

/**
 * Cross-problem progress: four numbers, time on stages by month, and every
 * criterion with its last five scores as a line and its average as a band.
 */
export default function Progress() {
  const { data, error } = useLibrary()
  const [range, setRange] = useState<'7' | '12'>('7')
  const [rubric, setRubric] = useState<Rubric | null>(null)
  useEffect(() => {
    if (!data?.problems[0]) return
    api.getProblem(data.problems[0].id).then((r) => setRubric(r.rubric)).catch(() => {})
  }, [data])

  const rows = useMemo(() => {
    if (!data?.progress || !rubric) return []
    const progress = data.progress
    const weak = new Set(progress.recurringWeaknesses.map((w) => w.criterionId))
    return CRITERION_ORDER.map((id) => {
      const c = rubric.criteria.find((x) => x.id === id)
      const avg = progress.criterionAverages[id]
      // Oldest → newest, last five scored attempts that scored this criterion.
      const series = progress.recent.filter((a) => a.scores[id] !== undefined).slice(0, 5).reverse().map((a) => a.scores[id] as number)
      return { id, name: c?.name ?? id, avg, series, recurring: weak.has(id) }
    })
  }, [data, rubric])

  if (error) return <p className="text-[14px] text-tint-rose">{error}</p>
  if (!data || !data.progress) return <h2 className="h-hero">Your<br />progress.</h2>
  const progress = data.progress
  const played = data.problems.filter((p) => p.attemptCount > 0).length
  const months = progress.activity.slice(range === '7' ? -7 : -12)
  const nextProblem = data.next ? data.problems.find((p) => p.id === data.next!.problemId) : undefined
  const stats = [
    { v: `${played}/${data.problems.length}`, t: 'Problems played' },
    { v: String(progress.attempts), t: 'Attempts' },
    { v: `${progress.criteriaAtPar}/${CRITERION_ORDER.length}`, t: 'Criteria at par' },
    { v: String(progress.streakDays), t: 'Day streak' },
  ]

  return (
    <>
      <h2 className="h-hero">Your<br />progress.</h2>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s, i) => (
          <div key={s.t} className="card-lined flex h-[132px] flex-col justify-between p-5">
            <span className={`h-11 w-11 rounded-full ${PASTEL_BG[pastelAt(i)]}`} />
            <div className="flex flex-col gap-1">
              <span className="text-[32px] font-medium leading-none tracking-[-0.02em] text-ink-strong">{s.v}</span>
              <span className="text-[14px] leading-none text-muted">{s.t}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card-lined flex flex-col gap-[18px] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="h-section">Time on stages</span>
            <Tag soft>{hoursLabel(progress.practiceSeconds)} in total</Tag>
          </div>
          <Dropdown label="Range" value={range} onChange={setRange} options={[{ value: '7', label: '7 months' }, { value: '12', label: 'Year' }]} />
        </div>
        <ActivityChart months={months} height={280} big mode="time" />
      </div>

      <div className="card-lined px-6 pb-4 pt-2">
        {rows.map((r) => (
          <div key={r.id} className="flex h-14 items-center gap-4 border-b border-soft last:border-b-0">
            <span className="min-w-0 flex-1 text-[15px] leading-none text-ink">{r.name}</span>
            {r.recurring && <span className="pill bg-blush h-7 px-3 text-[12px]">Recurring weakness</span>}
            <Sparkline series={r.series} />
            {r.avg === undefined ? (
              <span className="grid h-8 w-24 flex-none place-items-center rounded-full bg-soft text-[13px] text-muted">—</span>
            ) : (
              <span className={`flex h-8 w-24 flex-none items-center justify-center gap-1.5 rounded-full text-[13px] font-medium leading-none text-ink-strong ${PASTEL_BG[bandPastel(r.avg)]}`}>
                <Star filled={starred(r.avg)} />Band {r.avg.toFixed(1)}
              </span>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="py-4 text-[14px] text-muted">Criteria appear after your first scored attempt.</p>}
      </div>

      <Panel>
        <PanelHeader />
        <PanelIdentity sub={progress.medianOverall === null ? `${progress.attempts} attempts` : `Median band ${progress.medianOverall.toFixed(1)} · ${progress.attempts} attempts`} />
        <PanelCard title="Recurring weakness">
          {progress.recurringWeaknesses.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2">
                {progress.recurringWeaknesses.map((w) => <span key={w.criterionId} className="pill bg-blush h-8 px-3.5">{w.criterionName}</span>)}
              </div>
              <p className="text-[14px] leading-[1.55] text-muted">
                {progress.recurringWeaknesses.map((w) => `${w.criterionName} sat at band ${Math.floor(w.averageScore)} in ${w.occurrences} of your last ${w.windowSize} attempts`).join('. ')}.
              </p>
            </>
          ) : (
            <p className="text-[14px] leading-[1.55] text-muted">Nothing recurring yet. It takes three attempts before a low score counts as a habit rather than a bad day.</p>
          )}
        </PanelCard>
        {nextProblem && data.next && (
          <TwoToneCard
            pastel="peach"
            href={`/learn/${nextProblem.id}`}
            category={primaryConcept(data.concepts, nextProblem.conceptTags).label}
            icon={primaryConcept(data.concepts, nextProblem.conceptTags).icon}
            tag="Recommended"
            title={nextProblem.title}
            meta={`${data.next.criterionName ? `Targets ${data.next.criterionName.toLowerCase()}` : 'Next for you'} · ${nextProblem.attemptCount} attempt${nextProblem.attemptCount === 1 ? '' : 's'}`}
            concepts={conceptItems(data.concepts, nextProblem.conceptTags)}
          />
        )}
      </Panel>
    </>
  )
}

/** 80×22 polyline over the last five scores, 0–4. */
function Sparkline({ series }: { series: number[] }) {
  if (series.length < 2) return <span className="w-20 flex-none" />
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * 80},${20 - (v / 4) * 18}`).join(' ')
  return (
    <svg width="80" height="22" viewBox="0 0 80 22" fill="none" className="flex-none" aria-hidden>
      <polyline points={pts} stroke="#6E6E6E" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
