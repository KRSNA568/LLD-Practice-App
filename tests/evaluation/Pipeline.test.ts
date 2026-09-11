import { describe, expect, it } from 'vitest'
import type { CriterionResult } from '@lld/contracts'
import { DesignGraph } from '../../apps/api/src/domain/design/DesignGraph.js'
import { EvaluationPipeline } from '../../apps/api/src/evaluation/EvaluationPipeline.js'
import type { Evaluator } from '../../apps/api/src/evaluation/Evaluator.js'
import { RuleEvaluator } from '../../apps/api/src/evaluation/rules/RuleEvaluator.js'
import { LlmEvaluator } from '../../apps/api/src/evaluation/llm/LlmEvaluator.js'
import { StubLlmClient } from '../../apps/api/src/evaluation/llm/StubLlmClient.js'
import { LlmUnavailableError } from '../../apps/api/src/evaluation/llm/LlmClient.js'
import { summarise } from '../../apps/api/src/domain/feedback/ScoreAggregator.js'
import { designCtx, godClassDesign, rubric, strongDesign } from '../fixtures.js'

const ctx = designCtx

const exploding: Evaluator = {
  id: 'exploding-evaluator',
  kind: 'llm',
  criteria: ['edge-cases', 'reasoning'],
  async evaluate(): Promise<CriterionResult[]> {
    throw new LlmUnavailableError('provider is down')
  },
}

const DESIGN_STAGE_CRITERIA = rubric.criteria.filter((c) => c.stage === 'design').map((c) => c.id)

describe('EvaluationPipeline', () => {
  it('scores every design-stage criterion when both halves work', async () => {
    const pipeline = new EvaluationPipeline([
      new RuleEvaluator(),
      new LlmEvaluator(new StubLlmClient()),
    ])
    const outcome = await pipeline.run(ctx())
    expect(outcome.results.map((r) => r.criterionId).sort()).toEqual([...DESIGN_STAGE_CRITERIA].sort())
    expect(outcome.failures).toHaveLength(0)
    expect(outcome.unscored).toHaveLength(0)
    // Six of eight: change-resilience and reasoning wait for their stages.
    expect(outcome.results).toHaveLength(6)
  })

  it('keeps measured findings when the AI half fails', async () => {
    // The whole point of not treating evaluation as atomic: a flaky provider must
    // not throw away work that already succeeded.
    const pipeline = new EvaluationPipeline([new RuleEvaluator(), exploding])
    const outcome = await pipeline.run(ctx())

    expect(outcome.results).toHaveLength(5)
    expect(outcome.results.every((r) => r.evaluatorKind === 'deterministic')).toBe(true)
    expect(outcome.failures).toEqual([
      { evaluatorId: 'exploding-evaluator', reason: 'provider is down' },
    ])
    // Only this stage's missing criterion is reported — reasoning belongs to defend.
    expect(outcome.unscored).toEqual(['edge-cases'])
  })

  it('marks the report as AI-unavailable rather than silently short', async () => {
    const pipeline = new EvaluationPipeline([new RuleEvaluator(), exploding])
    const outcome = await pipeline.run(ctx())
    const summary = summarise(outcome.results, rubric, ['design'])

    expect(summary.aiUnavailable).toBe(true)
    expect(summary.criteriaScored).toBe(5)
    expect(summary.criteriaTotal).toBe(8)
    // The average is over what was actually scored — missing criteria must not be
    // read as zeros, which would show the learner a score they did not earn.
    expect(summary.overall).toBeGreaterThan(0)
  })

  it('does not blame the AI for criteria whose stage has not happened yet', async () => {
    const pipeline = new EvaluationPipeline([
      new RuleEvaluator(),
      new LlmEvaluator(new StubLlmClient()),
    ])
    const outcome = await pipeline.run(ctx())
    // reasoning (LLM, defend stage) is absent, but design is the only completed stage.
    expect(summarise(outcome.results, rubric, ['design']).aiUnavailable).toBe(false)
  })

  it('orders results by the rubric, not by which evaluator finished first', async () => {
    const pipeline = new EvaluationPipeline([
      new LlmEvaluator(new StubLlmClient()),
      new RuleEvaluator(),
    ])
    const outcome = await pipeline.run(ctx())
    expect(outcome.results.map((r) => r.criterionId)).toEqual(DESIGN_STAGE_CRITERIA)
  })

  it('surfaces the stub failure switch as a partial report', async () => {
    process.env.LLD_STUB_FAIL = '1'
    try {
      const pipeline = new EvaluationPipeline([
        new RuleEvaluator(),
        new LlmEvaluator(new StubLlmClient()),
      ])
      const outcome = await pipeline.run(ctx())
      expect(outcome.failures).toHaveLength(1)
      expect(summarise(outcome.results, rubric, ['design']).aiUnavailable).toBe(true)
    } finally {
      delete process.env.LLD_STUB_FAIL
    }
  })

  it('judges the design that traced its refusal path above the one that did not', async () => {
    const pipeline = new EvaluationPipeline([new LlmEvaluator(new StubLlmClient())])
    const strong = await pipeline.run(ctx(strongDesign))
    const weak = await pipeline.run(ctx(godClassDesign))

    const edge = (o: typeof strong) => o.results.find((r) => r.criterionId === 'edge-cases')!.score
    expect(edge(strong)).toBeGreaterThan(edge(weak))
  })

  it('grounds stub evidence against the submission like any other provider', async () => {
    const pipeline = new EvaluationPipeline([new LlmEvaluator(new StubLlmClient())])
    const outcome = await pipeline.run(ctx())
    const graph = new DesignGraph(strongDesign)
    for (const r of outcome.results) {
      for (const ref of r.evidence) {
        if (ref.kind === 'class') expect(graph.has(ref.name)).toBe(true)
        if (ref.kind === 'assumption') expect(ref.index).toBeLessThan(strongDesign.assumptions.length)
        if (ref.kind === 'step') {
          const w = strongDesign.walkthroughs.find((x) => x.scenarioId === ref.scenarioId)!
          expect(ref.index).toBeLessThan(w.steps.length)
        }
      }
    }
  })
})
