'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { PublicProblem, Rubric } from '@lld/contracts'
import { api, type HistoryPayload } from '@/lib/api'
import { CRITERION_ORDER } from '@/lib/format'
import { PASTEL_BG, bandPastel, starred } from '@/lib/tokens'
import { AttemptRow } from '@/components/AttemptRow'
import { Star } from '@/components/ui/Icon'
import { PanelCard, SectionHead } from '@/components/ui/Cards'
import { Panel, PanelHeader } from '@/components/shell/Panel'

/** One problem's attempts, and how each criterion moved across them. */
export default function ProblemHistory() {
  const { problemId } = useParams<{ problemId: string }>()
  const router = useRouter()
  const [problem, setProblem] = useState<PublicProblem | null>(null)
  const [rubric, setRubric] = useState<Rubric | null>(null)
  const [history, setHistory] = useState<HistoryPayload | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    void (async () => {
      const [{ problem, rubric }, history] = await Promise.all([api.getProblem(problemId), api.getHistory(problemId)])
      setProblem(problem); setRubric(rubric); setHistory(history)
    })()
  }, [problemId])

  async function tryAgain() {
    setStarting(true)
    try {
      const { attempt } = await api.startAttempt(problemId)
      router.push(`/practice/${attempt.id}`)
    } catch { setStarting(false) }
  }

  if (!problem || !history || !rubric) return <h2 className="h-hero">History.</h2>
  const attempts = history.attempts
  const scored = attempts.filter((a) => a.overall !== null).reverse()
  const best = scored.length ? Math.max(...scored.map((a) => a.overall!)) : null

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link href="/history" className="text-[14px] leading-none text-muted">← All attempts</Link>
        <h2 className="h-hero">{problem.title}.</h2>
      </div>
      <div className="flex items-center justify-between">
        <h3 className="h-section">{attempts.length} attempt{attempts.length === 1 ? '' : 's'}, newest first</h3>
        <button type="button" className="btn-primary btn-sm" disabled={starting} onClick={tryAgain}>{starting ? 'Starting…' : 'Try again'}</button>
      </div>
      <div className="flex flex-col gap-3">
        {attempts.map((a) => <AttemptRow key={a.id} a={a} title={`Attempt ${a.attemptNumber}`} subtitle={`${a.stagesCompleted.length} of 3 stages · ${new Date(a.createdAt).toLocaleDateString()}`} />)}
        {attempts.length === 0 && <p className="text-[14px] text-muted">No attempts on this problem yet.</p>}
      </div>

      {scored.length > 1 && (
        <>
          <SectionHead title="How each band moved" right="oldest → newest" />
          <div className="card-lined px-6 pb-4 pt-2">
            {CRITERION_ORDER.map((id) => {
              const c = rubric.criteria.find((x) => x.id === id)
              const series = scored.map((a) => a.scores[id]).filter((v): v is number => v !== undefined)
              if (series.length === 0) return null
              const last = series[series.length - 1]!
              return (
                <div key={id} className="flex h-14 items-center gap-4 border-b border-soft last:border-b-0">
                  <span className="min-w-0 flex-1 text-[15px] leading-none text-ink">{c?.name ?? id}</span>
                  <span className="flex gap-1.5">
                    {series.map((v, i) => <span key={i} className={`h-3 w-3 rounded-full ${PASTEL_BG[bandPastel(v)]}`} title={`Attempt: band ${v}`} />)}
                  </span>
                  <span className={`flex h-8 w-24 flex-none items-center justify-center gap-1.5 rounded-full text-[13px] font-medium leading-none text-ink-strong ${PASTEL_BG[bandPastel(last)]}`}>
                    <Star filled={starred(last)} />Band {last}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Panel>
        <PanelHeader />
        <PanelCard title="Best so far">
          <p className="text-[32px] font-medium leading-none tracking-[-0.02em] text-ink-strong">{best === null ? '—' : `Band ${best.toFixed(1)}`}</p>
          <p className="text-[14px] leading-[1.55] text-muted">{scored.length} scored attempt{scored.length === 1 ? '' : 's'} · {history.critique.correct} of {history.critique.total} warm-up pairs right</p>
        </PanelCard>
        {history.recurringWeaknesses[0] && (
          <div className="flex flex-col gap-3 rounded-3xl bg-blush p-6">
            <span className="text-[15px] font-medium leading-none text-ink-strong">Recurring weakness</span>
            <p className="text-[20px] font-medium leading-[1.35] tracking-[-0.01em] text-ink-strong">{history.recurringWeaknesses[0].criterionName} in {history.recurringWeaknesses[0].occurrences} of your last {history.recurringWeaknesses[0].windowSize} attempts here.</p>
          </div>
        )}
        {history.next && (
          <PanelCard title="Next for you">
            <p className="text-[14px] leading-[1.55] text-muted">{history.next.reason}</p>
            <Link href={`/learn/${history.next.problemId}`} className="btn-primary btn-xs self-start">Open {history.next.title.toLowerCase()}</Link>
          </PanelCard>
        )}
      </Panel>
    </>
  )
}
