import { describe, expect, it } from 'vitest'
import type { LlmClient, LlmRequest } from '../../apps/api/src/evaluation/llm/LlmClient.js'
import { groundProse, identifiersIn, sentencesOf } from '../../apps/api/src/coach/ground.js'
import { Reviewer } from '../../apps/api/src/coach/Reviewer.js'
import { LessonWriter } from '../../apps/api/src/coach/Lesson.js'
import { StubLlmClient } from '../../apps/api/src/evaluation/llm/StubLlmClient.js'
import { DesignGraph } from '../../apps/api/src/domain/design/DesignGraph.js'
import { designCtx, godClassDesign, strongDesign } from '../fixtures.js'
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
