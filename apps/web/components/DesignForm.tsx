'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { FieldError, RawStructuredSubmission, Scenario } from '@lld/contracts'
import { EASE } from './motion'
import { WalkthroughEditor } from './WalkthroughEditor'

/**
 * The structured design form.
 *
 * This is a class diagram captured as a table — class rows are nodes, relationship
 * rows are edges. Same information a drawing canvas would carry, without the
 * drawing, and unambiguous in a way a hand-drawn arrow never is.
 *
 * The one-sentence cap on responsibility is the most useful constraint here: a
 * learner who cannot describe a class without three "and"s has found their own god
 * class before any evaluator sees it. The Run section is the second: a class whose
 * methods nobody calls in any scenario is a class that is not pulling its weight.
 */

const STEREOTYPES = ['class', 'interface', 'abstract', 'enum'] as const
const KINDS = ['has-a', 'uses', 'extends', 'implements'] as const

export type FormState = RawStructuredSubmission

export function emptyForm(): FormState {
  return {
    format: 'structured-design',
    assumptions: [''],
    classes: [{ name: '', stereotype: 'class', responsibility: '', attributes: [], methods: [] }],
    relationships: [{ from: '', to: '', kind: 'uses' }],
    tradeoffs: '',
    decisions: [{ what: '', alternative: '', why: '' }],
    walkthroughs: [],
  }
}

/** Comma-separated members ↔ list. Kept forgiving: "park(), exit" is fine. */
const splitMembers = (s: string): string[] =>
  s
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
const joinMembers = (xs: string[]): string => xs.join(', ')

