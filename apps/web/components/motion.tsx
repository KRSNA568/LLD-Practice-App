'use client'

import { motion, type Variants } from 'framer-motion'

/**
 * Shared motion vocabulary.
 *
 * The rule everywhere: motion explains what changed. A card rises as it lands so
 * you can see it arrived; a number counts so you can see it moved; a highlight
 * pulses so your eye finds the class being discussed. Nothing animates just to
 * look expensive, and nothing runs long enough to slow down a repeat visit.
 */

/** Physical rather than linear — things settle, they do not stop dead. */
export const EASE = [0.22, 1, 0.36, 1] as const

export const riseIn: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
}

/** Feedback cards land one after another so the report reads as it arrives. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
}

export const MotionDiv = motion.div
export const MotionLi = motion.li
export const MotionSection = motion.section
