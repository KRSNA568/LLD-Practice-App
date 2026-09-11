'use client'

import { motion } from 'framer-motion'
import type { DesignModel, EvidenceRef } from '@lld/contracts'
import { riseIn, stagger } from './motion'

/**
 * Before and after, side by side.
 *
 * Green is added, amber is reopened, muted is untouched. The learner should be able
 * to see the blast radius of their revision at a glance, and — more usefully — see
 * what a small one looks like the next time they meet a change.
 */

type Change = 'added' | 'removed' | 'modified' | 'same'

const key = (s: string) => s.trim().toLowerCase()
const list = (xs: readonly string[]) => xs.map(key).sort().join('|')

function classify(before: DesignModel, after: DesignModel) {
  const b = new Map(before.classes.map((c) => [key(c.name), c]))
  const a = new Map(after.classes.map((c) => [key(c.name), c]))
  const rows: Array<{ name: string; change: Change; fields: string[] }> = []

  for (const c of before.classes) {
    const now = a.get(key(c.name))
    if (!now) {
      rows.push({ name: c.name, change: 'removed', fields: [] })
      continue
    }
    const fields: string[] = []
    if (c.stereotype !== now.stereotype) fields.push('type')
    if (c.responsibility.trim() !== now.responsibility.trim()) fields.push('responsibility')
    if (list(c.attributes) !== list(now.attributes)) fields.push('attributes')
    if (list(c.methods) !== list(now.methods)) fields.push('methods')
    rows.push({ name: now.name, change: fields.length ? 'modified' : 'same', fields })
  }
  for (const c of after.classes) {
    if (!b.has(key(c.name))) rows.push({ name: c.name, change: 'added', fields: [] })
  }
  return rows
}

const STYLE: Record<Change, string> = {
  added: 'border-positive/50 bg-positive/[0.07]',
  modified: 'border-caution/50 bg-caution/[0.07]',
  removed: 'border-critical/40 bg-critical/[0.06] opacity-70 line-through',
  same: 'border-line bg-raised/40 opacity-60',
}
const LABEL: Record<Change, string> = { added: 'added', modified: 'reopened', removed: 'removed', same: '' }

export function DesignDiffView({
  before,
  after,
  highlight,
}: {
  before: DesignModel
  after: DesignModel
  highlight: EvidenceRef | null
}) {
  const rows = classify(before, after)
  const lit = highlight?.kind === 'class' ? key(highlight.name) : null
  const counts = {
    added: rows.filter((r) => r.change === 'added').length,
    modified: rows.filter((r) => r.change === 'modified').length,
    removed: rows.filter((r) => r.change === 'removed').length,
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">What changed</h2>
        <div className="flex gap-1.5 text-[11px]">
          <span className="chip !py-0.5 !border-positive/40 !text-positive">{counts.added} added</span>
          <span className="chip !py-0.5 !border-caution/40 !text-caution">{counts.modified} reopened</span>
          {counts.removed > 0 && (
            <span className="chip !py-0.5 !border-critical/40 !text-critical">{counts.removed} removed</span>
          )}
        </div>
      </div>
      <motion.ul initial="hidden" animate="show" variants={stagger} className="grid gap-1.5 p-4 sm:grid-cols-2">
        {rows.map((r) => (
          <motion.li
            key={`${r.change}:${r.name}`}
            variants={riseIn}
            id={`class-${key(r.name)}`}
            className={`rounded-xl border px-3 py-2 transition-shadow ${STYLE[r.change]} ${
              lit === key(r.name) ? 'ring-2 ring-brand/50' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[13px] font-medium">{r.name}</span>
              {r.change !== 'same' && (
                <span className="text-[10px] uppercase tracking-wide text-ink-faint">{LABEL[r.change]}</span>
              )}
            </div>
            {r.fields.length > 0 && (
              <p className="mt-0.5 text-[11px] text-ink-muted">{r.fields.join(' · ')}</p>
            )}
          </motion.li>
        ))}
      </motion.ul>
    </div>
  )
}
