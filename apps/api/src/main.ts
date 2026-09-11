import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import { PracticeService } from './app/PracticeService.js'
import { ContentStore } from './infra/content/ContentStore.js'
import { InProcessQueue } from './infra/queue/InProcessQueue.js'
import { createRouter, DEMO_LEARNER_ID, errorHandler } from './http/routes.js'

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
    onError: (error, attempt, id) => {
      console.warn(
        `[queue] evaluation for ${id ?? 'unknown'} failed on attempt ${attempt + 1}:`,
        error instanceof Error ? error.message : error,
      )
    },
  })

  const service = new PracticeService(prisma, content, queue)

  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      problems: content.listProblems().length,
      evaluator: process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'stub',
    })
  })
  app.use('/api', createRouter(service, content))
  app.use(errorHandler)

  app.listen(PORT, () => {
    const playable = content.listProblems().map((p) => p.id).join(', ')
    console.log(`[api] listening on http://localhost:${PORT}`)
    console.log(`[api] playable problems: ${playable}`)
    console.log(
      `[api] evaluator: ${process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'deterministic stub (no API key set)'}`,
    )
  })
}

main().catch((error) => {
  console.error('[api] failed to start:', error)
  process.exit(1)
})
