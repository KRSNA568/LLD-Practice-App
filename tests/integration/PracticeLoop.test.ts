import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DesignModel, RawStageInput } from '@lld/contracts'
import { pushSchema, testDatabaseUrl } from '../testdb.js'
import { CoachService } from '../../apps/api/src/app/CoachService.js'
import { StubLlmClient } from '../../apps/api/src/evaluation/llm/StubLlmClient.js'
import { PracticeService } from '../../apps/api/src/app/PracticeService.js'
import { ContentStore } from '../../apps/api/src/infra/content/ContentStore.js'
import { InProcessQueue } from '../../apps/api/src/infra/queue/InProcessQueue.js'
import { toRawStructuredSubmission } from '../../apps/api/src/submission/StructuredDesignParser.js'
import { godClassDesign, strongDesign } from '../fixtures.js'

const DB_URL = testDatabaseUrl('loop')

const LEARNER = 'learner-test'

let prisma: any
let service: PracticeService
let coach: CoachService
let queue: InProcessQueue

const designInput = (design: DesignModel): RawStageInput => ({
  stage: 'design',
  submission: toRawStructuredSubmission(design),
})
const changeInput = (design: DesignModel, rationale = ''): RawStageInput => ({
  stage: 'change',
  submission: toRawStructuredSubmission(design),
  rationale,
})

/** The textbook absorption of the EV change: one new class behind the existing seam. */
const energyRevision: DesignModel = {
  ...strongDesign,
  classes: [
    ...strongDesign.classes.map((c) =>
      c.name === 'ParkingLot' ? { ...c, attributes: [...c.attributes, 'pricingByCapability'] } : c,
    ),
    { name: 'EnergyPricing', stereotype: 'class', responsibility: 'Prices a stay by kilowatt-hours consumed', attributes: ['ratePerKwh'], methods: ['feeFor'] },
  ],
  relationships: [...strongDesign.relationships, { from: 'EnergyPricing', to: 'PricingStrategy', kind: 'implements' }],
}

/** The second attempt at parking-lot is dealt the reserved-spots change; this absorbs it at the allocator seam. */
const reservedRevision: DesignModel = {
  ...strongDesign,
  classes: [
    ...strongDesign.classes,
    { name: 'ReservedFirstAllocator', stereotype: 'class', responsibility: 'Gives pass holders a reserved ground-floor spot before falling back to nearest-first', attributes: ['passHolders'], methods: ['allocate'] },
  ],
  relationships: [...strongDesign.relationships, { from: 'ReservedFirstAllocator', to: 'SpotAllocator', kind: 'implements' }],
}

/** The flag-and-branch absorption. */
const flagRevision: DesignModel = {
  ...godClassDesign,
  classes: godClassDesign.classes.map((c) =>
    c.name === 'Spot'
      ? { ...c, attributes: [...c.attributes, 'isElectric'] }
      : c.name === 'ParkingLotManager'
        ? { ...c, methods: [...c.methods, 'calculateKwhFee'] }
        : c,
  ),
}

beforeAll(async () => {
  // Deterministic by construction: whatever keys the developer has lying around,
  // this suite talks to the stub. The live provider is exercised by hand.
  process.env.LLD_FORCE_STUB = '1'
  await pushSchema(DB_URL)
  const { PrismaClient } = await import('@prisma/client')
  prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } })
  await prisma.learner.upsert({
    where: { id: LEARNER },
    create: { id: LEARNER, name: 'Test learner' },
    update: {},
  })
}, 60_000)

afterAll(async () => {
  await prisma?.$disconnect()
})

beforeEach(async () => {
  await prisma.critique.deleteMany({})
  await prisma.evaluation.deleteMany({})
  await prisma.submission.deleteMany({})
  await prisma.attempt.deleteMany({})
  await prisma.aiNote.deleteMany({})
  await prisma.dialogueTurn.deleteMany({})
  queue = new InProcessQueue({ maxRetries: 2, baseDelayMs: 1 })
  const content = ContentStore.load()
  service = new PracticeService(prisma, content, queue)
  coach = new CoachService(prisma, content, (l, id, stage) => service.loadContext(l, id, stage), new StubLlmClient(), (l, id) => service.loadDefend(l, id))
  service.transcriptsOf = (id) => coach.transcripts(id)
  service.onEvaluated = (l, id, stage) => queue.enqueue(() => coach.reviewStage(l, id, stage).then(() => undefined))
})

