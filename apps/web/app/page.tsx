'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import type { ProblemSummary } from '@lld/contracts'
import { api } from '@/lib/api'
import { useLibrary, chipsFor, conceptItems, primaryConcept } from '@/lib/useProblems'
import { PASTEL_HEX, TIER_WORD, bandLabel, bandPastel, daysAgo, hoursLabel, minutesSince, pastelAt } from '@/lib/tokens'
import { STAGE_LABEL } from '@/lib/format'
import { ChipRow } from '@/components/ui/Chips'
import { ContinueBar, PanelCard, ProblemCard, SectionHead, TwoToneCard } from '@/components/ui/Cards'
import { ActivityChart } from '@/components/ui/ActivityChart'
import { BandPill, CardSkeleton, Dropdown, StatPill, Tag } from '@/components/ui/Pills'
import { Panel, PanelHeader, PanelIdentity } from '@/components/shell/Panel'
import { useIdentity } from '@/components/IdentityGate'

const STAGE_INDEX = { design: 1, change: 2, defend: 3 } as const

const LOOP = [
  { n: '1', t: 'Design', pastel: 'pink', b: 'Declare your classes, relationships and decisions — then walk three scenarios through the design you just built.' },
  { n: '2', t: 'Change', pastel: 'peach', b: 'A hidden requirement change is revealed. Revise, and we measure the blast radius across your classes.' },
  { n: '3', t: 'Defend', pastel: 'lav', b: 'Answer up to three probes in prose. Every finding cites a class or step from your own design.' },
] as const

export default function Dashboard() {
  const { data, error } = useLibrary()
  if (error) return <p className="text-[14px] text-tint-rose">{error}</p>
  if (!data || !data.progress) return <DashboardSkeleton />
  return data.progress.attempts === 0 ? <FirstVisit data={data} /> : <Returning data={data} />
}

/* ------------------------------------------------------------------------- */
/* Returning learner                                                          */
/* ------------------------------------------------------------------------- */

