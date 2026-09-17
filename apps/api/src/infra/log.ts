import type { NextFunction, Request, Response } from 'express'

/**
 * One JSON line per event, to stdout, so any log shipper can read it and so a
 * `grep '"level":"error"'` works before there is a shipper. Fields are flat on
 * purpose. `LLD_LOG=pretty` prints the human form for a terminal.
 */
export type Level = 'debug' | 'info' | 'warn' | 'error'

const PRETTY = process.env.LLD_LOG === 'pretty'

export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const time = new Date().toISOString()
  if (PRETTY) {
    const extra = Object.entries(fields).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' ')
    const line = `${time.slice(11, 19)} ${level.padEnd(5)} ${msg}${extra ? '  ' + extra : ''}`
    ;(level === 'error' || level === 'warn' ? console.error : console.log)(line)
    return
  }
  const line = JSON.stringify({ time, level, msg, ...fields })
  ;(level === 'error' || level === 'warn' ? console.error : console.log)(line)
}

/** An error as fields: message, name, stack, plus anything the thrower attached. */
export function errorFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const { message, name, stack, ...rest } = error as Error & Record<string, unknown>
    return { error: message, errorName: name, stack, ...rest }
  }
  return { error: String(error) }
}

/** Every request: method, path, status, duration, who. Health checks are skipped so they do not drown the log. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/api/health') { next(); return }
  const started = process.hrtime.bigint()
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6
    log(res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info', 'request', {
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(ms),
      learner: req.learnerId,
    })
  })
  next()
}

/**
 * Process-level error capture. An unhandled rejection is logged and the process
 * goes on — it is almost always a background job, and the request path has its
 * own handler. An uncaught exception is logged and the process exits non-zero so
 * whatever supervises it restarts a clean one; continuing after one is guessing.
 */
export function captureProcessErrors(): void {
  process.on('unhandledRejection', (reason) => log('error', 'unhandled rejection', errorFields(reason)))
  process.on('uncaughtException', (error) => {
    log('error', 'uncaught exception — exiting', errorFields(error))
    process.exit(1)
  })
}
