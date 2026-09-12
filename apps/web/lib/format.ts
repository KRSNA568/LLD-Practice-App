import type { ConceptTier, CriterionId, MasteryLevel, Score, Stage } from '@lld/contracts'

/** Score bands, named. A 2 is adequate; the labels should not flatter. */
export const SCORE_LABEL: Record<Score, string> = {
  0: 'Missing',
  1: 'Weak',
  2: 'Adequate',
  3: 'Good',
  4: 'Strong',
}

export function scoreTone(score: number): 'critical' | 'caution' | 'positive' {
  if (score <= 1) return 'critical'
  if (score <= 2) return 'caution'
  return 'positive'
}

/** For averages, where "par" is the honest line: below 3 is not yet green. */
export function averageTone(avg: number): 'critical' | 'caution' | 'positive' {
  if (avg < 1.5) return 'critical'
  if (avg < 3) return 'caution'
  return 'positive'
}

export const CRITERION_ORDER: CriterionId[] = [
  'requirement-coverage',
  'class-responsibilities',
  'coupling-cohesion',
  'abstraction-use',
  'behaviour',
  'change-resilience',
  'edge-cases',
  'reasoning',
]

/**
 * The three passes of the loop, as the learner sees them. "Run" is shown as its
 * own step on the rail even though it is submitted with the design — walking the
 * scenarios is a distinct act, and the rail should say so.
 */
export const STAGE_STEPS: Array<{ id: Stage | 'run'; label: string; hint: string }> = [
  { id: 'design', label: 'Design', hint: 'Classes, responsibilities, relationships' },
  { id: 'run', label: 'Run', hint: 'Walk the scenarios through it' },
  { id: 'change', label: 'Change', hint: 'The requirements move' },
  { id: 'defend', label: 'Defend', hint: 'Three questions about your decisions' },
]

export const STAGE_LABEL: Record<Stage, string> = {
  design: 'Design',
  change: 'Change',
  defend: 'Defend',
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const mins = Math.round((Date.now() - then) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export const TIER_LABEL: Record<number, string> = {
  1: 'Foundations',
  2: 'Intermediate',
  3: 'Advanced',
  4: 'Concurrency',
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  new: 'Not yet',
  developing: 'Developing',
  solid: 'Solid',
}

export function masteryTone(level: MasteryLevel): 'faint' | 'caution' | 'positive' {
  return level === 'solid' ? 'positive' : level === 'developing' ? 'caution' : 'faint'
}

export const TIER_BLURB: Record<number, string> = {
  1: 'One domain, a handful of classes. Practise finding the seam and running the scenarios.',
  2: 'State, policies and error paths. Practise keeping rules out of the objects that use them.',
  3: 'Several collaborating subsystems. Practise interfaces that outlive the things behind them.',
  4: 'Shared state under contention. Practise making the unsafe thing impossible to express.',
}

export const CONCEPT_TIER_LABEL: Record<ConceptTier, string> = {
  foundation: 'Foundations',
  principle: 'Principles',
  structure: 'Structure',
  behaviour: 'Behaviour',
  practice: 'Practice',
}

export const CONCEPT_TIER_BLURB: Record<ConceptTier, string> = {
  foundation: 'Ideas everything else is built on.',
  principle: 'The named principles — what to keep apart, what to keep open.',
  structure: 'How objects relate and compose.',
  behaviour: 'How objects change and talk to each other over time.',
  practice: 'Applied judgement. The payoff.',
}