function Returning({ data }: { data: NonNullable<ReturnType<typeof useLibrary>['data']> }) {
  const progress = data.progress!
  const [chip, setChip] = useState('all')
  const [range, setRange] = useState<'7' | '12'>('7')
  const chips = useMemo(() => chipsFor(data.concepts, data.problems), [data])
  const byId = useMemo(() => new Map(data.problems.map((p) => [p.id, p])), [data.problems])

  // Recommended: the coach's next pick, then the open attempt's problem, then
  // by recency, then what has not been tried. Four, unless a chip narrows it.
  const recommended = useMemo(() => {
    const seen = new Set<string>()
    const out: ProblemSummary[] = []
    const push = (p?: ProblemSummary) => { if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p) } }
    if (chip === 'all') {
      push(data.next ? byId.get(data.next.problemId) : undefined)
      push(progress.openAttempt ? byId.get(progress.openAttempt.problemId) : undefined)
      for (const p of [...data.problems].sort((a, b) => (b.lastAttemptAt ?? '').localeCompare(a.lastAttemptAt ?? ''))) push(p)
      return out.slice(0, 4)
    }
    return data.problems.filter((p) => p.conceptTags.includes(chip))
  }, [chip, data, byId, progress.openAttempt])

  const open = progress.openAttempt
  const openProblem = open ? byId.get(open.problemId) : undefined
  const lastDone = progress.recent.find((a) => a.overall !== null)
  const lastDoneProblem = lastDone ? byId.get(lastDone.problemId) : undefined
  const months = progress.activity.slice(range === '7' ? -7 : -12)
  const recentDots = progress.recent.filter((a) => a.overall !== null).slice(0, 3)

  return (
    <>
      <h2 className="h-hero">Design under<br />pressure.</h2>
      <ChipRow items={chips} active={chip} onChange={setChip} />

      <section className="flex flex-col gap-4">
        <SectionHead title={chip === 'all' ? 'Recommended for you' : chips.find((c) => c.id === chip)?.label ?? ''} right={`${data.problems.length} problems`} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {recommended.map((p, i) => {
            const cat = primaryConcept(data.concepts, p.conceptTags)
            return (
              <ProblemCard
                key={p.id}
                href={`/learn/${p.id}`}
                title={p.title}
                category={cat.label}
                icon={cat.icon}
                pastel={pastelAt(i)}
                band={p.bestOverall}
              started={p.attemptCount > 0}
                tag={data.next?.problemId === p.id ? { label: 'Recommended', icon: 'bookmark' } : undefined}
                statusPill={open?.problemId === p.id ? 'In progress' : undefined}
                meta={p.attemptCount > 0 ? `${p.attemptCount} attempt${p.attemptCount === 1 ? '' : 's'} · last ${daysAgo(p.lastAttemptAt!)}` : `Not attempted · about ${p.minutes} min`}
                concepts={conceptItems(data.concepts, p.conceptTags)}
              />
            )
          })}
          {recommended.length === 0 && <p className="text-[14px] text-muted">No playable problem is tagged with that concept yet.</p>}
        </div>
      </section>

      {open && (
        <section className="flex flex-col gap-4">
          <SectionHead title="Continue where you left off" />
          <ContinueBar href={`/practice/${open.attemptId}`} eyebrow={`${STAGE_LABEL[open.stage]} stage · ${STAGE_INDEX[open.stage]} of 3`} title={open.problemTitle} cta="Resume attempt" />
        </section>
      )}

      <Panel>
        <PanelHeader />
        <PanelIdentity />
        <StatPill
          icon="flame"
          pastel="bg-lilac"
          label={`${progress.streakDays}-day streak`}
          href="/progress"
          trailing={
            <span className="flex pl-1.5">
              {recentDots.map((a) => (
                <span key={a.id} className="-ml-1.5 h-6 w-6 rounded-full border-2 border-white" style={{ background: PASTEL_HEX[bandPastel(a.overall!)] }} title={`${a.problemTitle}: ${bandLabel(a.overall!)}`} />
              ))}
            </span>
          }
        />
        <PanelCard>
          <div className="flex items-center justify-between">
            <span className="text-[16px] font-medium leading-none text-ink-strong">Activity</span>
            <Dropdown label="Range" value={range} onChange={setRange} options={[{ value: '7', label: '7 months' }, { value: '12', label: 'Year' }]} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[32px] font-medium leading-none tracking-[-0.02em] text-ink-strong">{hoursLabel(progress.practiceSeconds)}</span>
            <Tag soft>{progress.attempts} attempt{progress.attempts === 1 ? '' : 's'}</Tag>
          </div>
          <ActivityChart months={months} />
        </PanelCard>

        {open && openProblem && (
          <>
            <h3 className="h-section">Open attempt</h3>
            <TwoToneCard
              pastel="pink"
              href={`/practice/${open.attemptId}`}
              category={primaryConcept(data.concepts, openProblem.conceptTags).label}
              icon={primaryConcept(data.concepts, openProblem.conceptTags).icon}
              tag="In progress"
              title={open.problemTitle}
              meta={`${STAGE_LABEL[open.stage]} stage · ${minutesSince(open.startedAt)} min in`}
              concepts={conceptItems(data.concepts, openProblem.conceptTags)}
            />
          </>
        )}

        {lastDone && lastDoneProblem && (
          <>
            <h3 className="h-section">Recent</h3>
            <TwoToneCard
              pastel="peach"
              href={`/report/${lastDone.id}`}
              category={primaryConcept(data.concepts, lastDoneProblem.conceptTags).label}
              icon={primaryConcept(data.concepts, lastDoneProblem.conceptTags).icon}
              tag={<BandPill score={lastDone.overall!} onWhite />}
              title={lastDone.problemTitle}
              meta={`Attempt ${lastDone.attemptNumber} · ${daysAgo(lastDone.createdAt)}`}
              concepts={conceptItems(data.concepts, lastDoneProblem.conceptTags)}
            />
          </>
        )}
      </Panel>
    </>
  )
}

