'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SettingsMenu } from './SettingsMenu'
import { Avatar } from '@/components/ui/Pills'
import { useIdentity } from '@/components/IdentityGate'

/**
 * The 480px right panel. Each page declares its panel content with <Panel>;
 * it is portalled into the layout's slot so pages stay self-contained and the
 * column is the same on every route. Below the desktop breakpoint the slot
 * sits under the main column instead.
 */
export function Panel({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => { setSlot(document.getElementById('panel-slot')) }, [])
  return slot ? createPortal(children, slot) : null
}

/**
 * The panel's top row. The design shows a bell and a gear; there is nothing to
 * notify about yet, so only the gear is here — a bell that never rings would be
 * a promise, not a feature.
 */
export function PanelHeader() {
  return (
    <div className="flex items-center justify-end px-1.5 py-1">
      <SettingsMenu size={24} tone="plain" />
    </div>
  )
}

/** Avatar, name, and an optional line beneath. */
export function PanelIdentity({ sub }: { sub?: ReactNode }) {
  const { learner } = useIdentity()
  return (
    <div className="flex flex-col items-center gap-3">
      <Avatar name={learner.name} size={80} />
      <span className="text-[24px] font-medium leading-none tracking-[-0.02em] text-ink-strong">{learner.name}</span>
      {sub && <span className="text-[14px] leading-none text-muted">{sub}</span>}
    </div>
  )
}
