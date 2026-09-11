'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { NextProblemSuggestion, ProblemSummary } from '@lld/contracts'
import { api } from '@/lib/api'
import { ProblemCard } from '@/components/ProblemCard'
import { NextForYou } from '@/components/NextForYou'
import { stagger, riseIn } from '@/components/motion'

export default function ProblemsPage() {
  const [problems, setProblems] = useState<ProblemSummary[] | null>(null)
  const [next, setNext] = useState<NextProblemSuggestion | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listProblems()
      .then((r) => {
        setProblems(r.problems)
        setNext(r.next)
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load problems'))
  }, [])

  return (
    <div>
      <motion.header initial="hidden" animate="show" variants={riseIn} className="mb-8 mt-4">
        <h1 className="text-[28px] font-semibold tracking-tight">Practice a design</h1>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
          Sketch the classes and walk the scenarios through them. Then the requirements change and
          you revise. Then you defend it. Every finding points at your own design — nothing is a
          score out of a hundred, and most of it is measured rather than judged.
        </p>
      </motion.header>

      {error && (
        <div className="card border-critical/30 bg-critical/5 p-4 text-sm text-critical">
          {error}. Is the API running on port 4000?
        </div>
      )}

      {next && (
        <div className="mb-6">
          <NextForYou next={next} />
        </div>
      )}

      {!problems && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-56 p-5">
              <div className="skeleton h-5 w-2/3" />
              <div className="skeleton mt-3 h-3 w-1/3" />
              <div className="skeleton mt-6 h-6 w-full" />
            </div>
          ))}
        </div>
      )}

      {problems && (
        <motion.ul initial="hidden" animate="show" variants={stagger} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {problems.map((p) => (
            <ProblemCard key={p.id} problem={p} />
          ))}
        </motion.ul>
      )}
    </div>
  )
}
