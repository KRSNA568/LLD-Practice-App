import { z } from 'zod'
import type { CriterionResult } from '@lld/contracts'
import type { EvaluationContext } from '../evaluation/Evaluator.js'
import type { LlmClient } from '../evaluation/llm/LlmClient.js'
import { readJson } from '../evaluation/llm/LlmEvaluator.js'
import { groundProse } from './ground.js'
import { MENTOR_SYSTEM } from './prompts.js'

/**
 * "Explain this finding." A criterion card states what was found and what to do;
 * the explanation is the *why it matters here* — elaboration at the moment the
 * learner asks for it, in their own class names. Works for measured findings as
 * well as read ones: the measurement is the fact, the explanation is the teaching.
 */
const schema = z.object({ explanation: z.string().min(1) })

export class Explainer {
  constructor(private readonly client: LlmClient) {}

  async explain(ctx: EvaluationContext, result: CriterionResult): Promise<{ text: string; modelId: string } | null> {
    const response = await this.client.complete({
      system: MENTOR_SYSTEM,
      user: explainPrompt(ctx, result),
      maxTokens: 700,
      effort: 'low',
      json: true,
    })
    const parsed = schema.safeParse(readJson(response.text))
    if (!parsed.success) return null
    const grounded = groundProse(parsed.data.explanation, ctx.graph, [ctx.problem.title])
    if (grounded.kept < 2) return null
    return { text: grounded.text, modelId: this.client.id }
  }
}

export function explainPrompt(ctx: EvaluationContext, result: CriterionResult): string {
  const criterion = ctx.rubric.criteria.find((c) => c.id === result.criterionId)
  const cited = result.evidence
    .map((e) => (e.kind === 'class' ? e.name : e.kind === 'prose' ? `"${e.quote}"` : `${e.kind} ${'index' in e ? e.index : ''}`))
    .join(', ')
  return [
    'TASK: explain-finding',
    `The learner clicked "explain" on one finding. It was ${result.evaluatorKind === 'deterministic' ? 'measured from the structure of the design' : 'read by a reviewer'} and scored ${result.score}/4.`,
    '',
    `PROBLEM: ${ctx.problem.title}`,
    ctx.problem.brief,
    '',
    'THE DESIGN',
    JSON.stringify(
      {
        classes: ctx.design.classes.map((c) => ({ name: c.name, stereotype: c.stereotype, responsibility: c.responsibility, methods: c.methods })),
        relationships: ctx.design.relationships,
      },
      null,
      1,
    ),
    '',
    `CLASS NAMES YOU MAY MENTION: ${ctx.graph.classes.map((c) => c.name).join(', ') || '(none)'}`,
    '',
    'THE FINDING',
    `  criterion: ${criterion?.name ?? result.criterionId} — ${criterion?.question ?? ''}`,
    `  concern: ${result.concern}`,
    `  suggestion: ${result.suggestion}`,
    `  cites: ${cited || '(nothing)'}`,
    '',
    'In at most 120 words: why this matters for THIS problem specifically — what goes wrong later,',
    'in concrete terms, if it is left as is — and the smallest change that would move it, described',
    'in plain words using the learner\'s class names. Do not restate the concern. Do not give a score.',
    '',
    'Return exactly: {"explanation": "..."}',
  ].join('\n')
}
