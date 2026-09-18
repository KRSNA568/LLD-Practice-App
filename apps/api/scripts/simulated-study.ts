// The six-person study from STUDY_PROTOCOL.md with a model playing each engineer.
// Run from the repo root against a running API:
//
//   npx tsx apps/api/scripts/simulated-study.ts                # all six, skipping any already done
//   npx tsx apps/api/scripts/simulated-study.ts --only S1 J2   # a subset
//   npx tsx apps/api/scripts/simulated-study.ts --out study-sim --url http://localhost:4000/api
//
// What this is: a stand-in for the study when there are no six people. What it is
// not: evidence about people. A persona separates from another persona partly
// because its description differs, so the separation result is weaker than the
// real one, and there is no usability half at all. The parts that survive the
// substitution are (a) whether the scorer's verdict on six designs it has never
// seen is defensible, read finding by finding, (b) what the change stage does to
// designs of different shapes, and (c) what the personas say is wrong — each of
// those is a rubric claim to check by hand.
//
// The persona sees exactly what a learner sees: the public problem, its own
// design, the report, the change prompt, the probes and the mentor's follow-ups.
// Never the rubric, the gold designs, the hidden change's signals or the probes'.
// It goes through the HTTP API as its own learner (named S1…J3, suffixed "-sim"),
// so export-study.ts and reset-study.ts treat it like any participant.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadLocalEnv } from '../src/infra/env.js'
import { resolveLlmClient, readJson } from '../src/evaluation/llm/index.js'
import { designModelSchema, LEARNER_HEADER, type DesignModel } from '@lld/contracts'

loadLocalEnv()
const args = process.argv.slice(2)
const API = args.includes('--url') ? args[args.indexOf('--url') + 1]!.replace(/\/$/, '') : 'http://localhost:4000/api'
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1]! : 'study-sim'
const ONLY = args.includes('--only') ? args.slice(args.indexOf('--only') + 1).filter((a) => !a.startsWith('--')) : null
const PROBLEM_ID = 'parking-lot'
const STAGE_TIMEOUT_MS = 180_000
/** Groq's per-minute budget is shared between the persona and the scorer; give each a clear window. */
const PACE_MS = Number(process.env.SIM_PACE_MS ?? 45_000)

/* ------------------------------------------------------------------------- */
/* The six engineers                                                          */
/* ------------------------------------------------------------------------- */

type Persona = { code: string; group: 'senior' | 'junior'; name: string; profile: string }

// Written as people, not as rubric outcomes: years, stack, what they have built,
// how they work under time pressure. The model decides what such a person draws.
const PERSONAS: Persona[] = [
  {
    code: 'S1', group: 'senior', name: 'Meera',
    profile: 'Eleven years, mostly Java and Kotlin on payments and ledger systems; has been the tech lead who reviews everyone else\'s designs for the last four. Before drawing anything she asks what is likely to change and what must never be wrong. Terse writer — short responsibilities, few decorations. Names things by what they do in the domain. Suspicious of clever patterns; uses one only when she can say what it buys.',
  },
  {
    code: 'S2', group: 'senior', name: 'Tomasz',
    profile: 'Eight years, Go and Python, distributed systems and infra at two startups. Pragmatic to a fault: prefers fewer types, dislikes abstraction that exists "for the future", but is explicit about the one or two places where he expects extension and makes those places obvious. Writes walkthroughs carefully because that is how he finds his own bugs. Comfortable saying "I would not model that".',
  },
  {
    code: 'S3', group: 'senior', name: 'Anjali',
    profile: 'Seven years of C#/.NET in enterprise logistics; has done domain modelling workshops and thinks in aggregates, value objects and policies. Tends toward more classes rather than fewer, each small and named from the business language. Documents assumptions and trade-offs at length because her reviews get read by people who were not in the room.',
  },
  {
    code: 'J1', group: 'junior', name: 'Rahul',
    profile: 'Eight months out of college, one job building Spring Boot CRUD services. Thinks in entities that map to tables and a Service class that does the work. Has read about design patterns and interfaces for interviews but has not used them on anything real, so he reaches for them only when something reminds him of a textbook example. Wants to show he covered every requirement.',
  },
  {
    code: 'J2', group: 'junior', name: 'Priya',
    profile: 'Two years, almost all of it React and Node front-end work; this is her first low-level design exercise. Models the nouns from the problem statement as classes with fields, getters and setters, and connects them the way the sentences in the brief connect them. Walkthroughs are honest but sketchy — she is not sure which object should own which decision, and says so in her assumptions.',
  },
  {
    code: 'J3', group: 'junior', name: 'Dev',
    profile: 'Eighteen months in backend after a strong competitive-programming background. Treats the exercise as an algorithms problem: state in a couple of arrays and maps, a small number of functions that do the work efficiently, edge cases enumerated carefully. Adds classes when the form seems to want them, not because he sees a reason. Fast, confident, precise about behaviour, uninterested in what happens if requirements change.',
  },
]

