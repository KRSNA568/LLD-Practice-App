import { Router, type Request, type Response, type NextFunction } from 'express'
import { ZodError } from 'zod'
import {
  critiqueAnswerRequestSchema,
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
import type { CoachService } from '../app/CoachService.js'
import type { ContentStore } from '../infra/content/ContentStore.js'

/**
 * The HTTP layer is deliberately thin: parse, delegate, serialise. No rules live
 * here — if a route grows a conditional about attempt state, that logic belongs in
 * the domain where it can be tested without a server.
 */

/** Single-tenant for now, but threaded everywhere so accounts are a value, not a migration. */
export const DEMO_LEARNER_ID = 'learner-demo'

const wrap =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next)
  }

export function createRouter(service: PracticeService, content: ContentStore, coach?: CoachService): Router {
  const router = Router()

  router.get(
    '/problems',
    wrap(async (_req, res) => {
      res.json(await service.listProblems(DEMO_LEARNER_ID))
    }),
  )

  router.get(
    '/attempts/:id/notes',
    wrap(async (req, res) => {
      const attempt = await service.getAttempt(req.params.id!)
      const results = attempt.report?.results ?? []
      res.json(coach ? await coach.notesFor(attempt.id, results) : { review: {}, lessons: {}, lessonable: [], live: false })
    }),
  )

  router.post(
    '/attempts/:id/lessons/:criterionId',
    wrap(async (req, res) => {
      if (!coach) throw new NotFoundError('The mentor')
      const lesson = await coach.lessonFor(req.params.id!, req.params.criterionId!)
      if (!lesson) {
        res.status(204).end()
        return
      }
      res.json({ lesson })
    }),
  )

  router.get(
    '/learners/me/progress',
    wrap(async (_req, res) => {
      res.json(await service.getProgress(DEMO_LEARNER_ID))
    }),
  )

  router.get(
    '/concepts',
    wrap(async (_req, res) => {
      res.json(await service.getConcepts(DEMO_LEARNER_ID))
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
      const history = await service.getHistory(DEMO_LEARNER_ID, req.params.id!)
      res.json({ problemId: req.params.id, ...history })
    }),
  )

  router.get(
    '/problems/:id/critique',
    wrap(async (req, res) => {
      const pairs = await service.getCritique(DEMO_LEARNER_ID, req.params.id!)
      res.json({ problemId: req.params.id, pairs })
    }),
  )

  router.post(
    '/problems/:id/critique/:pairId',
    wrap(async (req, res) => {
      const body = critiqueAnswerRequestSchema.parse(req.body)
      const verdict = await service.answerCritique(DEMO_LEARNER_ID, req.params.id!, req.params.pairId!, body)
      res.json(verdict)
    }),
  )

  router.post(
    '/attempts',
    wrap(async (req, res) => {
      const body = startAttemptRequestSchema.parse(req.body)
      const attempt = await service.startAttempt(DEMO_LEARNER_ID, body.problemId)
      const draft = await service.getDraft(attempt.id)
      res.status(201).json({ attempt, draft })
    }),
  )

  router.get(
    '/attempts/:id',
    wrap(async (req, res) => {
      const attempt = await service.getAttempt(req.params.id!)
      const draft = attempt.state === 'DRAFT' ? await service.getDraft(attempt.id) : null
      res.json({ attempt, draft, report: attempt.report })
    }),
  )

  router.put(
    '/attempts/:id/draft',
    wrap(async (req, res) => {
      const body = saveDraftRequestSchema.parse(req.body)
      await service.saveDraft(req.params.id!, body.input)
      res.status(204).end()
    }),
  )

  router.post(
    '/attempts/:id/submit',
    wrap(async (req, res) => {
      const body = submitAttemptRequestSchema.parse(req.body)
      const attempt = await service.submit(req.params.id!, body.input, body.idempotencyKey)
      res.status(202).json({ attempt })
    }),
  )

  router.post(
    '/attempts/:id/retry',
    wrap(async (req, res) => {
      res.status(202).json({ attempt: await service.retry(req.params.id!) })
    }),
  )

  router.post(
    '/attempts/:id/advance',
    wrap(async (req, res) => {
      res.json({ attempt: await service.advance(req.params.id!) })
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

  const message = error instanceof Error ? error.message : 'Unexpected error'
  console.error('[api]', error)
  res.status(500).json({ error: { code: 'INTERNAL', message } } satisfies ApiError)
}
