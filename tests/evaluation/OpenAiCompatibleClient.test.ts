import { describe, expect, it } from 'vitest'
import { OpenAiCompatibleLlmClient } from '../../apps/api/src/evaluation/llm/OpenAiCompatibleLlmClient.js'
import { LlmUnavailableError } from '../../apps/api/src/evaluation/llm/LlmClient.js'
import { readJson } from '../../apps/api/src/evaluation/llm/LlmEvaluator.js'
import { resolveLlmClient, resolveLlmProvider } from '../../apps/api/src/evaluation/llm/index.js'

type Captured = { url: string; init: RequestInit }

function fakeFetch(
  respond: (captured: Captured) => Response | Promise<Response>,
): { fetch: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const captured = { url: String(url), init: init ?? {} }
    calls.push(captured)
    return respond(captured)
  }) as typeof fetch
  return { fetch: impl, calls }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function client(fetchImpl: typeof fetch, over: Partial<ConstructorParameters<typeof OpenAiCompatibleLlmClient>[0]> = {}) {
  return new OpenAiCompatibleLlmClient({
    id: 'groq:test-model',
    baseUrl: 'https://example.test/v1/',
    model: 'test-model',
    apiKey: 'k',
    fetchImpl,
    ...over,
  })
}

const request = { system: 'sys', user: 'usr', maxTokens: 64, json: true }

describe('OpenAiCompatibleLlmClient', () => {
  it('posts the chat-completions shape with JSON mode and a bearer token', async () => {
    const { fetch, calls } = fakeFetch(() =>
      json(200, {
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 10, completion_tokens: 4 },
      }),
    )
    const out = await client(fetch).complete(request)

    expect(out.text).toBe('{"ok":true}')
    expect(out.usage).toEqual({ inputTokens: 10, outputTokens: 4 })
    expect(calls[0]!.url).toBe('https://example.test/v1/chat/completions')
    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer k')
    const body = JSON.parse(String(calls[0]!.init.body))
    expect(body.model).toBe('test-model')
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ])
    expect(body.max_tokens).toBe(64)
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  it('omits response_format and the auth header when not asked for them', async () => {
    const { fetch, calls } = fakeFetch(() => json(200, { choices: [{ message: { content: 'hi' } }] }))
    await client(fetch, { apiKey: undefined }).complete({ ...request, json: false })
    const body = JSON.parse(String(calls[0]!.init.body))
    expect(body.response_format).toBeUndefined()
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBeUndefined()
  })

  it.each([
    [401, /rejected the credentials/],
    [429, /Rate limited/],
    [400, /rejected the request: bad model/],
    [503, /error 503/],
  ])('maps HTTP %s to LlmUnavailableError', async (status, pattern) => {
    const { fetch } = fakeFetch(() => json(status, { error: { message: 'bad model' } }))
    await expect(client(fetch).complete(request)).rejects.toThrow(LlmUnavailableError)
    await expect(client(fetch).complete(request)).rejects.toThrow(pattern)
  })

  it('treats a network failure as unavailable, not as a crash', async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError('fetch failed')
    })
    await expect(client(fetch).complete(request)).rejects.toThrow(/Could not reach groq/)
  })

  it('times out instead of hanging the evaluation', async () => {
    const { fetch } = fakeFetch(
      ({ init }) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const e = new Error('aborted')
            e.name = 'AbortError'
            reject(e)
          })
        }),
    )
    await expect(client(fetch, { timeoutMs: 20 }).complete(request)).rejects.toThrow(/did not answer within/)
  })

  it('falls back to plain mode when the provider cannot produce JSON mode output', async () => {
    let n = 0
    const { fetch, calls } = fakeFetch(() => {
      n += 1
      return n === 1
        ? json(400, { error: { message: 'Failed to generate JSON. Please adjust your prompt.' } })
        : json(200, { choices: [{ message: { content: '{"ok":1}' } }] })
    })
    const out = await client(fetch).complete(request)
    expect(out.text).toBe('{"ok":1}')
    expect(JSON.parse(String(calls[0]!.init.body)).response_format).toBeDefined()
    expect(JSON.parse(String(calls[1]!.init.body)).response_format).toBeUndefined()
  })

  it('rejects an empty completion so the evaluator retries rather than parsing nothing', async () => {
    const { fetch } = fakeFetch(() => json(200, { choices: [{ message: { content: '  ' } }] }))
    await expect(client(fetch).complete(request)).rejects.toThrow(/no text content/)
  })
})

