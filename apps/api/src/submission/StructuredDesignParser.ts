import {
  designModelSchema,
  RELATIONSHIP_KINDS,
  STEREOTYPES,
  WALKTHROUGH_OUTCOMES,
  type DesignModel,
  type FieldError,
  type RawStructuredSubmission,
  type RelationshipKind,
  type Stereotype,
  type WalkthroughOutcome,
} from '@lld/contracts'
import type { ParseResult, SubmissionParser } from './SubmissionParser.js'

/**
 * Parses the guided form into a DesignModel.
 *
 * The form is a class diagram captured as a table: class rows are nodes, relationship
 * rows are edges. Same information a diagram carries, without a drawing canvas and
 * without the ambiguity of hand-drawn arrows. The walkthrough section is a CRC
 * role-play captured as a list, and the decisions section is the rationale a
 * reviewer would otherwise have to ask for.
 *
 * Empty rows are dropped rather than rejected. The workspace always renders a blank
 * row at the bottom for adding the next class, so a trailing empty row is the normal
 * state of the form, not a mistake worth an error message.
 */
export class StructuredDesignParser implements SubmissionParser<RawStructuredSubmission> {
  readonly format = 'structured-design'
  readonly label = 'Structured design'
  readonly facets = ['structure', 'behaviour', 'rationale'] as const

  parse(raw: RawStructuredSubmission): ParseResult {
    const errors: FieldError[] = []

    const assumptions = raw.assumptions.map((a) => a.trim()).filter((a) => a.length > 0)

    const classRows = raw.classes.filter(
      (c) => c.name.trim().length > 0 || c.responsibility.trim().length > 0,
    )

    const classes = classRows.map((row, i) => {
      const name = row.name.trim()
      const responsibility = row.responsibility.trim()

      if (name.length === 0) {
        errors.push({ path: `classes.${i}.name`, message: 'Give this class a name' })
      }
      if (responsibility.length === 0) {
        errors.push({
          path: `classes.${i}.responsibility`,
          message: 'Say what this class is responsible for',
        })
      }

      return {
        name,
        stereotype: asStereotype(row.stereotype),
        responsibility,
        attributes: row.attributes.map((a) => a.trim()).filter(Boolean),
        methods: row.methods.map((m) => m.trim()).filter(Boolean),
      }
    })

    // Duplicate names would make evidence refs ambiguous — a finding could not say
    // which of two identically-named classes it meant.
    const seen = new Map<string, number>()
    classes.forEach((c, i) => {
      const key = c.name.toLowerCase()
      if (key.length === 0) return
      const first = seen.get(key)
      if (first !== undefined) {
        errors.push({
          path: `classes.${i}.name`,
          message: `Duplicate class name — already used in row ${first + 1}`,
        })
      } else {
        seen.set(key, i)
      }
    })

    const relRows = raw.relationships.filter(
      (r) => r.from.trim().length > 0 || r.to.trim().length > 0,
    )

    const relationships = relRows.map((row, i) => {
      const from = row.from.trim()
      const to = row.to.trim()

      if (from.length === 0) {
        errors.push({ path: `relationships.${i}.from`, message: 'Pick a source class' })
      }
      if (to.length === 0) {
        errors.push({ path: `relationships.${i}.to`, message: 'Pick a target class' })
      }
      if (from.length > 0 && from.toLowerCase() === to.toLowerCase()) {
        errors.push({
          path: `relationships.${i}.to`,
          message: 'A class cannot relate to itself',
        })
      }
      if (!RELATIONSHIP_KINDS.includes(row.kind as RelationshipKind)) {
        errors.push({
          path: `relationships.${i}.kind`,
          message: `Pick one of: ${RELATIONSHIP_KINDS.join(', ')}`,
        })
      }

      return { from, to, kind: asRelationshipKind(row.kind) }
    })

    // A decision is only a decision once it says what it decided. Alternative and
    // reason are optional at parse time; the evaluator scores their absence.
    const decisions = raw.decisions
      .map((d) => ({ what: d.what.trim(), alternative: d.alternative.trim(), why: d.why.trim() }))
      .filter((d) => d.what.length > 0 || d.alternative.length > 0 || d.why.length > 0)

    decisions.forEach((d, i) => {
      if (d.what.length === 0) {
        errors.push({ path: `decisions.${i}.what`, message: 'Say what you decided' })
      }
    })

    // Walkthrough rows: a scenario with no steps is dropped (the learner did not
    // walk it), and a half-filled step is an error on that step.
    const walkthroughs = raw.walkthroughs
      .map((w, wi) => {
        const steps = w.steps
          .map((s) => ({ className: s.className.trim(), method: s.method.trim(), note: s.note.trim() }))
          .filter((s) => s.className.length > 0 || s.method.length > 0)

        steps.forEach((s, si) => {
          if (s.className.length === 0) {
            errors.push({ path: `walkthroughs.${wi}.steps.${si}.className`, message: 'Pick the class that acts here' })
          }
          if (s.method.length === 0) {
            errors.push({ path: `walkthroughs.${wi}.steps.${si}.method`, message: 'Name the method that runs' })
          }
        })

        return {
          scenarioId: w.scenarioId.trim(),
          steps,
          outcome: asOutcome(w.outcome),
        }
      })
      .filter((w) => w.scenarioId.length > 0 && w.steps.length > 0)

    if (classes.length === 0) {
      errors.push({ path: 'classes', message: 'A design needs at least one class' })
    }

    if (errors.length > 0) return { ok: false, errors }

    // Belt and braces: the schema is the single source of truth for shape, so a
    // future edit to this method cannot silently emit an invalid model.
    const parsed = designModelSchema.safeParse({
      assumptions,
      classes,
      relationships,
      tradeoffs: raw.tradeoffs.trim(),
      decisions,
      walkthroughs,
    })

    if (!parsed.success) {
      return {
        ok: false,
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      }
    }

    return { ok: true, design: parsed.data }
  }
}

function asStereotype(value: string): Stereotype {
  const v = value.trim().toLowerCase()
  return (STEREOTYPES as readonly string[]).includes(v) ? (v as Stereotype) : 'class'
}

function asRelationshipKind(value: string): RelationshipKind {
  const v = value.trim().toLowerCase()
  return (RELATIONSHIP_KINDS as readonly string[]).includes(v) ? (v as RelationshipKind) : 'uses'
}

function asOutcome(value: string): WalkthroughOutcome {
  const v = value.trim().toLowerCase()
  return (WALKTHROUGH_OUTCOMES as readonly string[]).includes(v) ? (v as WalkthroughOutcome) : 'ok'
}

/**
 * The inverse of parse, for prefilling the form: the change stage starts from the
 * frozen design, and a new attempt starts from wherever the last one ended. A blank
 * trailing row is not added here — the form does that itself.
 */
export function toRawStructuredSubmission(design: DesignModel): RawStructuredSubmission {
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
