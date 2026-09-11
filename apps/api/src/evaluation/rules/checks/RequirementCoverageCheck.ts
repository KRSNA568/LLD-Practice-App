import type { CriterionResult, Score } from '@lld/contracts'
import type { DesignCheck, EvaluationContext } from '../../Evaluator.js'
import { containsAny, mentionsAny, overlaps, stems, surfaceTokens } from '../text.js'

/**
 * Did the design actually address what the brief asked for?
 *
 * The cheapest and most common failure in an LLD attempt is not a bad abstraction —
 * it is quietly skipping a requirement. This is provable rather than judged: each
 * requirement either has something in the design that speaks to it, or it does not.
 *
 * A requirement counts as addressed if its authored keywords appear in a class
 * name, responsibility, member or assumption. The keywords are authored per
 * requirement for a reason: "vehicle" appears in five of the six parking-lot
 * requirements, so word overlap alone let a design with a Vehicle class cover the
 * fee requirement without a fee in sight. Problems without keywords fall back to
 * overlap, which is generous by design — the point is to catch "you forgot fees
 * entirely", not to police phrasing.
 */
export class RequirementCoverageCheck implements DesignCheck {
  readonly id = 'requirement-coverage'
  readonly criterionId = 'requirement-coverage' as const
  readonly stage = 'design' as const
  readonly requires = ['structure'] as const

  run(ctx: EvaluationContext): CriterionResult {
    const { problem, graph, design } = ctx

    const surfaces = [
      ...graph.classes.map((c) => `${c.name} ${c.responsibility} ${c.attributes.join(' ')} ${c.methods.join(' ')}`),
      ...design.assumptions,
    ]

    const uncovered: string[] = []
    const coveredBy = new Map<string, string>()

    for (const req of problem.requirements) {
      const needle = stems(req.text)
      const speaksTo = (surface: string): boolean =>
        req.keywords.length > 0
          ? mentionsAny(surfaceTokens(surface), req.keywords)
          : overlaps(needle, surface) || containsAny(surface, req.conceptHints)

      let matchedClass: string | undefined

      for (const cls of graph.classes) {
        const surface = `${cls.name} ${cls.responsibility} ${cls.attributes.join(' ')} ${cls.methods.join(' ')}`
        if (speaksTo(surface)) {
          matchedClass = cls.name
          break
        }
      }

      const inAssumptions = matchedClass === undefined && surfaces.some(speaksTo)

      if (matchedClass !== undefined) {
        coveredBy.set(req.id, matchedClass)
      } else if (!inAssumptions) {
        uncovered.push(req.text)
      }
    }

    const total = problem.requirements.length
    const covered = total - uncovered.length
    const ratio = total === 0 ? 1 : covered / total

    const score: Score =
      ratio === 1 ? 4 : ratio >= 0.8 ? 3 : ratio >= 0.6 ? 2 : ratio >= 0.4 ? 1 : 0

    const concern =
      uncovered.length === 0
        ? `All ${total} requirements are addressed somewhere in the design.`
        : `${uncovered.length} of ${total} requirements have nothing in the design that speaks to them: ` +
          uncovered.map((r) => `"${r}"`).join('; ') + '.'

    const suggestion =
      uncovered.length === 0
        ? 'Next time, check that each requirement is owned by a class rather than only mentioned.'
        : 'Add a class that owns each missing requirement, or state in your assumptions why it is out of scope.'

    // Evidence points at the classes doing the covering. When nothing covers a
    // requirement there is, by definition, nothing in the design to cite — the
    // concern names the requirement instead.
    const cited = [...new Set(coveredBy.values())].slice(0, 4)

    return {
      criterionId: this.criterionId,
      stage: this.stage,
      score,
      evidence: cited.map((name) => ({ kind: 'class' as const, name })),
      concern,
      suggestion,
      confidence: 'high',
      evaluatorId: 'rule-evaluator',
      evaluatorKind: 'deterministic',
    }
  }
}
