'use client'

import { AnimatePresence, motion } from 'framer-motion'

/** The black pill toast. No undo — nothing here can be undone, so the design's "Undo" is not offered. */
export function Toast({ text, detail }: { text: string | null; detail?: string }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex h-[60px] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 items-center gap-3 rounded-full bg-ink-strong px-5"
        >
          <span className="text-[14px] font-medium leading-none text-white">{text}</span>
          <span className="flex-1" />
          {detail && <span className="text-[13px] leading-none text-faint">{detail}</span>}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
