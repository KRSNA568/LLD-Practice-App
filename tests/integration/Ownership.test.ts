import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import { pushSchema, testDatabaseUrl } from '../testdb.js'
import express from 'express'
import cors from 'cors'
import { LEARNER_HEADER } from '@lld/contracts'
import { CoachService } from '../../apps/api/src/app/CoachService.js'
import { PracticeService } from '../../apps/api/src/app/PracticeService.js'
import { StubLlmClient } from '../../apps/api/src/evaluation/llm/StubLlmClient.js'
import { createRouter, errorHandler } from '../../apps/api/src/http/routes.js'
import { identity } from '../../apps/api/src/http/identity.js'
import { ContentStore } from '../../apps/api/src/infra/content/ContentStore.js'
import { InProcessQueue } from '../../apps/api/src/infra/queue/InProcessQueue.js'
import { toRawStructuredSubmission } from '../../apps/api/src/submission/StructuredDesignParser.js'
import { strongDesign } from '../fixtures.js'

/**
 * Two learners on one instance must not be able to see or touch each other's
 * attempts. This is the ownership matrix: every attempt-addressed route, hit with
 * the wrong learner, answers not-found — never the data, never forbidden (which
 * would confirm the id exists).
 *
 * It goes through HTTP on purpose. The guard lives in the service, but the promise
 * is made at the route boundary, and a route that forgot to pass `req.learnerId`
 * would pass a service-level test and fail this one.
 */

const DB_URL = testDatabaseUrl('ownership')

let prisma: import('@prisma/client').PrismaClient
let server: import('node:http').Server
let base: string
let alice: string
let mallory: string
let attemptId: string

const call = (path: string, init: RequestInit & { as?: string } = {}) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.as) headers[LEARNER_HEADER] = init.as
  return fetch(base + path, { ...init, headers })
}

beforeAll(async () => {
  process.env.LLD_FORCE_STUB = '1'
  await pushSchema(DB_URL)
  const { PrismaClient } = await import('@prisma/client')
  prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } })
  await prisma.learner.create({ data: { id: 'learner-demo', name: 'Demo learner' } })

  const queue = new InProcessQueue({ maxRetries: 0, baseDelayMs: 1 })
  const content = ContentStore.load()
  const service = new PracticeService(prisma, content, queue)
  const coach = new CoachService(prisma, content, (l, id, s) => service.loadContext(l, id, s), new StubLlmClient(), (l, id) => service.loadDefend(l, id))
  service.transcriptsOf = (id) => coach.transcripts(id)

  const app = express()
  app.use(cors())
  app.use(express.json())
  app.use('/api', identity(prisma))
  app.use('/api', createRouter(service, content, coach, prisma))
  app.use(errorHandler)
  server = app.listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`

  // Two learners, by name — the way the study will create them.
  alice = ((await (await call('/learners', { method: 'POST', body: JSON.stringify({ name: 'Alice' }) })).json()) as { learner: { id: string } }).learner.id
  mallory = ((await (await call('/learners', { method: 'POST', body: JSON.stringify({ name: 'Mallory' }) })).json()) as { learner: { id: string } }).learner.id

  // Alice starts an attempt and saves a draft; Mallory will try to reach it.
  const started = (await (await call('/attempts', { method: 'POST', as: alice, body: JSON.stringify({ problemId: 'parking-lot' }) })).json()) as { attempt: { id: string } }
  attemptId = started.attempt.id
  await call(`/attempts/${attemptId}/draft`, {
    method: 'PUT',
    as: alice,
    body: JSON.stringify({ input: { stage: 'design', submission: toRawStructuredSubmission(strongDesign) } }),
  })
}, 60_000)

afterAll(async () => {
  server?.close()
  await prisma?.$disconnect()
})

describe('identity', () => {
  it('creates a learner from a name and reports who is asking', async () => {
    const me = (await (await call('/learners/me', { as: alice })).json()) as { learner: { id: string; name: string; createdAt: string } }
    expect(me.learner).toMatchObject({ id: alice, name: 'Alice' })
    expect(Date.parse(me.learner.createdAt)).not.toBeNaN()
  })

  it('falls back to the demo learner with no header, so scripts and a fresh clone still work', async () => {
    const me = (await (await call('/learners/me')).json()) as { learner: { id: string } }
    expect(me.learner.id).toBe('learner-demo')
  })

  it('refuses an id that names nobody, rather than failing deep in a service', async () => {
    const r = await call('/learners/me', { as: 'not-a-learner' })
    expect(r.status).toBe(401)
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('UNKNOWN_LEARNER')
  })
})

describe('ownership matrix', () => {
  const routes: Array<[string, string, unknown]> = [
    ['GET', '', undefined],
    ['GET', '/notes', undefined],
    ['PUT', '/draft', { input: { stage: 'design', submission: toRawStructuredSubmission(strongDesign) } }],
    ['POST', '/submit', { input: { stage: 'design', submission: toRawStructuredSubmission(strongDesign) }, idempotencyKey: 'mallory-key-0001' }],
    ['POST', '/retry', undefined],
    ['POST', '/advance', undefined],
    ['POST', '/lessons/abstraction-use', undefined],
    ['POST', '/explain/abstraction-use', undefined],
    ['POST', '/defend/p-1/turn', { text: 'I would add a class.' }],
  ]

  it.each(routes)('%s /attempts/:id%s answers not-found to the wrong learner', async (method, path, body) => {
    const r = await call(`/attempts/${attemptId}${path}`, { method, as: mallory, body: body ? JSON.stringify(body) : undefined })
    // 404, and specifically not 403 (which would confirm the attempt exists), not
    // 409 (which would reveal what stage it is at), and not 204 (which is what the
    // lesson and explain routes returned to a non-owner before this test existed).
    expect(r.status).toBe(404)
    expect(((await r.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND')
  })

  it('and the owner can still reach every one of them', async () => {
    const r = await call(`/attempts/${attemptId}`, { as: alice })
    expect(r.status).toBe(200)
    const body = (await r.json()) as { attempt: { id: string }; draft: unknown }
    expect(body.attempt.id).toBe(attemptId)
    expect(body.draft).not.toBeNull()
  })

  it('the demo learner cannot reach a named learner\'s attempt either', async () => {
    const r = await call(`/attempts/${attemptId}`)
    expect(r.status).toBe(404)
  })

  it('collection routes are scoped: Mallory sees none of Alice\'s attempts', async () => {
    const history = (await (await call('/problems/parking-lot/history', { as: mallory })).json()) as { attempts: unknown[] }
    expect(history.attempts).toHaveLength(0)
    const mine = (await (await call('/problems/parking-lot/history', { as: alice })).json()) as { attempts: unknown[] }
    expect(mine.attempts).toHaveLength(1)
  })

  it('Mallory\'s draft write did not touch Alice\'s draft', async () => {
    // The PUT /draft above, as Mallory, must have been a no-op on Alice's row.
    const draft = ((await (await call(`/attempts/${attemptId}`, { as: alice })).json()) as { draft: { submission: { classes: unknown[] } } }).draft
    expect(draft.submission.classes.length).toBe(strongDesign.classes.length)
  })
})