export function DesignForm({
  value,
  onChange,
  errors,
  disabled,
  scenarios,
  touched,
  frozen,
}: {
  value: FormState
  onChange: (next: FormState) => void
  errors: FieldError[]
  disabled?: boolean
  /** The scenarios to walk. Omit to hide the Run section. */
  scenarios?: Scenario[]
  /** Change stage: class names that differ from the frozen design, for the amber glow. */
  touched?: { added: string[]; modified: string[] }
  /** Change stage: the design is being revised, so the Run section is read-mostly. */
  frozen?: boolean
}) {
  const errorFor = (path: string): string | undefined =>
    errors.find((e) => e.path === path)?.message

  const patch = (partial: Partial<FormState>) => onChange({ ...value, ...partial })

  const classNames = value.classes.map((c) => c.name.trim()).filter(Boolean)
  const touchState = (name: string): 'added' | 'modified' | null => {
    const k = name.trim().toLowerCase()
    if (!touched || !k) return null
    if (touched.added.some((n) => n.toLowerCase() === k)) return 'added'
    if (touched.modified.some((n) => n.toLowerCase() === k)) return 'modified'
    return null
  }

  return (
    <div className="flex flex-col gap-8">
      <Section
        title="Assumptions"
        hint="Real briefs are incomplete. Write down what you decided so it is a choice, not a gap."
      >
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {value.assumptions.map((assumption, i) => (
              <Row key={i}>
                <input
                  className="field"
                  placeholder="e.g. Fees are calculated on exit, not entry"
                  value={assumption}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = [...value.assumptions]
                    next[i] = e.target.value
                    patch({ assumptions: next })
                  }}
                />
                <RemoveButton
                  disabled={disabled || value.assumptions.length === 1}
                  onClick={() =>
                    patch({ assumptions: value.assumptions.filter((_, j) => j !== i) })
                  }
                />
              </Row>
            ))}
          </AnimatePresence>
          <AddButton
            disabled={disabled}
            onClick={() => patch({ assumptions: [...value.assumptions, ''] })}
          >
            Add assumption
          </AddButton>
        </div>
      </Section>

      <Section
        title="Classes"
        hint="One sentence per class. If you need more than one, you have found two classes. Methods matter: the scenarios below are walked against them."
        error={errorFor('classes')}
        action={
          <button
            type="button"
            disabled={disabled}
            onClick={() => patch({ classes: [...value.classes, { name: '', stereotype: 'class', responsibility: '', attributes: [], methods: [] }] })}
            className="inline-flex h-9 flex-none items-center gap-2 whitespace-nowrap rounded-full border border-ink-strong px-4 text-[13px] font-medium leading-none text-ink-strong transition-colors hover:bg-soft disabled:opacity-50"
          >
            + Add class
          </button>
        }
      >
        <div className="space-y-2.5">

          <AnimatePresence initial={false}>
            {value.classes.map((row, i) => {
              const nameError = errorFor(`classes.${i}.name`)
              const respError = errorFor(`classes.${i}.responsibility`)
              const state = touchState(row.name)
              return (
                <ClassRow
                  key={i}
                  index={i}
                  name={row.name}
                  stereotype={row.stereotype}
                  methods={row.methods}
                  state={state}
                  defaultOpen={!row.name.trim()}
                  disabled={disabled}
                  canRemove={value.classes.length > 1}
                  onRemove={() => patch({ classes: value.classes.filter((_, j) => j !== i) })}
                >
                  <div>
                    <div className="grid gap-2 md:grid-cols-[1.1fr_0.7fr_2fr]">
                      <div>
                        <input
                          className={`field font-mono text-[13px] ${nameError ? 'border-critical/60' : ''}`}
                          placeholder="PricingStrategy"
                          value={row.name}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = [...value.classes]
                            next[i] = { ...row, name: e.target.value }
                            patch({ classes: next })
                          }}
                        />
                        <FieldError message={nameError} />
                      </div>

                      <select
                        className="field"
                        value={row.stereotype}
                        disabled={disabled}
                        onChange={(e) => {
                          const next = [...value.classes]
                          next[i] = { ...row, stereotype: e.target.value }
                          patch({ classes: next })
                        }}
                      >
                        {STEREOTYPES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>

                      <div>
                        <input
                          className={`field ${respError ? 'border-critical/60' : ''}`}
                          placeholder="Calculates the fee for a completed stay"
                          value={row.responsibility}
                          disabled={disabled}
                          onChange={(e) => {
                            const next = [...value.classes]
                            next[i] = { ...row, responsibility: e.target.value }
                            patch({ classes: next })
                          }}
                        />
                        <FieldError message={respError} />
                      </div>
                    </div>

                    <div className="mt-1.5 grid gap-2 md:grid-cols-2">
                      <input
                        className="field !py-1.5 font-mono text-[12px]"
                        placeholder="attributes: entryTime, spot"
                        value={joinMembers(row.attributes)}
                        disabled={disabled}
                        onChange={(e) => {
                          const next = [...value.classes]
                          next[i] = { ...row, attributes: splitMembers(e.target.value) }
                          patch({ classes: next })
                        }}
                      />
                      <input
                        className="field !py-1.5 font-mono text-[12px]"
                        placeholder="methods: feeFor, allocate"
                        value={joinMembers(row.methods)}
                        disabled={disabled}
                        onChange={(e) => {
                          const next = [...value.classes]
                          next[i] = { ...row, methods: splitMembers(e.target.value) }
                          patch({ classes: next })
                        }}
                      />
                    </div>
                  </div>
                </ClassRow>
              )
            })}
          </AnimatePresence>

          {/* The dashed row from the design: a place to name the next class. */}
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              patch({
                classes: [
                  ...value.classes,
                  { name: '', stereotype: 'class', responsibility: '', attributes: [], methods: [] },
                ],
              })
            }
            className="flex w-full items-center gap-4 rounded-2xl border-2 border-dashed border-dashed bg-white px-5 py-4 text-left transition-colors hover:bg-soft disabled:opacity-50"
          >
            <span className="h-3 w-3 flex-none rounded-full bg-line" />
            <span className="text-[15px] leading-none text-faint">{frozen ? 'Name the class the change should land in…' : 'Name the next class…'}</span>
          </button>
        </div>
      </Section>

      <Section
        title="Relationships"
        hint="Who owns whom, and who calls whom. This is what turns a list into a design."
      >
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {value.relationships.map((row, i) => (
              <Row key={i}>
                <div className="grid flex-1 gap-2 sm:grid-cols-[1fr_auto_1fr]">
                  <ClassPicker
                    value={row.from}
                    options={classNames}
                    disabled={disabled}
                    error={errorFor(`relationships.${i}.from`)}
                    onChange={(v) => {
                      const next = [...value.relationships]
                      next[i] = { ...row, from: v }
                      patch({ relationships: next })
                    }}
                  />
                  <select
                    className="field sm:w-[132px]"
                    value={row.kind}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = [...value.relationships]
                      next[i] = { ...row, kind: e.target.value }
                      patch({ relationships: next })
                    }}
                  >
                    {KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <ClassPicker
                    value={row.to}
                    options={classNames}
                    disabled={disabled}
                    error={errorFor(`relationships.${i}.to`)}
                    onChange={(v) => {
                      const next = [...value.relationships]
                      next[i] = { ...row, to: v }
                      patch({ relationships: next })
                    }}
                  />
                </div>
                <RemoveButton
                  disabled={disabled}
                  onClick={() =>
                    patch({ relationships: value.relationships.filter((_, j) => j !== i) })
                  }
                />
              </Row>
            ))}
          </AnimatePresence>
          <AddButton
            disabled={disabled}
            onClick={() =>
              patch({ relationships: [...value.relationships, { from: '', to: '', kind: 'uses' }] })
            }
          >
            Add relationship
          </AddButton>
        </div>
      </Section>

      <Section
        title="Decisions"
        hint="Up to five. What you chose, what you rejected, and why — the alternative is the part a reviewer reads first."
      >
        <div className="space-y-2">
          <div className="hidden gap-2 px-1 text-[11px] uppercase tracking-wide text-ink-faint md:grid md:grid-cols-[1.2fr_1.2fr_1.6fr_auto]">
            <span>Decided</span>
            <span>Instead of</span>
            <span>Because</span>
            <span />
          </div>
          <AnimatePresence initial={false}>
            {value.decisions.map((row, i) => (
              <Row key={i}>
                <div className="grid flex-1 gap-2 md:grid-cols-[1.2fr_1.2fr_1.6fr]">
                  <div>
                    <input
                      className={`field ${errorFor(`decisions.${i}.what`) ? 'border-critical/60' : ''}`}
                      placeholder="Pricing behind an interface"
                      value={row.what}
                      disabled={disabled}
                      onChange={(e) => {
                        const next = [...value.decisions]
                        next[i] = { ...row, what: e.target.value }
                        patch({ decisions: next })
                      }}
                    />
                    <FieldError message={errorFor(`decisions.${i}.what`)} />
                  </div>
                  <input
                    className="field"
                    placeholder="a fee method on ParkingLot"
                    value={row.alternative}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = [...value.decisions]
                      next[i] = { ...row, alternative: e.target.value }
                      patch({ decisions: next })
                    }}
                  />
                  <input
                    className="field"
                    placeholder="rates change monthly; the lot does not"
                    value={row.why}
                    disabled={disabled}
                    onChange={(e) => {
                      const next = [...value.decisions]
                      next[i] = { ...row, why: e.target.value }
                      patch({ decisions: next })
                    }}
                  />
                </div>
                <RemoveButton
                  disabled={disabled || value.decisions.length === 1}
                  onClick={() => patch({ decisions: value.decisions.filter((_, j) => j !== i) })}
                />
              </Row>
            ))}
          </AnimatePresence>
          {value.decisions.length < 5 && (
            <AddButton
              disabled={disabled}
              onClick={() =>
                patch({ decisions: [...value.decisions, { what: '', alternative: '', why: '' }] })
              }
            >
              Add decision
            </AddButton>
          )}
        </div>
      </Section>

      <Section
        title="Trade-offs"
        hint="What did you deliberately give up, and what did it buy you?"
      >
        <textarea
          className="field min-h-[96px] resize-y leading-relaxed"
          placeholder="I put pricing behind an interface rather than a method on ParkingLot because rate rules change far more often than the lot structure does…"
          value={value.tradeoffs}
          disabled={disabled}
          onChange={(e) => patch({ tradeoffs: e.target.value })}
        />
      </Section>

      {scenarios && scenarios.length > 0 && (
        <Section
          title={frozen ? 'Run it again' : 'Run it'}
          hint={
            classNames.length < 2
              ? 'Declare at least two classes, then walk each scenario through them step by step.'
              : frozen
                ? 'Your walkthroughs came across from the original design. Update any step the change affects.'
                : 'Walk each scenario through your design: which class acts, which method runs. This is how you find the class that does nothing — and the one that does everything.'
          }
        >
          {classNames.length >= 2 ? (
            <WalkthroughEditor
              scenarios={scenarios}
              classes={value.classes}
              value={value.walkthroughs}
              onChange={(walkthroughs) => patch({ walkthroughs })}
              disabled={disabled}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink-faint">
              Two classes unlock the walkthrough.
            </div>
          )}
        </Section>
      )}
    </div>
  )
}

