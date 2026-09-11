'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { applyTheme, readThemeChoice, type ThemeChoice } from '@/lib/theme'

const CHOICES: Array<{ value: ThemeChoice; label: string; glyph: string }> = [
  { value: 'light', label: 'Light', glyph: '☀' },
  { value: 'system', label: 'System', glyph: '◐' },
  { value: 'dark', label: 'Dark', glyph: '☾' },
]

export function TopBar() {
  const pathname = usePathname()
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
          <span className="hidden text-xs text-ink-faint sm:inline">LLD practice</span>
        </Link>

        <nav className="ml-2 hidden items-center gap-1 sm:flex">
          <NavLink href="/" active={pathname === '/'}>
            Problems
          </NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-1 rounded-xl border border-line bg-surface p-1">
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

function NavLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
        active ? 'bg-raised text-ink' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {children}
    </Link>
  )
}
