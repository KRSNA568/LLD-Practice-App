'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'

/**
 * A problem card is the whole affordance in the design — there is no detail
 * page between the catalogue and the workspace. This route is that click: it
 * resumes the attempt already open on this problem, or starts a new one, and
 * goes to the workspace. It shows for as long as that takes.
 */
export default function StartProblem() {
  const { problemId } = useParams<{ problemId: string }>()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const history = await api.getHistory(problemId)
        const open = history.attempts.find((a) => a.state === 'DRAFT' || a.state === 'COMPLETED' || a.state === 'COMPLETED_PARTIAL')
        const resumable = open && !(open.stage === 'defend' && open.state !== 'DRAFT') ? open : undefined
        if (resumable) {
          router.replace(`/practice/${resumable.id}`)
          return
        }
        const { attempt } = await api.startAttempt(problemId)
        if (alive) router.replace(`/practice/${attempt.id}`)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not start')
      }
    })()
    return () => { alive = false }
  }, [problemId, router])

  return (
    <div className="flex flex-col gap-4">
      <span className="h-section">{error ? 'Could not start' : 'Opening the workspace…'}</span>
      {error ? <p className="text-[14px] text-tint-rose">{error}</p> : <span className="h-16 w-1/2 rounded-full bg-panel" />}
    </div>
  )
}
