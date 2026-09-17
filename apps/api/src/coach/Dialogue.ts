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
      const question = acceptable(parsed.data.question.trim(), ctx, probe, transcript)
      if (question) return { question, usage: response.usage ? usage : undefined }
    }
    return null
  }
}

/**
 * Grounded, a question, short, not a verdict in disguise — and not putting words
 * in the learner's mouth. Seen live: "You chose an enum for Spot size" to a learner
 * who had said nothing about enums. Name grounding cannot catch that (Spot is a
 * real class), so an attribution is checked against what the learner actually
 * wrote: the content words after "you chose / you said / your …" have to appear in
 * their own turns, or the question is rejected and the model tries once more.
 */
export function acceptable(text: string, ctx: EvaluationContext, probe: Probe, transcript: DialogueTurn[] = []): string | null {
  if (!text.includes('?')) return null
  if (text.split(/\s+/).length > MAX_WORDS) return null
  if (/\b(you should|the right answer|the correct|you need to|instead, use)\b/i.test(text)) return null
  if (!attributionsBacked(text, transcript)) return null
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
    '- Never attribute to the learner anything they did not write. If they did not address',
    '  something, ask about it rather than assume what they chose.',
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

const ATTRIBUTION = /\b(?:you(?:'ve| have)? (?:chose|chosen|said|picked|decided|used|went with|mentioned|proposed|suggested|claimed|argued|described)|your (?:enum|choice|decision|answer|approach|design uses|use of))\b([^.?!,;:—–]*)/gi
const STOP = new Set(['the', 'a', 'an', 'that', 'this', 'for', 'with', 'and', 'or', 'of', 'to', 'in', 'on', 'as', 'is', 'are', 'was', 'be', 'it', 'its', 'by', 'from', 'than', 'then', 'not', 'your', 'you', 'their', 'there', 'here', 'would', 'should', 'could', 'have', 'has', 'into', 'over', 'about', 'which', 'what', 'when', 'where', 'how', 'why'])
const stem = (w: string) => w.toLowerCase().replace(/(ies|es|s|ing|ed)$/, '').slice(0, 6)

/**
 * Every "you chose X" in the question must find X in the learner's turns: at least
 * half of X's content words (stemmed), and at least one. A question with no
 * attribution passes. The probe's own wording is not the learner's, so it does
 * not count as backing.
 */
export function attributionsBacked(text: string, transcript: DialogueTurn[]): boolean {
  const said = transcript.filter((t) => t.role === 'learner').map((t) => t.text).join(' ')
  const saidStems = new Set(said.split(/[^A-Za-z]+/).filter((w) => w.length >= 3).map(stem))
  for (const m of text.matchAll(ATTRIBUTION)) {
    // The claim is the first few content words after the attribution; what follows a
    // dash or a clause break is the question, not the claim.
    const words = (m[1] ?? '').split(/[^A-Za-z]+/).filter((w) => w.length >= 3 && !STOP.has(w.toLowerCase())).slice(0, 5)
    if (words.length === 0) continue
    const hits = words.filter((w) => saidStems.has(stem(w))).length
    if (hits === 0 || hits * 2 < words.length) return false
  }
  return true
}
