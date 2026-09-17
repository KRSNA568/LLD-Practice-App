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
  type DesignModel,
  type MicroLesson,
  type NextProblemSuggestion,
  type EvidenceRef,
  type PublicProblem,
  type Rubric,
  type Stage,
} from '@lld/contracts'
import { api } from '@/lib/api'
import { LessonDrawer } from '@/components/LessonDrawer'
import { SubmittedDesign } from '@/components/SubmittedDesign'
import { Panel } from '@/components/shell/Panel'
import { BandPill, EmptyState, EvidenceLink } from '@/components/ui/Pills'
import { PASTEL_BG, bandPastel } from '@/lib/tokens'
import { CRITERION_ORDER, STAGE_LABEL } from '@/lib/format'

export default function ReportPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const router = useRouter()

  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [problem, setProblem] = useState<PublicProblem | null>(null)
  const [rubric, setRubric] = useState<Rubric | null>(null)
  const [highlight, setHighlight] = useState<EvidenceRef | null>(null)
  const [side, setSide] = useState<'yours' | 'exemplar'>('yours')
  const [nextPick, setNextPick] = useState<NextProblemSuggestion | null>(null)
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
          api.getHistory(attempt.problemId).then((h) => !cancelled && setNextPick(h.next)).catch(() => {})
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

  const [explaining, setExplaining] = useState<string | null>(null)
  async function explain(criterionId: string) {
    setExplaining(criterionId)
    try {
      const r = await api.requestExplanation(attemptId, criterionId)
      if (r?.explanation) setNotes((n) => (n ? { ...n, explanations: { ...n.explanations, [criterionId]: r.explanation } } : n))
    } catch {
      /* the card still stands without it */
    } finally {
      setExplaining(null)
    }
  }

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
    if (side !== 'yours') setSide('yours')
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
      <div className="mx-auto w-full max-w-lg pt-10">
        <EmptyState
          icon={attempt.state === 'DRAFT' ? 'learn' : 'info'}
          title={attempt.state === 'DRAFT' ? 'Nothing submitted yet' : 'Evaluation could not finish'}
          body={attempt.state === 'DRAFT' ? 'This attempt is still a draft.' : `${attempt.failureReason ?? 'Something went wrong while reviewing this design.'} Your submission is saved — retrying does not ask you to enter it again.`}
        />
        <div className="mt-4 flex justify-center">
          {attempt.state === 'DRAFT' ? (
            <Link href={`/practice/${attemptId}`} className="btn-primary btn-sm">Back to the workspace</Link>
          ) : (
            <button onClick={retry} disabled={busy} className="btn-primary btn-sm">{busy ? 'Retrying…' : 'Retry evaluation'}</button>
          )}
        </div>
      </div>
    )
  }

  if (!report) return <EvaluatingState label="Loading…" />

  const partial = report.summary.aiUnavailable
  const next = nextStage(attempt.stage)
  const canAdvance = next !== null && ADVANCEABLE_STATES.includes(attempt.state)
  const finished = next === null && ADVANCEABLE_STATES.includes(attempt.state)
  const latestDesign = attempt.revision?.design ?? attempt.design
  const byId = new Map((rubric?.criteria ?? []).map((c) => [c.id, c]))
  const ordered = [...report.results].sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage) || CRITERION_ORDER.indexOf(a.criterionId) - CRITERION_ORDER.indexOf(b.criterionId))
  const minutes = Math.max(1, Math.round((new Date(attempt.updatedAt).getTime() - new Date(attempt.createdAt).getTime()) / 60000))
  const latestStage = report.stagesCompleted.at(-1)
  const notePending = !notes || (!!latestStage && !notes.review[latestStage] && Date.now() - notesStarted.current < 25_000)
  const noteStages = STAGES.filter((st) => notes?.review[st])
  const blast = report.results.find((r) => r.criterionId === 'change-resilience')
  const citedBy = highlight ? ordered.find((r) => r.evidence.some((e) => sameRef(e, highlight))) : undefined
  const diffRows = attempt.design && attempt.revision ? classify(attempt.design, attempt.revision.design) : null

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <h2 className="text-[64px] font-medium leading-[1.05] tracking-[-0.03em] text-ink-strong">
          Band {report.summary.overall.toFixed(1)}<br />{finished ? 'overall.' : 'so far.'}
        </h2>
        <span className="pill-soft mb-1.5">Attempt {attempt.attemptNumber} · {minutes} min</span>
        <Link href={`/history/${attempt.problemId}`} className="btn-ghost btn-xs mb-1.5 ml-auto">{problem?.title ?? 'History'} history</Link>
      </div>

      <AnimatePresence>
        {failedStage && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2 rounded-3xl bg-blush p-6">
            <p className="text-[15px] font-medium leading-none text-ink-strong">The {STAGE_LABEL[attempt.stage].toLowerCase()} stage could not be evaluated</p>
            <p className="text-[14px] leading-relaxed text-ink-2">{attempt.failureReason ?? 'The evaluator failed.'} Everything below is from the stages that did complete.</p>
            <button onClick={retry} disabled={busy} className="btn-secondary btn-xs self-start">{busy ? 'Retrying…' : 'Retry this stage'}</button>
          </motion.div>
        )}
        {partial && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2 rounded-3xl bg-apricot p-6">
            <p className="text-[15px] font-medium leading-none text-ink-strong">AI review unavailable</p>
            <p className="text-[14px] leading-relaxed text-ink-2">The measured criteria ran normally and are complete. The judged criteria are missing from this report rather than guessed at.</p>
          </motion.div>
        )}
        {report.unchangedFromPrevious && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2 rounded-3xl bg-soft p-6">
            <p className="text-[15px] font-medium leading-none text-ink-strong">This is the same design as last time</p>
            <p className="text-[14px] leading-relaxed text-muted">Nothing substantive changed since your previous attempt, so the feedback will not either. Try acting on one suggestion before resubmitting.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {ordered.map((result) => {
          const criterion = byId.get(result.criterionId)
          const lessonable = notes?.lessonable.includes(result.criterionId)
          const explanation = notes?.explanations[result.criterionId]
          return (
            <div key={result.criterionId} className={`flex flex-col gap-3 rounded-3xl p-[22px] ${PASTEL_BG[bandPastel(result.score)]}`}>
              <div className="flex items-center justify-between gap-2.5">
                <span className="text-[18px] font-medium leading-[1.2] tracking-[-0.01em] text-ink-strong">{criterion?.name ?? result.criterionId}</span>
                <span className="flex flex-none items-center gap-2">
                  {result.evaluatorKind === 'llm' && <span className="text-[11px] leading-none text-ink-2" title="Read by the AI reviewer, not measured">read</span>}
                  <BandPill score={result.score} decimals={0} onWhite size="sm" />
                </span>
              </div>
              <span className="text-[14px] leading-[1.5] text-ink">{result.concern}</span>
              <span className="text-[14px] leading-[1.5] text-ink-3">{result.suggestion}</span>
              {result.evidence.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {result.evidence.slice(0, 4).map((e, i) => (
                    <EvidenceLink key={i} onClick={() => cite(e)} active={!!highlight && sameRef(e, highlight)}>{refLabel(e, attempt)}</EvidenceLink>
                  ))}
                </div>
              )}
              {explanation && <p className="rounded-2xl bg-white/70 p-3.5 text-[13px] leading-[1.5] text-ink">{explanation.text}</p>}
              {notes && (
                <div className="flex flex-wrap gap-3 pt-0.5">
                  {!explanation && (
                    <button type="button" onClick={() => explain(result.criterionId)} disabled={explaining === result.criterionId} className="text-[13px] font-medium leading-none text-ink-strong underline-offset-4 hover:underline disabled:opacity-50">
                      {explaining === result.criterionId ? 'Asking…' : 'Why does this matter here?'}
                    </button>
                  )}
                  {lessonable && (
                    <button type="button" onClick={() => learn(result.criterionId, criterion?.name ?? result.criterionId)} className="text-[13px] font-medium leading-none text-ink-strong underline-offset-4 hover:underline">
                      {notes.lessons[result.criterionId] ? 'Reopen the lesson' : 'Learn the concept behind this'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {diffRows && attempt.design && attempt.revision && (
        <>
          <h3 className="h-section">What the change cost you</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="card-lined flex flex-col gap-3 p-[22px]">
              <span className="text-[15px] font-medium leading-none text-muted">v1 · before</span>
              {attempt.design.classes.map((c) => {
                const row = diffRows.find((r) => r.name.toLowerCase() === c.name.toLowerCase())
                return <span key={c.name} className={`flex h-[38px] items-center rounded-xl border border-soft px-3.5 font-mono text-[14px] font-medium leading-none text-ink-strong ${row?.change === 'removed' ? 'bg-blush' : 'bg-ground'}`}>{c.name}</span>
              })}
            </div>
            <div className="card-lined flex flex-col gap-3 p-[22px]">
              <span className="text-[15px] font-medium leading-none text-ink-strong">v2 · after</span>
              {attempt.revision.design.classes.map((c) => {
                const row = diffRows.find((r) => r.name.toLowerCase() === c.name.toLowerCase())
                const bg = row?.change === 'added' ? 'bg-mint' : row?.change === 'modified' ? 'bg-apricot' : 'bg-ground'
                return <span key={c.name} className={`flex h-[38px] items-center rounded-xl border border-soft px-3.5 font-mono text-[14px] font-medium leading-none text-ink-strong ${bg}`}>{c.name}</span>
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {diffRows.filter((r) => r.change !== 'same').map((r) => (
              <span key={r.name} className={`flex h-[38px] items-center rounded-full px-4 font-mono text-[13px] font-medium leading-none text-ink-strong ${r.change === 'added' ? 'bg-mint' : r.change === 'modified' ? 'bg-apricot' : 'bg-blush'}`}>
                {r.change === 'added' ? '+' : r.change === 'modified' ? '~' : '−'} {r.name}{r.fields.length ? ` → ${r.fields.join(', ')}` : ''}
              </span>
            ))}
            {diffRows.every((r) => r.change === 'same') && <span className="text-[14px] text-muted">No class changed.</span>}
          </div>
          {attempt.revision.rationale && (
            <p id="prose-rationale" className={`rounded-2xl px-5 py-4 text-[14px] leading-relaxed ${highlight?.kind === 'prose' && highlight.field === 'rationale' ? 'bg-lilac text-ink-strong' : 'bg-soft text-muted'}`}>
              <span className="mr-2 text-[12px] font-medium uppercase tracking-wide text-faint">Your rationale</span>{attempt.revision.rationale}
            </p>
          )}
        </>
      )}

      {attempt.probes && attempt.answers && attempt.answers.length > 0 && (
        <>
          <h3 className="h-section">Your answers</h3>
          <ol className="flex flex-col gap-3">
            {attempt.probes.map((p) => {
              const a = attempt.answers!.find((x) => x.probeId === p.id)
              const lit = highlight?.kind === 'prose' && highlight.field === 'answer' && highlight.probeId === p.id
              return (
                <li key={p.id} id={`answer-${p.id}`} className={`flex flex-col gap-2.5 rounded-3xl p-[22px] ${lit ? 'bg-lilac' : 'card-lined'}`}>
                  <p className="text-[15px] font-medium leading-[1.4] text-ink-strong">{p.prompt}</p>
                  {a && a.transcript.length > 0 ? a.transcript.map((t, i) => (
                    <p key={i} className={`text-[14px] leading-relaxed ${t.role === 'mentor' ? 'text-tint-violet' : 'text-ink'}`}>
                      <span className="mr-2 text-[11px] font-medium uppercase tracking-wide text-faint">{t.role === 'mentor' ? 'Interviewer' : 'You'}</span>{t.text}
                    </p>
                  )) : (
                    <p className="text-[14px] leading-relaxed text-muted">{a?.response?.trim() || <em>No answer.</em>}</p>
                  )}
                </li>
              )
            })}
          </ol>
        </>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.4fr_1fr]">
        <div className="card-lined flex flex-col gap-3.5 p-[26px]">
          <span className="flex items-center gap-2 text-[16px] font-medium leading-none text-muted">
            Mentor note
            {notes && !notes.live && <span className="pill-soft h-6 px-2 text-[11px]" title="No model is configured; this note is a template over the lowest finding">stand-in</span>}
          </span>
          {noteStages.length > 0 ? (
            <>
              <p className="text-[20px] leading-[1.5] text-ink-strong">“{notes!.review[noteStages.at(-1)!]!.text}”</p>
              {noteStages.length > 1 && (
                <details className="group">
                  <summary className="cursor-pointer list-none text-[13px] font-medium leading-none text-muted">Earlier stages <span className="group-open:hidden">▸</span><span className="hidden group-open:inline">▾</span></summary>
                  <div className="mt-3 flex flex-col gap-3">
                    {noteStages.slice(0, -1).map((st) => (
                      <p key={st} className="text-[15px] leading-[1.5] text-ink-2">
                        <span className="mr-2 text-[12px] font-medium uppercase tracking-wide text-faint">{STAGE_LABEL[st]}</span>“{notes!.review[st]!.text}”
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : notePending ? (
            <div className="flex flex-col gap-2"><span className="skeleton h-5 w-11/12" /><span className="skeleton h-5 w-4/5" /><span className="skeleton h-5 w-2/3" /></div>
          ) : (
            <p className="text-[15px] leading-[1.5] text-muted">{whatThisMeans(report, rubric)}</p>
          )}
        </div>
        <div className="flex flex-col justify-between gap-4 rounded-3xl bg-ink-strong p-[26px]">
          {canAdvance ? (
            <>
              <div className="flex flex-col gap-2.5">
                <span className="text-[15px] font-medium leading-none text-faint">Next</span>
                <span className="text-[26px] font-medium leading-[1.2] tracking-[-0.02em] text-white">{next === 'change' ? 'The requirements change.' : 'Now defend it.'}</span>
                <span className="text-[14px] leading-[1.5] text-dashed">{next === 'change' ? 'Your design is frozen. You are about to be shown a requirement you did not know was coming, and asked to revise.' : 'Three questions, chosen from what the review found. Answer them as you would across the table.'}</span>
              </div>
              <button onClick={advance} disabled={busy} className="btn-sm self-start rounded-full bg-white px-6 text-[14px] font-medium text-ink-strong">{busy ? 'Opening…' : 'Continue'}</button>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-2.5">
                <span className="text-[15px] font-medium leading-none text-faint">Next for you</span>
                <span className="text-[26px] font-medium leading-[1.2] tracking-[-0.02em] text-white">{nextPick?.title ?? problem?.title ?? 'Try again'}</span>
                <span className="text-[14px] leading-[1.5] text-dashed">{nextPick?.reason ?? 'Another attempt at the same problem, with what you now know.'}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {nextPick && <Link href={`/learn/${nextPick.problemId}`} className="btn-sm rounded-full bg-white px-6 text-[14px] font-medium text-ink-strong">Start attempt</Link>}
                <button onClick={tryAgain} className={`btn-sm rounded-full px-6 text-[14px] font-medium ${nextPick ? 'border border-white/40 text-white' : 'bg-white text-ink-strong'}`}>Try this one again</button>
              </div>
            </>
          )}
        </div>
      </div>

      <LessonDrawer open={lesson !== null} title={lesson?.title ?? ''} lesson={lesson?.data ?? null} loading={lesson?.loading ?? false} failed={lesson?.failed ?? false} onClose={() => setLesson(null)} />

      <Panel>
        <div className="flex items-center justify-between">
          <span className="h-section">{side === 'exemplar' ? 'A strong design' : 'Submitted design'}</span>
          <span className="pill-soft bg-white">{attempt.revision ? 'v2' : 'v1'} · {(side === 'exemplar' ? attempt.exemplar : latestDesign)?.classes.length ?? 0} classes</span>
        </div>
        {side !== 'exemplar' && (
          <span className="text-[13px] leading-[1.5] text-muted">
            {citedBy ? <>Cited by <strong className="font-medium text-ink">{byId.get(citedBy.criterionId)?.name ?? citedBy.criterionId}</strong> — outlined below.</> : 'Click an evidence chip on a card to see what it points at.'}
          </span>
        )}
        {side !== 'exemplar' && latestDesign && latestDesign.classes.map((c) => {
          const lit = highlight?.kind === 'class' && highlight.name.toLowerCase() === c.name.toLowerCase()
          return (
            <div key={c.name} id={`class-${c.name.toLowerCase()}`} className={`flex flex-col gap-1.5 rounded-2xl bg-white px-[18px] py-4 ${lit ? 'border-2 border-ink-strong' : 'border border-soft'}`}>
              <span className="font-mono text-[16px] font-medium leading-none text-ink-strong">{c.name}{c.stereotype !== 'class' && <span className="ml-1.5 font-sans text-[11px] font-normal text-muted">{c.stereotype}</span>}</span>
              <span className="text-[13px] leading-[1.4] text-muted">{c.methods.length ? c.methods.join(' · ') : c.responsibility}</span>
            </div>
          )
        })}
        {side !== 'exemplar' && latestDesign && (
          <details className="group">
            <summary className="cursor-pointer list-none text-[13px] font-medium leading-none text-ink-strong">Assumptions, decisions and walkthroughs <span className="text-muted group-open:hidden">▸</span><span className="hidden text-muted group-open:inline">▾</span></summary>
            <div className="mt-3"><SubmittedDesign design={latestDesign} highlight={highlight} scenarios={problem?.scenarios ?? []} title="" compact /></div>
          </details>
        )}
        {side === 'exemplar' && attempt.exemplar && (
          <>
            <p className="text-[13px] leading-[1.5] text-muted">One strong design for this problem — not <em>the</em> answer. Compare it against the criterion you scored lowest on, not the whole thing.</p>
            <SubmittedDesign design={attempt.exemplar} highlight={null} scenarios={problem?.scenarios ?? []} title="" compact />
          </>
        )}
        {blast && (
          <div className="flex flex-col gap-1.5 rounded-2xl bg-blush p-[18px]">
            <span className="text-[15px] font-medium leading-none text-ink-strong">Blast radius</span>
            <span className="text-[13px] leading-[1.5] text-ink">{blast.concern}</span>
          </div>
        )}
        {attempt.exemplar && (
          <button type="button" onClick={() => setSide(side === 'exemplar' ? 'yours' : 'exemplar')} className="btn-secondary btn-xs self-start">
            {side === 'exemplar' ? 'Back to your design' : 'Compare with a strong design'}
          </button>
        )}
      </Panel>
    </>
  )
}

function EvaluatingState({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-md pt-24 text-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }} className="mx-auto h-11 w-11 rounded-full border-2 border-line border-t-ink-strong" />
      <motion.p key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-5 text-[15px] text-muted">{label}</motion.p>
      <p className="mt-1.5 text-[13px] text-faint">Your submission is already saved. This page updates itself.</p>
    </div>
  )
}

/** "ParkingLot.assignSpot"-style label for an evidence chip. */
function refLabel(e: EvidenceRef, attempt: Attempt): string {
  switch (e.kind) {
    case 'class': return e.name
    case 'relationship': return `${e.from} → ${e.to}`
    case 'assumption': return `Assumption ${e.index + 1}`
    case 'decision': return `Decision ${e.index + 1}`
    case 'step': {
      const w = (attempt.revision?.design ?? attempt.design)?.walkthroughs.find((x) => x.scenarioId === e.scenarioId)
      const st = w?.steps[e.index]
      return st ? `Step ${e.index + 1} · ${st.className}.${st.method}` : `Step ${e.index + 1}`
    }
    case 'prose': return e.field === 'answer' ? 'Your answer' : e.field === 'tradeoffs' ? 'Trade-offs' : 'Rationale'
    default: return 'Evidence'
  }
}

function sameRef(a: EvidenceRef, b: EvidenceRef): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** The class-level diff the "what the change cost you" block draws. */
type Change = 'added' | 'removed' | 'modified' | 'same'
function classify(before: DesignModel, after: DesignModel): Array<{ name: string; change: Change; fields: string[] }> {
  const key = (s: string) => s.trim().toLowerCase()
  const list = (xs: readonly string[]) => xs.map(key).sort().join('|')
  const b = new Map(before.classes.map((c) => [key(c.name), c]))
  const a = new Map(after.classes.map((c) => [key(c.name), c]))
  const rows: Array<{ name: string; change: Change; fields: string[] }> = []
  for (const c of before.classes) {
    const now = a.get(key(c.name))
    if (!now) { rows.push({ name: c.name, change: 'removed', fields: [] }); continue }
    const fields: string[] = []
    if (c.stereotype !== now.stereotype) fields.push('type')
    if (c.responsibility.trim() !== now.responsibility.trim()) fields.push('responsibility')
    if (list(c.attributes) !== list(now.attributes)) fields.push('attributes')
    if (list(c.methods) !== list(now.methods)) fields.push('methods')
    rows.push({ name: now.name, change: fields.length ? 'modified' : 'same', fields })
  }
  for (const c of after.classes) if (!b.has(key(c.name))) rows.push({ name: c.name, change: 'added', fields: [] })
  return rows
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
