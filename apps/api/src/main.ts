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
      console.warn(
        `[queue] evaluation for ${id ?? 'unknown'} failed on attempt ${attempt + 1}:`,
        error instanceof Error ? error.message : error,
      )
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

  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))
  app.use('/api', identity(prisma))
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      problems: content.listProblems().length,
      evaluator: llm.id,
      provider: resolveLlmProvider(),
    })
  })
  app.use('/api', createRouter(service, content, coach, prisma))
  app.use(errorHandler)

  app.listen(PORT, () => {
    const playable = content.listProblems().map((p) => p.id).join(', ')
    console.log(`[api] listening on http://localhost:${PORT}`)
    console.log(`[api] playable problems: ${playable}`)
    if (loadedEnv.length > 0) console.log(`[api] loaded from .env.local: ${loadedEnv.join(', ')}`)
    console.log(
      `[api] evaluator: ${
        resolveLlmProvider() === 'stub' ? 'deterministic stub (no API key set)' : llm.id
      }`,
    )
    if (resolveLlmProvider() !== 'stub') console.log(`[api] mentor: ${mentorLlm.id}`)
  })
}

main().catch((error) => {
  console.error('[api] failed to start:', error)
  process.exit(1)
})