describe('readJson', () => {
  it('extracts an object a smaller model wrapped in prose and fences', () => {
    const text = 'Sure! Here is the evaluation:\n```json\n{"results":[]}\n```\nLet me know if…'
    expect(readJson(text)).toEqual({ results: [] })
  })

  it('returns null rather than throwing on garbage', () => {
    expect(readJson('no braces here')).toBeNull()
    expect(readJson('{"unterminated": ')).toBeNull()
  })
})

describe('resolveLlmProvider', () => {
  it('defaults to the stub with nothing configured', () => {
    expect(resolveLlmProvider({})).toBe('stub')
    expect(resolveLlmClient({}).id).toMatch(/^stub/)
  })

  it('infers the provider from whichever free-tier key is present', () => {
    expect(resolveLlmProvider({ GROQ_API_KEY: 'g' })).toBe('groq')
    expect(resolveLlmProvider({ GEMINI_API_KEY: 'g' })).toBe('gemini')
    expect(resolveLlmProvider({ OPENROUTER_API_KEY: 'o' })).toBe('openrouter')
    expect(resolveLlmProvider({ ANTHROPIC_API_KEY: 'a' })).toBe('anthropic')
  })

  it('lets an explicit provider and model override inference', () => {
    const c = resolveLlmClient({ LLD_LLM_PROVIDER: 'groq', GROQ_API_KEY: 'g', LLD_LLM_MODEL: 'llama-3.1-8b-instant' })
    expect(c.id).toBe('groq:llama-3.1-8b-instant')
    expect(resolveLlmClient({ LLD_LLM_PROVIDER: 'ollama' }).id).toBe('ollama:llama3.1')
  })

  it('forces the stub when asked, whatever keys exist', () => {
    expect(resolveLlmProvider({ LLD_FORCE_STUB: '1', GROQ_API_KEY: 'g' })).toBe('stub')
  })

  it('refuses a provider whose key is missing, and an unknown provider name', () => {
    expect(() => resolveLlmClient({ LLD_LLM_PROVIDER: 'groq' })).toThrow(/GROQ_API_KEY/)
    expect(() => resolveLlmProvider({ LLD_LLM_PROVIDER: 'gpt' })).toThrow(/must be one of/)
  })
})

describe('LlmEvaluator with a lossy model', () => {
  it('drops a malformed evidence ref and keeps the score, reporting the drop', async () => {
    const { LlmEvaluator } = await import('../../apps/api/src/evaluation/llm/LlmEvaluator.js')
    const { designCtx, strongDesign } = await import('../fixtures.js')
    const client = {
      id: 'fake',
      async complete() {
        return {
          text: JSON.stringify({
            results: [
              {
                criterionId: 'edge-cases',
                score: 3,
                evidence: [
                  { kind: 'class', name: 'SpotAllocator' },
                  { kind: 'prose', field: 'rationale' }, // no quote — malformed
                ],
                concern: 'c',
                suggestion: 's',
                confidence: 'high',
              },
            ],
          }),
        }
      },
    }
    const evaluator = new LlmEvaluator(client)
    const results = await evaluator.evaluate(designCtx(strongDesign))
    expect(results).toHaveLength(1)
    expect(results[0]!.score).toBe(3)
    expect(results[0]!.evidence).toEqual([{ kind: 'class', name: 'SpotAllocator' }])
    expect(evaluator.lastGrounding?.dropped[0]?.reason).toMatch(/malformed/)
  })
})
