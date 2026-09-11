import type { DesignModel, Facet, FieldError } from '@lld/contracts'

/**
 * The seam that answers Change Test A: "today the learner submits text, later a class
 * diagram — how much of the domain changes?"
 *
 * Answer: nothing below this line. A parser's only job is to turn one capture format
 * into the canonical DesignModel. A diagram editor, a code uploader or a voice
 * transcript would each be a new implementation of this interface, and the rubric,
 * the evaluators, the report and the history screen would not know the difference.
 *
 * `facets` is the one thing a parser has to say about itself: which parts of the
 * model it is able to fill. A class-diagram parser can supply structure but not
 * scenario walkthroughs, and the checks that read walkthroughs are then omitted
 * rather than scoring the learner zero for something they were never asked for.
 *
 * The important discipline is that a parser either produces a whole valid model or a
 * list of field errors — never a partially-filled model with blanks for the evaluator
 * to trip over. Garbage stops here rather than becoming a low score later.
 */

export type ParseResult =
  | { ok: true; design: DesignModel }
  | { ok: false; errors: FieldError[] }

export interface SubmissionParser<TRaw> {
  /** Stable id, stored on the submission so we know how a design was captured. */
  readonly format: string

  /** Human-readable, shown in the UI when more than one format exists. */
  readonly label: string

  /** Which facets of the model this format can capture. */
  readonly facets: readonly Facet[]

  parse(raw: TRaw): ParseResult
}
