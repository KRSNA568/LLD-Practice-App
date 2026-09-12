import { describe, expect, it } from 'vitest'
import type { CriterionResult } from '@lld/contracts'
import { selectProbes } from '../../apps/api/src/domain/feedback/ProbeSelector.js'
import { parkingLot } from '../fixtures.js'

const finding = (criterionId: CriterionResult['criterionId'], score: CriterionResult['score'], cls?: string): CriterionResult => ({
  criterionId,
  stage: 'design',
  score,
  evidence: cls ? [{ kind: 'class', name: cls }] : [],
  concern: '',
  suggestion: '',
  confidence: 'high',
  evaluatorId: 'rule-evaluator',
  evaluatorKind: 'deterministic',
})

describe('selectProbes', () => {
  it('asks the probes the findings triggered, about the class the finding cited', () => {
    const probes = selectProbes(parkingLot.probes, [
      finding('abstraction-use', 1, 'ParkingLotManager'),
      finding('class-responsibilities', 4),
      finding('behaviour', 4),
    ])
    const pricing = probes.find((p) => p.id === 'p-pricing')!
    expect(pricing.triggered).toBe(true)
    expect(pricing.aboutClass).toBe('ParkingLotManager')
    expect(pricing.prompt).toContain('Which method in ParkingLotManager changes')
    expect(probes.map((p) => p.id)).not.toContain('p-split')
  })

  it('never asks more than three, worst finding first, then defaults', () => {
    const probes = selectProbes(parkingLot.probes, [
      finding('abstraction-use', 2, 'ParkingLot'),
      finding('class-responsibilities', 0, 'ParkingLotManager'),
      finding('behaviour', 1, 'ParkingLotManager'),
    ])
    expect(probes).toHaveLength(3)
    expect(probes[0]!.id).toBe('p-split')
    expect(probes.every((p) => p.triggered)).toBe(true)
  })

  it('falls back to default probes when nothing was triggered', () => {
    const probes = selectProbes(parkingLot.probes, [finding('abstraction-use', 4), finding('behaviour', 4)])
    expect(probes.length).toBeGreaterThan(0)
    expect(probes.every((p) => !p.triggered)).toBe(true)
    expect(probes.every((p) => !p.prompt.includes('{{'))).toBe(true)
  })

  it('reads as a sentence even when the triggering finding cited no class', () => {
    const [p] = selectProbes(parkingLot.probes, [finding('abstraction-use', 1)])
    expect(p!.prompt).toContain('your design')
    expect(p!.aboutClass).toBeNull()
  })

  it('is deterministic — the same findings choose the same probes', () => {
    const findings = [finding('behaviour', 1, 'ParkingLotManager'), finding('abstraction-use', 2, 'ParkingLotManager')]
    expect(selectProbes(parkingLot.probes, findings)).toEqual(selectProbes(parkingLot.probes, findings))
  })
})

describe('a strong design still gets three questions', () => {
  it('fills the remaining slots with probes whose trigger did not fire', async () => {
    const { selectProbes } = await import('../../apps/api/src/domain/feedback/ProbeSelector.js')
    const probes = [
      { id: 'a', prompt: 'A about {{class}}?', targetsConcept: 'x', triggerWhen: { criterionId: 'abstraction-use' as const, maxScore: 2 }, goodSignal: [], badSignal: [] },
      { id: 'b', prompt: 'B?', targetsConcept: 'x', triggerWhen: { criterionId: 'behaviour' as const, maxScore: 2 }, goodSignal: [], badSignal: [] },
      { id: 'c', prompt: 'C?', targetsConcept: 'x', goodSignal: [], badSignal: [] },
    ]
    const strong = [
      { criterionId: 'abstraction-use' as const, stage: 'design' as const, score: 4 as const, evidence: [], concern: '', suggestion: '', confidence: 'high' as const, evaluatorId: 'r', evaluatorKind: 'deterministic' as const },
      { criterionId: 'behaviour' as const, stage: 'design' as const, score: 4 as const, evidence: [], concern: '', suggestion: '', confidence: 'high' as const, evaluatorId: 'r', evaluatorKind: 'deterministic' as const },
    ]
    const picked = selectProbes(probes, strong)
    expect(picked.map((p) => p.id)).toEqual(['c', 'a', 'b'])
    expect(picked.every((p) => !p.triggered)).toBe(true)
    expect(picked[1]!.prompt).toBe('A about your design?')
  })
})
