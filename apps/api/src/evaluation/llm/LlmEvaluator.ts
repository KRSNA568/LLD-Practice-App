import {
  evidenceRefSchema,
  llmEvaluationResponseSchema,
  type CriterionId,
  type CriterionResult,
  type EvidenceRef,
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
        json: true,
      })

      const { raw, malformed } = dropMalformedEvidence(readJson(response.text))
      const parsed = llmEvaluationResponseSchema.safeParse(raw)
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
      this.lastGrounding = { kept: report.kept, dropped: [...malformed, ...report.dropped] }
      return results
    }

    throw new Error(
      `LLM returned unusable output after ${attempts} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    )
  }
}

/**
 * A model that scores correctly but mangles one evidence reference — a prose ref
 * without its quote is the common case — should lose that reference, not the whole
 * result. Malformed refs are removed before schema validation and reported alongside
 * the grounding drops, so the omission is visible rather than silent.
 */
function dropMalformedEvidence(raw: unknown): { raw: unknown; malformed: GroundingReport['dropped'] } {
  const malformed: GroundingReport['dropped'] = []
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { results?: unknown }).results)) {
    return { raw, malformed }
  }
  const results = ((raw as { results: unknown[] }).results ?? []).map((r) => {
    if (!r || typeof r !== 'object' || !Array.isArray((r as { evidence?: unknown }).evidence)) return r
    const item = r as { criterionId?: unknown; evidence: unknown[] }
    const evidence = item.evidence.filter((ref) => {
      if (evidenceRefSchema.safeParse(ref).success) return true
      malformed.push({
        criterionId: typeof item.criterionId === 'string' ? item.criterionId : 'unknown',
        ref: ref as EvidenceRef,
        reason: 'malformed evidence reference',
      })
      return false
    })
    return { ...item, evidence }
  })
  return { raw: { ...(raw as object), results }, malformed }
}

/** Models still wrap JSON in fences no matter how firmly asked not to. */
export function readJson(text: string): unknown {
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
