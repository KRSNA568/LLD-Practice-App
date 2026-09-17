import { loadLocalEnv } from './infra/env.js'

// Before anything reads process.env: a key in apps/api/.env.local counts.
const loadedEnv = loadLocalEnv()

import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import { PracticeService } from './app/PracticeService.js'
import { CoachService } from './app/CoachService.js'
import { ContentStore } from './infra/content/ContentStore.js'
import { InProcessQueue } from './infra/queue/InProcessQueue.js'
import { createRouter, DEMO_LEARNER_ID, errorHandler } from './http/routes.js'
import { identity } from './http/identity.js'
import { resolveLlmClient, resolveLlmProvider } from './evaluation/llm/index.js'
import { captureProcessErrors, errorFields, log, requestLogger } from './infra/log.js'
import { readFileSync } from 'node:fs'

const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version
const STARTED = Date.now()

const PORT = Number(process.env.PORT ?? 4000)

async function main(): Promise<void> {
  const prisma = new PrismaClient()

  // Content is validated on the way in, so a malformed problem file stops the
  // server at boot rather than halfway through someone's evaluation.
  const content = ContentStore.load()

  await prisma.learner.upsert({
    where: { id: DEMO_LEARNER_ID },
    create: { id: DEMO_LEARNER_ID, name: 'Demo learner' },
    update: {},
  })

  const queue = new InProcessQueue({
    maxRetries: 2,
    // Retries exist mostly for rate limits, which clear in seconds, not milliseconds.
    baseDelayMs: 4000,
    onError: (error, attempt, id) => {
      log('warn', 'queue job failed', { job: id ?? 'unknown', attempt: attempt + 1, ...errorFields(error) })
    },
  })

  const llm = resolveLlmClient()
  const service = new PracticeService(prisma, content, queue, llm)

  // The mentor writes after each stage lands, on the same queue, never on the
  // learner's request path. If it fails the report simply has no note.
  const mentorLlm = resolveLlmClient(process.env, 'mentor')
  const coach = new CoachService(
    prisma,
    content,
    (learnerId, id, stage) => service.loadContext(learnerId, id, stage),
    mentorLlm,
    (learnerId, id) => service.loadDefend(learnerId, id),
  )
  service.transcriptsOf = (id) => coach.transcripts(id)
  service.onEvaluated = (learnerId, attemptId, stage) => {
    queue.enqueue(
      async () => {
        await coach.reviewStage(learnerId, attemptId, stage)
      },
      { id: `note:${attemptId}:${stage}` },
    )
  }

  captureProcessErrors()
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))
  app.use(requestLogger)
  app.use('/api', identity(prisma))

  /**
   * The health check answers the questions an alert would ask: can it reach the
   * database, how long did that take, is the queue backing up, when did the last
   * evaluation land, and what version is this. `ok` is false when the database is
   * unreachable, so a probe on this route is a real probe.
   */
  app.get('/api/health', async (_req, res) => {
    const t0 = Date.now()
    let db: { ok: boolean; ms: number; error?: string }
    try {
      await prisma.$queryRaw`SELECT 1`
      db = { ok: true, ms: Date.now() - t0 }
    } catch (error) {
      db = { ok: false, ms: Date.now() - t0, error: error instanceof Error ? error.message : String(error) }
    }
    const last = db.ok ? await prisma.evaluation.findFirst({ orderBy: { completedAt: 'desc' }, select: { completedAt: true } }).catch(() => null) : null
    res.status(db.ok ? 200 : 503).json({
      ok: db.ok,
      version: VERSION,
      uptimeSeconds: Math.round((Date.now() - STARTED) / 1000),
      db,
      queue: { depth: queue.depth },
      lastEvaluationAt: last?.completedAt.toISOString() ?? null,
      problems: content.listProblems().length,
      evaluator: llm.id,
      provider: resolveLlmProvider(),
    })
  })
  app.use('/api', createRouter(service, content, coach, prisma))
  app.use(errorHandler)

  app.listen(PORT, () => {
    log('info', 'listening', {
      port: PORT,
      version: VERSION,
      problems: content.listProblems().map((p) => p.id),
      envLoaded: loadedEnv,
      evaluator: resolveLlmProvider() === 'stub' ? 'stub (no API key set)' : llm.id,
      mentor: resolveLlmProvider() === 'stub' ? 'stub' : mentorLlm.id,
    })
  })
}

main().catch((error) => {
  log('error', 'failed to start', errorFields(error))
  process.exit(1)
})
