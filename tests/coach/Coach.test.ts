import { describe, expect, it } from 'vitest'
import type { LlmClient, LlmRequest } from '../../apps/api/src/evaluation/llm/LlmClient.js'
import { groundProse, identifiersIn, sentencesOf } from '../../apps/api/src/coach/ground.js'
import { Reviewer } from '../../apps/api/src/coach/Reviewer.js'
import { LessonWriter } from '../../apps/api/src/coach/Lesson.js'
import { StubLlmClient } from '../../apps/api/src/evaluation/llm/StubLlmClient.js'
import { DesignGraph } from '../../apps/api/src/domain/design/DesignGraph.js'
import { designCtx, godClassDesign, rubric, strongDesign } from '../fixtures.js'
import type { Concept, CriterionResult } from '@lld/contracts'

const graph = new DesignGraph(strongDesign)

function result(over: Partial<CriterionResult> = {}): CriterionResult {
  return {
    criterionId: 'abstraction-use',
    stage: 'design',
    score: 1,
    evidence: [{ kind: 'class', name: 'ParkingLotManager' }],
    concern: 'pricing has no seam',
    suggestion: 'Introduce an abstraction for pricing.',
    confidence: 'high',
    evaluatorId: 'rules',
    evaluatorKind: 'deterministic',
    ...over,
  }
}

function canned(text: string): LlmClient {
  return { id: 'fake:model', complete: async (_r: LlmRequest) => ({ text }) }
}

describe('prose grounding', () => {
  it('finds backticked and CamelCase identifiers, stripping member access', () => {
    expect(identifiersIn('Move it out of `ParkingLot.park()` into SpotAllocator; the lot stays.')).toEqual(['ParkingLot', 'SpotAllocator'])
  })

  it('splits sentences without breaking on class names', () => {
    expect(sentencesOf('First one. `Second` here! Third? Yes.')).toHaveLength(4)
  })

  it('drops only the sentences that name a class the learner does not have', () => {
    const g = groundProse(
      'Your SpotAllocator owns allocation, which is right. A PaymentGateway would help here. Keep ParkingLot thin.',
      graph,
    )
    expect(g.kept).toBe(2)
    expect(g.dropped).toEqual([{ sentence: 'A PaymentGateway would help here.', unknown: ['PaymentGateway'] }])
    expect(g.text).not.toContain('PaymentGateway')
  })

  it('accepts names the caller vouches for, like the problem title', () => {
    expect(groundProse('This is the Parking Lot problem.', graph, ['Parking Lot']).kept).toBe(1)
    expect(groundProse('ParkingLot is here.', graph).kept).toBe(1)
  })
})

describe('Reviewer', () => {
  it('returns a grounded note and stamps the model', async () => {
    const reviewer = new Reviewer(canned(JSON.stringify({ note: 'Start with SpotAllocator. It decides too little. Give it the refusal.' })))
    const note = await reviewer.note(designCtx(strongDesign), [result()])
    expect(note).toEqual({ text: 'Start with SpotAllocator. It decides too little. Give it the refusal.', modelId: 'fake:model' })
  })

  it('omits a note that was mostly about classes the learner never wrote', async () => {
    const reviewer = new Reviewer(canned(JSON.stringify({ note: 'Add a PaymentGateway. Then a FeeEngine. Also a Ledger.' })))
    expect(await reviewer.note(designCtx(strongDesign), [result()])).toBeNull()
  })

  it('omits a note the model did not return as JSON', async () => {
    const reviewer = new Reviewer(canned('Sure! Here is my review: it is fine.'))
    expect(await reviewer.note(designCtx(strongDesign), [result()])).toBeNull()
  })

  it('the stub writes about the lowest finding, in its own words', async () => {
    const note = await new Reviewer(new StubLlmClient()).note(designCtx(godClassDesign), [
      result({ criterionId: 'coupling-cohesion', score: 3, concern: 'fine', suggestion: 'Nothing.' }),
      result(),
    ])
    expect(note?.text).toMatch(/use of abstraction|abstraction/i)
    expect(note?.text).toContain('pricing has no seam')
    expect(note?.modelId).toMatch(/^stub/)
  })
})

describe('LessonWriter', () => {
  const concept: Concept = {
    id: 'open-closed',
    tier: 'principle',
    name: 'Open/Closed',
    plain: 'Add behaviour by adding code, not editing it.',
    tell: 'A switch that grows.',
    prerequisites: [],
  }

  it('grounds body and both halves of the example', async () => {
    const writer = new LessonWriter(
      canned(
        JSON.stringify({
          title: 'Open/Closed',
          body: 'Behaviour goes behind a seam. Your SpotAllocator is one. A RateEngine would be another.',
          example: { before: 'ParkingLot computes fees itself.', after: 'A pricing object owns it.' },
        }),
      ),
    )
    const lesson = await writer.write(designCtx(strongDesign), concept, result())
    expect(lesson?.body).toBe('Behaviour goes behind a seam. Your SpotAllocator is one.')
    expect(lesson?.example.after).toBe('A pricing object owns it.')
  })

  it('refuses a lesson whose example is entirely ungrounded', async () => {
    const writer = new LessonWriter(
      canned(JSON.stringify({ title: 't', body: 'One. Two.', example: { before: 'FeeEngine does it.', after: 'x' } })),
    )
    expect(await writer.write(designCtx(strongDesign), concept, result())).toBeNull()
  })

  it('the stub produces a complete lesson from the authored concept text', async () => {
    const lesson = await new LessonWriter(new StubLlmClient()).write(designCtx(godClassDesign), concept, result())
    expect(lesson?.title).toContain('Open/Closed')
    expect(lesson?.body).toContain('Add behaviour by adding code')
    expect(lesson?.example.before).toContain('ParkingLotManager')
  })
})

