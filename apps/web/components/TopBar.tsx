'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { applyTheme, readThemeChoice, type ThemeChoice } from '@/lib/theme'
import { useIdentity } from '@/components/IdentityGate'

const CHOICES: Array<{ value: ThemeChoice; label: string; glyph: string }> = [
  { value: 'light', label: 'Light', glyph: '☀' },
  { value: 'system', label: 'System', glyph: '◐' },
  { value: 'dark', label: 'Dark', glyph: '☾' },
]

/**
 * The four places a learner goes. Dashboard is where you are; Learn is what you
 * can do; Concepts is why; Progress is how it is going. Practice and report pages
 * hang off Learn and are reached from cards, never from here.
 */
const NAV: Array<{ href: string; label: string; match: (p: string) => boolean }> = [
  { href: '/', label: 'Dashboard', match: (p) => p === '/' },
  { href: '/learn', label: 'Learn', match: (p) => p.startsWith('/learn') || p.startsWith('/practice') || p.startsWith('/report') || p.startsWith('/critique') || p.startsWith('/history') },
  { href: '/concepts', label: 'Concepts', match: (p) => p.startsWith('/concepts') },
  { href: '/progress', label: 'Progress', match: (p) => p.startsWith('/progress') },
]

export function TopBar() {
  const pathname = usePathname()
  const { learner, switchLearner } = useIdentity()
  const [choice, setChoice] = useState<ThemeChoice>('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setChoice(readThemeChoice())
    setMounted(true)
  }, [])

  // Following the system means following it as it changes, not only at load.
  useEffect(() => {
    if (choice !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [choice])

  function pick(next: ThemeChoice) {
    setChoice(next)
    applyTheme(next)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-5 py-3">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-[15px] font-bold text-white shadow-soft">
            D
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Deliberate</span>
          <span className="hidden text-xs text-ink-faint md:inline">learn design by doing</span>
        </Link>

        <nav className="ml-2 flex items-center gap-0.5 overflow-x-auto">
          {NAV.map((item) => {
            const active = item.match(pathname ?? '')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active ? 'text-ink' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-lg bg-raised"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Who this is, and the way a facilitator hands the keyboard to the next person. */}
        <div className="ml-auto hidden items-center gap-2 text-xs text-ink-muted sm:flex">
          <span className="max-w-[140px] truncate" title={learner.name}>{learner.name}</span>
          <button onClick={switchLearner} className="btn-quiet !px-2 !py-1 !text-xs" title="Switch to a different learner on this device">
            Switch
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 sm:ml-0 ml-auto">
          {CHOICES.map((option) => {
            const active = mounted && choice === option.value
            return (
              <button
                key={option.value}
                onClick={() => pick(option.value)}
                aria-label={`${option.label} theme`}
                aria-pressed={active}
                className="relative rounded-lg px-2.5 py-1 text-xs text-ink-muted transition-colors hover:text-ink"
              >
                {active && (
                  <motion.span
                    layoutId="theme-pill"
                    className="absolute inset-0 rounded-lg bg-raised"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className={`relative ${active ? 'text-ink' : ''}`}>{option.glyph}</span>
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}
