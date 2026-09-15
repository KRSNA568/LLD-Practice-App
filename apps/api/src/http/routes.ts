import { Router, type Request, type Response, type NextFunction } from 'express'
import { ZodError } from 'zod'
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import {
  createLearnerRequestSchema,
  critiqueAnswerRequestSchema,
  dialogueTurnRequestSchema,
  saveDraftRequestSchema,
  startAttemptRequestSchema,
  submitAttemptRequestSchema,
  type ApiError,
} from '@lld/contracts'
import {
  InvalidSubmissionError,
  NotFoundError,
  WrongStageError,
  type PracticeService,
} from '../app/PracticeService.js'
import { InvalidTransitionError } from '../domain/attempt/AttemptStateMachine.js'
import { DialogueClosedError, type CoachService } from '../app/CoachService.js'
import type { ContentStore } from '../infra/content/ContentStore.js'
import { DEMO_LEARNER_ID } from './identity.js'

/**
 * The HTTP layer is deliberately thin: parse, delegate, serialise. No rules live
 * here — if a route grows a conditional about attempt state, that logic belongs in
 * the domain where it can be tested without a server.
 */

export { DEMO_LEARNER_ID }

const wrap =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next)
  }

export function createRouter(service: PracticeService, content: ContentStore, coach?: CoachService, prisma?: PrismaClient): Router {
  const router = Router()

  /* ----------------------------------------------------------------------- */
  /* Who is asking. See identity.ts for why this is deliberately thin.        */
  /* ----------------------------------------------------------------------- */

  router.post(
    '/learners',
    wrap(async (req, res) => {
      if (!prisma) throw new NotFoundError('Learner sign-in')
      const { name } = createLearnerRequestSchema.parse(req.body)
      const learner = await prisma.learner.create({ data: { id: randomUUID(), name } })
      res.status(201).json({ learner: { id: learner.id, name: learner.name } })
    }),
  )

  router.get(
    '/learners/me',
    wrap(async (req, res) => {
      if (!prisma) throw new NotFoundError('Learner sign-in')
      const learner = await prisma.learner.findUnique({ where: { id: req.learnerId } })
      if (!learner) throw new NotFoundError('Learner')
      res.json({ learner: { id: learner.id, name: learner.name } })
    }),
  )

  router.get(
    '/problems',
    wrap(async (req, res) => {
      res.json(await service.listProblems(req.learnerId))
    }),
  )

  router.post(
    '/attempts/:id/defend/:probeId/turn',
    wrap(async (req, res) => {
      if (!coach) throw new NotFoundError('The mentor')
      const { text } = dialogueTurnRequestSchema.parse(req.body)
      res.json(await coach.turn(req.learnerId, req.params.id!, req.params.probeId!, text))
    }),
  )

  router.get(
    '/attempts/:id/notes',
    wrap(async (req, res) => {
      const attempt = await service.getAttempt(req.learnerId, req.params.id!)
      const results = attempt.report?.results ?? []
      res.json(
        coach
          ? await coach.notesFor(req.learnerId, attempt.id, results)
          : { review: {}, lessons: {}, explanations: {}, lessonable: [], live: false },
      )
    }),
  )

  router.post(
    '/attempts/:id/lessons/:criterionId',
    wrap(async (req, res) => {
      if (!coach) throw new NotFoundError('The mentor')
      const lesson = await coach.lessonFor(req.learnerId, req.params.id!, req.params.criterionId!)
      if (!lesson) {
        res.status(204).end()
        return
      }
      res.json({ lesson })
    }),
  )

  router.post(
    '/attempts/:id/explain/:criterionId',
    wrap(async (req, res) => {
      if (!coach) throw new NotFoundError('The mentor')
      const explanation = await coach.explain(req.learnerId, req.params.id!, req.params.criterionId!)
      if (!explanation) {
        res.status(204).end()
        return
      }
      res.json({ explanation })
    }),
  )

  router.get(
    '/learners/me/progress',
    wrap(async (req, res) => {
      const progress = await service.getProgress(req.learnerId)
      // The coach's note is generated on read and cached by the numbers it is
      // about, so the dashboard costs one call per new evaluation, not per visit.
      const rubric = content.rubricFor(content.listProblems()[0]!)
      const coachNote = coach
        ? await coach
            .coachNote(req.learnerId, {
              rubric,
              attempts: progress.attempts,
              problemsTried: progress.problemsTried,
              criterionAverages: progress.criterionAverages,
              weaknesses: progress.recurringWeaknesses,
              next: progress.next,
              recent: progress.recent.map((a) => ({
                problemTitle: a.problemTitle,
                overall: a.overall,
                lowest: lowestCriterion(a.scores, rubric),
              })),
            })
            .catch(() => null)
        : null
      res.json({ ...progress, coach: coachNote })
    }),
  )

  router.get(
    '/concepts',
    wrap(async (req, res) => {
      res.json(await service.getConcepts(req.learnerId))
    }),
  )

  router.get(
    '/problems/:id',
    wrap(async (req, res) => {
      const problem = content.getProblem(req.params.id!)
      if (!problem) throw new NotFoundError(`Problem "${req.params.id}"`)
      // The public projection: no hidden change, no probes, no critique answers.
      res.json({ problem: content.toPublic(problem), rubric: content.rubricFor(problem) })
    }),
  )

  router.get(
    '/problems/:id/history',
    wrap(async (req, res) => {
      const history = await service.getHistory(req.learnerId, req.params.id!)
      res.json({ problemId: req.params.id, ...history })
    }),
  )

  router.get(
    '/problems/:id/critique',
    wrap(async (req, res) => {
      const pairs = await service.getCritique(req.learnerId, req.params.id!)
      res.json({ problemId: req.params.id, pairs })
    }),
  )

  router.post(
    '/problems/:id/critique/:pairId',
    wrap(async (req, res) => {
      const body = critiqueAnswerRequestSchema.parse(req.body)
      const verdict = await service.answerCritique(req.learnerId, req.params.id!, req.params.pairId!, body)
      res.json(verdict)
    }),
  )

  router.post(
    '/attempts',
    wrap(async (req, res) => {
      const body = startAttemptRequestSchema.parse(req.body)
      const attempt = await service.startAttempt(req.learnerId, body.problemId)
      const draft = await service.getDraft(req.learnerId, attempt.id)
      res.status(201).json({ attempt, draft })
    }),
  )

  router.get(
    '/attempts/:id',
    wrap(async (req, res) => {
      const attempt = await service.getAttempt(req.learnerId, req.params.id!)
      const draft = attempt.state === 'DRAFT' ? await service.getDraft(req.learnerId, attempt.id) : null
      res.json({ attempt, draft, report: attempt.report })
    }),
  )

  router.put(
    '/attempts/:id/draft',
    wrap(async (req, res) => {
      const body = saveDraftRequestSchema.parse(req.body)
      await service.saveDraft(req.learnerId, req.params.id!, body.input)
      res.status(204).end()
    }),
  )

  router.post(
    '/attempts/:id/submit',
    wrap(async (req, res) => {
      const body = submitAttemptRequestSchema.parse(req.body)
      const attempt = await service.submit(req.learnerId, req.params.id!, body.input, body.idempotencyKey)
      res.status(202).json({ attempt })
    }),
  )

  router.post(
    '/attempts/:id/retry',
    wrap(async (req, res) => {
      res.status(202).json({ attempt: await service.retry(req.learnerId, req.params.id!) })
    }),
  )

  router.post(
    '/attempts/:id/advance',
    wrap(async (req, res) => {
      res.json({ attempt: await service.advance(req.learnerId, req.params.id!) })
    }),
  )

  return router
}