async function designAndSettle(design: DesignModel, key = crypto.randomUUID(), problemId = 'parking-lot') {
  const attempt = await service.startAttempt(LEARNER, problemId)
  await service.submit(LEARNER, attempt.id, designInput(design), key)
  await queue.drain()
  return service.getAttempt(LEARNER, attempt.id)
}

async function throughChange(design: DesignModel, revision: DesignModel, rationale = '') {
  const settled = await designAndSettle(design)
  await service.advance(LEARNER, settled.id)
  await service.submit(LEARNER, settled.id, changeInput(revision, rationale), crypto.randomUUID())
  await queue.drain()
  return service.getAttempt(LEARNER, settled.id)
}

describe('the design stage', () => {
  it('runs choose -> submit -> evaluate -> report', async () => {
    const settled = await designAndSettle(strongDesign)

    expect(settled.stage).toBe('design')
    expect(settled.state).toBe('COMPLETED')
    expect(settled.report).not.toBeNull()
    // Six of eight: change-resilience and reasoning belong to later stages.
    expect(settled.report!.results).toHaveLength(6)
    expect(settled.report!.summary.criteriaTotal).toBe(8)
    expect(settled.report!.stagesCompleted).toEqual(['design'])
    expect(settled.report!.summary.overall).toBeGreaterThan(2)

    const kinds = new Set(settled.report!.results.map((r) => r.evaluatorKind))
    expect(kinds).toEqual(new Set(['deterministic', 'llm']))
  })

  it('keeps the requirement change hidden until the design has been evaluated', async () => {
    const attempt = await service.startAttempt(LEARNER, 'parking-lot')
    expect(attempt.revealedChange).toBeNull()

    await service.submit(LEARNER, attempt.id, designInput(strongDesign), 'k')
    // Queued but not yet evaluated: still hidden.
    expect((await service.getAttempt(LEARNER, attempt.id)).revealedChange).toBeNull()

    await queue.drain()
    const settled = await service.getAttempt(LEARNER, attempt.id)
    expect(settled.revealedChange).not.toBeNull()
    expect(settled.revealedChange!.id).toBe('hc-ev')
  })

  it('pins the rubric and prompt version onto the evaluation', async () => {
    const settled = await designAndSettle(strongDesign)
    expect(settled.report!.rubricId).toBe('lld-core')
    expect(settled.report!.rubricVersion).toBe('2.0.0')
    const row = await prisma.evaluation.findFirst({ where: { attemptId: settled.id } })
    expect(row.promptVersion).toBe('2.1.0')
  })

  it('persists the submission before evaluation begins', async () => {
    const attempt = await service.startAttempt(LEARNER, 'parking-lot')
    await service.submit(LEARNER, attempt.id, designInput(strongDesign), 'key-1')

    const row = await prisma.submission.findUnique({
      where: { attemptId_stage: { attemptId: attempt.id, stage: 'design' } },
    })
    expect(row.payloadJson).toContain('PricingStrategy')
    expect(row.fingerprint).not.toBeNull()
    await queue.drain()
  })

  it('charges one evaluation for a replayed idempotency key', async () => {
    const attempt = await service.startAttempt(LEARNER, 'parking-lot')
    await service.submit(LEARNER, attempt.id, designInput(strongDesign), 'same-key')
    await queue.drain()

    const replay = await service.submit(LEARNER, attempt.id, designInput(strongDesign), 'same-key')
    await queue.drain()

    expect(replay.id).toBe(attempt.id)
    expect(await prisma.evaluation.count()).toBe(1)
  })

  it('refuses input for a stage the attempt has not reached', async () => {
    const attempt = await service.startAttempt(LEARNER, 'parking-lot')
    await expect(service.submit(LEARNER, attempt.id, changeInput(strongDesign), 'k')).rejects.toMatchObject({ code: 'WRONG_STAGE' })
  })

  it('tells the learner when they resubmitted an unchanged design', async () => {
    await designAndSettle(strongDesign, 'k1')
    const second = await designAndSettle(strongDesign, 'k2')
    expect(second.attemptNumber).toBe(2)
    expect(second.report!.unchangedFromPrevious).toBe(true)
  })

  it('rejects a malformed submission with per-field errors and no state change', async () => {
    const attempt = await service.startAttempt(LEARNER, 'parking-lot')
    const broken = designInput({
      ...strongDesign,
      classes: [{ name: 'Spot', stereotype: 'class', responsibility: '', attributes: [], methods: [] }],
    })
    await expect(service.submit(LEARNER, attempt.id, broken, 'bad')).rejects.toMatchObject({
      code: 'INVALID_SUBMISSION',
      fields: [{ path: 'classes.0.responsibility' }],
    })
    const row = await prisma.attempt.findUnique({ where: { id: attempt.id } })
    expect(row.state).toBe('DRAFT')
    expect(await prisma.submission.count()).toBe(0)
  })

  it('still produces a report when the AI half is down', async () => {
    process.env.LLD_STUB_FAIL = '1'
    try {
      const settled = await designAndSettle(godClassDesign)
      expect(settled.state).toBe('COMPLETED_PARTIAL')
      expect(settled.report!.summary.aiUnavailable).toBe(true)
      expect(settled.report!.results).toHaveLength(5)
      expect(settled.report!.results.every((r) => r.evaluatorKind === 'deterministic')).toBe(true)
      expect(settled.design).not.toBeNull()
    } finally {
      delete process.env.LLD_STUB_FAIL
    }
  })
})

