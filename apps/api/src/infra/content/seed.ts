/**
 * First-run setup: create the database, and validate every content file.
 *
 * The content check is the point. A malformed problem or a rubric version a problem
 * does not pin should fail here, loudly, on a developer's machine — not silently at
 * boot, and certainly not halfway through a learner's evaluation.
 */
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { ContentStore } from './ContentStore.js'

const DEMO_LEARNER_ID = 'learner-demo'
const apiDir = fileURLToPath(new URL('../../../', import.meta.url))

async function seed(): Promise<void> {
  // Migrations, not `db push`: the schema's history is a set of files that apply
  // in order on any database, and a change is a new file rather than a diff
  // Prisma worked out on the spot.
  console.log('· applying migrations')
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    stdio: 'inherit',
  })

  console.log('· validating content')
  const content = ContentStore.load()
  const problems = content.listProblems()

  for (const problem of problems) {
    // Throws if the problem pins a rubric version that is not the one loaded.
    const rubric = content.rubricFor(problem)
    const seams = problem.variationPoints.length
    const gold = Object.keys(problem.goldDesigns).length
    console.log(
      `  ✓ ${problem.id.padEnd(26)} ${problem.requirements.length} requirements · ` +
        `${seams} seams · ${problem.scenarios.length} scenarios · ${problem.hiddenChanges.length} changes · ` +
        `${problem.probes.length} probes · ${gold} gold designs · ${problem.critiquePairs.length} critiques · ` +
        `rubric ${rubric.id}@${rubric.version}`,
    )
  }

  const prisma = new PrismaClient()
  try {
    await prisma.learner.upsert({
      where: { id: DEMO_LEARNER_ID },
      create: { id: DEMO_LEARNER_ID, name: 'Demo learner' },
      update: {},
    })
    console.log(`· demo learner ready (${DEMO_LEARNER_ID})`)
  } finally {
    await prisma.$disconnect()
  }

  console.log(`\nReady — ${problems.length} playable problems. Run \`npm run dev\`.`)
}

seed().catch((error) => {
  console.error('\nSeed failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
