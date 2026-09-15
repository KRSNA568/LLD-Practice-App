import type { Usage } from './Reviewer.js'
import { microLessonSchema, type Concept, type CriterionResult, type MicroLesson } from '@lld/contracts'
import type { EvaluationContext } from '../evaluation/Evaluator.js'
import type { LlmClient } from '../evaluation/llm/LlmClient.js'
import { readJson } from '../evaluation/llm/LlmEvaluator.js'
import { groundProse } from './ground.js'
import { lessonPrompt, MENTOR_SYSTEM } from './prompts.js'

/**
 * A micro-lesson: the concept explained after the learner has seen the contrast
 * in their own design — "a time for telling", delivered on request rather than up
 * front. The concept text is authored; the model's job is the bridge from that
 * text to this learner's classes.
 */
export class LessonWriter {
  constructor(private readonly client: LlmClient) {}

  async write(ctx: EvaluationContext, concept: Concept, result: CriterionResult): Promise<(MicroLesson & { modelId: string; usage?: Usage }) | null> {
    const response = await this.client.complete({
      system: MENTOR_SYSTEM,
      user: lessonPrompt(ctx, concept, result),
      maxTokens: 900,
      effort: 'low',
      json: true,
    })
    const parsed = microLessonSchema.safeParse(readJson(response.text))
    if (!parsed.success) return null

    const known = [concept.name, ctx.problem.title]
    const body = groundProse(parsed.data.body, ctx.graph, known)
    const before = groundProse(parsed.data.example.before, ctx.graph, known)
    const after = groundProse(parsed.data.example.after, ctx.graph, known)
    if (body.kept < 2 || before.kept < 1 || after.kept < 1) return null

    return {
      title: parsed.data.title.trim(),
      body: body.text,
      example: { before: before.text, after: after.text },
      modelId: this.client.id,
      usage: response.usage,
    }
  }
}
