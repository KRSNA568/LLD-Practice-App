/**
 * Drafts a fully instrumented problem from a catalog entry, in stages, with the
 * configured model — then runs it through the same gates every hand-authored
 * problem passes: the problem schema, ContentStore's coherence rules, and the
 * evaluator itself on every gold design.
 *
 * The output is a DRAFT (`content/problems/<id>.draft.json`) plus a report of how
 * each gold design actually scored. A human reads both, edits, renames the file to
 * `<id>.json`, and only then is the problem playable. The model authors; the
 * pipeline gates; a person ships.
 *
 *   npx tsx apps/api/scripts/author-problem.ts <catalog-id> [--exemplar vending-machine]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import {
  commonFailureModeSchema,
  critiquePairSchema,
  designModelSchema,
  hiddenChangeSchema,
  probeSchema,
  problemSchema,
  requirementSchema,
  scenarioSchema,
  variationPointSchema,
  type CriterionResult,
  type DesignModel,
  type Problem,
} from '@lld/contracts'
import { loadLocalEnv } from '../src/infra/env.js'
import { resolveLlmClient } from '../src/evaluation/llm/index.js'
import { readJson } from '../src/evaluation/llm/LlmEvaluator.js'
import { RuleEvaluator } from '../src/evaluation/rules/RuleEvaluator.js'
import { DesignGraph } from '../src/domain/design/DesignGraph.js'
import { ContentStore } from '../src/infra/content/ContentStore.js'
import type { LlmClient } from '../src/evaluation/llm/LlmClient.js'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const read = <T>(rel: string): T => JSON.parse(readFileSync(`${ROOT}${rel}`, 'utf8')) as T
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type CatalogEntry = { id: string; tier: number; minutes: number; title: string; domain: string; conceptTags: string[] }

const SYSTEM = [
  'You author practice problems for a Low-Level Design platform. Every field you write is',
  'consumed by a deterministic evaluator, so precision matters more than prose:',
  '- keywords, nameHints, mustInvolve and mustIntroduce are matched by stem and prefix against',
  '  class names, responsibilities, attribute and method names — choose words a learner would',
  '  actually type, and 4–8 of them, lowercase.',
  '- Class names are plain identifiers (PascalCase). Stereotypes: class | interface | abstract | enum.',
  '- Relationship kinds: has-a | uses | extends | implements. Every relationship end must be a declared class.',
  '- A responsibility is ONE sentence, no more than two clauses. Never chain "and, and, and".',
  '- Walkthrough steps name a declared class and one of ITS declared methods, exactly as spelled.',
  '- Reply with JSON only. No prose, no fences.',
].join('\n')

/* ------------------------------------------------------------------------- */
/* Stages                                                                     */
/* ------------------------------------------------------------------------- */

const specSchema = z.object({
  brief: z.string().min(40),
  requirements: z.array(requirementSchema).min(5).max(7),
  constraints: z.array(z.string()).min(2).max(4),
  variationPoints: z.array(variationPointSchema).min(2).max(3),
  scenarios: z.array(scenarioSchema).length(3),
  commonFailureModes: z.array(commonFailureModeSchema).min(2).max(4),
})
type Spec = z.output<typeof specSchema>

function specPrompt(entry: CatalogEntry, exemplar: Problem): string {
  const ex = {
    brief: exemplar.brief,
    requirements: exemplar.requirements,
    constraints: exemplar.constraints,
    variationPoints: exemplar.variationPoints,
    scenarios: exemplar.scenarios,
    commonFailureModes: exemplar.commonFailureModes,
  }
  return [
    `Write the specification for the problem "${entry.title}" (domain: ${entry.domain}, tier ${entry.tier} of 4,`,
    `about ${entry.minutes} minutes). It should exercise these concepts: ${entry.conceptTags.join(', ')}.`,
    '',
    'Match the shape and the depth of this exemplar exactly (it is another problem on the platform):',
    JSON.stringify(ex, null, 1),
    '',
    'Requirements: 5–7, ids r1…, each with 4–8 lowercase keywords a design addressing it would contain.',
    'Variation points: 2–3, ids v1…, each the thing that changes in the real world and the nameHints a',
    'seam for it would carry. Scenarios: exactly 3, ids sc-…, the third with expectsFailurePath true.',
    'Constraints: 2–4 short lines that shrink the problem. commonFailureModes: 2–4, ids f1….',
    '',
    'Return exactly: {"brief": "...", "requirements": [...], "constraints": [...], "variationPoints": [...], "scenarios": [...], "commonFailureModes": [...]}',
  ].join('\n')
}

