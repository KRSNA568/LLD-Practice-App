import type { Concept, CriterionResult, Rubric } from '@lld/contracts'
import type { EvaluationContext } from '../evaluation/Evaluator.js'

/**
 * Prompts for the mentor. Versioned like the evaluation prompt, and for the same
 * reason: the cache key includes this, so changing the wording regenerates every
 * note rather than mixing old and new under one label.
 *
 * Each prompt starts with a `TASK:` line. The stub reads it to decide which
 * template to answer with; real models ignore it.
 */
export const COACH_PROMPT_VERSION = '1.0.0'

export const MENTOR_SYSTEM = [
  'You are a design mentor on a Low-Level Design practice platform, writing to one learner',
  'about the design they just submitted.',
  '',
  'Rules:',
  '- Write about THIS design only. Name classes exactly as the learner spelled them. Never',
  '  invent a class, method or attribute the learner does not have — if you want to suggest',
  '  one, describe it in plain words ("a class that owns pricing") rather than naming it.',
  '- Scores are decided elsewhere and are given to you. Do not re-score, do not argue with',
  '  a score, do not mention numbers.',
  '- Second person, plain language, no praise sandwiches, no "great job". Say the one',
  '  thing that matters most, then why it matters here, then what to do first.',
  '- Do not name design patterns as a substitute for explaining the idea.',
  '- Reply with JSON only. No prose before or after, no markdown fences.',
].join('\n')

function designBlock(ctx: EvaluationContext): string {
  const d = ctx.design
  return JSON.stringify(
    {
      classes: d.classes.map((c) => ({
        name: c.name,
        stereotype: c.stereotype,
        responsibility: c.responsibility,
        attributes: c.attributes,
        methods: c.methods,
      })),
      relationships: d.relationships,
      assumptions: d.assumptions,
      decisions: d.decisions,
    },
    null,
    1,
  )
}

function findingsBlock(results: CriterionResult[], rubric: Rubric): string {
  return results
    .map((r) => {
      const c = rubric.criteria.find((x) => x.id === r.criterionId)
      return `  - ${c?.name ?? r.criterionId} (${r.evaluatorKind === 'llm' ? 'read' : 'measured'}): ${r.score}/4\n      concern: ${r.concern}\n      suggestion: ${r.suggestion}`
    })
    .join('\n')
}

/** The reviewer's note over one stage: synthesis, not a ninth criterion. */
export function reviewerPrompt(ctx: EvaluationContext, results: CriterionResult[]): string {
  const stageLine =
    ctx.stage === 'design'
      ? 'The learner has just had their design reviewed.'
      : ctx.stage === 'change'
        ? `The learner was shown a requirement change — "${ctx.change?.prompt ?? ''}" — and revised the design. Their rationale: "${ctx.rationale ?? ''}".`
        : 'The learner has answered probe questions about their own decisions.'

  return [
    'TASK: reviewer-note',
    stageLine,
    '',
    `PROBLEM: ${ctx.problem.title}`,
    ctx.problem.brief,
    '',
    'THE DESIGN',
    designBlock(ctx),
    '',
    `CLASS NAMES YOU MAY MENTION: ${ctx.graph.classes.map((c) => c.name).join(', ') || '(none)'}`,
    '',
    'THE FINDINGS (already scored; you are synthesising, not re-scoring)',
    findingsBlock(results, ctx.rubric),
    '',
    'Write 3 to 5 sentences. Pick the single finding that would change this design the most',
    'if fixed, explain in the learner\'s own class names why it matters for THIS problem, and',
    'say what to do first. If everything is at par, say what would make it stronger still.',
    '',
    'Return exactly: {"note": "..."}',
  ].join('\n')
}

/** A two-minute lesson on one concept, illustrated with the learner's own classes. */
export function lessonPrompt(ctx: EvaluationContext, concept: Concept, result: CriterionResult): string {
  const criterion = ctx.rubric.criteria.find((c) => c.id === result.criterionId)
  return [
    'TASK: micro-lesson',
    `The learner scored ${result.score}/4 on "${criterion?.name ?? result.criterionId}" and asked to learn the concept behind it.`,
    '',
    'THE CONCEPT (authored — explain this, do not redefine it)',
    `  name: ${concept.name}`,
    `  plain: ${concept.plain}`,
    `  when it is missing: ${concept.tell}`,
    '',
    `PROBLEM: ${ctx.problem.title}`,
    '',
    'THE DESIGN',
    designBlock(ctx),
    '',
    `CLASS NAMES YOU MAY MENTION: ${ctx.graph.classes.map((c) => c.name).join(', ') || '(none)'}`,
    '',
    'THE FINDING THAT PROMPTED THIS',
    `  concern: ${result.concern}`,
    `  suggestion: ${result.suggestion}`,
    '',
    'Write a lesson of at most 180 words in "body": what the concept means, why it matters in',
    'this problem, and how to tell when you have it. Then give a before/after example that',
    'uses the learner\'s own classes: "before" describes how their design handles it now (in',
    'their class names), "after" describes the same responsibility restructured — in plain',
    'words, without inventing new class names. Two or three sentences each.',
    '',
    'Return exactly: {"title": "...", "body": "...", "example": {"before": "...", "after": "..."}}',
  ].join('\n')
}
