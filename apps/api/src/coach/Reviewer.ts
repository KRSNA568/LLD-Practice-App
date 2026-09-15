import { reviewerNoteSchema, type CriterionResult } from '@lld/contracts'
import type { EvaluationContext } from '../evaluation/Evaluator.js'
import type { LlmClient } from '../evaluation/llm/LlmClient.js'
import { readJson } from '../evaluation/llm/LlmEvaluator.js'
import { groundProse } from './ground.js'
import { MENTOR_SYSTEM, reviewerPrompt } from './prompts.js'

export type Usage = { inputTokens: number; outputTokens: number }
export type MentorText = { text: string; modelId: string; usage?: Usage }

/**
 * The reviewer's note. One call, one paragraph, grounded sentence by sentence.
 *
 * The bar for showing it is two surviving sentences: a note that lost most of
 * itself to grounding was mostly about a design the learner does not have, and
 * a one-line remnant would read as a verdict rather than a note.
 */
export class Reviewer {
  constructor(private readonly client: LlmClient) {}

  async note(ctx: EvaluationContext, results: CriterionResult[]): Promise<MentorText | null> {
    const response = await this.client.complete({
      system: MENTOR_SYSTEM,
      user: reviewerPrompt(ctx, results),
      maxTokens: 600,
      effort: 'low',
      json: true,
    })
    const parsed = reviewerNoteSchema.safeParse(readJson(response.text))
    if (!parsed.success) return null

    const grounded = groundProse(parsed.data.note, ctx.graph, [ctx.problem.title])
    if (grounded.kept < 2) return null
    return { text: grounded.text, modelId: this.client.id, usage: response.usage }
  }
}