/* ------------------------------------------------------------------------- */
/* Plumbing                                                                   */
/* ------------------------------------------------------------------------- */

const client = resolveLlmClient(process.env, 'evaluator')
const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const req = async <T>(learnerId: string | null, path: string, init?: RequestInit): Promise<T> => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (learnerId) headers[LEARNER_HEADER] = learnerId
  const r = await fetch(API + path, { ...init, headers })
  const body = r.status === 204 ? null : await r.json().catch(() => null)
  if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${path} → ${r.status} ${JSON.stringify(body).slice(0, 300)}`)
  return body as T
}

type Result = { criterionId: string; stage: string; score: number; concern: string; suggestion: string; evidence: Array<{ kind?: string; ref?: string }> }
type AttemptPayload = {
  id: string; state: string; stage: string
  revealedChange: { id: string; prompt: string } | null
  probes: Array<{ id: string; prompt: string }> | null
  report: null | { summary: { overall: number; aiUnavailable: boolean }; results: Result[] }
}
type Notes = { review: Partial<Record<string, { text: string }>> }

const settle = async (learnerId: string, id: string): Promise<AttemptPayload> => {
  const deadline = Date.now() + STAGE_TIMEOUT_MS
  while (Date.now() < deadline) {
    const { attempt } = await req<{ attempt: AttemptPayload }>(learnerId, `/attempts/${id}`)
    if (!['SUBMITTED', 'EVALUATING'].includes(attempt.state)) return attempt
    await sleep(1500)
  }
  throw new Error(`still evaluating after ${STAGE_TIMEOUT_MS / 1000}s`)
}

const raw = (d: DesignModel) => ({ format: 'structured-design', assumptions: d.assumptions, classes: d.classes, relationships: d.relationships, tradeoffs: d.tradeoffs, decisions: d.decisions, walkthroughs: d.walkthroughs })

const FORM_SHAPE = [
  '{ "assumptions": string[], "classes": [{ "name", "stereotype": "class"|"interface"|"abstract"|"enum", "responsibility": one sentence (max 200 chars), "attributes": string[], "methods": string[] }],',
  '  "relationships": [{ "from", "to", "kind": "has-a"|"uses"|"extends"|"implements" }], "tradeoffs": string,',
  '  "decisions": [{ "what" (max 200), "alternative" (max 200), "why" (max 300) }] (at most 5), "walkthroughs": [{ "scenarioId", "outcome": "ok"|"refused"|"error", "steps": [{ "className", "method", "note" (max 160) }] }] }',
].join('\n')

/** What the report page shows: score and concern per criterion, and the mentor's note. */
const reportForLearner = (attempt: AttemptPayload, notes: Notes | null, stage: string) => {
  const rows = (attempt.report?.results ?? []).filter((r) => r.stage === stage)
  const lines = rows.map((r) => `- ${r.criterionId}: ${r.score}/4${r.concern ? ` — ${r.concern}` : ''}${r.suggestion ? ` Suggestion: ${r.suggestion}` : ''}`)
  const note = notes?.review?.[stage]?.text
  return [`Report for the ${stage} stage (overall so far ${attempt.report?.summary.overall ?? '?'}):`, ...lines, note ? `\nMentor's note: ${note}` : ''].join('\n')
}

