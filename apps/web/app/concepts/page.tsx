'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CONCEPT_TIERS, type Concept, type ConceptMastery, type ConceptsPayload } from '@lld/contracts'
import { api } from '@/lib/api'
import { CONCEPT_TIER_BLURB, CONCEPT_TIER_LABEL, MASTERY_LABEL } from '@/lib/format'
import { MasteryRing } from '@/components/Mastery'
import { stagger, riseIn } from '@/components/motion'

/**
 * The curriculum map. Five rows, foundations at the top, practice at the bottom;
 * every concept a card with what it means, what its absence looks like, and where
 * the learner stands. Click one to see its prerequisites light up and the problems
 * that exercise it. This is the page that says "there is a body of knowledge here".
 */
export default function ConceptsPage() {
  const router = useRouter()
  const [data, setData] = useState<ConceptsPayload | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    api.getConcepts().then(setData).catch(() => setData(null))
  }, [])

  const byId = useMemo(() => new Map((data?.concepts ?? []).map((c) => [c.id, c])), [data])
  const mastery = useMemo(() => new Map((data?.mastery ?? []).map((m) => [m.conceptId, m])), [data])
  const current = selected ? byId.get(selected) : undefined
  const prereqs = new Set(current?.prerequisites ?? [])
  const dependents = new Set((data?.concepts ?? []).filter((c) => selected && c.prerequisites.includes(selected)).map((c) => c.id))

  async function practise(problemId: string) {
    setStarting(true)
    try {
      const { attempt } = await api.startAttempt(problemId)
      router.push(`/practice/${attempt.id}`)
    } catch {
      setStarting(false)
    }
  }

  const solid = data ? data.mastery.filter((m) => m.level === 'solid').length : 0
  const seen = data ? data.mastery.filter((m) => m.evidenceCount > 0).length : 0

  return (
    <div>
      <motion.header initial="hidden" animate="show" variants={riseIn} className="mb-6 mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Concepts</h1>
          <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-ink-muted">
            Twenty-two ideas, in the order they depend on each other. Your standing on each is folded from
            the rubric criteria that produce evidence about it — nothing here is graded separately.
          </p>
        </div>
        {data && (
          <p className="text-sm text-ink-muted">
            <strong className="font-semibold text-positive">{solid}</strong> solid ·{' '}
            <strong className="font-semibold">{seen}</strong> with evidence · {data.concepts.length} total
          </p>
        )}
      </motion.header>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {CONCEPT_TIERS.map((tier) => {
            const row = (data?.concepts ?? []).filter((c) => c.tier === tier)
            if (row.length === 0) return null
            return (
              <section key={tier}>
                <div className="mb-2 flex items-baseline gap-2">
                  <h2 className="text-[13px] font-semibold uppercase tracking-wide">{CONCEPT_TIER_LABEL[tier]}</h2>
                  <span className="text-[12px] text-ink-faint">{CONCEPT_TIER_BLURB[tier]}</span>
                </div>
                <motion.ul initial="hidden" animate="show" variants={stagger} className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {row.map((c) => (
                    <ConceptCard
                      key={c.id}
                      concept={c}
                      mastery={mastery.get(c.id)}
                      state={
                        selected === c.id ? 'selected' : prereqs.has(c.id) ? 'prereq' : dependents.has(c.id) ? 'dependent' : selected ? 'dim' : 'idle'
                      }
                      onClick={() => setSelected(selected === c.id ? null : c.id)}
                    />
                  ))}
                </motion.ul>
              </section>
            )
          })}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <AnimatePresence mode="wait">
            {current ? (
              <motion.div
                key={current.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="card p-5"
              >
                <div className="flex items-center gap-3">
                  <MasteryRing mastery={mastery.get(current.id) ?? { conceptId: current.id, level: 'new', average: null, evidenceCount: 0 }} />
                  <div>
                    <h2 className="text-[17px] font-semibold tracking-tight">{current.name}</h2>
                    <p className="text-[12px] text-ink-faint">
                      {MASTERY_LABEL[mastery.get(current.id)?.level ?? 'new']}
                      {(mastery.get(current.id)?.evidenceCount ?? 0) > 0 && ` · ${mastery.get(current.id)!.evidenceCount} scores`}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-[14px] leading-relaxed">{current.plain}</p>
                <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
                  <span className="font-semibold text-ink">When it is missing:</span> {current.tell}
                </p>
                {current.prerequisites.length > 0 && (
                  <p className="mt-3 text-[12px] text-ink-faint">
                    Builds on {current.prerequisites.map((p) => byId.get(p)?.name ?? p).join(', ')}.
                  </p>
                )}
                <div className="mt-4 border-t border-line pt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Practise this</p>
                  {(data?.practice[current.id] ?? []).length === 0 ? (
                    <p className="mt-1.5 text-[13px] text-ink-muted">
                      No playable problem is tagged with this yet — it still shows up through the criteria that measure it.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {(data?.practice[current.id] ?? []).map((p) => (
                        <li key={p.id}>
                          <button onClick={() => practise(p.id)} disabled={starting} className="btn-quiet w-full justify-between">
                            <span>{p.title}</span>
                            <span className="text-ink-faint">→</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-5 text-[13px] leading-relaxed text-ink-muted">
                Click a concept to see what it depends on, what depends on it, and where to practise it.
                <p className="mt-3">
                  <Link href="/learn" className="text-brand hover:underline">
                    Or pick a problem →
                  </Link>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  )
}

function ConceptCard({
  concept,
  mastery,
  state,
  onClick,
}: {
  concept: Concept
  mastery: ConceptMastery | undefined
  state: 'idle' | 'selected' | 'prereq' | 'dependent' | 'dim'
  onClick: () => void
}) {
  const m = mastery ?? { conceptId: concept.id, level: 'new' as const, average: null, evidenceCount: 0 }
  const ring =
    state === 'selected'
      ? 'border-brand ring-2 ring-brand/30'
      : state === 'prereq'
        ? 'border-machine/60 bg-machine/[0.05]'
        : state === 'dependent'
          ? 'border-judged/60 bg-judged/[0.05]'
          : 'border-line'
  return (
    <motion.li variants={riseIn} className="list-none">
      <button
        onClick={onClick}
        className={`card flex w-full items-center gap-3 p-3 text-left transition-all hover:shadow-lift ${ring} ${state === 'dim' ? 'opacity-45' : ''}`}
      >
        <MasteryRing mastery={m} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{concept.name}</p>
          <p className="truncate text-[11px] text-ink-faint">
            {state === 'prereq' ? 'builds toward the selected' : state === 'dependent' ? 'depends on the selected' : concept.plain}
          </p>
        </div>
      </button>
    </motion.li>
  )
}
