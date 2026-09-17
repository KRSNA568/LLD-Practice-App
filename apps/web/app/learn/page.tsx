'use client'

import { useMemo, useState } from 'react'
import { useLibrary, chipsFor, conceptItems, primaryConcept } from '@/lib/useProblems'
import { PASTEL_HEX, pastelAt } from '@/lib/tokens'
import { CONCEPT_TIER_LABEL } from '@/lib/format'
import { ChipRow, DotChip } from '@/components/ui/Chips'
import { PanelCard, ProblemCard, SectionHead } from '@/components/ui/Cards'
import { CardSkeleton, StatPill } from '@/components/ui/Pills'
import { Panel, PanelHeader } from '@/components/shell/Panel'
import { conceptIcon } from '@/components/ui/Icon'
import { CONCEPT_TIERS } from '@lld/contracts'

/**
 * The catalogue. Playable problems on the four pastels, three up; the rest of
 * the catalogue in white as "coming soon", so the shape of the library is honest.
 */
export default function Learn() {
  const { data, error } = useLibrary()
  const [chip, setChip] = useState('all')
  const [playedOnly, setPlayedOnly] = useState(false)
  const chips = useMemo(() => (data ? chipsFor(data.concepts, data.problems) : []), [data])

  if (error) return <p className="text-[14px] text-tint-rose">{error}</p>
  if (!data || !data.progress) {
    return (
      <>
        <h2 className="h-hero">Pick a<br />problem.</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <CardSkeleton key={i} h={196} />)}</div>
      </>
    )
  }
  const progress = data.progress
  const playable = data.problems.filter((p) => (chip === 'all' || p.conceptTags.includes(chip)) && (!playedOnly || p.attemptCount > 0))
  const upcoming = playedOnly ? [] : data.upcoming.filter((p) => chip === 'all' || p.conceptTags.includes(chip))
  const played = data.problems.filter((p) => p.attemptCount > 0).length
  const nextProblem = data.next ? data.problems.find((p) => p.id === data.next!.problemId) : undefined

  return (
    <>
      <h2 className="h-hero">Pick a<br />problem.</h2>
      <ChipRow items={chips} active={chip} onChange={setChip} />
      <div className="flex items-center justify-between">
        <h3 className="h-section">{chip === 'all' ? 'All problems' : chips.find((c) => c.id === chip)?.label}</h3>
        <label className="flex cursor-pointer items-center gap-2.5">
          <span className="text-[14px] leading-none text-muted">Played only</span>
          <input type="checkbox" className="sr-only" checked={playedOnly} onChange={(e) => setPlayedOnly(e.target.checked)} />
          <span aria-hidden className={`flex h-[30px] w-[52px] rounded-full p-[3px] transition-colors ${playedOnly ? 'justify-end bg-ink-strong' : 'justify-start bg-line'}`}>
            <span className="h-6 w-6 rounded-full bg-white" />
          </span>
        </label>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {playable.map((p, i) => {
          const cat = primaryConcept(data.concepts, p.conceptTags)
          return (
            <ProblemCard
              key={p.id}
              size="md"
              href={`/learn/${p.id}`}
              title={p.title}
              category={cat.label}
              icon={cat.icon}
              pastel={pastelAt(i)}
              band={p.bestOverall}
              started={p.attemptCount > 0}
              statusPill={progress.openAttempt?.problemId === p.id ? 'In progress' : undefined}
              meta={p.attemptCount > 0 ? `${p.attemptCount} attempt${p.attemptCount === 1 ? '' : 's'}${p.bestOverall !== null ? ` · best ${p.bestOverall.toFixed(1)}` : ''}` : `Not attempted · ${p.minutes} min`}
              concepts={conceptItems(data.concepts, p.conceptTags).slice(0, 2)}
            />
          )
        })}
        {upcoming.map((p) => (
          <ProblemCard key={p.id} size="md" href="#" title={p.title} category={primaryConcept(data.concepts, p.conceptTags).label} icon={conceptIcon(p.conceptTags[0] ?? '')} pastel="soon" band={null} meta="Not yet playable" />
        ))}
        {playable.length + upcoming.length === 0 && <p className="text-[14px] text-muted">Nothing matches. Clear the filter or switch off “played only”.</p>}
      </div>

      <Panel>
        <PanelHeader />
        {progress.coach && nextProblem ? (
          <PanelCard title="Coach note">
            <p className="text-[15px] leading-[1.55] text-ink">{progress.coach.text}</p>
            <a href={`/learn/${nextProblem.id}`} className="btn-primary btn-xs mt-0.5 self-start">Open {nextProblem.title.toLowerCase()}</a>
          </PanelCard>
        ) : data.next && nextProblem ? (
          <PanelCard title="Next for you">
            <p className="text-[15px] leading-[1.55] text-ink">{data.next.reason}</p>
            <a href={`/learn/${nextProblem.id}`} className="btn-primary btn-xs mt-0.5 self-start">Open {nextProblem.title.toLowerCase()}</a>
          </PanelCard>
        ) : (
          <PanelCard title="Coach note">
            <p className="text-[15px] leading-[1.55] text-muted">Finish an attempt and the coach reads it, then says what to practise next.</p>
          </PanelCard>
        )}
        <h3 className="h-section">Progress</h3>
        <div className="flex flex-col gap-3">
          <StatPill value={`${played}/${data.problems.length}`} label="Problems played" pastel="bg-lilac" href="/progress" />
          <StatPill value={String(progress.attempts)} label="Attempts logged" pastel="bg-blush" href="/history" />
          <StatPill value={progress.medianOverall === null ? '—' : progress.medianOverall.toFixed(1)} label="Median band" pastel="bg-mint" href="/progress" />
        </div>
        <SectionHead title="Concept groups" />
        <div className="flex flex-wrap gap-2.5">
          {CONCEPT_TIERS.map((t, i) => (
            <DotChip key={t} label={CONCEPT_TIER_LABEL[t]} color={PASTEL_HEX[pastelAt(i)]} href={`/concepts#${t}`} />
          ))}
        </div>
      </Panel>
    </>
  )
}