/* ------------------------------------------------------------------------- */
/* First visit                                                                */
/* ------------------------------------------------------------------------- */

function FirstVisit({ data }: { data: NonNullable<ReturnType<typeof useLibrary>['data']> }) {
  const router = useRouter()
  const { learner } = useIdentity()
  const [busy, setBusy] = useState(false)
  // The catalogue's first problem is the authored starting point (Parking Lot), not the shortest.
  const first = data.problems.find((p) => p.tier === 1) ?? data.problems[0]!
  const cat = primaryConcept(data.concepts, first.conceptTags)
  const avgMinutes = Math.round(data.problems.reduce((a, p) => a + p.minutes, 0) / data.problems.length)

  async function start() {
    setBusy(true)
    try {
      const { attempt } = await api.startAttempt(first.id)
      router.push(`/practice/${attempt.id}`)
    } catch {
      setBusy(false)
    }
  }

  return (
    <>
      <h2 className="h-hero">Practise real<br />system design.</h2>
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={start} disabled={busy} className="btn-primary h-16 px-8 text-[16px]">
          {busy ? 'Starting…' : 'Start your first problem'}
        </button>
        <span className="text-[14px] leading-relaxed text-muted">{data.problems.length} problems · one attempt takes about {avgMinutes} minutes</span>
      </div>

      <section className="flex flex-col gap-4">
        <SectionHead title="How one attempt runs" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {LOOP.map((s, i) => (
            <motion.div key={s.n} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="flex h-[300px] flex-col justify-between rounded-3xl p-7" style={{ background: PASTEL_HEX[s.pastel] }}>
              <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-[14px] font-medium leading-none text-ink-strong">{s.n}</span>
              <div className="flex flex-col gap-3">
                <h4 className="h-card">{s.t}</h4>
                <p className="text-[14px] leading-[1.55] text-ink-2">{s.b}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <SectionHead title="Start here" />
        <ProblemCard
          href={`/learn/${first.id}`}
          title={first.title}
          category={cat.label}
          icon={cat.icon}
          pastel="pink"
          band={null}
          statusPill={`★ ${TIER_WORD[first.tier] ?? 'Gentle'}`}
          meta={`No attempts yet · about ${first.minutes} min`}
        />
      </section>

      <Panel>
        <PanelHeader />
        <PanelIdentity sub={learner.createdAt ? `Joined ${daysAgo(learner.createdAt)}` : undefined} />
        <PanelCard title="Activity">
          <ActivityChart months={data.progress!.activity.slice(-7)} empty />
          <p className="text-[14px] leading-relaxed text-muted">Your first attempt fills this in. Bars stack by stage — Design, Change, Defend, Critique.</p>
        </PanelCard>
        <PanelCard title="Warm up first?">
          <p className="text-[14px] leading-[1.55] text-muted">Critique compares two authored designs and asks you to click the deciding class. Three minutes, no score.</p>
          <a href={`/critique/${first.id}`} className="btn-secondary btn-xs mt-1.5 self-start">Try a critique</a>
        </PanelCard>
      </Panel>
    </>
  )
}

function DashboardSkeleton() {
  return (
    <>
      <div className="h-[150px] w-2/3 rounded-3xl bg-panel" />
      <div className="flex gap-3">{[0, 1, 2, 3].map((i) => <span key={i} className="h-16 w-36 rounded-full bg-panel" />)}</div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <CardSkeleton key={i} h={212} />)}</div>
      <Panel><div className="flex flex-col gap-5"><span className="h-8" /><span className="mx-auto h-20 w-20 rounded-full bg-skel" /><CardSkeleton h={320} /></div></Panel>
    </>
  )
}