describe('the change stage', () => {
  it('cannot be opened before the design stage has a report', async () => {
    const attempt = await service.startAttempt(LEARNER, 'parking-lot')
    await expect(service.advance(LEARNER, attempt.id)).rejects.toMatchObject({ name: 'InvalidTransitionError' })
  })

  it('opens with the frozen design prefilled and the change revealed', async () => {
    const settled = await designAndSettle(strongDesign)
    const opened = await service.advance(LEARNER, settled.id)

    expect(opened.stage).toBe('change')
    expect(opened.state).toBe('DRAFT')
    expect(opened.revealedChange!.id).toBe('hc-ev')

    const draft = await service.getDraft(LEARNER, opened.id)
    expect(draft!.stage).toBe('change')
    if (draft!.stage === 'change') {
      expect(draft!.submission.classes.map((c) => c.name)).toContain('PricingStrategy')
    }
  })

  it('measures a change absorbed at an existing seam as a 4', async () => {
    const settled = await throughChange(strongDesign, energyRevision, 'EnergyPricing implements PricingStrategy; only ParkingLot wiring changed.')

    expect(settled.stage).toBe('change')
    expect(settled.state).toBe('COMPLETED')
    expect(settled.report!.stagesCompleted).toEqual(['design', 'change'])
    // The report grew: six design-stage results plus change-resilience.
    expect(settled.report!.results).toHaveLength(7)

    const resilience = settled.report!.results.find((r) => r.criterionId === 'change-resilience')!
    expect(resilience.stage).toBe('change')
    expect(resilience.score).toBe(4)
    expect(resilience.evidence).toContainEqual({ kind: 'class', name: 'EnergyPricing' })
    expect(settled.revision!.design.classes.map((c) => c.name)).toContain('EnergyPricing')
  })

  it('measures a flag-and-branch absorption as a 1 and names the flag', async () => {
    const settled = await throughChange(godClassDesign, flagRevision)
    const resilience = settled.report!.results.find((r) => r.criterionId === 'change-resilience')!
    expect(resilience.score).toBe(1)
    expect(resilience.concern).toContain('isElectric')
  })

  it('deals a different change to the second attempt at the same problem', async () => {
    const first = await designAndSettle(strongDesign, 'k1')
    const second = await designAndSettle(strongDesign, 'k2')
    expect(first.revealedChange!.id).toBe('hc-ev')
    expect(second.revealedChange!.id).toBe('hc-reserved')
  })
})

