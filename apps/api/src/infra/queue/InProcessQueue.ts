/**
 * A job queue that runs in the same process.
 *
 * The brief is explicit that this should not become a distributed-systems project,
 * and it does not need to be: what actually matters is that submitting does not
 * block on evaluation, that a failure is retried a bounded number of times, and
 * that the boundary is drawn somewhere a real broker could be dropped in later.
 *
 * That boundary is the point. If this product grew, the evaluation worker is the
 * first thing to pull out — it is the only slow, bursty, externally-dependent part
 * — and this interface is where the seam already is.
 */

export interface JobQueue {
  enqueue(job: () => Promise<void>, options?: { id?: string }): void
  /** Test hook: resolves once nothing is queued or running. */
  drain(): Promise<void>
}

export class InProcessQueue implements JobQueue {
  private running = 0
  private readonly waiters: Array<() => void> = []

  constructor(
    private readonly options: {
      maxRetries?: number
      baseDelayMs?: number
      onError?: (error: unknown, attempt: number, id?: string) => void
    } = {},
  ) {}

  enqueue(job: () => Promise<void>, options: { id?: string } = {}): void {
    this.running += 1
    // setImmediate rather than await: the caller returns to the learner straight
    // away, which is the whole reason this exists.
    setImmediate(() => {
      void this.run(job, options.id)
    })
  }

  private async run(job: () => Promise<void>, id?: string): Promise<void> {
    const maxRetries = this.options.maxRetries ?? 2
    const base = this.options.baseDelayMs ?? 50

    try {
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          await job()
          return
        } catch (error) {
          this.options.onError?.(error, attempt, id)
          if (attempt === maxRetries) return
          await new Promise((resolve) => setTimeout(resolve, base * 2 ** attempt))
        }
      }
    } finally {
      this.running -= 1
      if (this.running === 0) {
        while (this.waiters.length > 0) this.waiters.shift()!()
      }
    }
  }

  async drain(): Promise<void> {
    if (this.running === 0) return
    await new Promise<void>((resolve) => this.waiters.push(resolve))
  }
}
