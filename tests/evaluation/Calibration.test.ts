import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Problem, Rubric } from '@lld/contracts'
import { DesignGraph } from '../../apps/api/src/domain/design/DesignGraph.js'
import { EvaluationPipeline } from '../../apps/api/src/evaluation/EvaluationPipeline.js'
import { RuleEvaluator } from '../../apps/api/src/evaluation/rules/RuleEvaluator.js'
import { LlmEvaluator } from '../../apps/api/src/evaluation/llm/LlmEvaluator.js'
import { StubLlmClient } from '../../apps/api/src/evaluation/llm/StubLlmClient.js'

/**
 * The calibration gate.
 *
 * Every problem ships gold designs with an expected score band per criterion. This
 * suite runs each through the real pipeline and fails if a score lands outside its
 * band. That is what stops the evaluator rotting: a change to a check, a prompt or
 * a problem file cannot ship without proving it still separates a strong design
 * from a weak one on every problem in the library.
 */

const root = new URL('../../content/', import.meta.url)
const read = <T,>(rel: string): T => JSON.parse(readFileSync(fileURLToPath(new URL(rel, root)), 'utf8')) as T

const rubric = read<Rubric>('rubrics/lld-core.json')
const problems = readdirSync(fileURLToPath(new URL('problems/', root)))
  .filter((f) => f.endsWith('.json') && f !== 'catalog.json')
  .map((f) => read<Problem>(`problems/${f}`))

const pipeline = new EvaluationPipeline([new RuleEvaluator(), new LlmEvaluator(new StubLlmClient())])

describe('calibration — every gold design scores inside its authored band', () => {
  for (const problem of problems) {
    describe(problem.title, () => {
      for (const entry of problem.calibrationSet) {
        it(`${entry.label}`, async () => {
          const design = problem.goldDesigns[entry.designId]
          expect(design, `gold design "${entry.designId}" missing`).toBeDefined()

          const outcome = await pipeline.run({
            stage: 'design',
            problem,
            rubric,
            facets: ['structure', 'behaviour', 'rationale'],
            design: design!,
            graph: new DesignGraph(design!),
          })

          for (const [criterionId, [lo, hi]] of Object.entries(entry.expectedBands)) {
            const result = outcome.results.find((r) => r.criterionId === criterionId)
            expect(result, `${criterionId} was not scored`).toBeDefined()
            expect(
              result!.score,
              `${problem.id}/${entry.label}: ${criterionId} scored ${result!.score}, expected ${lo}–${hi}. ${result!.concern}`,
            ).toBeGreaterThanOrEqual(lo)
            expect(result!.score, `${problem.id}/${entry.label}: ${criterionId} scored ${result!.score}, expected ${lo}–${hi}`).toBeLessThanOrEqual(hi)
          }
        })
      }
    })
  }

  it('separates strong from weak on every problem', async () => {
    for (const problem of problems) {
      const scores = await Promise.all(
        problem.calibrationSet.map(async (entry) => {
          const design = problem.goldDesigns[entry.designId]!
          const outcome = await pipeline.run({
            stage: 'design', problem, rubric, facets: ['structure', 'behaviour', 'rationale'], design, graph: new DesignGraph(design),
          })
          return { label: entry.label, mean: outcome.results.reduce((a, r) => a + r.score, 0) / outcome.results.length }
        }),
      )
      const strong = scores.find((s) => s.label === 'strong')!
      for (const other of scores.filter((s) => s.label !== 'strong')) {
        expect(strong.mean, `${problem.id}: strong (${strong.mean}) should beat ${other.label} (${other.mean})`).toBeGreaterThan(other.mean)
      }
    }
  })
})
