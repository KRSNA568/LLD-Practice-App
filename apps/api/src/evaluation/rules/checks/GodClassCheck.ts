import type { CriterionResult, DesignClass, Score } from '@lld/contracts'
import type { DesignCheck, EvaluationContext } from '../../Evaluator.js'
import { actionVerbs, responsibilityClauses } from '../text.js'

/**
 * Names that almost always signal a class with no real identity of its own.
 * "Engine" is deliberately absent: a PricingEngine or RulesEngine is usually a
 * real orchestrator with a domain in its name, and calibration showed the suffix
 * alone was penalising exactly that.
 */
const VAGUE_SUFFIX = /(manager|service|handler|processor|controller|helper|util|utils|system)$/i

/**
 * Is any one class doing too many jobs?
 *
 * The form asks for a one-sentence responsibility, and that constraint does most of
 * the work: a learner who writes "handles parking, pricing, exit, payment and ticket
 * generation" has described their own god class. This check reads that sentence back
 * to them with a count attached.
 *
 * Two independent signals, because either alone misfires. Clause counting catches
 * the honest learner who lists everything; degree counting catches the one who wrote
 * a vague sentence for a class that the whole design leans on.
 */
export class GodClassCheck implements DesignCheck {
  readonly id = 'god-class'
  readonly criterionId = 'class-responsibilities' as const
  readonly stage = 'design' as const
  readonly requires = ['structure'] as const

  run(ctx: EvaluationContext): CriterionResult {
    const { graph } = ctx

    const scored = graph.classes.map((cls) => ({
      cls,
      clauses: responsibilityClauses(cls.responsibility).length,
      verbs: actionVerbs(cls.responsibility).length,
      degree: graph.inDegree(cls.name) + graph.outDegree(cls.name),
      vague: VAGUE_SUFFIX.test(cls.name.trim()),
    }))

    const offenders = scored
      .filter((s) => s.clauses >= 3 || s.verbs >= 3 || (s.vague && s.degree >= 4))
      .sort((a, b) => b.clauses + b.verbs - (a.clauses + a.verbs))

    const worst = offenders[0]

    // A design with no relationships at all is a list, not a design. Say so here
    // rather than letting it quietly pass because no single class looks overloaded.
    const noStructure = graph.classes.length >= 3 && graph.relationships.length === 0

    // A criterion that measures the *absence* of a fault will happily award full
    // marks to a design with nothing in it to be faulty. An empty submission was
    // scoring 4 here and being told "every class describes a single job", which is
    // both wrong and the opposite of useful. Nothing to judge is not a pass.
    if (graph.classes.length === 0) {
      return {
        criterionId: this.criterionId,
        stage: this.stage,
        score: 0,
        evidence: [],
        concern: 'There are no classes in this design, so there is nothing to judge here yet.',
        suggestion: 'Name the objects in this problem and give each one a single sentence saying what it is responsible for.',
        confidence: 'high',
        evaluatorId: 'rule-evaluator',
        evaluatorKind: 'deterministic',
      }
    }

    const score: Score = noStructure
      ? 1
      : offenders.length === 0
        ? 4
        : offenders.length === 1 && (worst!.clauses <= 3 && worst!.verbs <= 3)
          ? 2
          : offenders.length === 1
            ? 1
            : 0

    const concern = noStructure
      ? `${graph.classes.length} classes are declared but none are connected. Responsibilities cannot be judged without knowing who calls whom.`
      : offenders.length === 0
        ? 'Every class describes a single job.'
        : offenders
            .slice(0, 3)
            .map((o) => describe(o.cls, o.clauses, o.verbs, o.degree))
            .join(' ')

    const suggestion = noStructure
      ? 'Add relationships showing which class uses or owns which.'
      : offenders.length === 0
        ? 'Keep responsibilities to one sentence as the design grows.'
        : `Split ${worst!.cls.name}. Pull out the responsibility with the fewest dependencies on the rest — usually calculation rather than coordination.`

    return {
      criterionId: this.criterionId,
      stage: this.stage,
      score,
      evidence: offenders.slice(0, 3).map((o) => ({ kind: 'class' as const, name: o.cls.name })),
      concern,
      suggestion,
      confidence: offenders.length > 0 || noStructure ? 'high' : 'medium',
      evaluatorId: 'rule-evaluator',
      evaluatorKind: 'deterministic',
    }
  }
}

function describe(cls: DesignClass, clauses: number, verbs: number, degree: number): string {
  if (clauses >= 3) {
    return `${cls.name} lists ${clauses} separate responsibilities in one sentence: "${cls.responsibility}".`
  }
  if (verbs >= 3) {
    return `${cls.name} describes ${verbs} distinct actions, which usually means several classes are hiding inside it.`
  }
  return (
    `${cls.name} is a hub with ${degree} connections but a name that says nothing about what it owns.`
  )
}
