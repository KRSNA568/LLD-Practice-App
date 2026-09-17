// The synthetic learner. One real attempt against a running instance, timed, with a
// pass/fail verdict on one JSON line and a non-zero exit on failure — so a cron
// entry or an uptime service finds out the loop is broken before a person does.
//
//   npx tsx apps/api/scripts/canary.ts                       # localhost, design stage only
//   npx tsx apps/api/scripts/canary.ts --url https://…/api   # a deployed instance
//   npx tsx apps/api/scripts/canary.ts --full                # design → change → defend (costs mentor tokens)
//
// Runs as the demo learner (no x-learner-id), which the study export excludes,
// so canary attempts never pollute real data. Thresholds are deliberately loose:
// this is "does the loop work", not "is the model in a good mood".
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const API = args.includes('--url') ? args[args.indexOf('--url') + 1]!.replace(/\/$/, '') : 'http://localhost:4000/api'
const FULL = args.includes('--full')
const STAGE_TIMEOUT_MS = 120_000

const t0 = Date.now()
const timings: Record<string, number> = {}
const fail = (step: string, why: string): never => {
  console.log(JSON.stringify({ canary: 'fail', step, why, url: API, timings, totalMs: Date.now() - t0 }))
  process.exit(1)
}
const req = async (path: string, init?: RequestInit) => {
  const r = await fetch(API + path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } })
  const body = r.status === 204 ? null : await r.json().catch(() => null)
  if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${r.status} ${JSON.stringify(body).slice(0, 200)}`)
  return body as never
}
const timed = async <T>(step: string, fn: () => Promise<T>): Promise<T> => {
  const s = Date.now()
  try { return await fn() } catch (e) { return fail(step, e instanceof Error ? e.message : String(e)) } finally { timings[step] = Date.now() - s }
}
const settle = async (id: string) => {
  const deadline = Date.now() + STAGE_TIMEOUT_MS
  while (Date.now() < deadline) {
    const { attempt } = (await req(`/attempts/${id}`)) as { attempt: { state: string; stage: string; report: null | { summary: { overall: number; aiUnavailable: boolean }; results: unknown[] } } }
    if (!['SUBMITTED', 'EVALUATING'].includes(attempt.state)) return attempt
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`still evaluating after ${STAGE_TIMEOUT_MS / 1000}s`)
}

const health = await timed('health', () => req('/health')) as { ok: boolean; db: { ok: boolean }; provider: string }
if (!health.ok || !health.db.ok) fail('health', 'health reports not ok')

const problem = JSON.parse(readFileSync(fileURLToPath(new URL('../../../content/problems/parking-lot.json', import.meta.url)), 'utf8'))
const raw = (d: Record<string, unknown>) => ({ format: 'structured-design', assumptions: d.assumptions, classes: d.classes, relationships: d.relationships, tradeoffs: d.tradeoffs, decisions: d.decisions, walkthroughs: d.walkthroughs })
const strong = problem.goldDesigns.strong

const { attempt } = await timed('start', () => req('/attempts', { method: 'POST', body: JSON.stringify({ problemId: 'parking-lot' }) })) as { attempt: { id: string } }
const id = attempt.id

let settled = await timed('design', async () => {
  await req(`/attempts/${id}/submit`, { method: 'POST', body: JSON.stringify({ input: { stage: 'design', submission: raw(strong) }, idempotencyKey: `canary-${t0}` }) })
  return settle(id)
})
if (!settled.report || settled.report.results.length < 5) fail('design', `state ${settled.state}, ${settled.report?.results.length ?? 0} results`)
if (settled.report.summary.overall < 3) fail('design', `the gold design scored ${settled.report.summary.overall}; the evaluator has drifted`)
const aiUnavailable = settled.report.summary.aiUnavailable

if (FULL) {
  settled = await timed('change', async () => {
    const { attempt: opened } = (await req(`/attempts/${id}/advance`, { method: 'POST' })) as { attempt: { revealedChange: { expectedSeam: string } } }
    const seam = opened.revealedChange.expectedSeam
    const revised = seam === 'v1'
      ? { ...strong, classes: [...strong.classes, { name: 'MeteredPricing', stereotype: 'class', responsibility: 'Bills electric stays per kWh drawn', attributes: ['kwhRate'], methods: ['feeFor'] }], relationships: [...strong.relationships, { from: 'MeteredPricing', to: 'PricingStrategy', kind: 'implements' }] }
      : { ...strong, classes: [...strong.classes, { name: 'ReservedFirstAllocator', stereotype: 'class', responsibility: 'Gives pass holders a reserved spot first', attributes: ['passHolders'], methods: ['allocate'] }], relationships: [...strong.relationships, { from: 'ReservedFirstAllocator', to: 'SpotAllocator', kind: 'implements' }] }
    await req(`/attempts/${id}/submit`, { method: 'POST', body: JSON.stringify({ input: { stage: 'change', submission: raw(revised), rationale: 'A new implementation behind the existing seam.' }, idempotencyKey: `canary-c-${t0}` }) })
    return settle(id)
  })
  settled = await timed('defend', async () => {
    const { attempt: opened } = (await req(`/attempts/${id}/advance`, { method: 'POST' })) as { attempt: { probes: Array<{ id: string }> } }
    for (const p of opened.probes) {
      await req(`/attempts/${id}/defend/${p.id}/turn`, { method: 'POST', body: JSON.stringify({ text: 'I would add a new class implementing PricingStrategy rather than editing ParkingLot, because rates change more often than the lot does.' }) })
    }
    await req(`/attempts/${id}/submit`, { method: 'POST', body: JSON.stringify({ input: { stage: 'defend', answers: [] }, idempotencyKey: `canary-d-${t0}` }) })
    return settle(id)
  })
  if (settled.state !== 'COMPLETED' && settled.state !== 'COMPLETED_PARTIAL') fail('defend', `state ${settled.state}`)
}

console.log(JSON.stringify({ canary: 'pass', url: API, provider: health.provider, attempt: id, overall: settled.report?.summary.overall, aiUnavailable, full: FULL, timings, totalMs: Date.now() - t0 }))
