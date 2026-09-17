'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import type { Attempt, DialogueTurn, FieldError, ProbeAnswer, PublicProblem, RawStageInput } from '@lld/contracts'
import { api, ApiRequestError } from '@/lib/api'
import { liveDiff } from '@/lib/diff'
import { DesignForm, emptyForm, type FormState } from '@/components/DesignForm'
import { StageRail } from '@/components/ui/StageRail'
import { ProbePanel } from '@/components/ProbePanel'
import { Panel } from '@/components/shell/Panel'
import { PanelCard } from '@/components/ui/Cards'
import { Icon } from '@/components/ui/Icon'

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
          setDialogue(attempt.dialogue ?? {})
          api.getNotes(attemptId).then((n) => setLive(n.live)).catch(() => undefined)
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
  const [dialogue, setDialogue] = useState<Record<string, DialogueTurn[]>>({})
  const [live, setLive] = useState(false)

  async function turn(probeId: string, text: string) {
    const { transcript } = await api.defendTurn(attemptId, probeId, text)
    setDialogue((d) => ({ ...d, [probeId]: transcript }))
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
      <>
        <div className="flex gap-3">{[0, 1, 2].map((i) => <span key={i} className="h-12 w-28 rounded-full bg-panel" />)}</div>
        <span className="h-12 w-1/2 rounded-full bg-panel" />
        <div className="flex flex-col gap-3">{[0, 1, 2, 3].map((i) => <span key={i} className="h-[60px] rounded-2xl bg-panel" />)}</div>
      </>
    )
  }

  const stage = attempt.stage
  const completed = attempt.report?.stagesCompleted ?? []
  const frozenRaw = attempt.design ? withBlanks(designToRaw(attempt.design)) : null
  const diff = stage === 'change' && frozenRaw ? liveDiff(frozenRaw, form) : null
  const elapsed = Math.max(0, Math.round((Date.now() - new Date(attempt.createdAt).getTime()) / 60000))

  const answered = attempt.probes?.filter((p) => (dialogue[p.id] ?? []).some((t) => t.role === 'learner')).length ?? 0
  const submitLabel =
    stage === 'design'
      ? 'Submit design'
      : stage === 'change'
        ? 'Submit revision'
        : answered === (attempt.probes?.length ?? 0)
          ? 'Submit answers'
          : `Submit what I have (${answered}/${attempt.probes?.length ?? 0})`
  const heading = stage === 'design' ? 'Design it, then run it.' : stage === 'change' ? 'Revise for the change.' : 'Defend it.'

  // Which requirements the design-stage review found covered. The coverage
  // concern names the ones it did not, in quotes; before any review, no marks.
  const coverageConcern = attempt.report?.results.find((r) => r.criterionId === 'requirement-coverage' && r.stage === 'design')?.concern
  const covered = (text: string): boolean | null => (coverageConcern ? !coverageConcern.includes(`"${text}"`) : null)
  const decisions = form.decisions.filter((d) => d.what.trim())

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <StageRail current={stage} done={completed} />
        <span className="ml-auto text-[14px] leading-none text-muted">{problem.title} · {elapsed} min</span>
      </div>
      <h2 className="h-stage">{heading}</h2>

      <AnimatePresence>
        {banner && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl bg-blush px-5 py-4 text-[14px] text-ink-strong">
            {banner}
          </motion.div>
        )}
      </AnimatePresence>

      {(stage === 'design' || stage === 'change') && (
        <DesignForm
          value={form}
          onChange={updateForm}
          errors={errors}
          disabled={submitting}
          scenarios={problem.scenarios}
          touched={diff ? { added: diff.added, modified: diff.modified } : undefined}
          frozen={stage === 'change'}
        />
      )}

      {stage === 'change' && (
        <section className="flex flex-col gap-3.5">
          <div>
            <h3 className="h-section">What did you touch, and why?</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">One paragraph. If you renamed something rather than replacing it, say so here — the diff cannot tell the difference.</p>
          </div>
          <textarea
            className="field min-h-[110px] resize-y leading-relaxed"
            placeholder="I added EnergyPricing implementing PricingStrategy and marked charging as a capability on Spot. ParkingLot only changed to pick the strategy by capability; nothing else knows about kWh…"
            value={rationale}
            disabled={submitting}
            onChange={(e) => updateRationale(e.target.value)}
          />
        </section>
      )}

      {stage === 'defend' && attempt.probes && (
        <ProbePanel probes={attempt.probes} dialogue={dialogue} onTurn={turn} disabled={submitting} live={live} />
      )}

      <div className="mt-auto flex items-center justify-end gap-4 pb-1.5 pt-2">
        <span className="text-[14px] leading-none text-muted">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Autosaved' : ''}</span>
        <button onClick={submit} disabled={submitting} className="btn-primary">
          {submitting ? 'Submitting…' : submitLabel}
        </button>
      </div>

      <Panel>
        {stage === 'change' && attempt.revealedChange && (
          <div className="flex flex-col gap-3 rounded-3xl bg-apricot p-6">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white"><Icon name="change" size={18} stroke="#222222" width={1.8} /></span>
              <span className="text-[15px] font-medium leading-none text-ink-strong">Requirement change</span>
            </div>
            <p className="text-[20px] font-medium leading-[1.35] tracking-[-0.01em] text-ink-strong">{attempt.revealedChange.prompt}</p>
            <span className="text-[13px] leading-none text-ink-2">
              {diff ? `${diff.added.length} added · ${diff.modified.length} changed · ${diff.removed.length} removed so far` : 'Blast radius measured on submit'}
            </span>
          </div>
        )}
        {stage === 'defend' && (
          <div className="flex flex-col gap-3 rounded-3xl bg-lilac p-6">
            <span className="text-[15px] font-medium leading-none text-ink-strong">Three questions, about your design</span>
            <p className="text-[14px] leading-[1.55] text-ink-2">Chosen from what the review found. Answer the way you would across the table from an interviewer; one follow-up may come back on each.</p>
          </div>
        )}
        <PanelCard title="Problem brief">
          <p className="text-[14px] leading-[1.6] text-ink">{problem.brief}</p>
          {problem.constraints.length > 0 && (
            <ul className="mt-1 flex flex-col gap-1.5">
              {problem.constraints.map((c) => <li key={c} className="text-[13px] leading-[1.5] text-muted">· {c}</li>)}
            </ul>
          )}
        </PanelCard>
        <PanelCard title="Requirements">
          <ul className="flex flex-col gap-2.5">
            {problem.requirements.map((r) => {
              const ok = covered(r.text)
              return (
                <li key={r.id} className="flex gap-2.5">
                  {ok === true ? (
                    <Icon name="check" size={16} stroke="#4E9E77" width={2.4} className="mt-0.5 flex-none" />
                  ) : ok === false ? (
                    <span className="mt-0.5 h-4 w-4 flex-none rounded-full border-[1.5px] border-dashed" />
                  ) : (
                    <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-line" />
                  )}
                  <span className={`text-[14px] leading-[1.5] ${ok === false ? 'text-muted' : 'text-ink'}`}>{r.text}</span>
                </li>
              )
            })}
          </ul>
          {stage === 'design' && problem.hiddenChangeCount > 0 && (
            <p className="mt-1 text-[13px] leading-[1.5] text-muted">After your design is reviewed, the requirements will change. You will not be told how until then.</p>
          )}
        </PanelCard>
        {stage !== 'defend' && problem.scenarios.length > 0 && (
          <PanelCard title="Scenarios to walk">
            <ul className="flex flex-col gap-1.5">
              {problem.scenarios.map((sc) => <li key={sc.id} className="text-[14px] leading-[1.5] text-ink">· {sc.title}</li>)}
            </ul>
          </PanelCard>
        )}
        <PanelCard title="Decisions logged">
          {decisions.length > 0 ? (
            <p className="text-[14px] leading-[1.55] text-muted">
              {decisions.map((d, i) => <span key={i} className="block">{i + 1} · {d.what}{d.why.trim() ? ` — ${d.why}` : ''}</span>)}
            </p>
          ) : (
            <p className="text-[14px] leading-[1.55] text-muted">None yet. A decision is a choice with the alternative you rejected.</p>
          )}
        </PanelCard>
        {completed.length > 0 && (
          <Link href={`/report/${attemptId}`} className="btn-secondary btn-xs self-start">Report so far</Link>
        )}
      </Panel>
    </>
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