const ask = async (persona: Persona, user: string, opts: { json?: boolean; maxTokens: number }) => {
  const system = [
    `You are role-playing ${persona.name}, a software engineer. ${persona.profile}`,
    'You are doing a low-level design exercise in a web tool, alone, with about twenty-five minutes. Answer exactly as this engineer would — their habits, vocabulary, level of care and blind spots. Do not be better or worse than they would be, and do not mention that you are role-playing.',
    opts.json ? 'Reply with JSON only.' : 'Reply in plain prose, first person, no headings.',
  ].join('\n')
  const t0 = Date.now()
  const r = await client.complete({ system, user, maxTokens: opts.maxTokens, effort: 'low', json: opts.json ?? false })
  log(`  ${persona.code} persona call: ${Date.now() - t0}ms, in ${r.usage?.inputTokens ?? '?'} out ${r.usage?.outputTokens ?? '?'}`)
  return { text: r.text, usage: r.usage }
}

const askDesign = async (persona: Persona, user: string, maxTokens: number): Promise<{ design: DesignModel; rationale?: string; usage: unknown }> => {
  let last = ''
  // A learner fixes a form error as many times as it takes; four is what the
  // personas needed (J3 hit two different ones in a row).
  for (let i = 0; i < 4; i += 1) {
    const r = await ask(persona, i === 0 ? user : `${user}\n\nYour previous reply did not match the shape; the problems were: ${last}. Return the corrected JSON only.`, { json: true, maxTokens })
    const parsed = readJson(r.text) as { design?: unknown; rationale?: string } & Record<string, unknown>
    const candidate = parsed?.design ?? parsed
    const ok = designModelSchema.safeParse(candidate)
    if (ok.success) return { design: ok.data, rationale: typeof parsed?.rationale === 'string' ? parsed.rationale : undefined, usage: r.usage }
    last = ok.error.issues.slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    log(`  ${persona.code} design did not validate: ${last}`)
    await sleep(PACE_MS)
  }
  throw new Error(`${persona.code} could not produce a valid design`)
}

/* ------------------------------------------------------------------------- */
/* One session                                                                */
/* ------------------------------------------------------------------------- */

