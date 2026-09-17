'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { CritiqueVerdict, PublicCritiquePair, PublicProblem } from '@lld/contracts'
import { api } from '@/lib/api'
import { CritiqueBoard } from '@/components/CritiqueBoard'
import { Panel, PanelHeader } from '@/components/shell/Panel'
import { PanelCard } from '@/components/ui/Cards'
import { DotChip } from '@/components/ui/Chips'
import { PASTEL_HEX, pastelAt } from '@/lib/tokens'
import { useLibrary, conceptName } from '@/lib/useProblems'

export default function CritiquePage() {
  const { problemId } = useParams<{ problemId: string }>()
  const router = useRouter()
  const { data: lib } = useLibrary(false)
  const [problem, setProblem] = useState<PublicProblem | null>(null)
  const [pairs, setPairs] = useState<PublicCritiquePair[] | null>(null)
  const [index, setIndex] = useState(0)
  const [verdicts, setVerdicts] = useState<Record<string, CritiqueVerdict>>({})
  const [busy, setBusy] = useState(false)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    void (async () => {
      const [{ problem }, { pairs }] = await Promise.all([api.getProblem(problemId), api.getCritique(problemId)])
      setProblem(problem)
      setPairs(pairs)
      const first = pairs.findIndex((p) => !p.answered)
      setIndex(first === -1 ? 0 : first)
    })()
  }, [problemId])

  async function answer(pairId: string, choice: { design: string; className: string }) {
    setBusy(true)
    try {
      const verdict = await api.answerCritique(problemId, pairId, choice)
      setVerdicts((v) => ({ ...v, [pairId]: verdict }))
    } finally {
      setBusy(false)
    }
  }

  async function start() {
    setStarting(true)
    try {
      const { attempt } = await api.startAttempt(problemId)
      router.push(`/practice/${attempt.id}`)
    } catch {
      setStarting(false)
    }
  }

  if (!problem || !pairs) return <h2 className="h-page">Loading the warm-up…</h2>
  if (pairs.length === 0) return <h2 className="h-page">No warm-up for {problem.title} yet.</h2>

  const pair = pairs[index]!
  const verdict = verdicts[pair.id] ?? null
  const revealed = !!verdict || !!pair.answered
  const answeredCount = pairs.filter((p) => verdicts[p.id] || p.answered).length
  const correct = pairs.filter((p) => verdicts[p.id]?.correct ?? p.answered?.correct).length
  const allDone = answeredCount === pairs.length
  const concepts = lib ? [pair.targetsConcept, ...problem.conceptTags.filter((t) => t !== pair.targetsConcept)].slice(0, 4) : []

  return (
    <>
      <div className="flex flex-col gap-3">
        <span className="text-[14px] leading-none text-muted">Critique warm-up · {problem.title.toLowerCase()} · pair {index + 1} of {pairs.length}</span>
        <h2 className="h-page">{pair.question}</h2>
        <span className="text-[15px] leading-[1.5] text-muted">Click the class that decides it, then submit.</span>
      </div>

      <CritiqueBoard key={pair.id} pair={pair} verdict={verdict} onAnswer={(c) => answer(pair.id, c)} busy={busy} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="text-[14px] leading-none text-muted">{answeredCount} of {pairs.length} answered · {correct} right</span>
        <div className="flex gap-3">
          {index > 0 && <button type="button" className="btn-secondary btn-sm" onClick={() => setIndex((i) => i - 1)}>Previous</button>}
          {revealed && index < pairs.length - 1 && <button type="button" className="btn-primary btn-sm" onClick={() => setIndex((i) => i + 1)}>Next pair</button>}
          {allDone && <button type="button" className="btn-primary btn-sm" disabled={starting} onClick={start}>{starting ? 'Starting…' : `Start ${problem.title}`}</button>}
        </div>
      </div>

      <Panel>
        <PanelHeader />
        <PanelCard title="The brief both designs answer">
          <p className="text-[14px] leading-[1.6] text-ink">{problem.brief}</p>
        </PanelCard>
        <PanelCard title="Concepts in play">
          <div className="flex flex-wrap gap-2.5">
            {concepts.map((id, i) => <DotChip key={id} label={conceptName(lib!.concepts, id)} color={PASTEL_HEX[pastelAt(i)]} />)}
          </div>
        </PanelCard>
        <PanelCard title="No score here">
          <p className="text-[14px] leading-[1.55] text-muted">Critique is a warm-up. Nothing you do on this screen enters your bands or history.</p>
        </PanelCard>
      </Panel>
    </>
  )
}
