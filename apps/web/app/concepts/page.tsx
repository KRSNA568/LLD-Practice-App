'use client'

import { useMemo } from 'react'
import { CONCEPT_TIERS, type Concept, type ConceptMastery } from '@lld/contracts'
import { useLibrary } from '@/lib/useProblems'
import { PASTEL_BG, PASTEL_HEX, bandPastel, numberWord, pastelAt } from '@/lib/tokens'
import { Icon, conceptIcon } from '@/components/ui/Icon'
import { MasteryRing, StatPill } from '@/components/ui/Pills'
import { PanelCard, SectionHead } from '@/components/ui/Cards'
import { Panel, PanelHeader } from '@/components/shell/Panel'

/**
 * The curriculum map: every concept the rubric produces evidence about, with a
 * ring showing where the learner stands. Ordered by tier — foundations first —
 * so the map reads the way the ideas build.
 */
export default function Concepts() {
  const { data, error } = useLibrary()
  const view = useMemo(() => {
    if (!data || !data.progress) return null
    const order = new Map(CONCEPT_TIERS.map((t, i) => [t, i]))
    const concepts = [...data.concepts].sort((a, b) => order.get(a.tier)! - order.get(b.tier)!)
    const mastery = new Map(data.progress.conceptMastery.map((m) => [m.conceptId, m]))
    const withEvidence = concepts
      .map((c) => ({ c, m: mastery.get(c.id) }))
      .filter((x): x is { c: Concept; m: ConceptMastery & { average: number } } => !!x.m && x.m.average !== null && x.m.evidenceCount > 0)
    const weakest = [...withEvidence].sort((a, b) => a.m.average - b.m.average).slice(0, 3)
    const strongest = [...withEvidence].sort((a, b) => b.m.average - a.m.average).slice(0, 3)
    return { concepts, mastery, weakest, strongest }
  }, [data])

  if (error) return <p className="text-[14px] text-tint-rose">{error}</p>
  if (!data || !view) return <h2 className="h-hero">Ideas that<br />matter.</h2>
  const progress = data.progress!
  const scoredAttempts = progress.recent.filter((a) => a.overall !== null).length
  const window = Math.min(5, scoredAttempts)
  const firstOfTier = new Set<string>()

  return (
    <>
      <h2 className="h-hero">{numberWord(view.concepts.length)} ideas<br />that matter.</h2>
      <SectionHead
        title="Mastery by concept"
        right={window > 0 ? `Banded 1–4 from your last ${window} scored attempt${window === 1 ? '' : 's'}` : 'Bands appear after your first scored attempt'}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {view.concepts.map((c, i) => {
          const m = view.mastery.get(c.id)
          const avg = m && m.evidenceCount > 0 ? m.average : null
          const anchor = !firstOfTier.has(c.tier) && (firstOfTier.add(c.tier), true)
          const pastel = pastelAt(i)
          return (
            <div key={c.id} id={anchor ? c.tier : undefined} className="card-lined flex min-h-[152px] flex-col justify-between p-5">
              <div className="flex items-start justify-between">
                <span className={`grid h-10 w-10 place-items-center rounded-full ${PASTEL_BG[pastel]}`}>
                  <Icon name={conceptIcon(c.id)} size={18} stroke="#222222" />
                </span>
                <MasteryRing value={avg} pastel={PASTEL_HEX[pastel]} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[18px] font-medium leading-[1.2] tracking-[-0.01em] text-ink-strong">{c.name}</span>
                <span className="text-[13px] leading-[1.45] text-muted">{c.plain}</span>
              </div>
            </div>
          )
        })}
      </div>

      <Panel>
        <PanelHeader />
        <h3 className="h-section">Weakest</h3>
        <div className="flex flex-col gap-3">
          {view.weakest.length === 0 && <p className="text-[14px] text-muted">Nothing to rank yet — finish a scored attempt.</p>}
          {view.weakest.map(({ c, m }) => (
            <StatPill key={c.id} value={m.average.toFixed(1)} label={c.name} pastel={PASTEL_BG[bandPastel(m.average)]} href={practiceHref(data.progress!, data.problems, c.id)} />
          ))}
        </div>
        <h3 className="h-section">Strongest</h3>
        <div className="flex flex-col gap-3">
          {view.strongest.length === 0 && <p className="text-[14px] text-muted">Nothing to rank yet.</p>}
          {view.strongest.map(({ c, m }) => (
            <StatPill key={c.id} value={m.average.toFixed(1)} label={c.name} pastel={PASTEL_BG[bandPastel(m.average)]} href={practiceHref(data.progress!, data.problems, c.id)} />
          ))}
        </div>
        {view.weakest[0] && (
          <PanelCard title={`Where ${view.weakest[0].c.name.toLowerCase()} hurts`}>
            <p className="text-[14px] leading-[1.55] text-muted">
              {view.weakest[0].c.tell}{' '}
              {(() => {
                const p = data.problems.find((x) => x.conceptTags.includes(view.weakest[0]!.c.id))
                return p ? `${p.title} is the cleanest place to practise it.` : ''
              })()}
            </p>
          </PanelCard>
        )}
      </Panel>
    </>
  )
}

/** The first playable problem tagged with a concept, or the map itself. */
function practiceHref(_progress: unknown, problems: Array<{ id: string; conceptTags: string[] }>, conceptId: string): string {
  const p = problems.find((x) => x.conceptTags.includes(conceptId))
  return p ? `/learn/${p.id}` : '/learn'
}
