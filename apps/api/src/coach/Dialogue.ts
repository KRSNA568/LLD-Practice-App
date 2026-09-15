import type { Usage } from './Reviewer.js'
import { z } from 'zod'
import type { DialogueTurn, Probe } from '@lld/contracts'
import type { EvaluationContext } from '../evaluation/Evaluator.js'
import type { LlmClient } from '../evaluation/llm/LlmClient.js'
import { readJson } from '../evaluation/llm/LlmEvaluator.js'
import { groundProse, identifiersIn } from './ground.js'
import { COACH_PROMPT_VERSION, MENTOR_SYSTEM } from './prompts.js'

/**
 * The Socratic half of Defend. After the learner's first answer to a probe the
 * mentor asks one follow-up — a question, never an answer — that presses on the
 * weakest part of what was said. The learner replies once more and the probe is
 * done. The evaluator then reads the whole exchange.
 *
 * The constraints are the feature. A follow-up that states a solution, or names a
 * class the learner does not have, or is not a question, is discarded and the
 * probe simply ends after one turn. Nothing here is ever scored.
 */

const followUpSchema = z.object({ question: z.string().min(1) })
const MAX_WORDS = 60

export const DIALOGUE_PROMPT_VERSION = COACH_PROMPT_VERSION

export class Dialogue {
  constructor(private readonly client: LlmClient) {}

  async followUp(ctx: EvaluationContext, probe: Probe, transcript: DialogueTurn[]): Promise<{ question: string; usage?: Usage } | null> {
    // A retry is a second call; both are what the follow-up cost.
    const usage: Usage = { inputTokens: 0, outputTokens: 0 }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.client.complete({
        system: MENTOR_SYSTEM,
        user: followUpPrompt(ctx, probe, transcript),
        maxTokens: 700,
        effort: 'low',
        json: true,
      })
      usage.inputTokens += response.usage?.inputTokens ?? 0
      usage.outputTokens += response.usage?.outputTokens ?? 0
      const parsed = followUpSchema.safeParse(readJson(response.text))
      if (!parsed.success) continue
      const question = acceptable(parsed.data.question.trim(), ctx, probe)
      if (question) return { question, usage: response.usage ? usage : undefined }
    }
    return null
  }
}

/** Grounded, a question, short, and not a verdict in disguise. */
export function acceptable(text: string, ctx: EvaluationContext, probe: Probe): string | null {
  if (!text.includes('?')) return null
  if (text.split(/\s+/).length > MAX_WORDS) return null
  if (/\b(you should|the right answer|the correct|you need to|instead, use)\b/i.test(text)) return null
  // The probe itself may name a class (it was templated from the design), so
  // anything the probe mentions is fair game for the follow-up too.
  const known = identifiersIn(probe.prompt)
  const grounded = groundProse(text, ctx.graph, [...known, ctx.problem.title])
  if (grounded.dropped.length > 0) return null
  return grounded.text
}

export function followUpPrompt(ctx: EvaluationContext, probe: Probe, transcript: DialogueTurn[]): string {
  return [
    'TASK: follow-up',
    'You are interviewing the learner about their own design. They have just answered a probe.',
    'Ask ONE follow-up question that presses on the weakest part of their answer — the alternative',
    'they did not weigh, the class they did not name, the consequence they did not mention.',
    '',
    'Rules for the question:',
    '- It must be a question. It must not contain a solution, a hint of the solution, or a verdict.',
    '- At most 40 words. Reference something the learner actually wrote.',
    '- Name only classes from the list below or from the probe itself.',
    '',
    `PROBLEM: ${ctx.problem.title}`,
    '',
    `CLASS NAMES YOU MAY MENTION: ${ctx.graph.classes.map((c) => c.name).join(', ') || '(none)'}`,
    '',
    `THE PROBE: ${probe.prompt}`,
    `What a strong answer does: ${probe.goodSignal.join('; ')}`,
    `What a weak answer does: ${probe.badSignal.join('; ')}`,
    '',
    'THE EXCHANGE SO FAR',
    ...transcript.map((t) => `  ${t.role === 'learner' ? 'Learner' : 'You'}: ${t.text}`),
    '',
    'Return exactly: {"question": "..."}',
  ].join('\n')
}
