import type { IconName } from '@/components/ui/Icon'

/**
 * The six places on the rail, in the design's order. Practice pages hang off
 * Learn; the report hangs off History — that is where the design put the
 * active mark, and it is where a learner would look for a past report.
 */
export type NavId = 'critique' | 'home' | 'learn' | 'concepts' | 'progress' | 'history'

export const NAV: Array<{ id: NavId; href: string; label: string; icon: IconName }> = [
  { id: 'critique', href: '/critique', label: 'Critique', icon: 'critique' },
  { id: 'home', href: '/', label: 'Dashboard', icon: 'home' },
  { id: 'learn', href: '/learn', label: 'Learn', icon: 'learn' },
  { id: 'concepts', href: '/concepts', label: 'Concepts', icon: 'concepts' },
  { id: 'progress', href: '/progress', label: 'Progress', icon: 'progress' },
  { id: 'history', href: '/history', label: 'History', icon: 'history' },
]

export function activeNav(pathname: string): NavId {
  if (pathname.startsWith('/critique')) return 'critique'
  if (pathname.startsWith('/learn') || pathname.startsWith('/practice')) return 'learn'
  if (pathname.startsWith('/concepts')) return 'concepts'
  if (pathname.startsWith('/progress')) return 'progress'
  if (pathname.startsWith('/history') || pathname.startsWith('/report')) return 'history'
  return 'home'
}

/** The mobile bar has five slots; the design leaves Concepts to the desktop rail. */
export const MOBILE_NAV: NavId[] = ['critique', 'home', 'learn', 'progress', 'history']
