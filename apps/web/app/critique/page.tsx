'use client'

import { useLibrary, conceptItems, primaryConcept } from '@/lib/useProblems'
import { pastelAt } from '@/lib/tokens'
import { PanelCard, ProblemCard, SectionHead } from '@/components/ui/Cards'
import { CardSkeleton } from '@/components/ui/Pills'
import { Panel, PanelHeader } from '@/components/shell/Panel'

/** The warm-ups, one card per problem that has them. */
export default function CritiqueIndex() {
  const { data, error } = useLibrary(false)
  if (error) return <p className="text-[14px] text-tint-rose">{error}</p>
  const withPairs = data?.problems.filter((p) => p.critiquePairCount > 0) ?? []
  return (
    <>
      <h2 className="h-hero">Warm up<br />first.</h2>
      <SectionHead title="Two designs, one question" right={data ? `${withPairs.length} problems` : undefined} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {!data && [0, 1, 2].map((i) => <CardSkeleton key={i} h={196} />)}
        {withPairs.map((p, i) => {
          const cat = primaryConcept(data!.concepts, p.conceptTags)
          const done = p.critiquesAnswered >= p.critiquePairCount
          return (
            <ProblemCard
              key={p.id}
              size="md"
              href={`/critique/${p.id}`}
              title={p.title}
              category={cat.label}
              icon={cat.icon}
              pastel={pastelAt(i)}
              band={null}
              statusPill={done ? `${p.critiquesCorrect}/${p.critiquePairCount} right` : p.critiquesAnswered > 0 ? `${p.critiquesAnswered}/${p.critiquePairCount} answered` : `${p.critiquePairCount} pairs`}
              meta={done ? 'Answered · open to reread' : 'About three minutes'}
              concepts={conceptItems(data!.concepts, p.conceptTags).slice(0, 2)}
            />
          )
        })}
      </div>
      <Panel>
        <PanelHeader />
        <PanelCard title="What a critique is">
          <p className="text-[14px] leading-[1.55] text-muted">Two authored designs for the same brief, and one question only one of them answers well. Click the class that decides it. The explanation you read afterwards is the point.</p>
        </PanelCard>
        <PanelCard title="No score here">
          <p className="text-[14px] leading-[1.55] text-muted">Nothing on these screens enters your bands. It is the reading before the attempt.</p>
        </PanelCard>
      </Panel>
    </>
  )
}