describe('the defend stage', () => {
  it('selects probes from the learner\'s own findings and judges the answers', async () => {
    const changed = await throughChange(godClassDesign, flagRevision)
    const opened = await service.advance(LEARNER, changed.id)

    expect(opened.stage).toBe('defend')
    expect(opened.probes).not.toBeNull()
    expect(opened.probes!.length).toBeGreaterThan(0)
    expect(opened.probes!.length).toBeLessThanOrEqual(3)
    // The god class scored low on abstraction-use, so the pricing probe is asked
    // about the class that absorbed pricing.
    const pricing = opened.probes!.find((p) => p.id === 'p-pricing')
    expect(pricing?.prompt).toContain('ParkingLotManager')

    const answers = opened.probes!.map((p) => ({
      probeId: p.id,
      response: `I would add a WeekendPricing class rather than editing ParkingLotManager, because rates change more often than the lot; nothing else needs to know.`,
    }))
    await service.submit(LEARNER, opened.id, { stage: 'defend', answers }, crypto.randomUUID())
    await queue.drain()

    const done = await service.getAttempt(LEARNER, opened.id)
    expect(done.state).toBe('COMPLETED')
    expect(done.report!.stagesCompleted).toEqual(['design', 'change', 'defend'])
    expect(done.report!.results).toHaveLength(8)
    expect(done.report!.summary.criteriaScored).toBe(8)

    const reasoning = done.report!.results.find((r) => r.criterionId === 'reasoning')!
    expect(reasoning.stage).toBe('defend')
    expect(reasoning.evaluatorKind).toBe('llm')
    expect(reasoning.score).toBeGreaterThanOrEqual(3)
    expect(reasoning.evidence.some((e) => e.kind === 'prose' && e.field === 'answer')).toBe(true)
  })

  it('drops answers to probes the learner was never asked', async () => {
    const changed = await throughChange(strongDesign, energyRevision)
    const opened = await service.advance(LEARNER, changed.id)
    await service.submit(LEARNER, 
      opened.id,
      { stage: 'defend', answers: [{ probeId: 'p-does-not-exist', response: 'x' }] },
      crypto.randomUUID(),
    )
    await queue.drain()
    const done = await service.getAttempt(LEARNER, opened.id)
    expect(done.answers).toEqual([])
  })

  it('keeps the six measured criteria when the AI fails at the last step', async () => {
    const changed = await throughChange(strongDesign, energyRevision)
    const opened = await service.advance(LEARNER, changed.id)
    process.env.LLD_STUB_FAIL = '1'
    try {
      await service.submit(LEARNER, opened.id, { stage: 'defend', answers: [] }, crypto.randomUUID())
      await queue.drain()
    } finally {
      delete process.env.LLD_STUB_FAIL
    }
    const done = await service.getAttempt(LEARNER, opened.id)
    // Nothing at all scored at defend → the stage failed, but every earlier result survives.
    expect(done.state).toBe('FAILED')
    expect(done.report!.results.filter((r) => r.evaluatorKind === 'deterministic')).toHaveLength(6)
    expect(done.report!.stagesCompleted).toEqual(['design', 'change'])
  })
})

describe('history and next problem', () => {
  it('shows stages completed and improvement across attempts', async () => {
    await designAndSettle(godClassDesign, 'k1')
    // Attempt two is dealt hc-reserved, not hc-ev — the revision has to answer that.
    await throughChange(strongDesign, reservedRevision)

    const { attempts } = await service.getHistory(LEARNER, 'parking-lot')
    const [latest, first] = attempts
    expect(latest!.attemptNumber).toBe(2)
    expect(latest!.stagesCompleted).toEqual(['design', 'change'])
    expect(first!.stagesCompleted).toEqual(['design'])
    expect(latest!.overall!).toBeGreaterThan(first!.overall!)
    expect(latest!.scores['change-resilience']).toBe(4)
  })

  it('surfaces a recurring weakness only once there are three attempts, and points at a problem for it', async () => {
    await designAndSettle(godClassDesign, 'k1')
    await designAndSettle(godClassDesign, 'k2')
    let history = await service.getHistory(LEARNER, 'parking-lot')
    expect(history.recurringWeaknesses).toHaveLength(0)

    await designAndSettle(godClassDesign, 'k3')
    history = await service.getHistory(LEARNER, 'parking-lot')
    expect(history.recurringWeaknesses.length).toBeGreaterThan(0)
    expect(history.next).not.toBeNull()
    expect(history.next!.problemId).not.toBe('parking-lot')
    expect(history.next!.criterionId).toBe(history.recurringWeaknesses[0]!.criterionId)
  })

  it('lists problems with best score, critique progress and a next suggestion', async () => {
    await designAndSettle(strongDesign, 'k1')
    const { problems, next } = await service.listProblems(LEARNER)
    const parking = problems.find((p) => p.id === 'parking-lot')!
    expect(parking.attemptCount).toBe(1)
    expect(parking.bestOverall).toBeGreaterThan(0)
    expect(parking.critiquePairCount).toBe(3)
    expect(next).not.toBeNull()
  })

  it('prefills the next attempt from where the last one ended — the revision, not the original', async () => {
    await throughChange(strongDesign, energyRevision)
    const next = await service.startAttempt(LEARNER, 'parking-lot')
    const draft = await service.getDraft(LEARNER, next.id)
    expect(draft!.stage).toBe('design')
    if (draft!.stage === 'design') {
      expect(draft!.submission.classes.map((c) => c.name)).toContain('EnergyPricing')
    }
  })
})

