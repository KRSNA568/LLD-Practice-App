import { describe, expect, it } from 'vitest'
import { InProcessQueue } from '../../apps/api/src/infra/queue/InProcessQueue.js'

describe('InProcessQueue', () => {
  it('tells the job whether this run is its last', async () => {
    const queue = new InProcessQueue({ maxRetries: 2, baseDelayMs: 1 })
    const runs: Array<{ attempt: number; final: boolean }> = []
    queue.enqueue(async (run) => {
      runs.push(run)
      throw new Error('nope')
    })
    await queue.drain()
    expect(runs).toEqual([
      { attempt: 0, final: false },
      { attempt: 1, final: false },
      { attempt: 2, final: true },
    ])
  })

  it('waits as long as a rate-limited error says to, instead of the backoff', async () => {
    // From the simulated study: three retries 50ms apart against "try again in
    // 30s" were three certain failures. A hinted wait is honoured (capped).
    const queue = new InProcessQueue({ maxRetries: 1, baseDelayMs: 1 })
    const times: number[] = []
    queue.enqueue(async () => {
      times.push(Date.now())
      const error = new Error('rate limited') as Error & { retryAfterMs?: number }
      error.retryAfterMs = 120
      throw error
    })
    await queue.drain()
    expect(times).toHaveLength(2)
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(100)
  })
})
