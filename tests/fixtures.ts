import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { DesignModel, Problem, Rubric, Stage } from '@lld/contracts'
import { DesignGraph } from '../apps/api/src/domain/design/DesignGraph.js'
import type { EvaluationContext } from '../apps/api/src/evaluation/Evaluator.js'

const root = new URL('../', import.meta.url)

function load<T>(relative: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relative, root)), 'utf8')) as T
}

export const rubric = load<Rubric>('content/rubrics/lld-core.json')
export const parkingLot = load<Problem>('content/problems/parking-lot.json')

/**
 * The gold designs are content, not test code: the same four designs drive the
 * critique warm-up, the calibration suite and these tests. A fixture that drifted
 * from what the learner can see would be a fixture testing nothing.
 */
export const strongDesign: DesignModel = parkingLot.goldDesigns['strong']!
export const godClassDesign: DesignModel = parkingLot.goldDesigns['god-class']!
export const overPatternedDesign: DesignModel = parkingLot.goldDesigns['over-patterned']!
export const requirementsMissedDesign: DesignModel = parkingLot.goldDesigns['requirements-missed']!

/** A design-stage evaluation context over the parking lot problem. */
export function designCtx(
  design: DesignModel = strongDesign,
  over: Partial<EvaluationContext> = {},
): EvaluationContext {
  return {
    stage: 'design' satisfies Stage,
    problem: parkingLot,
    rubric,
    facets: ['structure', 'behaviour', 'rationale'],
    design,
    graph: new DesignGraph(design),
    ...over,
  }
}

/** A change-stage context: `before` was frozen, `after` is the revision. */
export function changeCtx(
  before: DesignModel,
  after: DesignModel,
  over: Partial<EvaluationContext> = {},
): EvaluationContext {
  return {
    stage: 'change',
    problem: parkingLot,
    rubric,
    facets: ['structure', 'behaviour', 'rationale'],
    design: after,
    graph: new DesignGraph(after),
    previousDesign: before,
    change: parkingLot.hiddenChanges[0],
    rationale: '',
    ...over,
  }
}