describe('critique', () => {
  it('serves pairs with the designs inlined and the answer withheld', async () => {
    const pairs = await service.getCritique(LEARNER, 'parking-lot')
    expect(pairs).toHaveLength(3)
    expect(pairs[0]!.left.design.classes.length).toBeGreaterThan(0)
    expect(pairs[0]).not.toHaveProperty('answer')
    expect(pairs[0]).not.toHaveProperty('telling')
    expect(pairs[0]!.answered).toBeNull()
  })

  it('scores a click and reveals the telling; the first answer is the one that counts', async () => {
    const right = await service.answerCritique(LEARNER, 'parking-lot', 'cp-1', { design: 'strong', className: 'PricingStrategy' })
    expect(right.correct).toBe(true)
    expect(right.telling.length).toBeGreaterThan(50)

    const again = await service.answerCritique(LEARNER, 'parking-lot', 'cp-1', { design: 'god-class', className: 'Spot' })
    expect(again.correct).toBe(true) // unchanged — already answered

    const wrong = await service.answerCritique(LEARNER, 'parking-lot', 'cp-2', { design: 'over-patterned', className: 'PricingStrategy' })
    expect(wrong.correct).toBe(false)
    expect(wrong.answer).toEqual({ design: 'strong', className: 'HourlyPricing' })

    const pairs = await service.getCritique(LEARNER, 'parking-lot')
    expect(pairs.find((p) => p.id === 'cp-2')!.answered).toEqual({ design: 'over-patterned', className: 'PricingStrategy', correct: false })

    const history = await service.getHistory(LEARNER, 'parking-lot')
    expect(history.critique).toEqual({ answered: 2, correct: 1, total: 3 })
  })
})

describe('the mentor', () => {
  it('writes a grounded note after each stage lands, cached by content', async () => {
    const settled = await designAndSettle(godClassDesign)
    const notes = await coach.notesFor(LEARNER, settled.id, settled.report!.results)

    expect(notes.review.design?.text).toBeTruthy()
    expect(notes.review.design?.modelId).toMatch(/^stub/)
    expect(notes.live).toBe(false)
    // Low criteria are the ones a lesson can be asked for.
    expect(notes.lessonable).toContain('abstraction-use')
    expect(notes.lessonable).not.toContain('requirement-coverage')

    const before = await prisma.aiNote.count()
    await coach.reviewStage(LEARNER, settled.id, 'design')
    expect(await prisma.aiNote.count()).toBe(before)
  })

  it('writes a lesson on request for a low criterion only, using the learner\'s classes', async () => {
    const settled = await designAndSettle(godClassDesign)
    const lesson = await coach.lessonFor(LEARNER, settled.id, 'abstraction-use')
    expect(lesson?.conceptId).toBe('open-closed')
    expect(lesson?.example.before).toContain('ParkingLotManager')

    // At par → no lesson, and nothing stored.
    expect(await coach.lessonFor(LEARNER, settled.id, 'requirement-coverage')).toBeNull()
    expect((await coach.notesFor(LEARNER, settled.id, settled.report!.results)).lessons['abstraction-use']?.title).toBe(lesson?.title)
  })

  it('leaves the attempt untouched when the mentor fails', async () => {
    const broken = new CoachService(prisma, ContentStore.load(), (l, id, stage) => service.loadContext(l, id, stage), {
      id: 'broken',
      complete: async () => {
        throw new Error('down')
      },
    })
    service.onEvaluated = (l, id, stage) => queue.enqueue(() => broken.reviewStage(l, id, stage).then(() => undefined))
    const settled = await designAndSettle(strongDesign)
    expect(settled.state).toBe('COMPLETED')
    expect((await broken.notesFor(LEARNER, settled.id, settled.report!.results)).review.design).toBeUndefined()
  })
})

