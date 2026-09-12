/**
 * Runs the mentor's prompts against the configured provider and prints what the
 * grounding filter kept and dropped. Bypasses the cache on purpose.
 *
 *   npx tsx apps/api/scripts/live-mentor.ts [god-class|strong] [runs]
 */
import { loadLocalEnv } from '../src/infra/env.js'
import { resolveLlmClient } from '../src/evaluation/llm/index.js'
import { readJson } from '../src/evaluation/llm/LlmEvaluator.js'
import { groundProse } from '../src/coach/ground.js'
import { MENTOR_SYSTEM, reviewerPrompt, lessonPrompt } from '../src/coach/prompts.js'
import { RuleEvaluator } from '../src/evaluation/rules/RuleEvaluator.js'
import { ContentStore } from '../src/infra/content/ContentStore.js'
import { designCtx, parkingLot } from '../../../tests/fixtures.js'

async function main() {
  loadLocalEnv()
  const which = process.argv[2] ?? 'god-class'
  const runs = Number(process.argv[3] ?? 1)
  const design = parkingLot.goldDesigns[which]!
  const client = resolveLlmClient()
  const ctx = designCtx(design)
  const results = await new RuleEvaluator().evaluate(ctx)
  const concept = ContentStore.load().listConcepts().find((c) => c.id === 'open-closed')!
  const low = results.find((r) => r.criterionId === 'abstraction-use')!

  for (let i = 0; i < runs; i += 1) {
    const r = await client.complete({ system: MENTOR_SYSTEM, user: reviewerPrompt(ctx, results), maxTokens: 600, effort: 'low', json: true })
    const note = (readJson(r.text) as { note?: string })?.note ?? ''
    const g = groundProse(note, ctx.graph, [parkingLot.title])
    console.log(`\n[note ${i + 1}] kept ${g.kept}, dropped ${g.dropped.length}`)
    for (const d of g.dropped) console.log(`  DROPPED (${d.unknown.join(', ')}): ${d.sentence}`)

    const l = await client.complete({ system: MENTOR_SYSTEM, user: lessonPrompt(ctx, concept, low), maxTokens: 900, effort: 'low', json: true })
    const lesson = readJson(l.text) as { body?: string; example?: { before?: string; after?: string } } | null
    for (const [label, text] of [['body', lesson?.body], ['before', lesson?.example?.before], ['after', lesson?.example?.after]] as const) {
      const gl = groundProse(text ?? '', ctx.graph, [concept.name, parkingLot.title])
      console.log(`[lesson ${i + 1} ${label}] kept ${gl.kept}, dropped ${gl.dropped.length}`)
      for (const d of gl.dropped) console.log(`  DROPPED (${d.unknown.join(', ')}): ${d.sentence}`)
    }
  }
}
main().catch((e) => { console.error('FAILED:', e instanceof Error ? e.message : e); process.exit(1) })
