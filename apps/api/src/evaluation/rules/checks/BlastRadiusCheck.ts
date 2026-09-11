import type { CriterionResult, EvidenceRef, Score } from '@lld/contracts'
import type { DesignCheck, EvaluationContext } from '../../Evaluator.js'
import { blastRadius, diffDesigns, seamsReused } from '../../../domain/design/DesignDiff.js'
import { containsAny } from '../text.js'

/**
 * When the requirements changed, did the design absorb it by adding, or by
 * reopening what already worked?
 *
 * This is extensibility measured rather than judged. The learner's first design was
 * frozen before they saw the change; the revision is diffed against it. A new class
 * plugged into an abstraction that already existed, with at most one existing class
 * touched to wire it in, is the open-closed principle happening in front of us.
 * Three edited classes and a new `isElectric` attribute is the thing the principle
 * exists to prevent — and the finding can name the attribute.
 *
 * Interviewers test exactly this with follow-up questions. Here the follow-up is
 * part of the loop, and the answer is counted.
 */

/** Attribute names that almost always mean "a branch was added somewhere". */
const FLAG_ATTRIBUTE = /^(is|has|can|should)[a-z0-9_]*$|(flag|type|kind|mode|category)$/i
/** Method names that carry the branch in their name. */
const BRANCHY_METHOD = /^(if|switch|check|handle)[a-z0-9_]*(type|kind|case|mode)/i

export class BlastRadiusCheck implements DesignCheck {
  readonly id = 'blast-radius'
  readonly criterionId = 'change-resilience' as const
  readonly stage = 'change' as const
  readonly requires = ['structure'] as const

  run(ctx: EvaluationContext): CriterionResult {
    const { design, previousDesign, change } = ctx

    if (!previousDesign || !change) {
      return this.result(0, [], 'No revision was submitted, so there is no evidence about how the design handles change.', 'Revise the design against the change and resubmit.')
    }

    const diff = diffDesigns(previousDesign, design)
    const radius = blastRadius(diff)
    const seams = seamsReused(diff, previousDesign, design)

    const evidence: EvidenceRef[] = []
    const notes: string[] = []

    // Was the change absorbed at all? Look for the new vocabulary anywhere in the
    // revised design — class names, responsibilities, attributes, methods, rationale.
    const corpus = [
      ...design.classes.flatMap((c) => [c.name, c.responsibility, ...c.attributes, ...c.methods]),
      ...design.assumptions,
      ctx.rationale ?? '',
    ].join(' ')
    const absorbed = change.mustIntroduce.length === 0 || containsAny(corpus, change.mustIntroduce)

    if (!absorbed) {
      const hint = change.mustIntroduce[0] ?? 'the new behaviour'
      return this.result(
        0,
        [],
        `Nothing in the revised design owns ${hint}. ${diff.added.length + diff.modified.length === 0 ? 'The design was resubmitted unchanged.' : 'Classes changed, but none of them speaks to the requirement that changed.'}`,
        'Name the class that owns the new behaviour, then decide whether it is a new implementation of something that already exists or a change to something that already works.',
      )
    }

    // Flag smell: a new boolean / type attribute or a branchy method on an existing class.
    const flags = diff.modified.flatMap((m) => [
      ...m.attributesAdded.filter((a) => FLAG_ATTRIBUTE.test(a)).map((a) => ({ cls: m.name, member: a, kind: 'attribute' as const })),
      ...m.methodsAdded.filter((mm) => BRANCHY_METHOD.test(mm)).map((mm) => ({ cls: m.name, member: mm, kind: 'method' as const })),
    ])

    // The new class that extends a concrete class rather than plugging into a seam.
    const extendsConcrete = diff.added.filter((c) =>
      design.relationships.some(
        (r) =>
          r.kind === 'extends' &&
          r.from.toLowerCase() === c.name.toLowerCase() &&
          previousDesign.classes.some((p) => p.name.toLowerCase() === r.to.toLowerCase() && p.stereotype === 'class'),
      ),
    )

    let score: Score
    if (diff.added.length === 0) {
      score = flags.length > 0 ? 1 : 2
    } else if (seams.length > 0 && radius <= 1 && flags.length === 0) {
      score = 4
    } else if (flags.length > 0) {
      score = 1
    } else {
      score = 3
    }

    // Narrative, in the order that matters most to the learner.
    if (diff.added.length > 0) {
      const names = diff.added.map((c) => c.name)
      const via = seams.length > 0 ? ` behind ${seams.join(' and ')}, which already existed` : extendsConcrete.length > 0 ? `, extending ${diff.added[0]!.name === extendsConcrete[0]!.name ? 'a concrete class rather than an abstraction' : 'a concrete class'}` : ', but not behind any abstraction that existed before the change'
      notes.push(`Added ${names.join(', ')}${via}.`)
      evidence.push(...diff.added.slice(0, 2).map((c) => ({ kind: 'class' as const, name: c.name })))
    } else {
      notes.push('No class was added. The change was absorbed entirely by editing classes that already worked.')
    }

    if (diff.modified.length > 0) {
      const touched = diff.modified.map((m) => `${m.name} (${m.fields.join(', ')})`)
      notes.push(
        `${diff.modified.length === 1 ? 'One existing class was' : `${diff.modified.length} existing classes were`} reopened: ${touched.join('; ')}.${radius <= 1 && diff.added.length > 0 ? ' One touch to wire in a new class is the expected cost.' : ''}`,
      )
      evidence.push(...diff.modified.slice(0, 2).map((m) => ({ kind: 'class' as const, name: m.name })))
    }

    if (diff.removed.length > 0) {
      notes.push(
        `${diff.removed.map((c) => c.name).join(', ')} ${diff.removed.length === 1 ? 'was' : 'were'} removed. If that was a rename, the rationale should say so — the evaluator cannot tell a rename from a replacement.`,
      )
    }

    for (const f of flags.slice(0, 1)) {
      notes.push(
        `${f.cls} gained ${f.kind === 'attribute' ? 'an attribute' : 'a method'} called ${f.member}. A ${f.kind === 'attribute' ? 'flag' : 'branch'} like that means the next variant is another branch in the same place.`,
      )
      if (!evidence.some((e) => e.kind === 'class' && e.name === f.cls)) evidence.push({ kind: 'class', name: f.cls })
    }

    const suggestion =
      score === 4
        ? 'This is the shape to keep: the change was a new implementation and the caller never knew.'
        : flags.length > 0
          ? `What if ${flags[0]!.cls} were handed the varying behaviour as an object instead of asking which kind it is?`
          : diff.added.length === 0
            ? 'Try again with a rule: you may add classes, but you may only edit one existing one. The one you have to edit is where the seam should go.'
            : seams.length === 0
              ? `Make ${diff.added[0]!.name} implement an interface the existing code already depends on — if there is none, that interface is what was missing in the first design.`
              : `Reduce the wiring: only one existing class should need to know ${diff.added[0]!.name} exists.`

    return this.result(score, evidence.slice(0, 5), notes.join(' '), suggestion)
  }

  private result(score: Score, evidence: EvidenceRef[], concern: string, suggestion: string): CriterionResult {
    return {
      criterionId: this.criterionId,
      stage: this.stage,
      score,
      evidence,
      concern,
      suggestion,
      confidence: 'high',
      evaluatorId: 'rule-evaluator',
      evaluatorKind: 'deterministic',
    }
  }
}
