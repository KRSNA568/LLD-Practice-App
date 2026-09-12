'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ADVANCEABLE_STATES,
  IN_FLIGHT_STATES,
  nextStage,
  STAGES,
  type Attempt,
  type AttemptNotes,
  type EvaluationReport,
  type MicroLesson,
  type EvidenceRef,
  type PublicProblem,
  type Rubric,
  type Stage,
} from '@lld/contracts'
import { api } from '@/lib/api'
import { CriterionCard } from '@/components/CriterionCard'
import { MentorNote } from '@/components/MentorNote'
import { LessonDrawer } from '@/components/LessonDrawer'
import { SubmittedDesign } from '@/components/SubmittedDesign'
import { DesignDiffView } from '@/components/DesignDiff'
import { StageRail } from '@/components/StageRail'
import { Counter } from '@/components/Counter'
import { stagger, riseIn } from '@/components/motion'
import { scoreTone, STAGE_LABEL } from '@/lib/format'

const TONE_TEXT = {
  critical: 'text-critical',
  caution: 'text-caution',
  positive: 'text-positive',
} as const

const STAGE_INTRO: Record<Stage, string> = {
  design: 'What the structure and the walkthroughs prove, plus one judged reading of your assumptions.',
  change: 'How much of the design had to be reopened when the requirements moved — measured from the diff.',
  defend: 'How well the decisions held up under questioning.',
}

const CONTINUE_LABEL: Record<Stage, string> = {
  design: '',
  change: 'Continue — the requirements are about to change',
  defend: 'Continue — defend your decisions',
}

