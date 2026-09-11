import {
  llmEvaluationResponseSchema,
  type CriterionId,
  type CriterionResult,
  type Score,
} from '@lld/contracts'
import type { EvaluationContext, Evaluator } from '../Evaluator.js'
import type { LlmClient } from './LlmClient.js'
import { buildSystemPrompt, buildUserPrompt, PROMPT_VERSION } from './PromptBuilder.js'
import { groundEvidence, type GroundingReport } from './EvidenceGroundingValidator.js'

/**
 * The judgement half of evaluation.
 *
 * Owns only the criteria that need *reading*: whether the unhappy paths were
 * thought about, and whether the learner can explain and defend their own
 * decisions. Everything provable — structure, behaviour, the blast radius of a
 * change — stays next door with the rule evaluator. The research is blunt about
 * why: models identify classes well and count relationships badly.
 *
 * Three defences sit between the model and the learner, and they matter in order:
 * the output must match the schema, every citation must exist in the submission, and
 * anything that fails either check is dropped rather than repaired. A missing
 * criterion is honest; an invented one is not.
 */
export class LlmEvaluator implements Evaluator {
  readonly id: string
  readonly kind = 'llm' as const

  /** Exposed so the pipeline can report which criteria went unscored on failure. */
  lastGrounding: GroundingReport | null = null

  constructor(
    private readonly client: LlmClient,
    private readonly options: { maxTokens?: number; retries?: number } = {},
  ) {
    this.id = `llm-evaluator:${client.id}:${PROMPT_VERSION}`
  }

  get criteria(): readonly CriterionId[] {
    // Declared per-rubric at evaluate() time; this is the static superset.
    return ['edge-cases', 'reasoning']
  }

  async evaluate(ctx: EvaluationContext): Promise<CriterionResult[]> {
    const criteria = ctx.rubric.criteria.filter(
      (c) => c.judgedBy === 'llm' && c.stage === ctx.stage,
    )
    if (criteria.length === 0) return []

    const system = buildSystemPrompt()
    const user = buildUserPrompt(ctx, criteria)
    const attempts = (this.options.retries ?? 1) + 1

    let lastError: unknown

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const response = await this.client.complete({
        system,
        user,
        maxTokens: this.options.maxTokens ?? 2048,
        // Rubric criteria are a judgement task, not a lookup — worth the thinking.
        effort: 'medium',
      })

      const parsed = llmEvaluationResponseSchema.safeParse(readJson(response.text))
      if (!parsed.success) {
        lastError = parsed.error
        continue
      }

      const allowed = new Set(criteria.map((c) => c.id))

      const shaped: CriterionResult[] = parsed.data.results
        // A model that scores a criterion it was not asked about is out of scope,
        // not helpful — the rule evaluator already owns those.
        .filter((r) => allowed.has(r.criterionId))
        .map((r) => ({
          criterionId: r.criterionId,
          stage: ctx.stage,
          score: clampScore(r.score),
          evidence: r.evidence,
          concern: r.concern.trim(),
          suggestion: r.suggestion.trim(),
          confidence: r.confidence,
          evaluatorId: this.id,
          evaluatorKind: 'llm' as const,
        }))

      const { results, report } = groundEvidence(shaped, ctx.graph, {
        rationale: ctx.rationale,
        answers: ctx.answers,
      })
      this.lastGrounding = report
      return results
    }

    throw new Error(
      `LLM returned unusable output after ${attempts} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    )
  }
}

/** Models still wrap JSON in fences no matter how firmly asked not to. */
function readJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const open = cleaned.indexOf('{')
  const close = cleaned.lastIndexOf('}')
  if (open === -1 || close <= open) return null
  try {
    return JSON.parse(cleaned.slice(open, close + 1))
  } catch {
    return null
  }
}

function clampScore(raw: number): Score {
  const n = Math.round(raw)
  return (n < 0 ? 0 : n > 4 ? 4 : n) as Score
}
