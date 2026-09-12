/**
 * The provider boundary.
 *
 * Deliberately tiny: one call, text in, text out, plus an id used to stamp the
 * evaluation so we always know what produced a given score. Everything interesting —
 * the rubric, the prompt, schema validation, grounding — lives above this line in
 * LlmEvaluator, where it can be tested without a network.
 *
 * Keeping the port this thin is what makes the stub a genuine substitute rather than
 * a mock: the whole app runs end-to-end with no API key, and swapping in a real
 * provider changes one line of wiring.
 */
export interface LlmClient {
  readonly id: string
  complete(request: LlmRequest): Promise<LlmResponse>
}

export type LlmRequest = {
  system: string
  user: string
  maxTokens: number
  /**
   * How hard the model should think before answering.
   *
   * Note there is deliberately no `temperature` here. Current Claude models reject
   * it outright, and the older habit of pinning temperature to 0 for "reproducible"
   * judgement was never really buying that anyway. Consistency comes from the fixed
   * rubric, the constrained output shape and the grounding check instead.
   */
  effort?: 'low' | 'medium' | 'high'
  /**
   * The caller will parse the reply as a single JSON object. Providers that offer a
   * JSON mode switch it on; the rest ignore the flag. Either way the caller still
   * validates the shape — this is a hint, not a guarantee.
   */
  json?: boolean
}

export type LlmResponse = {
  text: string
  usage?: { inputTokens: number; outputTokens: number }
}

export class LlmUnavailableError extends Error {
  readonly code = 'LLM_UNAVAILABLE' as const
  constructor(message: string) {
    super(message)
    this.name = 'LlmUnavailableError'
  }
}
