import { LlmUnavailableError, type LlmClient, type LlmRequest, type LlmResponse } from './LlmClient.js'

/**
 * The default evaluator brain when no API key is configured.
 *
 * This exists so the product runs end-to-end on a fresh clone with zero setup. It is
 * not a mock that returns canned nonsense — it reads the actual submission out of the
 * prompt and applies simple heuristics, so a weak design and a strong one get
 * genuinely different feedback and the demo is honest.
 *
 * Parsing the submission back out of the prompt is a little indirect, but it keeps
 * the LlmClient port to a single text-in/text-out method. A port that had to carry
 * structured context just to satisfy the stub would be a worse port, and the real
 * providers would pay for it forever.
 *
 * Set LLD_STUB_FAIL=1 to make it throw — that is how the partial-report path gets
 * exercised without unplugging anything.
 */
export class StubLlmClient implements LlmClient {
  readonly id = 'stub-heuristic-v3'

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (process.env.LLD_STUB_FAIL === '1') {
      throw new LlmUnavailableError('Stub evaluator failing deliberately (LLD_STUB_FAIL=1)')
    }

    // Mentor tasks announce themselves on the first line; the evaluator does not.
    const task = /^TASK: (\S+)/.exec(request.user)?.[1]
    if (task === 'reviewer-note') return { text: JSON.stringify(stubReviewerNote(request.user)) }
    if (task === 'micro-lesson') return { text: JSON.stringify(stubLesson(request.user)) }
    if (task === 'follow-up') return { text: JSON.stringify(stubFollowUp(request.user)) }
    if (task === 'explain-finding') return { text: JSON.stringify(stubExplain(request.user)) }
    if (task === 'coach-note') return { text: JSON.stringify(stubCoach(request.user)) }

    const submission = extractSubmission(request.user)
    const wanted = extractRequestedCriteria(request.user)
    const results: unknown[] = []

    if (wanted.has('edge-cases')) results.push(judgeEdgeCases(submission))
    if (wanted.has('reasoning')) results.push(judgeReasoning(submission))

    return {
      text: JSON.stringify({ results }),
      usage: { inputTokens: 0, outputTokens: 0 },
    }
  }
}

type Submission = {
  assumptions: string[]
  classes: Array<{ name: string; stereotype: string; responsibility: string }>
  relationships: Array<{ from: string; to: string; kind: string }>
  decisions: Array<{ what: string; alternative: string; why: string }>
  tradeoffs: string
  walkthroughs: Array<{ scenarioId: string; outcome: string; steps: string[] }>
  change: { prompt: string; rationale: string } | null
  probes: Array<{ id: string; prompt: string; goodSignal: string[]; badSignal: string[]; answer: string }>
}

const EMPTY: Submission = {
  assumptions: [],
  classes: [],
  relationships: [],
  decisions: [],
  tradeoffs: '',
  walkthroughs: [],
  change: null,
  probes: [],
}

function extractSubmission(prompt: string): Submission {
  const start = prompt.indexOf('THE SUBMISSION')
  if (start === -1) return EMPTY
  const open = prompt.indexOf('{', start)
  if (open === -1) return EMPTY

  let depth = 0
  for (let i = open; i < prompt.length; i += 1) {
    if (prompt[i] === '{') depth += 1
    else if (prompt[i] === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return { ...EMPTY, ...(JSON.parse(prompt.slice(open, i + 1)) as Partial<Submission>) }
        } catch {
          return EMPTY
        }
      }
    }
  }
  return EMPTY
}

function extractRequestedCriteria(prompt: string): Set<string> {
  const block = prompt.slice(prompt.indexOf('SCORE THESE CRITERIA'))
  const found = new Set<string>()
  for (const m of block.matchAll(/^\s{2}([a-z-]+) —/gm)) found.add(m[1]!)
  return found
}

const FAILURE_WORDS =
  /(fail|error|invalid|reject|refus|unavailable|full|empty|not found|timeout|retry|conflict|cannot|sold out|insufficient|exact change)/i

function judgeEdgeCases(s: Submission) {
  const text = `${s.assumptions.join(' ')} ${s.classes.map((c) => c.responsibility).join(' ')}`
  const handlesFailure = FAILURE_WORDS.test(text)
  const refusalTraced = s.walkthroughs.some((w) => w.outcome === 'refused' || w.outcome === 'error')
  const assumptions = s.assumptions.length

  const score =
    assumptions >= 2 && refusalTraced
      ? 4
      : assumptions >= 1 && (refusalTraced || handlesFailure)
        ? 3
        : assumptions >= 1 || refusalTraced || handlesFailure
          ? 2
          : 0

  const evidence: unknown[] = []
  if (assumptions > 0) evidence.push({ kind: 'assumption', index: 0 })
  const refusal = s.walkthroughs.find((w) => w.outcome !== 'ok')
  if (refusal && refusal.steps.length > 0) {
    evidence.push({ kind: 'step', scenarioId: refusal.scenarioId, index: refusal.steps.length - 1 })
  }

  return {
    criterionId: 'edge-cases',
    score,
    evidence,
    concern:
      assumptions === 0 && !refusalTraced
        ? 'No assumptions are recorded and no walkthrough ends in a refusal, so the gaps in the brief were filled silently and the unhappy path was not traced.'
        : refusalTraced
          ? `${assumptions} assumption${assumptions === 1 ? '' : 's'} recorded and the refusal path is traced through to the class that says no.`
          : handlesFailure
            ? 'Failure is mentioned in the responsibilities, but no walkthrough actually ends in a refusal — the design talks about the unhappy path without running it.'
            : 'Assumptions are recorded but nothing in the design or the walkthroughs accounts for the unhappy path.',
    suggestion: refusalTraced
      ? 'Consider whether the refusal should be a type the caller has to handle rather than a null or an exception.'
      : 'Walk the scenario that cannot succeed and end it with the class that says no — that class is where a result type belongs.',
    confidence: 'medium',
  }
}