function designPrompt(entry: CatalogEntry, spec: Spec, exemplar: DesignModel, kind: 'strong' | string, smell?: Spec['commonFailureModes'][number]): string {
  const ask =
    kind === 'strong'
      ? [
          'Write the STRONG design: 6–9 classes; one abstraction (interface or abstract) per variation point,',
          'named so its nameHints match; every requirement addressed; each scenario walked in 3–5 steps',
          'through DIFFERENT classes (no class on more than half the steps); the failure scenario ends',
          '"refused" with a class that says no; 3 decisions each naming a rejected alternative; 2–4 assumptions.',
          'Each responsibility is ONE clause naming ONE job — "Decides which copy a member receives" — never a',
          'list ("manages catalog, members and loans"): a list is measured as several responsibilities and fails.',
        ]
      : [
          `Write a WEAK design that exhibits this failure mode and nothing else obviously wrong: "${smell?.name}" — ${smell?.description}`,
          'It should still be a plausible attempt: 4–7 classes, every scenario walked (the failure scenario may',
          'end "ok" if that is what the smell implies), 1–2 decisions, 1–2 assumptions. Make the smell visible in',
          'the structure (class names, members, relationships, walkthrough), not in the prose.',
        ]
  return [
    `Problem: "${entry.title}". ${spec.brief}`,
    '',
    'REQUIREMENTS',
    ...spec.requirements.map((r) => `  ${r.id}: ${r.text} (keywords: ${r.keywords.join(', ')})`),
    'VARIATION POINTS',
    ...spec.variationPoints.map((v) => `  ${v.id}: ${v.name} — ${v.why} (nameHints: ${v.nameHints.join(', ')})`),
    'SCENARIOS (walk every one; use these exact ids)',
    ...spec.scenarios.map((s) => `  ${s.id}: ${s.title}${s.expectsFailurePath ? ' — should end refused' : ''} (mustInvolve: ${s.mustInvolve.join(', ')})`),
    '',
    ...ask,
    '',
    'Match the shape of this exemplar design from another problem exactly:',
    JSON.stringify(exemplar, null, 1),
    '',
    'Return exactly one DesignModel: {"assumptions": [...], "classes": [...], "relationships": [...], "tradeoffs": "...", "decisions": [...], "walkthroughs": [...]}',
  ].join('\n')
}

const instrumentationSchema = z.object({
  hiddenChanges: z.array(hiddenChangeSchema).length(2),
  probes: z.array(probeSchema).min(4).max(6),
  critiquePairs: z.array(critiquePairSchema).min(2).max(3),
})

function instrumentationPrompt(entry: CatalogEntry, spec: Spec, gold: Record<string, DesignModel>, exemplar: Problem): string {
  const ex = { hiddenChanges: exemplar.hiddenChanges, probes: exemplar.probes, critiquePairs: exemplar.critiquePairs }
  return [
    `Problem: "${entry.title}". ${spec.brief}`,
    'VARIATION POINTS: ' + spec.variationPoints.map((v) => `${v.id} (${v.name})`).join('; '),
    'GOLD DESIGNS (label → class names):',
    ...Object.entries(gold).map(([label, d]) => `  ${label}: ${d.classes.map((c) => `${c.name}<${c.stereotype}>`).join(', ')}`),
    '',
    'Write, matching this exemplar from another problem exactly in shape and depth:',
    JSON.stringify(ex, null, 1),
    '',
    'hiddenChanges: exactly 2, ids hc-…, each a requirement change revealed AFTER the design is frozen;',
    '  expectedSeam is a variation point id; mustIntroduce is 5–8 lowercase words a design that absorbed',
    '  the change would contain and one that ignored it would not.',
    'probes: 4–6, ids p-…; use {{class}} where the evaluator should substitute the class it cited;',
    '  triggerWhen.criterionId is one of: requirement-coverage, class-responsibilities, coupling-cohesion,',
    '  abstraction-use, behaviour, edge-cases; at least three probes have a triggerWhen.',
    'critiquePairs: 2–3, ids cp-…; left/right are gold design labels from the list above; answer.className',
    '  must be a class in answer.design exactly as spelled; telling is one paragraph a learner reads after clicking.',
    '',
    'Return exactly: {"hiddenChanges": [...], "probes": [...], "critiquePairs": [...]}',
  ].join('\n')
}

/* ------------------------------------------------------------------------- */
/* Calling, validating, repairing                                             */
/* ------------------------------------------------------------------------- */

async function generate<S extends z.ZodTypeAny>(client: LlmClient, label: string, user: string, schema: S, maxTokens: number): Promise<z.output<S>> {
  let prompt = user
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const t0 = Date.now()
    const response = await client.complete({ system: SYSTEM, user: prompt, maxTokens, effort: 'medium', json: true })
    const parsed = schema.safeParse(readJson(response.text))
    if (parsed.success) {
      console.log(`  ${label}: ok (${Date.now() - t0} ms, ${response.usage?.outputTokens ?? '?'} out)`)
      return parsed.data
    }
    const issues = parsed.error.issues.slice(0, 12).map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ')
    console.log(`  ${label}: invalid, repairing —\n  ${issues}`)
    prompt = `${user}\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION. Fix exactly these and return the whole object again:\n  ${issues}\n\nPREVIOUS ATTEMPT:\n${response.text.slice(0, 6000)}`
    await sleep(15_000)
  }
  throw new Error(`${label}: could not produce a valid object in 3 attempts`)
}

