'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

/**
 * The pink dot on the critique glyph. It means: a problem you have already
 * attempted still has warm-up pairs you have not answered. A first visitor has
 * nothing attempted, so no dot — which is the state the design shows.
 */
export function useCritiqueDot(): boolean {
  const [dot, setDot] = useState(false)
  useEffect(() => {
    let alive = true
    api.listProblems()
      .then(({ problems }) => {
        if (!alive) return
        setDot(problems.some((p) => p.attemptCount > 0 && p.critiquesAnswered < p.critiquePairCount))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])
  return dot
}
