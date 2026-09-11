/** Small shared text helpers for the deterministic checks. Kept in one place so that
 *  "does this design mention X" means the same thing in every check. */

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','by','can','for','from','has','have','in','is','it','its',
  'of','on','or','that','the','their','them','they','this','to','when','with','which','only','be',
  'system','support','supported','supports','should','must','each','some','all','any','one','two',
  'three','later','after','before','into','out','up','down','same','different','via','per',
])

export function normalise(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Splits CamelCase and snake_case so `PricingStrategy` matches the word "pricing". */
export function words(input: string): string[] {
  return normalise(input.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' '))
    .split(' ')
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

/** Crude but predictable stemming — enough to match "pricing" against "price". */
export function stem(word: string): string {
  return word
    .replace(/(ies)$/, 'y')
    .replace(/(ing|ed|es|s)$/, '')
}

export function stems(input: string): Set<string> {
  return new Set(words(input).map(stem))
}

export function overlaps(needleStems: Set<string>, haystack: string): boolean {
  const hay = stems(haystack)
  for (const s of needleStems) if (hay.has(s)) return true
  return false
}

export function containsAny(haystack: string, hints: readonly string[]): boolean {
  const hay = normalise(haystack.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
  return hints.some((h) => hay.includes(normalise(h)))
}

/**
 * Counts distinct responsibility clauses in a sentence.
 *
 * "Manages floors and finds spots and calculates fees" is three jobs wearing one
 * class name. Splitting on conjunctions and commas is imperfect but it is honest
 * about what it measures, and it matches how a reviewer reads the sentence.
 */
export function responsibilityClauses(responsibility: string): string[] {
  return responsibility
    .split(/\s*(?:,|;|\band\b|\balso\b|\bplus\b|\bas well as\b|\/)\s*/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 2)
}

/** Number of distinct action verbs, as a second opinion on clause counting. */
export function actionVerbs(responsibility: string): string[] {
  const VERB_HINT = /(manag|handl|process|creat|calculat|comput|find|search|assign|allocat|generat|print|validat|persist|stor|sav|updat|delet|remov|add|track|monitor|notif|send|receiv|book|reserv|cancel|pay|charg|dispens|park|schedul|rout|render|format|pars|convert|check|verif)/i
  const found = new Set<string>()
  for (const w of normalise(responsibility.replace(/([a-z0-9])([A-Z])/g, '$1 $2')).split(' ')) {
    const m = VERB_HINT.exec(w)
    if (m) found.add(m[1]!.toLowerCase())
  }
  return [...found]
}

/**
 * Every token a design exposes for keyword matching: camel-split words *and* the
 * unsplit identifier, so `freeSpot` answers to both "free" and "freespot".
 */
export function surfaceTokens(input: string): Set<string> {
  const out = new Set<string>()
  for (const raw of input.split(/[^A-Za-z0-9_]+/)) {
    if (!raw) continue
    out.add(raw.toLowerCase().replace(/_/g, ''))
    for (const w of raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().split(' ')) {
      if (w) out.add(w)
    }
  }
  return out
}

/**
 * Does any authored keyword appear among the tokens? A keyword matches a token when
 * their stems agree ("fee" ~ "fees") or when the token starts with a keyword of at
 * least four letters ("allocat" ~ "allocator", "find" ~ "finds") — short keywords
 * match exactly, so "car" never matches "card".
 */
export function mentionsAny(tokens: ReadonlySet<string>, keywords: readonly string[]): boolean {
  for (const k of keywords) {
    const key = normalise(k).replace(/\s+/g, '')
    if (!key) continue
    const keyStem = stem(key)
    for (const t of tokens) {
      if (t === key || stem(t) === keyStem) return true
      if (key.length >= 4 && t.startsWith(key)) return true
    }
  }
  return false
}