describe('defend as a dialogue', () => {
  it('asks one follow-up, closes after two learner turns, and scores the whole exchange', async () => {
    const settled = await throughChange(godClassDesign, flagRevision, 'Added a flag.')
    await service.advance(LEARNER, settled.id)
    const opened = await service.getAttempt(LEARNER, settled.id)
    const probe = opened.probes![0]!

    const first = await coach.turn(LEARNER, opened.id, probe.id, 'ParkingLotManager.calculateFee gets a new branch. Nothing else changes.')
    expect(first.closed).toBe(false)
    expect(first.transcript.map((t) => t.role)).toEqual(['learner', 'mentor'])
    expect(first.transcript[1]!.text).toMatch(/\?$/)

    const second = await coach.turn(LEARNER, opened.id, probe.id, 'Honestly, a PricingStrategy interface would be better than the branch.')
    expect(second.closed).toBe(true)
    await expect(coach.turn(LEARNER, opened.id, probe.id, 'one more')).rejects.toThrow(/finished/)

    // The dialogue is on the attempt, server-held.
    expect((await service.getAttempt(LEARNER, opened.id)).dialogue?.[probe.id]).toHaveLength(3)

    // Submitting folds the dialogue into the answer: learner turns only in `response`.
    await service.submit(LEARNER, opened.id, { stage: 'defend', answers: [] }, 'k-dialogue')
    await queue.drain()
    const done = await service.getAttempt(LEARNER, opened.id)
    expect(done.state).toBe('COMPLETED')
    const answer = done.answers!.find((a) => a.probeId === probe.id)!
    expect(answer.response).toContain('PricingStrategy interface')
    expect(answer.response).not.toContain(first.transcript[1]!.text)
    expect(answer.transcript).toHaveLength(3)
    expect(done.report!.results.find((r) => r.criterionId === 'reasoning')).toBeDefined()
  })

  it('refuses a turn on a probe that was not asked, or once the stage is closed', async () => {
    const settled = await throughChange(godClassDesign, flagRevision)
    await expect(coach.turn(LEARNER, settled.id, 'p-pricing', 'x')).rejects.toThrow(/not open/)
    await service.advance(LEARNER, settled.id)
    await expect(coach.turn(LEARNER, settled.id, 'p-nope', 'x')).rejects.toThrow(/not asked/)
  })
})

describe('progress: activity and time', () => {
  it('buckets stages, critiques and time by month, and reports a median band', async () => {
    const settled = await designAndSettle(strongDesign)
    expect(settled.state).toBe('COMPLETED')
    const progress = await service.getProgress(LEARNER)

    expect(progress.activity).toHaveLength(12)
    const thisMonth = progress.activity[11]!
    const now = new Date()
    expect(thisMonth.month).toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    expect(thisMonth.design).toBe(1)
    expect(thisMonth.change).toBe(0)
    // Time is start → last submission; a test attempt is fast, but never negative and never the cap.
    expect(progress.practiceSeconds).toBeGreaterThanOrEqual(0)
    expect(progress.practiceSeconds).toBeLessThan(60)
    expect(thisMonth.seconds).toBe(progress.practiceSeconds)
    expect(progress.medianOverall).toBe(settled.report!.summary.overall)
    expect(progress.openAttempt?.startedAt).toBeDefined()
  })

  it('lists what is catalogued but not playable, separately', async () => {
    const { problems, upcoming } = await service.listProblems(LEARNER)
    expect(problems.length).toBeGreaterThan(0)
    expect(upcoming.length).toBeGreaterThan(0)
    const ids = new Set(problems.map((p) => p.id))
    for (const u of upcoming) expect(ids.has(u.id)).toBe(false)
    expect(problems[0]).toHaveProperty('lastAttemptAt')
    expect(problems[0]).toHaveProperty('critiquesAnswered')
  })
})
