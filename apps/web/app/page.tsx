'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import type { Concept, ProblemSummary, ProgressPayload } from '@lld/contracts'
import { api } from '@/lib/api'
import { pluralise, scoreTone } from '@/lib/format'
import { ProblemCard } from '@/components/ProblemCard'
import { CoachCard } from '@/components/CoachCard'
import { ContinueCard } from '@/components/ContinueCard'
import { StatStrip } from '@/components/StatStrip'
import { ConceptChip, MasteryRing } from '@/components/Mastery'
import { stagger, riseIn } from '@/components/motion'

const TONE_TEXT = { critical: 'text-critical', caution: 'text-caution', positive: 'text-positive' } as const

/**
 * The dashboard. A returning learner sees where they are; a new one sees how the
 * loop works and one button. Everything on this page is derived from evidence the
 * evaluator already produced — there is no separate "engagement" model.
 */
export default function DashboardPage() {
  const [progress, setProgress] = useState<ProgressPayload | null>(null)
  const [problems, setProblems] = useState<ProblemSummary[] | null>(null)
  const [concepts, setConcepts] = useState<Concept[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.getProgress(), api.listProblems(), api.getConcepts()])
      .then(([p, l, c]) => {
        setProgress(p)
        setProblems(l.problems)
        setConcepts(c.concepts)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [])

  if (error) {
    return (
      <div className="card mt-6 border-critical/30 bg-critical/5 p-4 text-sm text-critical">
        {error}. Is the API running on port 4000?
      </div>
    )
  }
  if (!progress || !problems || !concepts) return <DashboardSkeleton />
  const byId = new Map(concepts.map((c) => [c.id, c]))
  const names = new Map(concepts.map((c) => [c.id, c.name]))
  if (progress.attempts === 0) return <FirstVisit problems={problems} names={names} />

  const path = pickPath(progress)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div>
      <motion.header initial="hidden" animate="show" variants={riseIn} className="mb-6 mt-4">
        <h1 className="text-[28px] font-semibold tracking-tight">{greeting}.</h1>
        <p className="mt-1 text-[15px] text-ink-muted">{statusLine(progress)}</p>
      </motion.header>

      <div className="space-y-4">
        {progress.openAttempt && <ContinueCard open={progress.openAttempt} />}
        {(progress.coach || (progress.next && !progress.openAttempt)) && (
          <CoachCard note={progress.coach} next={progress.openAttempt ? null : progress.next} />
        )}

        <StatStrip
          stats={[
            { label: 'Problems', value: progress.problemsTried, hint: `of ${problems.length} playable` },
            { label: 'Attempts', value: progress.attempts, hint: `${progress.stagesCompleted.defend} defended` },
            { label: 'Criteria at par', value: `${progress.criteriaAtPar}/8`, hint: 'averaging 3 or better' },
            { label: 'Streak', value: pluralise(progress.streakDays, 'day'), hint: progress.streakDays > 0 ? 'keep it going' : 'practise today' },
          ]}
        />

        <div className="grid gap-4 lg:grid-cols-5">
          <motion.section initial="hidden" animate="show" variants={riseIn} className="card p-5 lg:col-span-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold tracking-tight">Your path</h2>
              <Link href="/concepts" className="text-xs text-brand hover:underline">
                Full map →
              </Link>
            </div>
            <p className="mt-1 text-[13px] text-ink-muted">
              The concepts your recent attempts say the most about. Solid is an average of 3 or better
              across the criteria that speak to it.
            </p>
            <ul className="mt-4 space-y-3">
              {path.map((m) => {
                const c = byId.get(m.conceptId)
                if (!c) return null
                return (
                  <li key={m.conceptId} className="flex items-center gap-3">
                    <MasteryRing mastery={m} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="truncate text-[12px] text-ink-muted">{m.level === 'solid' ? c.plain : c.tell}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </motion.section>

          <motion.section initial="hidden" animate="show" variants={riseIn} className="card p-5 lg:col-span-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold tracking-tight">Recent</h2>
              <Link href="/progress" className="text-xs text-brand hover:underline">
                All progress →
              </Link>
            </div>
            <ul className="mt-3 divide-y divide-line">
              {progress.recent.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <Link
                    href={a.state === 'DRAFT' ? `/practice/${a.id}` : `/report/${a.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-raised"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{a.problemTitle}</p>
                      <p className="text-[11px] text-ink-faint">
                        attempt {a.attemptNumber} · {a.stagesCompleted.length}/3 stages
                      </p>
                    </div>
                    {a.overall !== null ? (
                      <span className={`text-sm font-semibold tabular-nums ${TONE_TEXT[scoreTone(a.overall)]}`}>{a.overall.toFixed(1)}</span>
                    ) : (
                      <span className="text-[11px] text-ink-faint">open</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </motion.section>
        </div>

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight">Problems</h2>
            <Link href="/learn" className="text-xs text-brand hover:underline">
              See all {problems.length} →
            </Link>
          </div>
          <motion.ul initial="hidden" animate="show" variants={stagger} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orderForDashboard(problems).slice(0, 3).map((p) => (
              <ProblemCard key={p.id} problem={p} conceptNames={names} />
            ))}
          </motion.ul>
        </section>

        <div className="pt-2">
          <ConceptStrip progress={progress} concepts={concepts} />
        </div>
      </div>
    </div>
  )
}

/** Three concepts: the two weakest with evidence, then the strongest — a picture, not a ranking. */
function pickPath(progress: ProgressPayload) {
  const withEvidence = progress.conceptMastery.filter((m) => m.evidenceCount > 0 && m.average !== null)
  const asc = [...withEvidence].sort((a, b) => a.average! - b.average!)
  const weakest = asc.slice(0, 2)
  const strongest = asc.slice(-1).filter((m) => !weakest.includes(m))
  return [...weakest, ...strongest]
}

function statusLine(p: ProgressPayload): string {
  if (p.recurringWeaknesses[0]) {
    return `${p.recurringWeaknesses[0].criterionName} keeps coming up. That is the thing to work on next.`
  }
  if (p.openAttempt) return `You have an attempt open on ${p.openAttempt.problemTitle}.`
  if (p.criteriaAtPar >= 6) return 'Most criteria are at par. Time for a harder problem.'
  return `${pluralise(p.attempts, 'attempt')} across ${pluralise(p.problemsTried, 'problem')} so far.`
}

/** Unfinished business first, then untried, then the rest. */
function orderForDashboard(problems: ProblemSummary[]): ProblemSummary[] {
  return [...problems].sort((a, b) => {
    const rank = (p: ProblemSummary) => (p.attemptCount === 0 ? 1 : p.bestOverall !== null && p.bestOverall < 3 ? 0 : 2)
    return rank(a) - rank(b)
  })
}

function ConceptStrip({ progress, concepts }: { progress: ProgressPayload; concepts: Concept[] }) {
  const byId = new Map(concepts.map((c) => [c.id, c]))
  const shown = progress.conceptMastery.filter((m) => m.evidenceCount > 0)
  if (shown.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] uppercase tracking-wide text-ink-faint">Evidence so far</span>
      {shown.map((m) => (
        <ConceptChip key={m.conceptId} id={m.conceptId} name={byId.get(m.conceptId)?.name} level={m.level} />
      ))}
    </div>
  )
}

/**
 * The first visit. No stats to show, so show the loop: what you will do, why it is
 * shaped this way, and one place to start.
 */
function FirstVisit({ problems, names }: { problems: ProblemSummary[]; names: Map<string, string> }) {
  const router = useRouter()
  const [starting, setStarting] = useState(false)
  const first = problems[0]

  async function start() {
    if (!first) return
    setStarting(true)
    try {
      const { attempt } = await api.startAttempt(first.id)
      router.push(`/practice/${attempt.id}`)
    } catch {
      setStarting(false)
    }
  }

  const steps = [
    { n: 1, title: 'Design it, then run it', body: 'Sketch the classes, then walk three scenarios through them step by step. A design that cannot be walked is not a design yet.' },
    { n: 2, title: 'The requirements change', body: 'Only after your design is frozen and reviewed. You revise; the blast radius is measured from the diff, not judged.' },
    { n: 3, title: 'Defend it', body: 'Three questions chosen from what the review found in your design, worded around your own class names.' },
  ]

  return (
    <div>
      <motion.header initial="hidden" animate="show" variants={riseIn} className="mb-8 mt-6 max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">Low-level design, practised</p>
        <h1 className="mt-2 text-[32px] font-semibold leading-tight tracking-tight">
          Feedback that points at <em className="not-italic text-brand">your</em> design — not at an answer you were meant to guess.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          Six of eight criteria are measured from your class graph, your walkthroughs and your diff. Two are read by an
          AI mentor. Every finding cites something you wrote.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={start} disabled={starting || !first} className="btn-primary">
            {starting ? 'Starting…' : `Start with ${first?.title ?? 'a problem'}`}
          </button>
          {first && first.critiquePairCount > 0 && (
            <Link href={`/critique/${first.id}`} className="btn-quiet">
              Warm up first · 4 min
            </Link>
          )}
        </div>
      </motion.header>

      <motion.ol initial="hidden" animate="show" variants={stagger} className="mb-10 grid gap-4 sm:grid-cols-3">
        {steps.map((s) => (
          <motion.li key={s.n} variants={riseIn} className="card list-none p-5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-soft font-mono text-sm font-semibold text-brand">{s.n}</span>
            <h2 className="mt-3 text-[15px] font-semibold tracking-tight">{s.title}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{s.body}</p>
          </motion.li>
        ))}
      </motion.ol>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Problems</h2>
          <Link href="/learn" className="text-xs text-brand hover:underline">
            The library →
          </Link>
        </div>
        <motion.ul initial="hidden" animate="show" variants={stagger} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {problems.slice(0, 3).map((p) => (
            <ProblemCard key={p.id} problem={p} conceptNames={names} />
          ))}
        </motion.ul>
      </section>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="mt-4 space-y-4">
      <div className="skeleton h-8 w-56" />
      <div className="skeleton h-4 w-80" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card h-20 p-4" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card h-56 lg:col-span-3" />
        <div className="card h-56 lg:col-span-2" />
      </div>
    </div>
  )
}
