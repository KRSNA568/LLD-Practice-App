import { createHash, randomUUID } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import type { AiNoteKind } from '@lld/contracts'
import type { Usage } from './Reviewer.js'

/**
 * Get-or-generate for anything the mentor writes.
 *
 * The key is content-addressed: kind + prompt version + the inputs that went into
 * the prompt. Re-opening a report costs nothing; resubmitting an identical design
 * costs nothing; changing the prompt regenerates. A `null` from the generator is
 * not cached — an unavailable model today should not mean an empty note forever.
 */
export class NoteStore {
  constructor(private readonly prisma: PrismaClient) {}

  static key(kind: AiNoteKind, promptVersion: string, inputs: unknown): string {
    return createHash('sha256').update(JSON.stringify({ kind, promptVersion, inputs })).digest('hex')
  }

  async get<T>(kind: AiNoteKind, key: string): Promise<(T & { modelId: string }) | null> {
    const row = await this.prisma.aiNote.findUnique({ where: { kind_key: { kind, key } } })
    if (!row) return null
    return { ...(JSON.parse(row.json) as T), modelId: row.modelId }
  }

  async getOrGenerate<T extends { modelId: string; usage?: Usage }>(
    where: { kind: AiNoteKind; key: string; learnerId: string; attemptId?: string; stage?: string; refId?: string },
    generate: () => Promise<T | null>,
  ): Promise<T | null> {
    const cached = await this.get<T>(where.kind, where.key)
    if (cached) return cached

    const fresh = await generate()
    if (!fresh) return null

    // Usage is a fact about the call, not part of the note: it goes in columns so
    // cost is queryable, and is not returned on a cache hit because a cache hit cost nothing.
    const { modelId, usage, ...json } = fresh
    await this.prisma.aiNote.upsert({
      where: { kind_key: { kind: where.kind, key: where.key } },
      create: {
        id: randomUUID(),
        learnerId: where.learnerId,
        kind: where.kind,
        key: where.key,
        attemptId: where.attemptId ?? null,
        stage: where.stage ?? null,
        refId: where.refId ?? null,
        modelId,
        json: JSON.stringify(json),
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
      },
      update: {},
    })
    return fresh
  }

  /** Everything written about one attempt, for the report. */
  async forAttempt(learnerId: string, attemptId: string) {
    return this.prisma.aiNote.findMany({ where: { attemptId, learnerId }, orderBy: { createdAt: 'asc' } })
  }
}
