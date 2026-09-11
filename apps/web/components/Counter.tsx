'use client'

import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

/**
 * A number that counts to its value.
 *
 * Worth the code because this product is about improvement over time: seeing 2.1
 * climb to 3.4 registers as movement in a way that rendering "3.4" never does.
 * Respects reduced-motion by snapping straight to the value.
 */
export function Counter({
  value,
  decimals = 1,
  className,
}: {
  value: number
  decimals?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const [display, setDisplay] = useState(reduced ? value : 0)
  const previous = useRef(reduced ? value : 0)

  useEffect(() => {
    if (reduced) {
      setDisplay(value)
      previous.current = value
      return
    }
    const controls = animate(previous.current, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(latest),
    })
    previous.current = value
    return () => controls.stop()
  }, [value, reduced])

  return <span className={className}>{display.toFixed(decimals)}</span>
}
