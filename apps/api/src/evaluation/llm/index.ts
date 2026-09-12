import type { LlmClient } from './LlmClient.js'
import { StubLlmClient } from './StubLlmClient.js'
import { AnthropicLlmClient } from './AnthropicLlmClient.js'
import { OpenAiCompatibleLlmClient } from './OpenAiCompatibleLlmClient.js'

export * from './LlmClient.js'
export * from './LlmEvaluator.js'
export * from './EvidenceGroundingValidator.js'
export { StubLlmClient } from './StubLlmClient.js'
export { AnthropicLlmClient } from './AnthropicLlmClient.js'
export { OpenAiCompatibleLlmClient } from './OpenAiCompatibleLlmClient.js'

export const LLM_PROVIDERS = ['groq', 'gemini', 'openrouter', 'ollama', 'anthropic', 'stub'] as const
export type LlmProvider = (typeof LLM_PROVIDERS)[number]

/**
 * The free tier, plus a local option. Every one of these speaks the OpenAI chat
 * dialect, so a provider is nothing more than this row.
 */
const OPENAI_COMPATIBLE: Record<
  Exclude<LlmProvider, 'anthropic' | 'stub'>,
  { baseUrl: string; model: string; mentorModel?: string; keyVar: string | null; reasoningEffort?: boolean }
> = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    // Groq's free tier is 8k tokens/minute *per model*. Judgement stays on the
    // large model; notes, lessons and follow-ups run on the small one, in a
    // separate budget — and they are conversation, not scoring.
    mentorModel: 'openai/gpt-oss-20b',
    keyVar: 'GROQ_API_KEY',
    reasoningEffort: true,
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    keyVar: 'GEMINI_API_KEY',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    keyVar: 'OPENROUTER_API_KEY',
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    keyVar: null,
  },
}

/**
 * Which provider the environment is asking for. Explicit `LLD_LLM_PROVIDER` wins;
 * otherwise whichever key is present, in the order a free-tier user is most likely
 * to have one; otherwise the stub. Exported so the startup log and /health can say
 * what was chosen without re-deriving it.
 */
export function resolveLlmProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  if (env.LLD_FORCE_STUB === '1') return 'stub'
  const explicit = env.LLD_LLM_PROVIDER?.trim().toLowerCase()
  if (explicit) {
    if ((LLM_PROVIDERS as readonly string[]).includes(explicit)) return explicit as LlmProvider
    throw new Error(`LLD_LLM_PROVIDER must be one of ${LLM_PROVIDERS.join(', ')}; got "${explicit}"`)
  }
  if (env.GROQ_API_KEY) return 'groq'
  if (env.GEMINI_API_KEY) return 'gemini'
  if (env.OPENROUTER_API_KEY) return 'openrouter'
  if (env.ANTHROPIC_API_KEY) return 'anthropic'
  return 'stub'
}

/**
 * Picks a provider from the environment.
 *
 * The stub is the default on purpose: a fresh clone runs the whole practice loop
 * with no configuration, and the deterministic half of the rubric is unaffected
 * either way. Setting a key upgrades the judgement criteria; it does not unlock
 * the product.
 */
export type LlmRole = 'evaluator' | 'mentor'

export function resolveLlmClient(env: NodeJS.ProcessEnv = process.env, role: LlmRole = 'evaluator'): LlmClient {
  const provider = resolveLlmProvider(env)
  if (provider === 'stub') return new StubLlmClient()
  if (provider === 'anthropic') return new AnthropicLlmClient()

  const row = OPENAI_COMPATIBLE[provider]
  const apiKey = row.keyVar ? env[row.keyVar] : undefined
  if (row.keyVar && !apiKey) {
    throw new Error(`LLD_LLM_PROVIDER=${provider} needs ${row.keyVar} to be set`)
  }
  const model =
    role === 'mentor'
      ? env.LLD_LLM_MENTOR_MODEL?.trim() || row.mentorModel || env.LLD_LLM_MODEL?.trim() || row.model
      : env.LLD_LLM_MODEL?.trim() || row.model
  return new OpenAiCompatibleLlmClient({
    id: `${provider}:${model}`,
    baseUrl: env.LLD_LLM_BASE_URL?.trim() || row.baseUrl,
    model,
    apiKey,
    reasoningEffort: row.reasoningEffort ?? false,
  })
}