async function session(persona: Persona) {
  const out = join(OUT, `${persona.code}.json`)
  if (existsSync(out)) { log(`${persona.code} already done, skipping`); return }
  const t0 = Date.now()
  const record: Record<string, unknown> = { persona, personaModel: client.id, startedAt: new Date().toISOString() }
  const usage: Array<{ step: string; inputTokens?: number; outputTokens?: number }> = []
  const note = (step: string, u: unknown) => usage.push({ step, ...((u ?? {}) as object) })

  const { learner } = await req<{ learner: { id: string } }>(null, '/learners', { method: 'POST', body: JSON.stringify({ name: `${persona.code}-sim` }) })
  const L = learner.id
  record.learnerId = L
  log(`${persona.code} (${persona.name}, ${persona.group}) → learner ${L}`)

  const { problem } = await req<{ problem: Record<string, unknown> }>(L, `/problems/${PROBLEM_ID}`)
  const pub = { title: problem.title, brief: problem.brief, constraints: problem.constraints, requirements: (problem.requirements as Array<{ id: string; text: string }>).map((r) => ({ id: r.id, text: r.text })), scenarios: (problem.scenarios as Array<{ id: string; title: string; description: string }>).map((s) => ({ id: s.id, title: s.title, description: s.description })) }

  // Design
  const designPrompt = [
    'Here is the problem you were given:', JSON.stringify(pub, null, 1), '',
    'Fill in the design form the way you would in fifteen minutes. Return ONLY a JSON object with this exact shape:', FORM_SHAPE,
    'Every scenario needs a walkthrough. Use your own class and method names consistently across classes, relationships and walkthroughs.',
  ].join('\n')
  const d = await askDesign(persona, designPrompt, 3500)
  note('design', d.usage)
  record.design = d.design
  log(`  ${persona.code} designed ${d.design.classes.length} classes: ${d.design.classes.map((c) => c.name).join(', ')}`)
  await sleep(PACE_MS)

  const { attempt } = await req<{ attempt: { id: string } }>(L, '/attempts', { method: 'POST', body: JSON.stringify({ problemId: PROBLEM_ID }) })
  const id = attempt.id
  record.attemptId = id
  const tDesign = Date.now()
  await req(L, `/attempts/${id}/submit`, { method: 'POST', body: JSON.stringify({ input: { stage: 'design', submission: raw(d.design) }, idempotencyKey: `sim-${persona.code}-d-${t0}` }) })
  let a = await settle(L, id)
  if (!a.report) throw new Error(`${persona.code} design stage ended in ${a.state}`)
  log(`  ${persona.code} design scored ${a.report.summary.overall} in ${Date.now() - tDesign}ms (ai ${a.report.summary.aiUnavailable ? 'UNAVAILABLE' : 'ok'})`)
  await sleep(PACE_MS)
  let notes = await req<Notes>(L, `/attempts/${id}/notes`).catch(() => null)
  record.designReport = reportForLearner(a, notes, 'design')

  // Change
  const { attempt: opened } = await req<{ attempt: AttemptPayload }>(L, `/attempts/${id}/advance`, { method: 'POST' })
  const change = opened.revealedChange!
  record.changeId = change.id
  const changePrompt = [
    'You submitted this design:', JSON.stringify(d.design, null, 1), '',
    'The tool showed you this report on it:', record.designReport as string, '',
    'Now the requirements change. The tool says:', `"${change.prompt}"`, '',
    'Edit your design to handle the change, the way you actually would — you may add, remove, rename or leave things alone. Return ONLY a JSON object: { "design": <the whole revised design in the same shape as before>, "rationale": one paragraph, in your own voice, on what you touched and why }.',
  ].join('\n')
  const c = await askDesign(persona, changePrompt, 4000)
  note('change', c.usage)
  record.revisedDesign = c.design
  record.rationale = c.rationale ?? ''
  log(`  ${persona.code} revised to ${c.design.classes.length} classes`)
  await sleep(PACE_MS)
  const tChange = Date.now()
  await req(L, `/attempts/${id}/submit`, { method: 'POST', body: JSON.stringify({ input: { stage: 'change', submission: raw(c.design), rationale: c.rationale ?? '' }, idempotencyKey: `sim-${persona.code}-c-${t0}` }) })
  a = await settle(L, id)
  log(`  ${persona.code} change scored: overall ${a.report?.summary.overall} in ${Date.now() - tChange}ms`)
  await sleep(PACE_MS)
  notes = await req<Notes>(L, `/attempts/${id}/notes`).catch(() => null)
  record.changeReport = reportForLearner(a, notes, 'change')

  // Defend
  const { attempt: defend } = await req<{ attempt: AttemptPayload }>(L, `/attempts/${id}/advance`, { method: 'POST' })
  const transcripts: Record<string, Array<{ role: string; text: string }>> = {}
  for (const probe of defend.probes ?? []) {
    const history: Array<{ role: string; text: string }> = [{ role: 'mentor', text: probe.prompt }]
    for (let turn = 0; turn < 2; turn += 1) {
      const answerPrompt = [
        'Your current design:', JSON.stringify(c.design, null, 1), '',
        'The mentor is asking you about it. The exchange so far:', ...history.map((h) => `${h.role === 'mentor' ? 'Mentor' : 'You'}: ${h.text}`), '',
        'Reply to the last mentor message in at most 120 words, as you would type it into a chat box.',
      ].join('\n')
      const r = await ask(persona, answerPrompt, { maxTokens: 400 })
      note(`defend:${probe.id}:${turn}`, r.usage)
      const text = r.text.trim().slice(0, 2000)
      history.push({ role: 'learner', text })
      const { transcript, closed } = await req<{ transcript: Array<{ role: string; text: string }>; closed: boolean }>(L, `/attempts/${id}/defend/${probe.id}/turn`, { method: 'POST', body: JSON.stringify({ text }) })
      const followUp = transcript.filter((t) => t.role === 'mentor').at(-1)
      if (closed || !followUp || transcript.at(-1)?.role !== 'mentor') break
      history.push({ role: 'mentor', text: followUp.text })
      await sleep(PACE_MS / 3)
    }
    transcripts[probe.id] = history
    await sleep(PACE_MS / 3)
  }
  record.transcripts = transcripts
  const tDefend = Date.now()
  await req(L, `/attempts/${id}/submit`, { method: 'POST', body: JSON.stringify({ input: { stage: 'defend', answers: [] }, idempotencyKey: `sim-${persona.code}-f-${t0}` }) })
  a = await settle(L, id)
  log(`  ${persona.code} defend scored: overall ${a.report?.summary.overall}, state ${a.state} in ${Date.now() - tDefend}ms`)
  record.finalState = a.state
  record.finalOverall = a.report?.summary.overall
  record.results = a.report?.results
  await sleep(PACE_MS)
  notes = await req<Notes>(L, `/attempts/${id}/notes`).catch(() => null)
  record.defendReport = reportForLearner(a, notes, 'defend')
  record.notes = notes?.review

  // The three questions
  const exitPrompt = [
    'You have finished. Here is the whole report you can see, stage by stage:', '',
    record.designReport as string, '', record.changeReport as string, '', record.defendReport as string, '',
    'Someone running the session asks you three questions. Answer each in two to four sentences, honestly, in your own voice. Return ONLY JSON: { "q1": "...", "q2": "...", "q3": "..." }',
    '1. Was there a moment the feedback told you something you did not already know about your design?',
    '2. Was there a finding you thought was wrong? Name the criterion and say why.',
    '3. If a friend were preparing for a design interview, would you tell them about this? Why or why not?',
  ].join('\n')
  const ex = await ask(persona, exitPrompt, { json: true, maxTokens: 700 })
  note('exit', ex.usage)
  record.exit = readJson(ex.text)

  record.usage = usage
  record.finishedAt = new Date().toISOString()
  record.wallSeconds = Math.round((Date.now() - t0) / 1000)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(out, JSON.stringify(record, null, 2) + '\n')
  log(`${persona.code} done in ${record.wallSeconds}s → ${out}`)
}

/* ------------------------------------------------------------------------- */

const health = await req<{ ok: boolean; provider: string; evaluator: string }>(null, '/health')
if (!health.ok || health.provider === 'stub') { console.error(`API at ${API} is ${health.provider}; the study needs the real model`); process.exit(1) }
log(`API ${API} evaluator=${health.evaluator}, persona model=${client.id}, pace=${PACE_MS}ms`)

for (const persona of PERSONAS) {
  if (ONLY && !ONLY.includes(persona.code)) continue
  try {
    await session(persona)
  } catch (e) {
    log(`${persona.code} FAILED: ${e instanceof Error ? e.message : String(e)}`)
    // Groq's daily cap ends the run; anything else is worth a look before continuing.
    if (/tokens per day|TPD/i.test(String(e))) { log('daily cap reached; rerun later to continue'); break }
  }
  await sleep(PACE_MS)
}
log('run finished')
