import type { PrismaClient } from '@prisma/client'
import type { NextFunction, Request, Response } from 'express'
import { LEARNER_HEADER, type ApiError } from '@lld/contracts'

/**
 * Who is asking, for every request.
 *
 * This is the Phase 2 stand-in for accounts and it is disposable: a learner id in
 * a header, no secret behind it. What it is for is keeping study participants'
 * attempts apart on one instance, and making sure ownership is threaded through
 * every service call *now*, so real auth in Phase 4 replaces this file and
 * changes nothing below it.
 *
 * No header means the demo learner, so scripts and a fresh clone keep working.
 * A header naming a learner that does not exist is refused rather than let
 * through to fail as a foreign-key error deep in a service.
 */

/** Single-tenant fallback. Threaded, never assumed. */
export const DEMO_LEARNER_ID = 'learner-demo'

declare module 'express-serve-static-core' {
  interface Request {
    learnerId: string
  }
}

export function identity(prisma: PrismaClient) {
  // Existence is checked once per id per process. Learners are never deleted by
  // the app, so a hit stays valid; a miss is re-checked in case the row was
  // created by a concurrent request.
  const known = new Set<string>([DEMO_LEARNER_ID])

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const raw = req.header(LEARNER_HEADER)?.trim()
    if (!raw) {
      req.learnerId = DEMO_LEARNER_ID
      next()
      return
    }
    if (!known.has(raw)) {
      const row = await prisma.learner.findUnique({ where: { id: raw }, select: { id: true } })
      if (!row) {
        res.status(401).json({
          error: { code: 'UNKNOWN_LEARNER', message: 'That learner does not exist here. Enter your name again.' },
        } satisfies ApiError)
        return
      }
      known.add(raw)
    }
    req.learnerId = raw
    next()
  }
}