describe('Dialogue', () => {
  const probe = {
    id: 'p-pricing',
    prompt: 'Weekend rates start next month. Which method in ParkingLotManager changes?',
    targetsConcept: 'open-closed',
    goodSignal: ['names a single class'],
    badSignal: ['adds a branch'],
  }
  const ctx = designCtx(godClassDesign, { stage: 'defend' })
  const transcript = [{ role: 'learner' as const, text: 'calculateFee gets a branch.' }]

  it('accepts a grounded question and nothing else', async () => {
    const { acceptable } = await import('../../apps/api/src/coach/Dialogue.js')
    expect(acceptable('Which other method in ParkingLotManager would need to know?', ctx, probe)).toBeTruthy()
    expect(acceptable('You should extract a PricingStrategy.', ctx, probe)).toBeNull() // not a question, a verdict
    expect(acceptable('Would a PricingStrategy interface help?', ctx, probe)).toBeNull() // names a class they lack
    expect(acceptable('Is that right?'.repeat(40), ctx, probe)).toBeNull() // too long
  })

  it('retries once on a bad follow-up, then gives up', async () => {
    const { Dialogue } = await import('../../apps/api/src/coach/Dialogue.js')
    let n = 0
    const client = {
      id: 'fake',
      complete: async () => ({ text: JSON.stringify({ question: n++ === 0 ? 'Use a Strategy.' : 'What breaks in ParkingLotManager first?' }) }),
    }
    expect((await new Dialogue(client).followUp(ctx, probe, transcript))?.question).toBe('What breaks in ParkingLotManager first?')
    const bad = { id: 'fake', complete: async () => ({ text: JSON.stringify({ question: 'Use a Strategy.' }) }) }
    expect(await new Dialogue(bad).followUp(ctx, probe, transcript)).toBeNull()
  })

  it('reports what the follow-up cost, retries included', async () => {
    const { Dialogue } = await import('../../apps/api/src/coach/Dialogue.js')
    let n = 0
    const client = {
      id: 'fake',
      complete: async () => ({
        text: JSON.stringify({ question: n++ === 0 ? 'Use a Strategy.' : 'What breaks in ParkingLotManager first?' }),
        usage: { inputTokens: 100, outputTokens: 10 },
      }),
    }
    const out = await new Dialogue(client).followUp(ctx, probe, transcript)
    // The rejected first attempt was a real call and is part of the cost.
    expect(out?.usage).toEqual({ inputTokens: 200, outputTokens: 20 })
  })

  it('the stub asks a grounded question that quotes the learner', async () => {
    const { Dialogue } = await import('../../apps/api/src/coach/Dialogue.js')
    const q = (await new Dialogue(new StubLlmClient()).followUp(ctx, probe, transcript))?.question
    expect(q).toMatch(/^You said "calculateFee gets a branch/)
    expect(q).toMatch(/\?$/)
    expect(q).toContain('ParkingLotManager')
  })
})

describe('Explainer', () => {
  it('returns a grounded explanation, or nothing', async () => {
    const { Explainer } = await import('../../apps/api/src/coach/Explainer.js')
    const ok = new Explainer(canned(JSON.stringify({ explanation: 'ParkingLotManager will grow a branch per rate. Move the rule out first.' })))
    expect((await ok.explain(designCtx(godClassDesign), result()))?.text).toContain('ParkingLotManager')
    const bad = new Explainer(canned(JSON.stringify({ explanation: 'Add a RateEngine. Then a FeeTable.' })))
    expect(await bad.explain(designCtx(godClassDesign), result())).toBeNull()
  })

  it('the stub explains from the card itself', async () => {
    const { Explainer } = await import('../../apps/api/src/coach/Explainer.js')
    const e = await new Explainer(new StubLlmClient()).explain(designCtx(godClassDesign), result())
    expect(e?.text).toContain('Introduce an abstraction for pricing')
  })
})

describe('Coach', () => {
  const input = {
    rubric,
    attempts: 4,
    problemsTried: 2,
    criterionAverages: { 'abstraction-use': 1.2, 'coupling-cohesion': 3.5 },
    weaknesses: [{ criterionId: 'abstraction-use', criterionName: 'Use of Abstraction', occurrences: 3, windowSize: 3, averageScore: 1.2 }],
    next: { problemId: 'vending-machine', title: 'Vending Machine', reason: 'exercises it' },
    recent: [{ problemTitle: 'Parking Lot', overall: 1.5, lowest: 'Use of Abstraction' }],
  }

  it('accepts a note that names only known criteria and problems', async () => {
    const { Coach } = await import('../../apps/api/src/coach/Coach.js')
    const good = new Coach(canned(JSON.stringify({ note: 'Use of Abstraction is the habit. In Vending Machine, find the seam first.' })))
    expect((await good.note(input))?.text).toContain('Vending Machine')
    const bad = new Coach(canned(JSON.stringify({ note: 'Try the Elevator System next.' })))
    expect(await bad.note(input)).toBeNull()
  })

  it('the stub names the recurring weakness and the next problem', async () => {
    const { Coach } = await import('../../apps/api/src/coach/Coach.js')
    const n = await new Coach(new StubLlmClient()).note(input)
    expect(n?.text).toContain('Use of Abstraction')
    expect(n?.text).toContain('Vending Machine')
  })
})