export default function ReportPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const router = useRouter()

  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [problem, setProblem] = useState<PublicProblem | null>(null)
  const [rubric, setRubric] = useState<Rubric | null>(null)
  const [highlight, setHighlight] = useState<EvidenceRef | null>(null)
  const [side, setSide] = useState<'yours' | 'diff' | 'exemplar'>('yours')
  const [busy, setBusy] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const [notes, setNotes] = useState<AttemptNotes | null>(null)
  const notesTimer = useRef<ReturnType<typeof setTimeout>>()
  const notesStarted = useRef<number>(0)
  const [lesson, setLesson] = useState<{ criterionId: string; title: string; data: (MicroLesson & { modelId: string }) | null; loading: boolean; failed: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const { attempt } = await api.getAttempt(attemptId)
        if (cancelled) return
        setAttempt(attempt)

        if (!rubric) {
          const { problem, rubric } = await api.getProblem(attempt.problemId)
          if (!cancelled) {
            setProblem(problem)
            setRubric(rubric)
          }
        }

        // Stop as soon as evaluation settles — including on failure, which is a
        // final answer rather than a reason to keep asking.
        if (IN_FLIGHT_STATES.includes(attempt.state)) {
          timer.current = setTimeout(poll, 900)
        }
      } catch {
        if (!cancelled) timer.current = setTimeout(poll, 2000)
      }
    }

    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId])

  // The mentor writes after the scores land, on its own queue. Poll for the note
  // of the stage just completed for up to 25s, then stop and show nothing —
  // never a placeholder pretending to be a note.
  const settledStages = attempt?.report?.stagesCompleted.join(',') ?? ''
  useEffect(() => {
    if (!attempt?.report) return
    let cancelled = false
    notesStarted.current = Date.now()

    async function pollNotes() {
      try {
        const n = await api.getNotes(attemptId)
        if (cancelled) return
        setNotes(n)
        const latest = attempt!.report!.stagesCompleted.at(-1)
        const waiting = latest && !n.review[latest] && Date.now() - notesStarted.current < 25_000
        if (waiting) notesTimer.current = setTimeout(pollNotes, 1500)
      } catch {
        if (!cancelled) notesTimer.current = setTimeout(pollNotes, 3000)
      }
    }
    void pollNotes()
    return () => {
      cancelled = true
      clearTimeout(notesTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, settledStages])

  async function learn(criterionId: string, title: string) {
    const cached = notes?.lessons[criterionId]
    if (cached) {
      setLesson({ criterionId, title, data: cached, loading: false, failed: false })
      return
    }
    setLesson({ criterionId, title, data: null, loading: true, failed: false })
    try {
      const r = await api.requestLesson(attemptId, criterionId)
      setLesson({ criterionId, title, data: r?.lesson ?? null, loading: false, failed: !r?.lesson })
      if (r?.lesson) setNotes((n) => (n ? { ...n, lessons: { ...n.lessons, [criterionId]: r.lesson } } : n))
    } catch {
      setLesson({ criterionId, title, data: null, loading: false, failed: true })
    }
  }

  function cite(ref: EvidenceRef) {
    setHighlight(ref)
    if (side !== 'yours' && ref.kind !== 'class') setSide('yours')
    const id =
      ref.kind === 'class'
        ? `class-${ref.name.toLowerCase()}`
        : ref.kind === 'assumption'
          ? `assumption-${ref.index}`
          : ref.kind === 'decision'
            ? `decision-${ref.index}`
            : ref.kind === 'step'
              ? `step-${ref.scenarioId}-${ref.index}`
              : ref.kind === 'prose'
                ? ref.field === 'tradeoffs'
                  ? 'prose-tradeoffs'
                  : ref.field === 'answer'
                    ? `answer-${ref.probeId ?? ''}`
                    : 'prose-rationale'
                : null
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function retry() {
    setBusy(true)
    try {
      await api.retry(attemptId)
      const { attempt } = await api.getAttempt(attemptId)
      setAttempt(attempt)
      timer.current = setTimeout(() => window.location.reload(), 900)
    } finally {
      setBusy(false)
    }
  }

  async function advance() {
    setBusy(true)
    try {
      await api.advance(attemptId)
      router.push(`/practice/${attemptId}`)
    } catch {
      setBusy(false)
    }
  }

  async function tryAgain() {
    if (!attempt) return
    const { attempt: fresh } = await api.startAttempt(attempt.problemId)
    router.push(`/practice/${fresh.id}`)
  }

  if (!attempt) return <EvaluatingState label="Loading…" />

  if (IN_FLIGHT_STATES.includes(attempt.state)) {
    return (
      <EvaluatingState
        label={
          attempt.state === 'SUBMITTED'
            ? 'Saved. Queued for review…'
            : attempt.stage === 'change'
              ? 'Measuring what changed…'
              : attempt.stage === 'defend'
                ? 'Reading your answers…'
                : 'Reviewing your design…'
        }
      />
    )
  }

  const { report } = attempt
  const failedStage = attempt.state === 'FAILED'

  if (!report && (failedStage || attempt.state === 'DRAFT')) {
    return (
      <motion.div initial="hidden" animate="show" variants={riseIn} className="mx-auto max-w-lg pt-16">
        <div className="card p-6 text-center">
          <h1 className="text-lg font-semibold">
            {attempt.state === 'DRAFT' ? 'Nothing submitted yet' : 'Evaluation could not finish'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            {attempt.state === 'DRAFT'
              ? 'This attempt is still a draft.'
              : attempt.failureReason ?? 'Something went wrong while reviewing this design.'}
          </p>
          {attempt.state === 'DRAFT' ? (
            <Link href={`/practice/${attemptId}`} className="btn-primary mt-5 inline-flex">
              Back to the workspace
            </Link>
          ) : (
            <>
              <p className="mt-2 text-xs text-ink-faint">
                Your submission is saved — nothing was lost, and retrying does not ask you to enter it again.
              </p>
              <button onClick={retry} disabled={busy} className="btn-primary mt-5">
                {busy ? 'Retrying…' : 'Retry evaluation'}
              </button>
            </>
          )}
        </div>
      </motion.div>
    )
  }

  if (!report) return <EvaluatingState label="Loading…" />

  const partial = report.summary.aiUnavailable
  const next = nextStage(attempt.stage)
  const canAdvance = next !== null && ADVANCEABLE_STATES.includes(attempt.state)
  const finished = next === null && ADVANCEABLE_STATES.includes(attempt.state)
  const latestDesign = attempt.revision?.design ?? attempt.design
  const stagesShown = STAGES.filter((s) => report.results.some((r) => r.stage === s))

  return (
    <div className="space-y-5">
      <motion.div initial="hidden" animate="show" variants={riseIn}>
        <StageRail current={attempt.stage} completed={report.stagesCompleted} runStarted={!!attempt.design?.walkthroughs.length} />
      </motion.div>

      <motion.header initial="hidden" animate="show" variants={riseIn} className="mt-1">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-faint">
              {problem?.title ?? 'Design'} · Attempt {attempt.attemptNumber}
            </p>
            <h1 className="mt-0.5 text-[26px] font-semibold tracking-tight">
              {finished ? 'Full review' : `Review so far`}
            </h1>
            <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-ink-muted">{whatThisMeans(report, rubric)}</p>
          </div>

          <div className="flex items-center gap-5">
            <div className="text-right">
              <div className={`text-3xl font-semibold tabular-nums ${TONE_TEXT[scoreTone(report.summary.overall)]}`}>
                <Counter value={report.summary.overall} />
                <span className="text-base text-ink-faint">/4</span>
              </div>
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">
                {report.summary.criteriaScored} of {report.summary.criteriaTotal} criteria
              </p>
            </div>
            <div className="flex gap-2">
              <Link href={`/history/${attempt.problemId}`} className="btn-quiet">
                History
              </Link>
              {canAdvance ? (
                <button onClick={advance} disabled={busy} className="btn-primary">
                  {busy ? 'Opening…' : CONTINUE_LABEL[next!]}
                </button>
              ) : (
                <button onClick={tryAgain} className="btn-primary">
                  Try again
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {failedStage && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="card border-critical/30 bg-critical/5 p-4">
            <p className="text-sm font-medium text-critical">The {STAGE_LABEL[attempt.stage].toLowerCase()} stage could not be evaluated</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              {attempt.failureReason ?? 'The evaluator failed.'} Everything below is from the stages that did complete.
            </p>
            <button onClick={retry} disabled={busy} className="btn-quiet mt-3">
              {busy ? 'Retrying…' : 'Retry this stage'}
            </button>
          </motion.div>
        )}

        {partial && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="card border-caution/30 bg-caution/5 p-4">
            <p className="text-sm font-medium text-caution">AI review unavailable</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              The measured criteria below ran normally and are complete. The judged criteria are
              missing from this report rather than guessed at.
            </p>
          </motion.div>
        )}

        {report.unchangedFromPrevious && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="card border-line p-4">
            <p className="text-sm font-medium">This is the same design as last time</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              Nothing substantive changed since your previous attempt, so the feedback will not
              either. Try acting on one suggestion before resubmitting.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-5 lg:grid-cols-[1fr_400px] lg:items-start">
        <div className="space-y-8">
          {stagesShown.map((stage) => (
            <section key={stage}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-[15px] font-semibold tracking-tight">{STAGE_LABEL[stage]}</h2>
                <p className="text-xs text-ink-faint">{STAGE_INTRO[stage]}</p>
              </div>

              <MentorNote
                text={notes?.review[stage]?.text ?? null}
                pending={!notes || (!notes.review[stage] && stage === report.stagesCompleted.at(-1) && Date.now() - notesStarted.current < 25_000)}
                live={notes?.live ?? false}
              />

              {stage === 'change' && attempt.design && attempt.revision && (
                <div className="mb-4">
                  <DesignDiffView before={attempt.design} after={attempt.revision.design} highlight={highlight} />
                  {attempt.revision.rationale && (
                    <p id="prose-rationale" className="mt-3 rounded-xl bg-raised px-4 py-3 text-[13px] leading-relaxed text-ink-muted">
                      <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Your rationale</span>
                      {attempt.revision.rationale}
                    </p>
                  )}
                </div>
              )}

              {stage === 'defend' && attempt.probes && attempt.answers && (
                <ol className="mb-4 space-y-2">
                  {attempt.probes.map((p) => {
                    const a = attempt.answers!.find((x) => x.probeId === p.id)
                    const lit = highlight?.kind === 'prose' && highlight.field === 'answer' && highlight.probeId === p.id
                    return (
                      <li key={p.id} id={`answer-${p.id}`} className={`rounded-xl border px-4 py-3 transition-colors ${lit ? 'border-brand/50 bg-brand-soft' : 'border-line bg-raised/40'}`}>
                        <p className="text-[13px] font-medium">{p.prompt}</p>
                        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{a?.response?.trim() || <em>No answer.</em>}</p>
                      </li>
                    )
                  })}
                </ol>
              )}

              <motion.ul initial="hidden" animate="show" variants={stagger} className="space-y-4">
                {report.results
                  .filter((r) => r.stage === stage)
                  .map((result) => (
                    <CriterionCard
                      key={result.criterionId}
                      result={result}
                      criterion={rubric?.criteria.find((c) => c.id === result.criterionId)}
                      onCite={cite}
                      onLearn={
                        notes?.lessonable.includes(result.criterionId)
                          ? () => learn(result.criterionId, rubric?.criteria.find((c) => c.id === result.criterionId)?.name ?? result.criterionId)
                          : undefined
                      }
                      learnLabel={notes?.lessons[result.criterionId] ? 'Reopen the lesson' : 'Learn the concept behind this'}
                    />
                  ))}
              </motion.ul>
            </section>
          ))}

          {canAdvance && (
            <motion.div initial="hidden" animate="show" variants={riseIn} className="card border-brand/25 bg-brand-soft/40 p-5">
              <p className="text-sm font-semibold">
                {next === 'change' ? 'Now the requirements change.' : 'Now defend it.'}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
                {next === 'change'
                  ? 'Your design is frozen. You are about to be shown a requirement you did not know was coming, and asked to revise. What gets measured is how much of the design you have to reopen.'
                  : 'Three questions, chosen from what the review found. Answer them as you would across the table.'}
              </p>
              <button onClick={advance} disabled={busy} className="btn-primary mt-4">
                {busy ? 'Opening…' : CONTINUE_LABEL[next!]}
              </button>
            </motion.div>
          )}
        </div>

        <div className="space-y-3 lg:sticky lg:top-20">
          <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
            {(
              [
                ['yours', 'Your design'],
                ['diff', 'Diff'],
                ['exemplar', 'A strong design'],
              ] as const
            ).map(([id, label]) => {
              const enabled = id === 'yours' || (id === 'diff' ? !!attempt.revision : !!attempt.exemplar)
              return (
                <button
                  key={id}
                  disabled={!enabled}
                  onClick={() => setSide(id)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-35 ${
                    side === id ? 'bg-brand-soft text-brand' : 'text-ink-muted hover:bg-raised'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {side === 'yours' && latestDesign && (
            <SubmittedDesign
              design={latestDesign}
              highlight={highlight}
              scenarios={problem?.scenarios ?? []}
              title={attempt.revision ? 'Your revised design' : 'Your design'}
            />
          )}
          {side === 'diff' && attempt.design && attempt.revision && (
            <DesignDiffView before={attempt.design} after={attempt.revision.design} highlight={highlight} />
          )}
          {side === 'exemplar' && attempt.exemplar && (
            <div className="space-y-2">
              <p className="px-1 text-xs leading-relaxed text-ink-faint">
                One strong design for this problem — not <em>the</em> answer. Compare it against the
                criterion you scored lowest on, not the whole thing.
              </p>
              <SubmittedDesign design={attempt.exemplar} highlight={highlight} scenarios={problem?.scenarios ?? []} title="A strong design" compact />
            </div>
          )}
        </div>
      </div>
      <LessonDrawer
        open={lesson !== null}
        title={lesson?.title ?? ''}
        lesson={lesson?.data ?? null}
        loading={lesson?.loading ?? false}
        failed={lesson?.failed ?? false}
        onClose={() => setLesson(null)}
      />
    </div>
  )
}

function EvaluatingState({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-md pt-24 text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
        className="mx-auto grid h-11 w-11 place-items-center rounded-2xl border-2 border-line border-t-brand"
      />
      <motion.p key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-5 text-sm text-ink-muted">
        {label}
      </motion.p>
      <p className="mt-1.5 text-xs text-ink-faint">Your submission is already saved. This page updates itself.</p>
    </div>
  )
}

/**
 * One sentence over the whole report: the two lowest criteria, named, with the
 * stage they came from. A deterministic stand-in for the mentor's note, so the
 * layout has a place for it and a learner without an AI key still gets a summary.
 */
function whatThisMeans(report: EvaluationReport, rubric: Rubric | null): string {
  const byId = new Map((rubric?.criteria ?? []).map((c) => [c.id, c]))
  const sorted = [...report.results].sort((a, b) => a.score - b.score)
  const low = sorted.filter((r) => r.score <= 2).slice(0, 2)
  if (low.length === 0) return 'Nothing scored below par. The next problem up is where this gets interesting.'
  const names = low.map((r) => (byId.get(r.criterionId)?.name ?? r.criterionId).toLowerCase())
  const first = names.length === 1 ? names[0]! : `${names[0]} and ${names[1]}`
  return `The findings that matter most are about ${first}. Start with the top card below — its evidence chips point at the exact rows.`
}
