'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, Logo } from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/Pills'
import { useIdentity } from '@/components/IdentityGate'
import { NAV, activeNav } from './nav'
import { SettingsMenu } from './SettingsMenu'
import { useCritiqueDot } from './useCritiqueDot'

/** The 128px beige rail: mark, six round buttons, then the gear and the avatar. */
export function Rail() {
  const pathname = usePathname() ?? '/'
  const active = activeNav(pathname)
  const dot = useCritiqueDot()
  const { learner } = useIdentity()

  return (
    <nav aria-label="Primary" className="panel sticky top-6 hidden h-[calc(100vh-48px)] w-32 flex-none flex-col items-center gap-4 pb-6 pt-[26px] lg:flex">
      <Link href="/" className="mb-2.5" aria-label="Dashboard"><Logo /></Link>
      {NAV.map((item) => {
        const on = item.id === active
        return (
          <Link key={item.id} href={item.href} aria-label={item.label} aria-current={on ? 'page' : undefined} title={item.label} className="relative">
            <span className={`grid h-16 w-16 place-items-center rounded-full border border-line transition-colors ${on ? 'bg-ink-strong' : 'bg-white hover:bg-soft'}`}>
              <Icon name={item.icon} size={22} stroke={on ? '#FFFFFF' : '#222222'} width={1.6} />
            </span>
            {item.id === 'critique' && dot && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-dot" aria-label="Warm-ups waiting" />}
          </Link>
        )
      })}
      <span className="min-h-6 flex-1" />
      <SettingsMenu />
      <Avatar name={learner.name} size={64} />
    </nav>
  )
}

/** The 84px bottom bar at phone width. */
export function MobileNav() {
  const pathname = usePathname() ?? '/'
  const active = activeNav(pathname)
  const dot = useCritiqueDot()
  return (
    <nav aria-label="Primary" className="fixed inset-x-4 bottom-4 z-30 flex h-[84px] items-center justify-around rounded-[28px] bg-panel px-3 lg:hidden">
      {NAV.filter((n) => ['critique', 'home', 'learn', 'progress', 'history'].includes(n.id)).map((item) => {
        const on = item.id === active
        return (
          <Link key={item.id} href={item.href} aria-label={item.label} aria-current={on ? 'page' : undefined} className="relative">
            <span className={`grid h-[52px] w-[52px] place-items-center rounded-full ${on ? 'bg-ink-strong' : 'bg-white'}`}>
              <Icon name={item.icon} size={20} stroke={on ? '#FFFFFF' : '#222222'} width={1.6} />
            </span>
            {item.id === 'critique' && dot && <span className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-dot" />}
          </Link>
        )
      })}
    </nav>
  )
}
