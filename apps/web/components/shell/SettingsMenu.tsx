'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Icon } from '@/components/ui/Icon'
import { useIdentity } from '@/components/IdentityGate'

/**
 * Behind the gear: who this is, and the way to hand the keyboard to someone
 * else. That is the whole settings surface today. There is no theme switch
 * because the design has one look.
 */
export function SettingsMenu({ size = 64, tone = 'white' }: { size?: 24 | 64; tone?: 'white' | 'plain' }) {
  const { learner, switchLearner } = useIdentity()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={size === 64 ? 'grid h-16 w-16 place-items-center rounded-full border border-line bg-white transition-colors hover:bg-soft' : 'grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-white'}
      >
        <Icon name="gear" size={size === 64 ? 22 : 24} stroke={size === 64 ? '#6E6E6E' : '#222222'} width={1.6} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            role="menu"
            className={`absolute z-40 w-64 rounded-3xl border border-soft bg-white p-4 shadow-lift ${tone === 'white' && size === 64 ? 'bottom-0 left-[72px]' : 'right-0 top-10'}`}
          >
            <span className="block text-[12px] leading-none text-muted">Practising as</span>
            <span className="mt-1.5 block truncate text-[16px] font-medium leading-tight text-ink-strong">{learner.name}</span>
            <button type="button" role="menuitem" onClick={switchLearner} className="btn-secondary btn-xs mt-4 w-full">
              Switch learner
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