function ClassPicker({
  value,
  options,
  onChange,
  disabled,
  error,
}: {
  value: string
  options: string[]
  onChange: (value: string) => void
  disabled?: boolean
  error?: string
}) {
  return (
    <div>
      <input
        className={`field font-mono text-[13px] ${error ? 'border-critical/60' : ''}`}
        placeholder="ClassName"
        list="lld-class-names"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id="lld-class-names">
        {options.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <FieldError message={error} />
    </div>
  )
}

function Section({
  title,
  hint,
  error,
  action,
  children,
}: {
  title: string
  hint: string
  error?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="h-section">{title}</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{hint}</p>
        </div>
        {action}
      </div>
      {children}
      <FieldError message={error} />
    </section>
  )
}

/**
 * A class as the design draws it: a pastel dot, the name, its methods, a
 * chevron — and the full editor underneath when opened. A class with no name
 * yet opens by itself, because there is nothing to show collapsed.
 */
function ClassRow({ index, name, stereotype, methods, state, defaultOpen, disabled, canRemove, onRemove, children }: {
  index: number
  name: string
  stereotype: string
  methods: string[]
  state: 'added' | 'modified' | null
  defaultOpen: boolean
  disabled?: boolean
  canRemove: boolean
  onRemove: () => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const dot = ['#F5C6C8', '#F8D9B7', '#D8D3F6', '#BCEAD4'][index % 4]
  const ring = state === 'added' ? '0 0 0 2px #4E9E77' : state === 'modified' ? '0 0 0 2px #C98F4E' : '0 0 0 0px transparent'
  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto', boxShadow: ring }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="overflow-hidden rounded-2xl border border-soft bg-white"
    >
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-4 px-5 py-4 text-left">
        <span className="h-3 w-3 flex-none rounded-full" style={{ background: dot }} />
        <span className="w-[150px] flex-none truncate font-mono text-[15px] font-medium leading-none text-ink-strong">
          {name.trim() || <span className="font-sans font-normal text-faint">Unnamed class</span>}
          {stereotype !== 'class' && name.trim() && <span className="ml-1.5 font-sans text-[11px] font-normal text-muted">{stereotype}</span>}
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px] leading-[1.4] text-muted">
          {methods.filter(Boolean).join(' · ') || (state === null ? 'no methods yet' : '')}
          {state === 'added' && <span className="ml-2 text-tint-green">added</span>}
          {state === 'modified' && <span className="ml-2 text-tint-amber">changed</span>}
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6E6E6E" strokeWidth="1.8" strokeLinecap="round" className={`flex-none transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden><path d="M9 6l6 6-6 6" /></svg>
      </button>
      {open && (
        <div className="flex items-start gap-2 border-t border-soft px-5 pb-5 pt-4">
          <div className="flex-1">{children}</div>
          <RemoveButton disabled={disabled || !canRemove} onClick={onRemove} />
        </div>
      )}
    </motion.div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="flex items-start gap-2 overflow-hidden"
    >
      {children}
    </motion.div>
  )
}

function AddButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-2 self-start rounded-full border border-line bg-white px-4 text-[13px] font-medium leading-none text-ink-strong transition-colors hover:bg-soft disabled:opacity-40"
    >
      + {children}
    </button>
  )
}

function RemoveButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Remove row"
      className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-soft hover:text-tint-rose disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-faint"
    >
      ×
    </button>
  )
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <motion.p
      initial={{ opacity: 0, y: -3 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-1 text-xs text-critical"
    >
      {message}
    </motion.p>
  )
}