const WEIGHS =
  /(instead of|rather than|versus|vs\.?|considered|could have|alternative|chose|trade|because|so that|would revisit|unless|if .* (changed|varied|started))/i
const HEDGES = /(would revisit|change my mind|unless|until|if that changed|if .* started)/i

function judgeReasoning(s: Submission) {
  const classNames = s.classes.map((c) => c.name.toLowerCase())
  const namesClass = (t: string) => classNames.some((n) => n.length > 2 && t.toLowerCase().includes(n))

  const perAnswer: number[] = s.probes.map((p) => {
    const a = p.answer.trim()
    const words = a.split(/\s+/).filter(Boolean).length
    if (words === 0) return 0
    const cls = namesClass(a)
    const weighs = WEIGHS.test(a)
    const hedges = HEDGES.test(a)
    if (words < 12 || !cls) return 1
    if (!weighs) return 2
    return hedges ? 4 : 3
  })

  const decisionsWithAlternatives = s.decisions.filter((d) => d.alternative.trim().length > 0 && d.why.trim().length > 0).length
  const rationaleWeighs = !!s.change && WEIGHS.test(s.change.rationale)

  let score: number
  if (perAnswer.length > 0) {
    const mean = perAnswer.reduce((x, y) => x + y, 0) / perAnswer.length
    // Recorded decisions with alternatives lift a middling defence by one band; a
    // defence with no recorded decisions at all is capped at 3.
    const lifted = decisionsWithAlternatives >= 2 ? mean + 0.5 : mean
    score = Math.min(4, Math.round(s.decisions.length === 0 ? Math.min(lifted, 3) : lifted))
  } else {
    score = decisionsWithAlternatives >= 2 ? 3 : s.decisions.length > 0 ? 2 : 0
  }

  const evidence: unknown[] = []
  const best = s.probes
    .map((p, i) => ({ p, score: perAnswer[i] ?? 0 }))
    .sort((a, b) => b.score - a.score)[0]
  if (best && best.p.answer.trim().length > 0) {
    evidence.push({ kind: 'prose', field: 'answer', probeId: best.p.id, quote: firstClause(best.p.answer) })
  }
  if (s.decisions.length > 0) evidence.push({ kind: 'decision', index: 0 })
  const weakest = s.probes.map((p, i) => ({ p, score: perAnswer[i] ?? 0 })).sort((a, b) => a.score - b.score)[0]

  return {
    criterionId: 'reasoning',
    score,
    evidence,
    concern:
      perAnswer.length === 0
        ? s.decisions.length === 0
          ? 'No decisions were recorded and no probes were answered, so the reasoning behind the design is not visible.'
          : `${s.decisions.length} decision${s.decisions.length === 1 ? '' : 's'} recorded${decisionsWithAlternatives > 0 ? ', with the rejected alternative named' : ', but without saying what was rejected'}.`
        : weakest && weakest.score <= 1
          ? `The answer to "${firstClause(weakest.p.prompt)}" ${weakest.p.answer.trim().length === 0 ? 'was left blank' : 'does not name a class from the design, so it reads as a general statement rather than a defence of this design'}.`
          : weakest && weakest.score === 2
            ? 'The answers name the right classes but describe what the design does rather than what it cost or what was rejected.'
            : `The answers name specific classes and weigh alternatives${rationaleWeighs ? ', and the change rationale does the same' : ''}.`,
    suggestion:
      perAnswer.length === 0
        ? 'For each decision, write the alternative you rejected and why — that is the sentence a reviewer reads first.'
        : weakest && weakest.score <= 2
          ? 'Answer with the class name, the alternative you rejected, and one condition under which you would choose differently.'
          : 'Say what would change your mind — that is the difference between a defended decision and a held opinion.',
    confidence: 'medium',
  }
}

function firstClause(text: string): string {
  const clause = text.split(/(?<=[.!?])\s|,\s/)[0] ?? text
  return clause.slice(0, 120).trim()
}

/* ------------------------------------------------------------------------- */
/* Mentor stand-ins                                                           */
/* ------------------------------------------------------------------------- */

/**
 * The stub's mentor is a template over the lowest finding: enough to show the
 * shape of the feature without a key, honest enough not to pretend to insight.
 * It reads the findings block the real prompt carries.
 */
