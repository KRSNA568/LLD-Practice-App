import type { Criterion } from '@lld/contracts'
import type { EvaluationContext } from '../Evaluator.js'

/**
 * Builds the evaluation prompt.
 *
 * Versioned, because the prompt and the rubric together define what a score means.
 * If either changes, scores from before and after are not comparable, and quietly
 * mixing them would make the history screen lie. The version is stamped onto every
 * evaluation so that comparison can always be scoped correctly later.
 */
export const PROMPT_VERSION = '2.0.0'

/**
 * Three things keep the output usable, and all three are constraints rather than
 * requests: the model may only score criteria we hand it, it must cite elements from
 * a list we provide, and it must return the fixed result shape. The open-ended
 * version of this question — "is this a good design?" — produces prose that reads
 * well and cannot be checked, scored or compared.
 *
 * The model is only ever asked to *read*: assumptions, decisions, rationale, and
 * answers to probes. Everything that can be counted from the class graph, the
 * walkthroughs or the diff is scored elsewhere and never reaches this prompt as a
 * question.
 */
export function buildSystemPrompt(): string {
  return [
    'You are reviewing a Low-Level Design submission for a practice platform.',
    '',
    'There is no reference solution. Many different designs are valid. Judge the design',
    'on its own terms against the rubric you are given, never against a design you would',
    'have written.',
    '',
    'Rules:',
    '- Score only the criteria listed. Ignore anything else you notice — structure,',
    '  coupling and extensibility are measured separately and are not your concern.',
    '- Every finding must cite specific elements from the submission. You will be given',
    '  the exact list of class names available to cite. Citing anything not on that list',
    '  is an error.',
    '- Each band comes with an anchor showing what that band looks like. Score by',
    '  comparing the submission to the anchors, not by intuition.',
    '- "concern" states what is wrong. "suggestion" states what to do next. They must not',
    '  be paraphrases of each other.',
    '- Do not name design patterns as a way of praising a design. Judge whether the',
    '  reasoning holds, not whether it uses a famous word.',
    '- Use the full range of scores. A competent but unremarkable answer is a 2 or 3.',
    '- Reply with JSON only. No prose before or after, no markdown fences.',
  ].join('\n')
}

export function buildUserPrompt(ctx: EvaluationContext, criteria: readonly Criterion[]): string {
  const { problem, design, graph, stage } = ctx

  const citable = graph.classes.map((c) => c.name)

  const rubricBlock = criteria
    .map((c) => {
      const bands = (['0', '1', '2', '3', '4'] as const)
        .map((b) => {
          const anchor = c.anchors?.[b]
          return `      ${b} = ${c.bands[b]}${anchor ? `\n          looks like: ${anchor}` : ''}`
        })
        .join('\n')
      return `  ${c.id} — ${c.name}\n    ${c.question}\n${bands}`
    })
    .join('\n\n')

  /**
   * One JSON block carries everything the model may read. The stub client parses
   * this same block, which keeps the LlmClient port to text-in/text-out.
   */
  const submission: Record<string, unknown> = {
    assumptions: design.assumptions,
    classes: design.classes,
    relationships: design.relationships,
    decisions: design.decisions,
    tradeoffs: design.tradeoffs,
    walkthroughs: design.walkthroughs.map((w) => ({
      scenarioId: w.scenarioId,
      scenario: problem.scenarios.find((s) => s.id === w.scenarioId)?.title ?? w.scenarioId,
      outcome: w.outcome,
      steps: w.steps.map((s) => `${s.className}.${s.method}${s.note ? ` — ${s.note}` : ''}`),
    })),
  }

  if (stage === 'defend') {
    submission.change = ctx.change ? { prompt: ctx.change.prompt, rationale: ctx.rationale ?? '' } : null
    submission.probes = (ctx.probes ?? []).map((p) => ({
      id: p.id,
      prompt: p.prompt,
      goodSignal: p.goodSignal,
      badSignal: p.badSignal,
      answer: ctx.answers?.find((a) => a.probeId === p.id)?.response ?? '',
    }))
  }

  const exampleEvidence =
    stage === 'defend'
      ? [
          { kind: 'prose', field: 'answer', probeId: ctx.probes?.[0]?.id ?? 'p-1', quote: 'a short verbatim quote from an answer' },
          { kind: 'decision', index: 0 },
          { kind: 'class', name: 'ExampleClassFromTheListAbove' },
        ]
      : [
          { kind: 'class', name: 'ExampleClassFromTheListAbove' },
          { kind: 'assumption', index: 0 },
          { kind: 'step', scenarioId: problem.scenarios[0]?.id ?? 'sc-1', index: 0 },
        ]

  return [
    `STAGE: ${stage}`,
    stage === 'defend'
      ? 'The learner designed, was then shown a requirement change and revised, and has now answered probes about their own decisions. Judge the reasoning in the decisions, the change rationale and the answers.'
      : 'The learner has submitted a design with scenario walkthroughs. Judge only what needs reading: whether the gaps in the brief were filled deliberately and whether failure was thought about.',
    '',
    `PROBLEM: ${problem.title}`,
    problem.brief,
    '',
    'REQUIREMENTS',
    ...problem.requirements.map((r) => `  - ${r.text}`),
    '',
    'SCENARIOS THE LEARNER WAS ASKED TO WALK',
    ...problem.scenarios.map((s) => `  - ${s.title}${s.expectsFailurePath ? ' (should end in a refusal)' : ''}`),
    '',
    'THE SUBMISSION',
    JSON.stringify(submission, null, 2),
    '',
    `CLASS NAMES YOU MAY CITE: ${citable.length > 0 ? citable.join(', ') : '(none declared)'}`,
    '',
    'SCORE THESE CRITERIA',
    rubricBlock,
    '',
    'Return exactly this JSON shape:',
    JSON.stringify(
      {
        results: [
          {
            criterionId: criteria[0]?.id ?? 'reasoning',
            score: 2,
            evidence: exampleEvidence,
            concern: 'What is wrong, specifically.',
            suggestion: 'What to do about it.',
            confidence: 'medium',
          },
        ],
      },
      null,
      2,
    ),
  ]
    .filter((line) => line !== '')
    .join('\n')
}
