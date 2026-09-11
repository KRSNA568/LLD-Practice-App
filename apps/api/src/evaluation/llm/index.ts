import type { LlmClient } from './LlmClient.js'
import { StubLlmClient } from './StubLlmClient.js'
import { AnthropicLlmClient } from './AnthropicLlmClient.js'

export * from './LlmClient.js'
export * from './LlmEvaluator.js'
export * from './EvidenceGroundingValidator.js'
export { StubLlmClient } from './StubLlmClient.js'
export { AnthropicLlmClient } from './AnthropicLlmClient.js'

/**
 * Picks a provider from the environment.
 *
 * The stub is the default on purpose: a fresh clone runs the whole practice loop
 * with no configuration, and the deterministic half of the rubric is unaffected
 * either way. Setting a key upgrades the judgement criteria; it does not unlock
 * the product.
 */
export function resolveLlmClient(): LlmClient {
  if (process.env.LLD_FORCE_STUB === '1') return new StubLlmClient()
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicLlmClient()
  return new StubLlmClient()
}
