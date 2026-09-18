// Re-run the measured design-stage checks on the study's designs with the rubric
// as it is now, without touching the stored evaluations. Run from the repo root:
//
//   npx tsx apps/api/scripts/rescore-study.ts --in study-sim
//
// The stored scores are what the learners saw; this is what they would see after
// the rubric fixes the study prompted. Both belong in the findings. Deterministic
// checks only, no model — the LLM-read criteria are not part of the composite.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DesignModel, Problem, Rubric } from '@lld/contracts'
import { DesignGraph } from '../src/domain/design/DesignGraph.js'
import { RuleEvaluator } from '../src/evaluation/rules/RuleEvaluator.js'

const args = process.argv.slice(2)
const IN = args.includes('--in') ? args[args.indexOf('--in') + 1]! : 'study-sim'
const root = fileURLToPath(new URL('../../../', import.meta.url))
const problem = JSON.parse(readFileSync(join(root, 'content/problems/parking-lot.json'), 'utf8')) as Problem
const rubric = JSON.parse(readFileSync(join(root, 'content/rubrics/lld-core.json'), 'utf8')) as Rubric
const MEASURED = ['requirement-coverage', 'class-responsibilities', 'coupling-cohesion', 'abstraction-use', 'behaviour']

const evaluator = new RuleEvaluator()
const files = readdirSync(IN).filter((f) => /^[SJ]\d\.json$/.test(f)).sort()
console.log(['learner', 'stored', 'now', ...MEASURED.map((c) => c.split('-')[0])].map((s, i) => s.padEnd(i < 3 ? 8 : 10)).join(''))
for (const file of files) {
  const record = JSON.parse(readFileSync(join(IN, file), 'utf8')) as { persona: { code: string }; design: DesignModel; results?: Array<{ criterionId: string; stage: string; score: number }> }
  const results = await evaluator.evaluate({ stage: 'design', problem, rubric, facets: ['structure', 'behaviour', 'rationale'], design: record.design, graph: new DesignGraph(record.design) })
  const now = Object.fromEntries(results.map((r) => [r.criterionId, r.score]))
  const stored = Object.fromEntries((record.results ?? []).filter((r) => r.stage === 'design').map((r) => [r.criterionId, r.score]))
  const mean = (m: Record<string, number>) => MEASURED.map((c) => m[c]).filter((n): n is number => n !== undefined).reduce((a, b, _, xs) => a + b / xs.length, 0)
  console.log([record.persona.code, mean(stored).toFixed(2), mean(now).toFixed(2), ...MEASURED.map((c) => `${stored[c] ?? '?'}→${now[c] ?? '?'}`)].map((s, i) => String(s).padEnd(i < 3 ? 8 : 10)).join(''))
}
