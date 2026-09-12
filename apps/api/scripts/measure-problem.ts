/**
 * Runs every gold design of a problem file through the measured checks and the
 * coherence rules, and (with --write-bands) records calibration bands: [3,4] for
 * the strong design — a bar — and ±1 around the actual score for the others — a
 * regression band. The second half of authoring: edit, measure, repeat.
 *
 *   npx tsx apps/api/scripts/measure-problem.ts content/problems/<id>.draft.json [--write-bands]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { problemSchema, type Problem } from '@lld/contracts'
import { RuleEvaluator } from '../src/evaluation/rules/RuleEvaluator.js'
import { DesignGraph } from '../src/domain/design/DesignGraph.js'
import { ContentStore } from '../src/infra/content/ContentStore.js'

async function main() {
  const file = resolve(process.argv[2] ?? '')
  const write = process.argv.includes('--write-bands')
  const problem = problemSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
  const rubric = ContentStore.load().rubricFor(problem)
  const rules = new RuleEvaluator()
  const cal: Problem['calibrationSet'] = []
  let strongBelowPar = false

  for (const [label, design] of Object.entries(problem.goldDesigns)) {
    const results = await rules.evaluate({
      stage: 'design',
      problem,
      rubric,
      facets: ['structure', 'behaviour', 'rationale'],
      design,
      graph: new DesignGraph(design),
    })
    console.log(`${label}: ${results.map((r) => `${r.criterionId}=${r.score}`).join(' ')}`)
    for (const r of results) {
      if ((label === 'strong' && r.score < 3) || r.score <= 1) console.log(`   ${r.criterionId} ${r.score}: ${r.concern}`)
      if (label === 'strong' && r.score < 3) strongBelowPar = true
    }
    const bands: Record<string, [number, number]> = {}
    for (const r of results) bands[r.criterionId] = label === 'strong' ? [3, 4] : [Math.max(0, r.score - 1), Math.min(4, r.score + 1)]
    if (label === 'strong') bands['edge-cases'] = [2, 4]
    cal.push({ designId: label, label, expectedBands: bands })
  }

  ContentStore.assertCoherent(problem, file)
  console.log('coherence: ok')
  if (strongBelowPar) console.log('NOTE: the strong design is below par somewhere — fix it before writing bands.')

  if (write && !strongBelowPar) {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    raw.calibrationSet = cal
    writeFileSync(file, JSON.stringify(raw, null, 2) + '\n')
    console.log('calibration bands written')
  }
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e)
  process.exit(1)
})
