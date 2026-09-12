/**
 * Exercises the configured LLM provider against a gold design, end to end through
 * LlmEvaluator: prompt → model → JSON → schema → grounding. Run it whenever the
 * provider, model or prompt changes; the test suite deliberately never does this.
 *
 *   npx tsx apps/api/scripts/live-llm.ts [god-class|strong|...] [design|defend]
 */
import { loadLocalEnv } from '../src/infra/env.js'
import { resolveLlmClient } from '../src/evaluation/llm/index.js'
import { LlmEvaluator } from '../src/evaluation/llm/LlmEvaluator.js'
import { designCtx, parkingLot } from '../../../tests/fixtures.js'

async function main() {
  loadLocalEnv()
  const which = process.argv[2] ?? 'god-class'
  const design = parkingLot.goldDesigns[which]
  if (!design) throw new Error(`no gold design "${which}"`)

  const client = resolveLlmClient()
  console.log(`provider: ${client.id}`)
  const evaluator = new LlmEvaluator(client)
  const stage = process.argv[3] ?? 'design'
  const ctx =
    stage === 'defend'
      ? designCtx(design, {
          stage: 'defend',
          change: parkingLot.hiddenChanges[0],
          rationale: 'Added an isElectric flag to Spot and a calculateKwhFee method to the manager.',
          probes: parkingLot.probes.slice(0, 2),
          answers: [
            {
              probeId: parkingLot.probes[0]!.id,
              response:
                'ParkingLotManager.calculateFee would need a new branch for weekend rates. Nothing else changes, honestly — it is all in that one method already, which is sort of the problem.',
            },
            { probeId: parkingLot.probes[1]!.id, response: 'I guess it depends. Maybe an if statement somewhere.' },
          ],
        })
      : designCtx(design)
  const t0 = Date.now()
  const results = await evaluator.evaluate(ctx)
  console.log(`latency: ${Date.now() - t0} ms`)
  for (const r of results) {
    console.log(`\n${r.criterionId}: ${r.score}/4 (${r.confidence})`)
    console.log(`  concern: ${r.concern}`)
    console.log(`  suggestion: ${r.suggestion}`)
    console.log(`  evidence: ${JSON.stringify(r.evidence)}`)
  }
  console.log(`\ngrounding: ${JSON.stringify(evaluator.lastGrounding)}`)
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e)
  process.exit(1)
})
