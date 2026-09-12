import type {
  ApiError,
  Attempt,
  AttemptNotes,
  ConceptsPayload,
  MicroLesson,
  ProgressPayload,
  AttemptSummary,
  CritiqueVerdict,
  EvaluationReport,
  NextProblemSuggestion,
  ProblemSummary,
  PublicCritiquePair,
  PublicProblem,
  RawStageInput,
  RecurringWeakness,
  Rubric,
} from '@lld/contracts'

/** Requests go to /api on this origin; Next rewrites them to the Express process. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError['error'],
  ) {
    super(body.message)
    this.name = 'ApiRequestError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
    cache: 'no-store',
  })

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiRequestError(
      response.status,
      (payload as ApiError | null)?.error ?? { code: 'INTERNAL', message: 'Request failed' },
    )
  }
  return payload as T
}

export type HistoryPayload = {
  problemId: string
  attempts: AttemptSummary[]
  recurringWeaknesses: RecurringWeakness[]
  critique: { answered: number; correct: number; total: number }
  next: NextProblemSuggestion | null
}

export const api = {
  getProgress: () => request<ProgressPayload>('/learners/me/progress'),

  getConcepts: () => request<ConceptsPayload>('/concepts'),

  listProblems: () =>
    request<{ problems: ProblemSummary[]; next: NextProblemSuggestion | null }>('/problems'),

  getProblem: (id: string) =>
    request<{ problem: PublicProblem; rubric: Rubric }>(`/problems/${id}`),

  getHistory: (id: string) => request<HistoryPayload>(`/problems/${id}/history`),

  getCritique: (id: string) =>
    request<{ problemId: string; pairs: PublicCritiquePair[] }>(`/problems/${id}/critique`),

  answerCritique: (id: string, pairId: string, choice: { design: string; className: string }) =>
    request<CritiqueVerdict>(`/problems/${id}/critique/${pairId}`, {
      method: 'POST',
      body: JSON.stringify(choice),
    }),

  startAttempt: (problemId: string) =>
    request<{ attempt: Attempt; draft: RawStageInput | null }>('/attempts', {
      method: 'POST',
      body: JSON.stringify({ problemId }),
    }),

  getNotes: (id: string) => request<AttemptNotes>(`/attempts/${id}/notes`),

  requestLesson: (id: string, criterionId: string) =>
    request<{ lesson: MicroLesson & { conceptId: string; modelId: string } } | undefined>(`/attempts/${id}/lessons/${criterionId}`, {
      method: 'POST',
    }),

  getAttempt: (id: string) =>
    request<{ attempt: Attempt; draft: RawStageInput | null; report: EvaluationReport | null }>(
      `/attempts/${id}`,
    ),

  saveDraft: (id: string, input: RawStageInput) =>
    request<void>(`/attempts/${id}/draft`, {
      method: 'PUT',
      body: JSON.stringify({ input }),
    }),

  submit: (id: string, input: RawStageInput, idempotencyKey: string) =>
    request<{ attempt: Attempt }>(`/attempts/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ input, idempotencyKey }),
    }),

  retry: (id: string) =>
    request<{ attempt: Attempt }>(`/attempts/${id}/retry`, { method: 'POST' }),

  advance: (id: string) =>
    request<{ attempt: Attempt }>(`/attempts/${id}/advance`, { method: 'POST' }),
}
