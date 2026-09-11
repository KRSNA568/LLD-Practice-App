'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import type { Attempt, FieldError, ProbeAnswer, PublicProblem, RawStageInput } from '@lld/contracts'
import { api, ApiRequestError } from '@/lib/api'
import { liveDiff } from '@/lib/diff'
import { DesignForm, emptyForm, type FormState } from '@/components/DesignForm'
import { StageRail } from '@/components/StageRail'
import { ChangeReveal } from '@/components/ChangeReveal'
import { ProbePanel } from '@/components/ProbePanel'
import { riseIn } from '@/components/motion'

/**
 * The workspace. One route, three stages.
 *
 * Design and change share the form; defend is the probe panel. What the learner
 * submits is decided by the attempt's stage on the server, never by the client, so
 * a stale tab cannot submit a change revision to an attempt that has moved on.
 */
export default function PracticePage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const router = useRouter()

  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [problem, setProblem] = useState<PublicProblem | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [rationale, setRationale] = useState('')
  const [answers, setAnswers] = useState<ProbeAnswer[]>([])
  const [errors, setErrors] = useState<FieldError[]>([])
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [submitting, setSubmitting] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  /**
   * Generated once per stage when the workspace opens, not per click. A double-
   * tapped submit, a retry after a dropped connection and an impatient refresh all
   * carry the same key, so they cost one evaluation rather than three.
   */
  const idempotencyKey = useMemo(
    () => `${attemptId}:${attempt?.stage ?? 'design'}:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attemptId, attempt?.stage],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { attempt, draft } = await api.getAttempt(attemptId)
        if (cancelled) return
        if (attempt.state !== 'DRAFT') {
          router.replace(`/report/${attemptId}`)
          return
        }
        setAttempt(attempt)

        const { problem } = await api.getProblem(attempt.problemId)
        if (cancelled) return
        setProblem(problem)

        if (draft?.stage === 'design' || draft?.stage === 'change') {
          setForm(withBlanks(draft.submission))
          if (draft.stage === 'change') setRationale(draft.rationale)
        } else if (draft?.stage === 'defend') {
          setAnswers(draft.answers)
          setForm(emptyForm())
        } else {
          setForm(emptyForm())
        }
      } catch (error) {
        if (!cancelled) setBanner(error instanceof Error ? error.message : 'Could not load attempt')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [attemptId, router])

  const input = useCallback(
    (next: { form?: FormState; rationale?: string; answers?: ProbeAnswer[] }): RawStageInput | null => {
      if (!attempt) return null
      const f = next.form ?? form
      switch (attempt.stage) {
        case 'design':
          return f ? { stage: 'design', submission: f } : null
        case 'change':
          return f ? { stage: 'change', submission: f, rationale: next.rationale ?? rationale } : null
        case 'defend':
          return { stage: 'defend', answers: next.answers ?? answers }
      }
    },
    [attempt, form, rationale, answers],
  )

  // Debounced autosave. Nobody should lose thirty minutes of design to a closed tab.
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const scheduleSave = useCallback(
    (payload: RawStageInput | null) => {
      if (!payload) return
      clearTimeout(saveTimer.current)
      setSaving('saving')
      saveTimer.current = setTimeout(() => {
        api
          .saveDraft(attemptId, payload)
          .then(() => setSaving('saved'))
          .catch(() => setSaving('idle'))
      }, 700)
    },
    [attemptId],
  )

  function updateForm(next: FormState) {
    setForm(next)
    scheduleSave(input({ form: next }))
  }
  function updateRationale(next: string) {
    setRationale(next)
    scheduleSave(input({ rationale: next }))
  }
  function updateAnswers(next: ProbeAnswer[]) {
    setAnswers(next)
    scheduleSave(input({ answers: next }))
  }

  async function submit() {
    const payload = input({})
    if (!payload) return
    setSubmitting(true)
    setErrors([])
    setBanner(null)
    try {
      await api.submit(attemptId, payload, idempotencyKey)
      router.push(`/report/${attemptId}`)
    } catch (error) {
      if (error instanceof ApiRequestError && error.body.fields) {
        setErrors(error.body.fields)
        setBanner('A few fields need attention before this can be reviewed.')
      } else {
        setBanner(error instanceof Error ? error.message : 'Submission failed')
      }
      setSubmitting(false)
    }
  }

  if (!problem || !form || !attempt) {
    return (
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="card h-64 p-5">
          <div className="skeleton h-6 w-2/3" />
          <div className="skeleton mt-4 h-3 w-full" />
          <div className="skeleton mt-2 h-3 w-5/6" />
        </div>
        <div className="card h-96 p-5">
          <div className="skeleton h-5 w-1/4" />
          <div className="skeleton mt-4 h-9 w-full" />
          <div className="skeleton mt-2 h-9 w-full" />
        </div>
      </div>
    )
  }

  const stage = attempt.stage
  const completed = attempt.report?.stagesCompleted ?? []
  const runStarted = form.walkthroughs.some((w) => w.steps.some((s) => s.className.trim() && s.method.trim()))
  const frozenRaw = attempt.design ? withBlanks(designToRaw(attempt.design)) : null
  const diff = stage === 'change' && frozenRaw ? liveDiff(frozenRaw, form) : null

  const submitLabel =
    stage === 'design' ? 'Submit for review' : stage === 'change' ? 'Submit the revision' : 'Submit answers'

  return (
    <div className="space-y-5">
      <motion.div initial="hidden" animate="show" variants={riseIn}>
        <StageRail current={stage} completed={completed} runStarted={runStarted} />
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr] lg:items-start">
        <motion.aside initial="hidden" animate="show" variants={riseIn} className="lg:sticky lg:top-20">
          <div className="card p-5">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-lg font-semibold tracking-tight">{problem.title}</h1>
              <span className="chip shrink-0 !py-0.5 !text-[11px]">Attempt {attempt.attemptNumber}</span>
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{problem.brief}</p>

            <h2 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Requirements</h2>
            <ul className="mt-2 space-y-1.5">
              {problem.requirements.map((r, i) => (
                <li key={r.id} className="flex gap-2.5 text-sm leading-relaxed text-ink-muted">
                  <span className="mt-0.5 select-none font-mono text-xs text-ink-faint">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{r.text}</span>
                </li>
              ))}
            </ul>

            {problem.constraints.length > 0 && (
              <>
                <h2 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">Constraints</h2>
                <ul className="mt-2 space-y-1">
                  {problem.constraints.map((c) => (
                    <li key={c} className="text-sm text-ink-muted">
                      · {c}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {stage === 'design' && problem.scenarios.length > 0 && (
              <>
                <h2 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  You will walk these
                </h2>
                <ul className="mt-2 space-y-1">
                  {problem.scenarios.map((s) => (
                    <li key={s.id} className="text-sm text-ink-muted">
                      · {s.title}
                    </li>
                  ))}
                </ul>
                {problem.hiddenChangeCount > 0 && (
                  <p className="mt-4 rounded-xl bg-raised px-3 py-2.5 text-xs leading-relaxed text-ink-faint">
                    After your design is reviewed, the requirements will change. You will not be told
                    how until then — design for the change you cannot see.
                  </p>
                )}
              </>
            )}

            {stage === 'defend' && (
              <p className="mt-4 rounded-xl bg-raised px-3 py-2.5 text-xs leading-relaxed text-ink-faint">
                These questions were chosen from what the review found in your own design. Answer
                them the way you would across the table from an interviewer.
              </p>
            )}

            <div className="mt-5 border-t border-line pt-4">
              <Link href={`/report/${attemptId}`} className="text-xs text-ink-faint hover:text-ink">
                {completed.length > 0 ? '← Back to the report so far' : ''}
              </Link>
            </div>
          </div>
        </motion.aside>

        <div className="space-y-6">
          <AnimatePresence>
            {banner && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="card border-critical/30 bg-critical/5 p-3.5 text-sm text-critical"
              >
                {banner}
              </motion.div>
            )}
          </AnimatePresence>

          {stage === 'change' && attempt.revealedChange && diff && (
            <ChangeReveal change={attempt.revealedChange} diff={diff} />
          )}

          {(stage === 'design' || stage === 'change') && (
            <div className="card p-5">
              <DesignForm
                value={form}
                onChange={updateForm}
                errors={errors}
                disabled={submitting}
                scenarios={problem.scenarios}
                touched={diff ? { added: diff.added, modified: diff.modified } : undefined}
                frozen={stage === 'change'}
              />
            </div>
          )}

          {stage === 'change' && (
            <motion.div initial="hidden" animate="show" variants={riseIn} className="card p-5">
              <h3 className="text-sm font-semibold tracking-tight">What did you touch, and why?</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">
                One paragraph. If you renamed something rather than replacing it, say so here — the
                diff cannot tell the difference.
              </p>
              <textarea
                className="field mt-3 min-h-[96px] resize-y leading-relaxed"
                placeholder="I added EnergyPricing implementing PricingStrategy and marked charging as a capability on Spot. ParkingLot only changed to pick the strategy by capability; nothing else knows about kWh…"
                value={rationale}
                disabled={submitting}
                onChange={(e) => updateRationale(e.target.value)}
              />
            </motion.div>
          )}

          {stage === 'defend' && attempt.probes && (
            <ProbePanel probes={attempt.probes} answers={answers} onChange={updateAnswers} disabled={submitting} />
          )}

          <div className="flex items-center gap-3">
            <button onClick={submit} disabled={submitting} className="btn-primary min-w-[170px]">
              {submitting ? 'Submitting…' : submitLabel}
            </button>
            <span className="text-xs text-ink-faint">
              {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Draft saved' : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The form always shows one blank row per list so there is somewhere to type. */
function withBlanks(raw: FormState): FormState {
  return {
    ...raw,
    assumptions: raw.assumptions.length > 0 ? raw.assumptions : [''],
    classes: raw.classes.length > 0 ? raw.classes : emptyForm().classes,
    relationships: raw.relationships.length > 0 ? raw.relationships : [{ from: '', to: '', kind: 'uses' }],
    decisions: raw.decisions.length > 0 ? raw.decisions : [{ what: '', alternative: '', why: '' }],
    walkthroughs: raw.walkthroughs,
  }
}

function designToRaw(design: NonNullable<Attempt['design']>): FormState {
  return {
    format: 'structured-design',
    assumptions: design.assumptions,
    classes: design.classes.map((c) => ({
      name: c.name,
      stereotype: c.stereotype,
      responsibility: c.responsibility,
      attributes: c.attributes,
      methods: c.methods,
    })),
    relationships: design.relationships.map((r) => ({ from: r.from, to: r.to, kind: r.kind })),
    tradeoffs: design.tradeoffs,
    decisions: design.decisions.map((d) => ({ what: d.what, alternative: d.alternative, why: d.why })),
    walkthroughs: design.walkthroughs.map((w) => ({
      scenarioId: w.scenarioId,
      steps: w.steps.map((s) => ({ className: s.className, method: s.method, note: s.note })),
      outcome: w.outcome,
    })),
  }
}
