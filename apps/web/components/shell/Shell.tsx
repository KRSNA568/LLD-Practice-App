'use client'

import type { ReactNode } from 'react'
import { MobileNav, Rail } from './Rail'
import { Logo } from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/Pills'
import { useIdentity } from '@/components/IdentityGate'

/**
 * Rail · main · panel, 24px apart on a 24px inset, as every artboard is laid
 * out. At phone width the rail becomes the bottom bar, the panel stacks under
 * the main column, and the top row is the mark and the avatar.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { learner } = useIdentity()
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px] gap-6 p-4 pb-32 sm:p-6 lg:pb-6">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col gap-6 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col lg:pl-4 lg:pt-5">
          <div className="mb-5 flex items-center justify-between lg:hidden">
            <Logo size={26} />
            <Avatar name={learner.name} size={44} />
          </div>
          <main className="flex min-w-0 flex-1 flex-col gap-7">{children}</main>
        </div>
        <aside id="panel-slot" className="panel flex w-full flex-none flex-col gap-5 self-start p-6 xl:sticky xl:top-6 xl:max-h-[calc(100vh-48px)] xl:w-[480px] xl:overflow-y-auto" />
      </div>
      <MobileNav />
    </div>
  )
}
