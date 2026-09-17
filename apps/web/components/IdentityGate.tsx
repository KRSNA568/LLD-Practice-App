'use client'

import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { Logo } from '@/components/ui/Icon'
import { clearLearner, readLearner, storeLearner, type Learner } from '@/lib/identity'

/**
 * Who is using this browser, asked once.
 *
 * Deliberately a name and nothing else: this exists so six study participants on
 * one instance keep their attempts apart, and so a facilitator can switch between
 * them from the top bar without clearing storage by hand. It is not sign-in and
 * does not pretend to be. Real accounts replace this in Phase 4.
 */

type IdentityValue = { learner: Learner; switchLearner: () => void }
const IdentityContext = createContext<IdentityValue | null>(null)

export function useIdentity(): IdentityValue {
  const value = useContext(IdentityContext)
  if (!value) throw new Error('useIdentity must be used inside IdentityGate')
  return value
}

export function IdentityGate({ children }: { children: ReactNode }) {
  // `undefined` until the browser has been asked; `null` when nobody is stored.
  const [learner, setLearner] = useState<Learner | null | undefined>(undefined)

  useEffect(() => {
    const stored = readLearner()
    setLearner(stored)
    // A learner stored before `createdAt` existed: fill it in from the API once.
    if (stored && !stored.createdAt) {
      api.me().then(({ learner }) => { storeLearner(learner); setLearner(learner) }).catch(() => {})
    }
  }, [])

  function switchLearner() {
    clearLearner()
    setLearner(null)
  }

  if (learner === undefined) return null
  if (learner === null) return <NamePrompt onDone={(l) => { storeLearner(l); setLearner(l) }} />
  return <IdentityContext.Provider value={{ learner, switchLearner }}>{children}</IdentityContext.Provider>
}

function NamePrompt({ onDone }: { onDone: (learner: Learner) => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      const { learner } = await api.createLearner(trimmed)
      onDone(learner)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start a session')
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ground px-5">
      <motion.form
        onSubmit={submit}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex w-full max-w-[440px] flex-col rounded-4xl bg-panel p-8"
      >
        <Logo size={28} />
        <h1 className="mt-6 text-[28px] font-medium leading-[1.2] tracking-[-0.02em] text-ink-strong">What should we call you?</h1>
        <p className="mt-3 text-[14px] leading-[1.55] text-muted">
          Your attempts and progress are kept under this name on this device. No password, no email — this is a practice space, not an account.
        </p>
        <label className="mt-6 block">
          <span className="sr-only">Your name</span>
          <input autoFocus className="field" placeholder="Your name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>
        {error && <p className="mt-2 text-[13px] text-tint-rose">{error}</p>}
        <button type="submit" className="btn-primary mt-4 w-full" disabled={busy || !name.trim()}>
          {busy ? 'Starting…' : 'Start practising'}
        </button>
      </motion.form>
    </div>
  )
}

