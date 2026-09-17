/**
 * The design's vocabulary, as functions: which pastel a card gets, which tint a
 * band is, how a concept abbreviates, how a number reads in a headline.
 * Everything here is deterministic so a card is the same colour every visit.
 */

export const PASTELS = ['pink', 'peach', 'lav', 'mint'] as const
export type Pastel = (typeof PASTELS)[number]

export const PASTEL_HEX: Record<Pastel, string> = { pink: '#F5C6C8', peach: '#F8D9B7', lav: '#D8D3F6', mint: '#BCEAD4' }
export const PASTEL_DEEP: Record<Pastel, string> = { pink: '#EFA8AD', peach: '#F4C48F', lav: '#C9C2F0', mint: '#A6E0C4' }
export const PASTEL_BG: Record<Pastel, string> = { pink: 'bg-blush', peach: 'bg-apricot', lav: 'bg-lilac', mint: 'bg-mint' }

export const CHIP_TINTS = ['#C9767D', '#C98F4E', '#6F68B8', '#4E9E77'] as const

/** The i-th thing in a list gets the i-th pastel, round-robin. */
export function pastelAt(i: number): Pastel {
  return PASTELS[((i % 4) + 4) % 4]!
}

/**
 * A band is the integer a score sits in. 4 is mint, 3 lavender, 2 peach, and 1
 * (or 0) pink. The star marks anything from 3.5 up. Floor, not round: a 2.6 is
 * in band 2 and should look like it.
 */
export function bandOf(score: number): 1 | 2 | 3 | 4 {
  const b = Math.floor(score)
  return (b >= 4 ? 4 : b >= 3 ? 3 : b >= 2 ? 2 : 1) as 1 | 2 | 3 | 4
}
export const BAND_PASTEL: Record<1 | 2 | 3 | 4, Pastel> = { 4: 'mint', 3: 'lav', 2: 'peach', 1: 'pink' }
export function bandPastel(score: number): Pastel {
  return BAND_PASTEL[bandOf(score)]
}
export function starred(score: number): boolean {
  return score >= 3.5
}
/** "Band 3.2" for an average, "Band 3" for a single criterion score. */
export function bandLabel(score: number, decimals = 1): string {
  return `Band ${Number.isInteger(score) && decimals === 1 && score === Math.round(score) ? score.toFixed(1) : score.toFixed(decimals)}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const second = parts.length > 1 ? parts[parts.length - 1]![0] : parts[0]?.[1] ?? ''
  return (first + (second ?? '')).toUpperCase()
}

/** Two letters for a concept avatar: "Cohesion" → "Co", "Open/Closed" → "Op". */
export function abbrev(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, '')
  return (letters[0] ?? '').toUpperCase() + (letters[1] ?? '').toLowerCase()
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
/** "Fourteen", "Twenty-two". Digits past ninety-nine. */
export function numberWord(n: number): string {
  if (n < 0 || !Number.isInteger(n)) return String(n)
  if (n < 20) return cap(ONES[n]!)
  if (n < 100) return cap(TENS[Math.floor(n / 10)]! + (n % 10 ? '-' + ONES[n % 10] : ''))
  return String(n)
}
function cap(s: string): string {
  return s[0]!.toUpperCase() + s.slice(1)
}

/** "3.5h" / "48m" / "0m". */
export function hoursLabel(seconds: number): string {
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  const h = seconds / 3600
  return `${h < 10 ? h.toFixed(1) : Math.round(h)}h`
}

export function minutesSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
}

/** "18 min", "1h 12m", "3 days" — an attempt's length or age. */
export function durationLabel(seconds: number): string {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'}`
}

/** "today", "2 days ago", "3 weeks ago". */
export function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  const w = Math.floor(days / 7)
  if (w < 5) return `${w} week${w === 1 ? '' : 's'} ago`
  const mo = Math.floor(days / 30)
  return `${mo} month${mo === 1 ? '' : 's'} ago`
}

export const TIER_WORD: Record<number, string> = { 1: 'Gentle', 2: 'Steady', 3: 'Demanding', 4: 'Hard' }
