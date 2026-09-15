// Start a study session from a known state. Run from the repo root.
//
//   npx tsx apps/api/scripts/reset-study.ts                         # dry run: what a full reset would remove
//   npx tsx apps/api/scripts/reset-study.ts --learner "Priya" --yes # one learner's attempts, notes, dialogue, critiques
//   npx tsx apps/api/scripts/reset-study.ts --all --yes             # every learner except the demo one, and their data
//   npx tsx apps/api/scripts/reset-study.ts --demo --yes            # the demo learner's data only (what scripts leave behind)
//
// Nothing is deleted without --yes. `--learner` matches an id or an exact name;
// the Learner row itself is kept so the name can be reused, unless --all.
import { PrismaClient } from '@prisma/client'
import { loadLocalEnv } from '../src/infra/env.js'

loadLocalEnv()
const args = process.argv.slice(2)
const yes = args.includes('--yes')
const all = args.includes('--all')
const demo = args.includes('--demo')
const learnerArg = args.includes('--learner') ? args[args.indexOf('--learner') + 1] : undefined
const DEMO = 'learner-demo'

if (!all && !demo && !learnerArg) {
  console.log('Dry run of --all. Pass --learner <id|name>, --demo, or --all; add --yes to actually delete.\n')
}

const prisma = new PrismaClient()

const learners = await prisma.learner.findMany({
  where: all || (!demo && !learnerArg)
    ? { id: { not: DEMO } }
    : demo
      ? { id: DEMO }
      : { OR: [{ id: learnerArg }, { name: learnerArg }] },
  include: { _count: { select: { attempts: true, critiques: true } } },
})

if (learners.length === 0) {
  console.log('No matching learner.')
  await prisma.$disconnect()
  process.exit(0)
}

const ids = learners.map((l) => l.id)
const attemptIds = (await prisma.attempt.findMany({ where: { learnerId: { in: ids } }, select: { id: true } })).map((a) => a.id)
const notes = await prisma.aiNote.count({ where: { learnerId: { in: ids } } })
const turns = await prisma.dialogueTurn.count({ where: { attemptId: { in: attemptIds } } })

for (const l of learners) console.log(`  ${l.name.padEnd(24)} ${l.id}  attempts=${l._count.attempts} critiques=${l._count.critiques}`)
console.log(`\n${learners.length} learner(s), ${attemptIds.length} attempts, ${notes} mentor notes, ${turns} dialogue turns${all ? ', and the learner rows themselves' : ''}`)

if (!yes) {
  console.log('\nDry run. Add --yes to delete.')
  await prisma.$disconnect()
  process.exit(0)
}

await prisma.$transaction([
  prisma.dialogueTurn.deleteMany({ where: { attemptId: { in: attemptIds } } }),
  prisma.aiNote.deleteMany({ where: { learnerId: { in: ids } } }),
  prisma.critique.deleteMany({ where: { learnerId: { in: ids } } }),
  // Submissions and evaluations cascade from the attempt.
  prisma.attempt.deleteMany({ where: { learnerId: { in: ids } } }),
  ...(all ? [prisma.learner.deleteMany({ where: { id: { in: ids } } })] : []),
])
console.log('Deleted.')
await prisma.$disconnect()