/** One place that decides how a domain error becomes a status code. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  /**
   * A malformed request body is the caller's mistake, not ours. Letting a raw
   * ZodError fall through to the 500 branch would report our own bug for their
   * typo, and would hand the client no way to see which field was wrong.
   */
  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'INVALID_SUBMISSION',
        message: 'The request body is not valid',
        fields: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    } satisfies ApiError)
    return
  }

  if (error instanceof InvalidSubmissionError) {
    res.status(422).json({
      error: { code: 'INVALID_SUBMISSION', message: error.message, fields: error.fields },
    } satisfies ApiError)
    return
  }
  if (error instanceof NotFoundError) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: error.message } } satisfies ApiError)
    return
  }
  if (error instanceof InvalidTransitionError) {
    res.status(409).json({
      error: { code: 'INVALID_TRANSITION', message: error.message },
    } satisfies ApiError)
    return
  }
  if (error instanceof WrongStageError) {
    res.status(409).json({ error: { code: 'WRONG_STAGE', message: error.message } } satisfies ApiError)
    return
  }
  if (error instanceof DialogueClosedError) {
    res.status(409).json({ error: { code: 'DIALOGUE_CLOSED', message: error.message } } satisfies ApiError)
    return
  }

  const message = error instanceof Error ? error.message : 'Unexpected error'
  console.error('[api]', error)
  res.status(500).json({ error: { code: 'INTERNAL', message } } satisfies ApiError)
}

function lowestCriterion(scores: Record<string, number | undefined>, rubric: { criteria: Array<{ id: string; name: string }> }): string | null {
  let best: { name: string; score: number } | null = null
  for (const c of rubric.criteria) {
    const score = scores[c.id]
    if (score !== undefined && (best === null || score < best.score)) best = { name: c.name, score }
  }
  return best?.name ?? null
}
