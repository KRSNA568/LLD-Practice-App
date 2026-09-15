// The study export. Run from the repo root:
//
//   npx tsx apps/api/scripts/export-study.ts                 # ./study-export/{scores,attempts}.csv
//   npx tsx apps/api/scripts/export-study.ts --out-dir /tmp/s --include-demo
//
// Excludes the demo learner unless asked: that identity is what scripts and a
// fresh clone use, and its attempts are not study data.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { loadLocalEnv } from '../src/infra/env.js'
import { buildStudyExport, toCsv } from '../src/study/StudyExport.js'

loadLocalEnv()
const args = process.argv.slice(2)
const outDir = args.includes('--out-dir') ? args[args.indexOf('--out-dir') + 1]! : 'study-export'
const includeDemo = args.includes('--include-demo')

const prisma = new PrismaClient()
const rows = await prisma.attempt.findMany({
  where: includeDemo ? {} : { learnerId: { not: 'learner-demo' } },
  include: { learner: true, submissions: true, evaluations: true },
  orderBy: [{ learnerId: 'asc' }, { createdAt: 'asc' }],
})
const ids = rows.map((r) => r.id)
const notes = await prisma.aiNote.findMany({ where: { attemptId: { in: ids } } })
const turns = await prisma.dialogueTurn.findMany({ where: { attemptId: { in: ids } } })

const { scores, attempts } = buildStudyExport(
  rows.map((attempt) => ({
    attempt,
    submissions: attempt.submissions,
    evaluations: attempt.evaluations,
    notes: notes.filter((n) => n.attemptId === attempt.id),
    turns: turns.filter((t) => t.attemptId === attempt.id),
  })),
)

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'scores.csv'), toCsv(scores))
writeFileSync(join(outDir, 'attempts.csv'), toCsv(attempts))
await prisma.$disconnect()

const learners = new Set(attempts.map((a) => a.learnerId)).size
const abandoned = attempts.filter((a) => a.abandoned).length
console.log(`${outDir}/scores.csv    ${scores.length} rows`)
console.log(`${outDir}/attempts.csv  ${attempts.length} attempts, ${learners} learners, ${abandoned} abandoned${includeDemo ? '' : ' (demo learner excluded)'}`)
