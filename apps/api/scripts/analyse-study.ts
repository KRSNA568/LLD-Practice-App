// The analysis from STUDY_PROTOCOL.md "After the last session", run on the export.
// Run from the repo root, after export-study.ts:
//
//   npx tsx apps/api/scripts/analyse-study.ts --in study-export
//   npx tsx apps/api/scripts/analyse-study.ts --in study-sim/export --sim   # S1-sim … J3-sim names
//
// Learner names S1–S3 are seniors and J1–J3 juniors, per the protocol. Prints the
// composites, the separation verdict, change-resilience on its own, and the
// activation and cost columns. Reads only; decides nothing the protocol does not.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const IN = args.includes('--in') ? args[args.indexOf('--in') + 1]! : 'study-export'

const csv = (file: string): Array<Record<string, string>> => {
  const [head, ...lines] = readFileSync(join(IN, file), 'utf8').trim().split('\n')
  const cols = parseLine(head!)
  return lines.map((l) => Object.fromEntries(parseLine(l).map((v, i) => [cols[i]!, v])))
}
function parseLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1 } else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

const MEASURED = ['requirement-coverage', 'class-responsibilities', 'coupling-cohesion', 'abstraction-use', 'behaviour']
const group = (name: string): 'senior' | 'junior' | null => (/^S\d/.test(name) ? 'senior' : /^J\d/.test(name) ? 'junior' : null)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const fmt = (n: number) => (Number.isNaN(n) ? '—' : n.toFixed(2))

const scores = csv('scores.csv').filter((r) => group(r.learnerName!))
const attempts = csv('attempts.csv').filter((r) => group(r.learnerName!))
if (scores.length === 0) { console.log(`No S*/J* learners in ${IN}`); process.exit(1) }

type Learner = { name: string; group: 'senior' | 'junior'; composite: number; perCriterion: Record<string, number>; resilience: number | null; reasoning: number | null }
const learners: Learner[] = []
for (const name of [...new Set(scores.map((r) => r.learnerName!))].sort()) {
  const rows = scores.filter((r) => r.learnerName === name)
  const design = rows.filter((r) => r.stage === 'design')
  const perCriterion = Object.fromEntries(MEASURED.map((c) => [c, mean(design.filter((r) => r.criterionId === c).map((r) => Number(r.score)))]))
  const composite = mean(MEASURED.map((c) => perCriterion[c]!).filter((n) => !Number.isNaN(n)))
  const res = rows.find((r) => r.stage === 'change' && r.criterionId === 'change-resilience')
  const rsn = rows.find((r) => r.stage === 'defend' && r.criterionId === 'reasoning')
  learners.push({ name, group: group(name)!, composite, perCriterion, resilience: res ? Number(res.score) : null, reasoning: rsn ? Number(rsn.score) : null })
}

console.log(`\n${learners.length} learners from ${IN}\n`)
console.log(['learner', 'group', 'composite', ...MEASURED.map((c) => c.split('-')[0]), 'resil', 'reason'].map((s, i) => s.padEnd(i < 2 ? 8 : 10)).join(''))
for (const l of learners) {
  console.log([l.name, l.group, fmt(l.composite), ...MEASURED.map((c) => fmt(l.perCriterion[c]!)), l.resilience ?? '—', l.reasoning ?? '—'].map((s, i) => String(s).padEnd(i < 2 ? 8 : 10)).join(''))
}

const seniors = learners.filter((l) => l.group === 'senior')
const juniors = learners.filter((l) => l.group === 'junior')
const verdict = (key: (l: Learner) => number | null, label: string) => {
  const s = seniors.map(key).filter((n): n is number => n !== null)
  const j = juniors.map(key).filter((n): n is number => n !== null)
  if (s.length === 0 || j.length === 0) return console.log(`\n${label}: not enough data`)
  const minS = Math.min(...s), maxJ = Math.max(...j)
  const overlap = s.filter((x) => x <= maxJ).length + j.filter((x) => x >= minS).length
  const result = overlap === 0 ? 'SEPARATES (no overlap)' : overlap <= 2 ? `INCONCLUSIVE (${overlap} in the overlap)` : 'DOES NOT SEPARATE'
  console.log(`\n${label}: seniors ${s.map(fmt).join(' ')} (mean ${fmt(mean(s))}) vs juniors ${j.map(fmt).join(' ')} (mean ${fmt(mean(j))}) → ${result}`)
}
verdict((l) => l.composite, 'Design composite (five measured criteria)')
for (const c of MEASURED) verdict((l) => l.perCriterion[c]!, `  ${c}`)
verdict((l) => l.resilience, 'Change resilience (change stage)')
verdict((l) => l.reasoning, 'Reasoning (defend stage)')

console.log('\nActivation, time and cost')
for (const a of attempts) {
  const secs = ['secondsDesigning', 'secondsRevising', 'secondsDefending'].map((k) => Number(a[k] || 0))
  const tokens = Object.entries(a).filter(([k]) => /Tokens$/i.test(k)).map(([k, v]) => `${k}=${v}`).join(' ')
  console.log(`  ${a.learnerName!.padEnd(8)} stages ${a.stagesSubmitted}/3 ${a.abandoned === 'true' ? 'ABANDONED' : a.finalState} · ${secs.map((s) => Math.round(s)).join('+')}s · ${tokens}`)
}
