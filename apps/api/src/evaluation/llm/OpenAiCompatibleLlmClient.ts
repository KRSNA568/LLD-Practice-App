import { LlmUnavailableError, type LlmClient, type LlmRequest, type LlmResponse } from './LlmClient.js'

/**
 * One adapter for every provider that speaks the OpenAI chat-completions dialect —
 * which today is most of the free tier: Groq, Gemini's compatibility endpoint,
 * OpenRouter, and a local Ollama. They differ only in base URL, model name and
 * credential, so a table of those is the whole difference between providers.
 *
 * Same discipline as AnthropicLlmClient: carry text across the network, translate
 * every failure into LlmUnavailableError, decide nothing. Uses global fetch so there
 * is no SDK to install for any of them.
 */

export type OpenAiCompatibleOptions = {
  /** Stamped onto evaluations, e.g. `groq:llama-3.3-70b-versatile`. */
  id: string
  baseUrl: string
  model: string
  apiKey?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /**
   * Whether the endpoint accepts `reasoning_effort`. Reasoning models spend the
   * output budget thinking unless told how hard to; providers that do not know
   * the field may reject the request, so it is opt-in per provider.
   */
  reasoningEffort?: boolean
}

type ChatCompletion = {
  choices?: Array<{ message?: { content?: string | null } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string }
}

const DEFAULT_TIMEOUT_MS = 20_000
/** Overridable for offline jobs (content authoring) that can afford to wait out a whole window. */
const MAX_RATE_LIMIT_WAIT_MS = Number(process.env.LLD_LLM_MAX_WAIT_MS ?? 30_000)

export class OpenAiCompatibleLlmClient implements LlmClient {
  readonly id: string
  private readonly baseUrl: string
  private readonly model: string
  private readonly apiKey: string | undefined
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly reasoningEffort: boolean

  constructor(options: OpenAiCompatibleOptions) {
    this.id = options.id
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.model = options.model
    this.apiKey = options.apiKey
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.fetchImpl = options.fetchImpl ?? fetch
    this.reasoningEffort = options.reasoningEffort ?? false
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    try {
      return await this.send(request, request.json ?? false)
    } catch (error) {
      if (!(error instanceof LlmUnavailableError)) throw error
      // Some providers' JSON mode fails on longer outputs with a 400 rather than a
      // malformed reply. The callers all parse defensively, so plain mode is a
      // fine second try — better than reporting the model as down.
      if (request.json && /JSON/i.test(error.message)) {
        return this.send(request, false)
      }
      // A per-minute token limit tells us when it resets. Free tiers are tight
      // enough that waiting it out once is the difference between a report and a
      // partial one — but only once, and never longer than the caller would.
      if (error.retryAfterMs !== undefined && error.retryAfterMs <= MAX_RATE_LIMIT_WAIT_MS) {
        await new Promise((r) => setTimeout(r, error.retryAfterMs))
        return this.send(request, request.json ?? false)
      }
      throw error
    }
  }

  private async send(request: LlmRequest, jsonMode: boolean): Promise<LlmResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`

    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      max_tokens: request.maxTokens,
    }
    if (jsonMode) body.response_format = { type: 'json_object' }
    if (this.reasoningEffort && request.effort) body.reasoning_effort = request.effort

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (error) {
      clearTimeout(timer)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LlmUnavailableError(`${this.id} did not answer within ${this.timeoutMs / 1000}s`)
      }
      throw new LlmUnavailableError(`Could not reach ${this.id}`)
    }
    clearTimeout(timer)

    if (!response.ok) throw await this.translate(response)

    let payload: ChatCompletion
    try {
      payload = (await response.json()) as ChatCompletion
    } catch {
      throw new LlmUnavailableError(`${this.id} returned a non-JSON body`)
    }

    const text = payload.choices?.[0]?.message?.content ?? ''
    if (text.trim().length === 0) {
      throw new LlmUnavailableError(`${this.id} returned no text content`)
    }

    return {
      text,
      usage: payload.usage
        ? {
            inputTokens: payload.usage.prompt_tokens ?? 0,
            outputTokens: payload.usage.completion_tokens ?? 0,
          }
        : undefined,
    }
  }

  /**
   * The distinction that matters downstream is whether a retry could help: rate
   * limits and upstream faults might, bad credentials and a rejected request will
   * not. All of them degrade to a partial report; none is fatal to the attempt.
   */
  private async translate(response: Response): Promise<LlmUnavailableError> {
    const detail = await response
      .json()
      .then((j) => (j as ChatCompletion).error?.message)
      .catch(() => undefined)
    const status = response.status
    if (status === 401 || status === 403) {
      return new LlmUnavailableError(`${this.id} rejected the credentials — check the API key`)
    }
    if (status === 429) {
      const error = new LlmUnavailableError(`Rate limited by ${this.id} — the AI half of this report was skipped`)
      error.retryAfterMs = resetAfterMs(response.headers)
      return error
    }
    if (status === 400 || status === 404 || status === 422) {
      return new LlmUnavailableError(`${this.id} rejected the request${detail ? `: ${detail}` : ''}`)
    }
    return new LlmUnavailableError(`${this.id} error ${status}${detail ? `: ${detail}` : ''}`)
  }
}

/**
 * When a 429 will clear. `retry-after` is the standard; Groq also sends
 * `x-ratelimit-reset-tokens` as "26.1s" or "1m3s". Undefined when unknown.
 */
export function resetAfterMs(headers: Headers): number | undefined {
  const retryAfter = headers.get('retry-after')
  if (retryAfter && /^\d+$/.test(retryAfter.trim())) return Number(retryAfter) * 1000
  const reset = headers.get('x-ratelimit-reset-tokens') ?? headers.get('x-ratelimit-reset-requests')
  if (!reset) return undefined
  let ms = 0
  for (const [, n, unit] of reset.matchAll(/([\d.]+)(ms|s|m|h)/g)) {
    ms += Number(n) * (unit === 'ms' ? 1 : unit === 's' ? 1000 : unit === 'm' ? 60_000 : 3_600_000)
  }
  return ms > 0 ? Math.ceil(ms) + 250 : undefined
}
