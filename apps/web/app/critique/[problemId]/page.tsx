'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import type { CritiqueVerdict, PublicCritiquePair, PublicProblem } from '@lld/contracts'
import { api } from '@/lib/api'
import { CritiqueBoard } from '@/components/CritiqueBoard'
import { riseIn, EASE } from '@/components/motion'

/**
 * The warm-up: three contrasting pairs before the first attempt at a problem.
 *
 * No evaluator runs here. The answers are authored, the scoring is a comparison,
 * and the point is not the score — it is that a learner who has just judged two
 * designs against a change is ready to be told why one of them absorbs it.
 */
export default function CritiquePage() {
  const { problemId } = useParams<{ problemId: string }>()
  const router = useRouter()

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
      // Resume at the first unanswered pair.
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

  if (!problem || !pairs) {
    return (
      <div className="card h-80 p-5">
        <div className="skeleton h-6 w-1/2" />
        <div className="skeleton mt-4 h-40 w-full" />
      </div>
    )
  }

  const pair = pairs[index]!
  const verdict = verdicts[pair.id] ?? null
  const revealed = !!verdict || !!pair.answered
  const correct = pairs.filter((p) => verdicts[p.id]?.correct ?? p.answered?.correct).length
  const answeredCount = pairs.filter((p) => verdicts[p.id] || p.answered).length
  const last = index === pairs.length - 1

  return (
    <div className="mx-auto max-w-5xl">
      <motion.header initial="hidden" animate="show" variants={riseIn} className="mb-6 mt-2">
        <Link href="/" className="text-xs text-ink-faint hover:text-ink">
          ← All problems
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-faint">Warm-up · {problem.title}</p>
            <h1 className="mt-0.5 text-[26px] font-semibold tracking-tight">Which design handles it?</h1>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-muted">
              Two designs for the same brief. Read the question, click the class that decides it.
              You will see why straight after — that is the part worth reading.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {pairs.map((p, i) => {
              const v = verdicts[p.id]?.correct ?? p.answered?.correct
              return (
                <button
                  key={p.id}
                  onClick={() => setIndex(i)}
                  className={`h-2.5 w-8 rounded-full transition-colors ${
                    v === true ? 'bg-positive' : v === false ? 'bg-caution' : i === index ? 'bg-brand' : 'bg-line'
                  }`}
                  aria-label={`Pair ${i + 1}`}
                />
              )
            })}
          </div>
        </div>
      </motion.header>

      <AnimatePresence mode="wait">
        <motion.div
          key={pair.id}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.25, ease: EASE }}
        >
          <CritiqueBoard pair={pair} verdict={verdict} onAnswer={(c) => answer(pair.id, c)} busy={busy} />
        </motion.div>
      </AnimatePresence>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-ink-faint">
          {answeredCount} of {pairs.length} answered · {correct} right
        </span>
        <div className="flex gap-2">
          {index > 0 && (
            <button onClick={() => setIndex(index - 1)} className="btn-quiet">
              Previous
            </button>
          )}
          {!last ? (
            <button onClick={() => setIndex(index + 1)} disabled={!revealed} className="btn-primary">
              Next pair
            </button>
          ) : (
            <button onClick={start} disabled={starting || !revealed} className="btn-primary">
              {starting ? 'Starting…' : 'Now design it yourself'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
