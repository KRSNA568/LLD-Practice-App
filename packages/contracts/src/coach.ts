import { z } from 'zod'
import { stageSchema } from './rubric.js'

/**
 * What the AI mentor produces. None of this is a score: every shape here is prose
 * grounded to the learner's own design, cached by its inputs, and absent — never
 * fabricated — when no model answered.
 */

export const AI_NOTE_KINDS = ['review', 'lesson', 'explain', 'coach'] as const
export type AiNoteKind = (typeof AI_NOTE_KINDS)[number]

/** The reviewer's note: a short paragraph over one stage of one attempt. */
export const reviewerNoteSchema = z.object({
  note: z.string().min(1),
})
export type ReviewerNote = z.infer<typeof reviewerNoteSchema>

/** A two-minute lesson on one concept, using the learner's own classes as the example. */
export const microLessonSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  example: z.object({
    before: z.string().min(1),
    after: z.string().min(1),
  }),
})
export type MicroLesson = z.infer<typeof microLessonSchema>

/** Everything the report needs from the mentor, keyed by stage / criterion. */
export type AttemptNotes = {
  review: Partial<Record<z.infer<typeof stageSchema>, { text: string; modelId: string }>>
  lessons: Record<string, MicroLesson & { conceptId: string; modelId: string }>
  /** On-demand explanations of a finding, by criterion id. */
  explanations: Record<string, { text: string; modelId: string }>
  /** Which criteria a lesson can be requested for (scored ≤ 2). */
  lessonable: string[]
  /** True when a model is configured; false means the stub stands in. */
  live: boolean
}