function lowestFinding(prompt: string): { name: string; score: number; concern: string; suggestion: string } | null {
  const block = prompt.split('THE FINDINGS')[1] ?? ''
  const findings = [...block.matchAll(/- (.+?) \((?:read|measured)\): (\d)\/4\n\s+concern: (.*)\n\s+suggestion: (.*)/g)].map((m) => ({
    name: m[1]!,
    score: Number(m[2]),
    concern: m[3]!.trim(),
    suggestion: m[4]!.trim(),
  }))
  if (findings.length === 0) return null
  return findings.sort((a, b) => a.score - b.score)[0]!
}

function firstClass(prompt: string): string | null {
  const m = /CLASS NAMES YOU MAY MENTION: ([^\n]+)/.exec(prompt)
  const first = m?.[1]?.split(',')[0]?.trim()
  return first && first !== '(none)' ? first : null
}

function stubReviewerNote(prompt: string): { note: string } {
  const low = lowestFinding(prompt)
  if (!low) return { note: 'Nothing here was scored, so there is nothing to say yet. Submit a design and come back.' }
  if (low.score >= 3) {
    return {
      note: `Every criterion is at par, and ${low.name.toLowerCase()} is the closest to the line. ${low.suggestion} That is the place to push next.`,
    }
  }
  return {
    note: `The finding that would change this design most is ${low.name.toLowerCase()}. ${low.concern} Start there: ${low.suggestion.replace(/\.$/, '')}. The other findings get easier once that one moves.`,
  }
}

function stubLesson(prompt: string): { title: string; body: string; example: { before: string; after: string } } {
  const name = /name: (.+)/.exec(prompt)?.[1]?.trim() ?? 'the concept'
  const plain = /plain: (.+)/.exec(prompt)?.[1]?.trim() ?? ''
  const tell = /when it is missing: (.+)/.exec(prompt)?.[1]?.trim() ?? ''
  const concern = /concern: (.+)/.exec(prompt)?.[1]?.trim() ?? ''
  const suggestion = /suggestion: (.+)/.exec(prompt)?.[1]?.trim() ?? ''
  const cls = firstClass(prompt) ?? 'your main class'
  return {
    title: `${name}, in your own design`,
    body: `${plain} You can usually tell it is missing by this: ${tell.replace(/\.$/, '')}. In this problem the review found exactly that. ${concern} The fix is smaller than it looks, and it starts with one class.`,
    example: {
      before: `Right now ${cls} carries this responsibility alongside its others. ${concern}`,
      after: `${suggestion} Once that is done, ${cls} keeps one job and the new responsibility has a home of its own.`,
    },
  }
}

/**
 * A follow-up that presses on the probe's own weak-answer signal, phrased around
 * the first thing the learner said. Always a question; names only the classes the
 * prompt allows.
 */
function stubFollowUp(prompt: string): { question: string } {
  const weak = /What a weak answer does: ([^\n]+)/.exec(prompt)?.[1]?.split(';')[0]?.trim() ?? 'leaves the alternative unnamed'
  const said = /Learner: ([^\n]+)/.exec(prompt)?.[1]?.trim() ?? ''
  const cls = firstClass(prompt)
  const opener = said ? `You said "${said.split(/\s+/).slice(0, 8).join(' ')}…"` : 'Take your answer'
  return {
    question: `${opener} — a weak answer here usually ${weak.replace(/\.$/, '')}. What would you have to change${cls ? ` in ${cls}` : ''} if that turned out to be true of yours?`,
  }
}

function stubExplain(prompt: string): { explanation: string } {
  const criterion = /criterion: ([^—\n]+)/.exec(prompt)?.[1]?.trim() ?? 'this criterion'
  const suggestion = /suggestion: (.+)/.exec(prompt)?.[1]?.trim() ?? ''
  const cls = firstClass(prompt) ?? 'the class it cites'
  return {
    explanation: `${criterion} is the kind of thing that costs nothing today and a rewrite later: the next requirement lands on ${cls} and everything that touches it. The smallest move is the suggestion on the card — ${suggestion.replace(/\.$/, '')} — done before anything else changes, so you can see whether the rest of the design gets simpler.`,
  }
}

function stubCoach(prompt: string): { note: string } {
  const weak = /RECURRING WEAKNESS[^\n]*\n  - ([^:]+):/.exec(prompt)?.[1]?.trim()
  const next = /NEXT PROBLEM ALREADY CHOSEN: ([^—\n]+)/.exec(prompt)?.[1]?.trim()
  const lowest = [...prompt.matchAll(/  - (.+?): ([\d.]+)\n/g)]
    .map((m) => ({ name: m[1]!, v: Number(m[2]) }))
    .sort((a, b) => a.v - b.v)[0]?.name
  const habit = weak ?? lowest
  if (!habit) return { note: 'Not enough scored attempts to see a habit yet. Two more and the picture appears.' }
  return {
    note: `The habit these numbers show is ${habit}: it is the criterion that has moved least. It is worth breaking because it is the one an interviewer follows up on.${next && next !== '(none)' ? ` In ${next}, look for the place that criterion bites before you draw a single class.` : ''}`,
  }
}
