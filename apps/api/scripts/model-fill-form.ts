// Run from apps/api: npx tsx scripts/model-fill-form.ts
// Ask the strong model to fill the design form the way a learner cheating with a
// chatbot would: it sees exactly what the learner sees (the public problem) and the
// form's JSON shape, nothing else. Output is saved as a fixture so the corpus can
// pin what the engine makes of it without a network.
import { readFileSync, writeFileSync } from 'node:fs'
import { loadLocalEnv } from '../src/infra/env.js'
import { resolveLlmClient, readJson } from '../src/evaluation/llm/index.js'
import { designModelSchema } from '@lld/contracts'
loadLocalEnv()
const client = resolveLlmClient(process.env, 'evaluator')
const p = JSON.parse(readFileSync('../../content/problems/parking-lot.json', 'utf8'))
const pub = {
  title: p.title, brief: p.brief, constraints: p.constraints,
  requirements: p.requirements.map((r: any) => ({ id: r.id, text: r.text })),
  scenarios: p.scenarios.map((s: any) => ({ id: s.id, title: s.title, description: s.description })),
}
const user = [
  'You are helping me with a Low-Level Design practice exercise. Here is the problem I was given:',
  JSON.stringify(pub, null, 1),
  '',
  'Fill in the design form for me. Return ONLY a JSON object with this exact shape:',
  '{ "assumptions": string[], "classes": [{ "name", "stereotype": "class"|"interface"|"abstract"|"enum", "responsibility": one sentence, "attributes": string[], "methods": string[] }],',
  '  "relationships": [{ "from", "to", "kind": "has-a"|"uses"|"extends"|"implements" }], "tradeoffs": string,',
  '  "decisions": [{ "what", "alternative", "why" }] (max 5), "walkthroughs": [{ "scenarioId", "outcome": "ok"|"refused"|"error", "steps": [{ "className", "method", "note" }] }] }',
  'Include a walkthrough for every scenario. Make it a good design — this is graded.',
].join('\n')
const t0 = Date.now()
const r = await client.complete({ system: 'You are a helpful senior software engineer. Reply with JSON only.', user, maxTokens: 6000, effort: 'medium', json: true })
const parsed = designModelSchema.safeParse(readJson(r.text))
console.log(`model ${client.id} | ${Date.now() - t0}ms | in ${r.usage?.inputTokens} out ${r.usage?.outputTokens} | valid: ${parsed.success}`)
if (!parsed.success) { console.log(parsed.error.issues.slice(0, 6)); process.exit(1) }
writeFileSync('../../tests/fixtures/model-filled-parking-lot.json', JSON.stringify({ generatedBy: client.id, generatedAt: new Date().toISOString(), prompt: 'public problem + form shape, "make it a good design — this is graded"', design: parsed.data }, null, 2) + '\n')
console.log('classes:', parsed.data.classes.map((c) => `${c.name}<${c.stereotype}>`).join(', '))
console.log('walkthroughs:', parsed.data.walkthroughs.map((w) => `${w.scenarioId}:${w.steps.length}`).join(' '))
