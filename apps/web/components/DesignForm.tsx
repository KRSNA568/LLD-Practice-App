'use client'

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
    <div className="space-y-7">
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
      >
        <div className="space-y-2.5">
          <div className="hidden gap-2 px-1 text-[11px] uppercase tracking-wide text-ink-faint md:grid md:grid-cols-[1.1fr_0.7fr_2fr_auto]">
            <span>Name</span>
            <span>Type</span>
            <span>Responsibility</span>
            <span />
          </div>

          <AnimatePresence initial={false}>
            {value.classes.map((row, i) => {
              const nameError = errorFor(`classes.${i}.name`)
              const respError = errorFor(`classes.${i}.responsibility`)
              const state = touchState(row.name)
              return (
                <Row key={i}>
                  <motion.div
                    animate={
                      state === 'added'
                        ? { boxShadow: '0 0 0 2px rgb(var(--positive) / 0.45)' }
                        : state === 'modified'
                          ? { boxShadow: '0 0 0 2px rgb(var(--caution) / 0.45)' }
                          : { boxShadow: '0 0 0 0px rgb(var(--caution) / 0)' }
                    }
                    transition={{ duration: 0.25 }}
                    className="flex-1 rounded-xl"
                  >
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
                  </motion.div>
                  <RemoveButton
                    disabled={disabled || value.classes.length === 1}
                    onClick={() => patch({ classes: value.classes.filter((_, j) => j !== i) })}
                  />
                </Row>
              )
            })}
          </AnimatePresence>

          <AddButton
            disabled={disabled}
            onClick={() =>
              patch({
                classes: [
                  ...value.classes,
                  { name: '', stereotype: 'class', responsibility: '', attributes: [], methods: [] },
                ],
              })
            }
          >
            Add class
          </AddButton>
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
  children,
}: {
  title: string
  hint: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2.5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">{hint}</p>
      </div>
      {children}
      <FieldError message={error} />
    </section>
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
      className="rounded-lg px-2 py-1.5 text-xs font-medium text-brand transition-colors hover:bg-brand-soft disabled:opacity-40"
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
      className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-raised hover:text-critical disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
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
