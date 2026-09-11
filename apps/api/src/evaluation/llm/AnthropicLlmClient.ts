import Anthropic from '@anthropic-ai/sdk'
import { LlmUnavailableError, type LlmClient, type LlmRequest, type LlmResponse } from './LlmClient.js'

/**
 * The real provider, used when ANTHROPIC_API_KEY is present.
 *
 * Everything that decides what a score means — the rubric, the prompt, schema
 * validation, evidence grounding — lives in LlmEvaluator. This class only carries
 * text across the network and translates SDK failures into one domain error, so the
 * pipeline can treat "the AI is down" the same way regardless of provider.
 */

/**
 * Note there is no `temperature` on the request below. It is not an oversight:
 * current Claude models reject the parameter, and reproducibility here comes from
 * the fixed rubric and the grounding check rather than from sampling settings.
 */
const DEFAULT_MODEL = 'claude-opus-5'

export class AnthropicLlmClient implements LlmClient {
  readonly id: string
  private readonly client: Anthropic
  private readonly model: string

  constructor(options: { model?: string; client?: Anthropic } = {}) {
    this.model = options.model ?? process.env.LLD_ANTHROPIC_MODEL ?? DEFAULT_MODEL
    // The zero-arg constructor resolves credentials from the environment, so a key
    // is never threaded through application code.
    this.client = options.client ?? new Anthropic()
    this.id = `anthropic:${this.model}`
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: 'user', content: request.user }],
        output_config: { effort: request.effort ?? 'medium' },
      })

      // content is a discriminated union; there may be thinking blocks alongside
      // the answer, so collect text rather than reaching for content[0].
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')

      if (text.trim().length === 0) {
        throw new LlmUnavailableError('Model returned no text content')
      }

      return {
        text,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      }
    } catch (error) {
      throw translate(error)
    }
  }
}

/**
 * Most specific first. The distinction that matters downstream is whether this is
 * worth retrying: rate limits and upstream faults are, a malformed request is not.
 * Either way the pipeline degrades to a partial report rather than losing the
 * deterministic findings, so nothing here is fatal to the learner's attempt.
 */
function translate(error: unknown): Error {
  if (error instanceof LlmUnavailableError) return error

  if (error instanceof Anthropic.AuthenticationError) {
    return new LlmUnavailableError('Anthropic rejected the credentials — check ANTHROPIC_API_KEY')
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new LlmUnavailableError('Rate limited by Anthropic — the AI half of this report was skipped')
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new LlmUnavailableError(`Anthropic rejected the request: ${error.message}`)
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new LlmUnavailableError('Could not reach Anthropic')
  }
  if (error instanceof Anthropic.APIError) {
    return new LlmUnavailableError(`Anthropic error ${error.status}: ${error.message}`)
  }
  return error instanceof Error ? error : new Error(String(error))
}
