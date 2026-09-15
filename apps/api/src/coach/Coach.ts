import type { MentorText } from './Reviewer.js'
import { z } from 'zod'
import type { NextProblemSuggestion, RecurringWeakness, Rubric } from '@lld/contracts'
import type { LlmClient } from '../evaluation/llm/LlmClient.js'
import { readJson } from '../evaluation/llm/LlmEvaluator.js'
import { MENTOR_SYSTEM } from './prompts.js'

/**
 * The coach across problems: what you keep doing, and what to do next. Inputs are
 * scores, so there is nothing to ground against a design — the discipline here is
 * that the coach may only talk about criteria and problems that exist, which the
 * prompt enumerates and the output is checked against.
 */
const schema = z.object({ note: z.string().min(1) })

export type CoachInput = {
  rubric: Rubric
  attempts: number
  problemsTried: number
  criterionAverages: Record<string, number>
  weaknesses: RecurringWeakness[]
  next: NextProblemSuggestion | null
  /** Recent attempts, newest first: problem title, overall, and the lowest criterion. */
  recent: Array<{ problemTitle: string; overall: number | null; lowest: string | null }>
}

export class Coach {
  constructor(private readonly client: LlmClient) {}

  async note(input: CoachInput): Promise<MentorText | null> {
    const response = await this.client.complete({
      system: MENTOR_SYSTEM,
      user: coachPrompt(input),
      maxTokens: 500,
      effort: 'low',
      json: true,
    })
    const parsed = schema.safeParse(readJson(response.text))
    if (!parsed.success) return null
    const text = parsed.data.note.trim()
    // Only names we handed it: criteria, problems. A coach who invents a problem
    // the library does not have is worse than none.
    const allowed = new Set([...input.rubric.criteria.map((c) => c.name), ...input.recent.map((r) => r.problemTitle), input.next?.title ?? ''])
    // Any run of capitalised words is a name. A sentence-initial word can join the
    // run ("In Vending Machine"), so the test is containment either way.
    const named = [...text.matchAll(/\b([A-Z][A-Za-z]+(?: (?:&|and|of)? ?[A-Z][A-Za-z]+)+)\b/g)].map((m) => m[1]!.toLowerCase())
    const names = [...allowed].filter(Boolean).map((a) => a.toLowerCase())
    for (const n of named) {
      if (!names.some((a) => n.includes(a) || a.includes(n))) return null
    }
    return { text, modelId: this.client.id, usage: response.usage }
  }
}

export function coachPrompt(input: CoachInput): string {
  return [
    'TASK: coach-note',
    'You are writing the two-or-three-sentence note at the top of a learner\'s progress page.',
    '',
    `They have made ${input.attempts} attempts across ${input.problemsTried} problems.`,
    '',
    'AVERAGE PER CRITERION (0–4, par is 3)',
    ...input.rubric.criteria.map((c) => `  - ${c.name}: ${input.criterionAverages[c.id]?.toFixed(1) ?? 'not yet scored'}`),
    '',
    'RECURRING WEAKNESS (below par in most of the last few attempts)',
    ...(input.weaknesses.length > 0
      ? input.weaknesses.map((w) => `  - ${w.criterionName}: ${w.occurrences} of the last ${w.windowSize}, averaging ${w.averageScore.toFixed(1)}`)
      : ['  (none yet)']),
    '',
    'RECENT ATTEMPTS, NEWEST FIRST',
    ...input.recent.slice(0, 6).map((r) => `  - ${r.problemTitle}: ${r.overall?.toFixed(1) ?? 'open'}${r.lowest ? `, lowest on ${r.lowest}` : ''}`),
    '',
    `NEXT PROBLEM ALREADY CHOSEN: ${input.next ? `${input.next.title} — ${input.next.reason}` : '(none)'}`,
    '',
    'Write 2–3 sentences: the one habit these numbers show (name the criterion), why it is worth',
    'breaking, and what to look for in the next problem. Name only criteria and problems listed',
    'above. No numbers, no praise, no "keep it up".',
    '',
    'Return exactly: {"note": "..."}',
  ].join('\n')
}
