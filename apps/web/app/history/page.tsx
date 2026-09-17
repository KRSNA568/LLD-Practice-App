'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useLibrary, conceptItems, primaryConcept } from '@/lib/useProblems'
import { numberWord } from '@/lib/tokens'
import { AttemptRow } from '@/components/AttemptRow'
import { Dropdown } from '@/components/ui/Pills'
import { Icon } from '@/components/ui/Icon'
import { PanelCard, TwoToneCard } from '@/components/ui/Cards'
import { Panel, PanelHeader } from '@/components/shell/Panel'

/** Every attempt across every problem, newest first. */
export default function History() {
  const { data, error } = useLibrary()
  const [filter, setFilter] = useState('all')
  const rows = useMemo(() => {
    if (!data?.progress) return []
    return data.progress.recent.filter((a) => filter === 'all' || a.problemId === filter)
  }, [data, filter])

  if (error) return <p className="text-[14px] text-tint-rose">{error}</p>
  if (!data || !data.progress) return <h2 className="h-hero">Your<br />attempts.</h2>
  const progress = data.progress
  const played = data.problems.filter((p) => p.attemptCount > 0)
  const weakness = progress.recurringWeaknesses[0]
  const nextProblem = data.next ? data.problems.find((p) => p.id === data.next!.problemId) : undefined
  const browseId = filter !== 'all' ? filter : progress.recent[0]?.problemId

  return (
    <>
      <h2 className="h-hero">{numberWord(progress.attempts)}<br />attempt{progress.attempts === 1 ? '' : 's'}.</h2>
      <div className="flex items-center justify-between">
        <h3 className="h-section">Newest first</h3>
        <Dropdown label="Problem" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All problems' }, ...played.map((p) => ({ value: p.id, label: p.title }))]} />
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((a) => <AttemptRow key={a.id} a={a} title={a.problemTitle} />)}
        {rows.length === 0 && <p className="text-[14px] text-muted">No attempts here yet.</p>}
      </div>

      <Panel>
        <PanelHeader />
        <div className="flex flex-col gap-3 rounded-3xl bg-blush p-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white"><Icon name="info" size={18} stroke="#222222" width={1.8} /></span>
            <span className="text-[15px] font-medium leading-none text-ink-strong">Recurring weakness</span>
          </div>
          {weakness ? (
            <>
              <p className="text-[20px] font-medium leading-[1.35] tracking-[-0.01em] text-ink-strong">
                {weakness.criterionName} sat at band {Math.floor(weakness.averageScore)} in {weakness.occurrences} of your last {weakness.windowSize} attempts.
              </p>
              <span className="text-[13px] leading-[1.5] text-ink-2">Detected across {numberWord(new Set(progress.recent.slice(0, weakness.windowSize).map((a) => a.problemId)).size).toLowerCase()} problem{new Set(progress.recent.slice(0, weakness.windowSize).map((a) => a.problemId)).size === 1 ? '' : 's'}.</span>
            </>
          ) : (
            <p className="text-[15px] leading-[1.45] text-ink-2">Nothing recurring yet. Three attempts before a low band counts as a habit.</p>
          )}
        </div>
        {nextProblem && data.next && (
          <TwoToneCard
            pastel="peach"
            href={`/learn/${nextProblem.id}`}
            category={primaryConcept(data.concepts, nextProblem.conceptTags).label}
            icon={primaryConcept(data.concepts, nextProblem.conceptTags).icon}
            tag="Coach pick"
            title={nextProblem.title}
            meta={nextProblem.bestOverall !== null ? `Best band ${nextProblem.bestOverall.toFixed(1)} · try for ${Math.min(4, Math.floor(nextProblem.bestOverall) + 1)}` : 'Not attempted yet'}
            concepts={conceptItems(data.concepts, nextProblem.conceptTags)}
          />
        )}
        <PanelCard title="By problem">
          <p className="text-[14px] leading-[1.55] text-muted">Open a problem to see every attempt side by side and how its bands moved.</p>
          {browseId && <Link href={`/history/${browseId}`} className="btn-secondary btn-xs self-start">Browse by problem</Link>}
        </PanelCard>
      </Panel>
    </>
  )
}
