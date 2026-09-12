'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { ConceptMastery, ProblemSummary } from '@lld/contracts'
import { api } from '@/lib/api'
import { TIER_BLURB, TIER_LABEL } from '@/lib/format'
import { ProblemCard } from '@/components/ProblemCard'
import { stagger, riseIn } from '@/components/motion'

/**
 * The library, as a curriculum: problems grouped by level, each level saying what
 * it is for. Cards carry the learner's standing on the concepts the problem
 * exercises, so choosing a problem is choosing what to work on.
 */
export default function LearnPage() {
  const [problems, setProblems] = useState<ProblemSummary[] | null>(null)
  const [mastery, setMastery] = useState<Map<string, ConceptMastery>>(new Map())
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.listProblems(), api.getConcepts()])
      .then(([l, c]) => {
        setProblems(l.problems)
        setMastery(new Map(c.mastery.map((m) => [m.conceptId, m])))
        setNames(new Map(c.concepts.map((x) => [x.id, x.name])))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load problems'))
  }, [])

  const tiers = problems ? [...new Set(problems.map((p) => p.tier))].sort() : []

  return (
    <div>
      <motion.header initial="hidden" animate="show" variants={riseIn} className="mb-8 mt-4">
        <h1 className="text-[28px] font-semibold tracking-tight">Learn</h1>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
          Each problem is one full loop: design and run it, absorb a change you did not see coming,
          defend it. The dots show where you stand on the concepts a problem exercises.
        </p>
      </motion.header>

      {error && (
        <div className="card border-critical/30 bg-critical/5 p-4 text-sm text-critical">
          {error}. Is the API running on port 4000?
        </div>
      )}

      {!problems && !error && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-56 p-5">
              <div className="skeleton h-5 w-2/3" />
              <div className="skeleton mt-3 h-3 w-1/3" />
            </div>
          ))}
        </div>
      )}

      {problems &&
        tiers.map((tier) => (
          <section key={tier} className="mb-10">
            <div className="mb-3">
              <h2 className="text-[15px] font-semibold tracking-tight">
                <span className="mr-2 font-mono text-xs text-ink-faint">L{tier}</span>
                {TIER_LABEL[tier] ?? `Tier ${tier}`}
              </h2>
              <p className="text-[13px] text-ink-muted">{TIER_BLURB[tier]}</p>
            </div>
            <motion.ul initial="hidden" animate="show" variants={stagger} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {problems
                .filter((p) => p.tier === tier)
                .map((p) => (
                  <ProblemCard key={p.id} problem={p} mastery={mastery} conceptNames={names} />
                ))}
            </motion.ul>
          </section>
        ))}
    </div>
  )
}
