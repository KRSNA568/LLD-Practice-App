import type { Metadata } from 'next'
import { Sora } from 'next/font/google'
import './globals.css'
import { IdentityGate } from '@/components/IdentityGate'
import { Shell } from '@/components/shell/Shell'

const sora = Sora({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--font-sora', display: 'swap' })

export const metadata: Metadata = {
  title: 'Deliberate — LLD practice',
  description: 'Practice Low-Level Design and get feedback anchored to evidence in your own submission.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sora.variable}>
      <body className="min-h-screen font-sans">
        <IdentityGate>
          <Shell>{children}</Shell>
        </IdentityGate>
      </body>
    </html>
  )
}
