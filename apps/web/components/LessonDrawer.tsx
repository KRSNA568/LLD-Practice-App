'use client'

import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { MicroLesson } from '@lld/contracts'

/**
 * A side drawer for a two-minute lesson. Opens on request from a low-scoring
 * criterion, never automatically: the point is that the learner has just seen the
 * contrast in their own design and is now ready to be told.
 */
export function LessonDrawer({
  open,
  title,
  lesson,
  loading,
  failed,
  onClose,
}: {
  open: boolean
  title: string
  lesson: (MicroLesson & { modelId: string }) | null
  loading: boolean
  failed: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            aria-label="Close lesson"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px]"
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-line bg-surface p-6 shadow-lift"
          >
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-judged/15 text-[12px] text-judged" aria-hidden>
                ◈
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-judged">Lesson</span>
              <button onClick={onClose} className="ml-auto rounded-lg px-2 py-1 text-sm text-ink-muted hover:bg-raised hover:text-ink">
                ✕
              </button>
            </div>

            <h2 className="mt-3 text-[20px] font-semibold tracking-tight">{lesson?.title ?? title}</h2>

            {loading && (
              <div className="mt-4 space-y-2">
                <div className="skeleton h-3.5 w-full" />
                <div className="skeleton h-3.5 w-11/12" />
                <div className="skeleton h-3.5 w-3/4" />
                <div className="skeleton mt-6 h-24 w-full" />
              </div>
            )}

            {failed && !loading && (
              <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">
                The mentor could not write this one just now. The finding on the card still stands; try again in a moment.
              </p>
            )}

            {lesson && !loading && (
              <>
                <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed">{lesson.body}</p>
                <div className="mt-6 space-y-3">
                  <div className="rounded-xl border border-critical/25 bg-critical/[0.05] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-critical">In your design now</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed">{lesson.example.before}</p>
                  </div>
                  <div className="rounded-xl border border-positive/25 bg-positive/[0.05] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-positive">Restructured</p>
                    <p className="mt-1.5 text-[13px] leading-relaxed">{lesson.example.after}</p>
                  </div>
                </div>
                <p className="mt-6 text-[11px] text-ink-faint">
                  Written by {lesson.modelId.startsWith('stub') ? 'a stand-in (no model configured)' : lesson.modelId}. Every class
                  it names is one you wrote.
                </p>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
