'use client'

import { motion } from 'framer-motion'
import { riseIn, stagger } from './motion'

export type Stat = { label: string; value: string | number; hint?: string }

/** Four numbers in a row. Numbers are context, not the point, so they stay quiet. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <motion.ul initial="hidden" animate="show" variants={stagger} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <motion.li key={s.label} variants={riseIn} className="card list-none px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">{s.label}</p>
          <p className="mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight">{s.value}</p>
          {s.hint && <p className="text-[11px] text-ink-faint">{s.hint}</p>}
        </motion.li>
      ))}
    </motion.ul>
  )
}