/** The structural facts the evaluator relies on — checked here so the report is specific. */
function lintDesign(label: string, d: DesignModel, spec: Spec): string[] {
  const out: string[] = []
  const names = new Set(d.classes.map((c) => c.name.toLowerCase()))
  for (const r of d.relationships) {
    for (const end of [r.from, r.to]) if (!names.has(end.toLowerCase())) out.push(`${label}: relationship references undeclared class "${end}"`)
  }
  const scenarioIds = new Set(spec.scenarios.map((s) => s.id))
  for (const w of d.walkthroughs) {
    if (!scenarioIds.has(w.scenarioId)) out.push(`${label}: walkthrough for unknown scenario "${w.scenarioId}"`)
    for (const s of w.steps) {
      const c = d.classes.find((x) => x.name.toLowerCase() === s.className.toLowerCase())
      if (!c) out.push(`${label}: step names undeclared class "${s.className}"`)
      else if (!c.methods.some((m) => m.replace(/\(.*$/, '').toLowerCase() === s.method.replace(/\(.*$/, '').toLowerCase()))
        out.push(`${label}: step ${s.className}.${s.method} — method not declared on that class`)
    }
  }
  for (const sc of spec.scenarios) if (!d.walkthroughs.some((w) => w.scenarioId === sc.id)) out.push(`${label}: scenario ${sc.id} not walked`)
  return out
}

/** A problem with the spec filled in and nothing else — enough for the evaluator to run. */
function skeleton(entry: CatalogEntry, spec: Spec): Problem {
  return {
    id: entry.id,
    version: '2.0.0',
    rubricId: 'lld-core',
    rubricVersion: '2.0.0',
    title: entry.title,
    tier: entry.tier,
    minutes: entry.minutes,
    domain: entry.domain,
    brief: spec.brief,
    requirements: spec.requirements,
    constraints: spec.constraints,
    variationPoints: spec.variationPoints,
    scenarios: spec.scenarios,
    hiddenChanges: [],
    probes: [],
    conceptTags: entry.conceptTags,
    commonFailureModes: spec.commonFailureModes,
    goldDesigns: {},
    critiquePairs: [],
    calibrationSet: [],
    nextProblems: [],
  }
}

/* ------------------------------------------------------------------------- */
/* Main                                                                       */
/* ------------------------------------------------------------------------- */

async function main() {
  loadLocalEnv()
  // An offline job can wait out a whole rate-limit window; a request path cannot.
  process.env.LLD_LLM_MAX_WAIT_MS ??= '120000'
  const id = process.argv[2]
  if (!id) throw new Error('usage: author-problem <catalog-id> [--exemplar <id>]')
  const flag = process.argv.indexOf('--exemplar')
  const exemplarId = flag !== -1 ? process.argv[flag + 1]! : 'vending-machine'
  const catalog = read<{ problems: CatalogEntry[] }>('content/problems/catalog.json')
  const entry = catalog.problems.find((p) => p.id === id)
  if (!entry) throw new Error(`"${id}" is not in the catalog`)
  const exemplar = problemSchema.parse(read<unknown>(`content/problems/${exemplarId}.json`))

  const client = resolveLlmClient()
  if (client.id.startsWith('stub')) throw new Error('Authoring needs a real model — put a key in apps/api/.env.local')
  console.log(`Authoring "${entry.title}" with ${client.id}, exemplar ${exemplarId}\n`)

  // Stage 1 — the spec.
  const spec = await generate(client, 'spec', specPrompt(entry, exemplar), specSchema, 4000)
  await sleep(30_000)

  // Stage 2 — gold designs: strong, then one per failure mode (two).
  const gold: Record<string, DesignModel> = {}
  const strongEx = exemplar.goldDesigns['strong']!
  const rubric = ContentStore.load().rubricFor(exemplar)
  const rules = new RuleEvaluator()
  const measure = (design: DesignModel) =>
    rules.evaluate({
      stage: 'design',
      problem: { ...skeleton(entry, spec), goldDesigns: {} },
      rubric,
      facets: ['structure', 'behaviour', 'rationale'],
      design,
      graph: new DesignGraph(design),
    })

  // The strong design has to clear par on every measured criterion — that is what
  // "strong" means here. The evaluator's own concerns are the repair prompt: the
  // measurement tells the generator exactly what to fix, up to three rounds.
  let strong = await generate(client, 'gold/strong', designPrompt(entry, spec, strongEx, 'strong'), designModelSchema, 6000)
  for (let round = 0; round < 3; round += 1) {
    const results = await measure(strong)
    const below = results.filter((r) => r.score < 3)
    console.log(`  gold/strong measured: ${results.map((r) => `${r.criterionId}=${r.score}`).join(' ')}`)
    if (below.length === 0) break
    await sleep(30_000)
    const fixes = below.map((r) => `- ${r.criterionId} scored ${r.score}/4: ${r.concern} Do this: ${r.suggestion}`).join('\n')
    // The repair carries the previous design and the findings, not the exemplar —
    // half the tokens, and the findings are the more specific instruction anyway.
    strong = await generate(
      client,
      `gold/strong (repair ${round + 1})`,
      [
        `Problem: "${entry.title}". You wrote the strong design below; it was measured and fell short.`,
        'Fix every item and return the whole DesignModel again (same shape, same scenario ids).',
        'Keep every responsibility to ONE clause naming ONE job — a comma list is measured as several jobs.',
        '',
        'FINDINGS',
        fixes,
        '',
        'SCENARIOS: ' + spec.scenarios.map((s) => `${s.id} (${s.title})`).join('; '),
        '',
        'PREVIOUS DESIGN',
        JSON.stringify(strong),
      ].join('\n'),
      designModelSchema,
      6000,
    )
  }
  gold['strong'] = strong
  await sleep(20_000)
  const weakExemplarLabel = Object.keys(exemplar.goldDesigns).find((k) => k !== 'strong')!
  for (const smell of spec.commonFailureModes.slice(0, 2)) {
    const label = smell.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)
    gold[label] = await generate(client, `gold/${label}`, designPrompt(entry, spec, exemplar.goldDesigns[weakExemplarLabel]!, label, smell), designModelSchema, 5000)
    await sleep(20_000)
  }

  // Stage 3 — the instrumentation around them.
  const inst = await generate(client, 'instrumentation', instrumentationPrompt(entry, spec, gold, exemplar), instrumentationSchema, 5000)

  // Assemble and gate.
  const lint = Object.entries(gold).flatMap(([label, d]) => lintDesign(label, d, spec))
  const draft: Problem = {
    ...skeleton(entry, spec),
    hiddenChanges: inst.hiddenChanges,
    probes: inst.probes,
    goldDesigns: gold,
    critiquePairs: inst.critiquePairs,
  }

  // Run every gold design through the measured checks and record what happened.
  const report: string[] = []
  for (const [label, design] of Object.entries(gold)) {
    const results: CriterionResult[] = await measure(design)
    const scores = Object.fromEntries(results.map((r) => [r.criterionId, r.score]))
    report.push(`${label}: ${JSON.stringify(scores)}`)
    for (const r of results) if (r.score <= 1 || (label === 'strong' && r.score <= 2)) report.push(`    ${r.criterionId} ${r.score}: ${r.concern}`)

    // Proposed bands: the strong design must clear par on every measured criterion —
    // that is a bar, not a description. Weak designs get a regression band around
    // what the evaluator actually said, for a human to tighten.
    const expectedBands: Record<string, [number, number]> = {}
    for (const r of results) {
      expectedBands[r.criterionId] = label === 'strong' ? [3, 4] : [Math.max(0, r.score - 1), Math.min(4, r.score + 1)]
    }
    if (label === 'strong') expectedBands['edge-cases'] = [2, 4]
    draft.calibrationSet.push({ designId: label, label, expectedBands })
  }

  const parsed = problemSchema.safeParse(draft)
  const coherence: string[] = []
  if (parsed.success) {
    try {
      ContentStore.assertCoherent(parsed.data, `${entry.id}.draft.json`)
    } catch (e) {
      coherence.push(e instanceof Error ? e.message : String(e))
    }
  }

  const out = `content/problems/${entry.id}.draft.json`
  writeFileSync(`${ROOT}${out}`, JSON.stringify(draft, null, 2) + '\n')

  console.log(`\nWrote ${out}\n`)
  console.log('MEASURED SCORES PER GOLD DESIGN')
  for (const line of report) console.log('  ' + line)
  console.log(`\nSCHEMA: ${parsed.success ? 'ok' : parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  console.log(`COHERENCE: ${coherence.length === 0 ? 'ok' : coherence.join('; ')}`)
  console.log(`LINT: ${lint.length === 0 ? 'ok' : ''}`)
  for (const l of lint) console.log('  - ' + l)
  console.log('\nNext: read the draft, fix what the report flags, rename to <id>.json, run npm test.')
}

main().catch((e) => {
  console.error('FAILED:', e instanceof Error ? e.message : e)
  process.exit(1)
})
