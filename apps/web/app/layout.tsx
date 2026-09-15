import type { Metadata } from 'next'
import './globals.css'
import { THEME_BOOTSTRAP } from '@/lib/theme'
import { TopBar } from '@/components/TopBar'
import { IdentityGate } from '@/components/IdentityGate'

export const metadata: Metadata = {
  title: 'Deliberate — LLD practice',
  description:
    'Practice Low-Level Design and get feedback anchored to evidence in your own submission.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applies the stored theme before first paint, so there is no flash of
            the wrong one on load. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen">
        <IdentityGate>
          <TopBar />
          <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-6">{children}</main>
        </IdentityGate>
      </body>
    </html>
  )
}
