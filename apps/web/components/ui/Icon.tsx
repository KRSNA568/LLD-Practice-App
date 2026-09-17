/**
 * Every glyph in the design, as its path. 24-unit box, stroked, round caps; the
 * colour comes from `stroke` (defaults to currentColor) so a tinted chip and a
 * black rail share one drawing.
 */
export const ICON_PATHS = {
  // rail
  critique: 'M4 4h11v11H4z M9 9h11v11H9z',
  home: 'M4 11 12 4l8 7v9H4z',
  learn: 'M5 4h9a2 2 0 012 2v14H7a2 2 0 00-2 2z M19 6v14',
  concepts: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  progress: 'M4 20h16 M7.5 17v-5 M12 17V7 M16.5 17v-8',
  history: 'M12 4a8 8 0 100 16 8 8 0 000-16 M12 8v4l3 2',
  // categories
  all: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  structure: 'M12 3 4 8v8l8 5 8-5V8z M12 3v18 M4 8l8 5 8-5',
  behaviour: 'M4 6h6v5H4z M14 13h6v5h-6z M10 8.5h4v7',
  change: 'M4 7h11l-3-3 M20 17H9l3 3',
  rationale: 'M12 4v16 M6 8h12 M6 8 3 14h6z M18 8l-3 6h6z',
  concurrency: 'M5 6h14 M5 12h14 M5 18h14 M9 3v6 M15 15v6',
  state: 'M7 5a4 4 0 100 8h10a4 4 0 110 8H7',
  lock: 'M6 11h12v9H6z M9 11V8a3 3 0 016 0v3',
  layers: 'M12 4 3 9l9 5 9-5z M3 15l9 5 9-5',
  clock: 'M12 4a8 8 0 100 16 8 8 0 000-16 M12 8v4l3 2',
  // chrome
  bell: 'M6 17h12l-1.5-3v-3a4.5 4.5 0 10-9 0v3z M10 20h4',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6 M12 3v3 M12 18v3 M3 12h3 M18 12h3 M6.2 6.2l2.1 2.1 M15.7 15.7l2.1 2.1 M17.8 6.2l-2.1 2.1 M8.3 15.7l-2.1 2.1',
  flame: 'M12 3c4 5 3 6 3 8a3 3 0 11-6 0c0-3 3-3 3-8z',
  chevron: 'M9 6l6 6-6 6',
  chevdown: 'M6 9l6 6 6-6',
  check: 'M5 12l4 4 10-10',
  bookmark: 'M12 4a5 5 0 100 10 5 5 0 000-10 M9.5 13.5 8 20l4-2.4 4 2.4-1.5-6.5',
  info: 'M12 8v5 M12 16.5v.5 M12 4a8 8 0 100 16 8 8 0 000-16',
  plus: 'M12 5v14 M5 12h14',
  close: 'M6 6l12 12 M18 6L6 18',
  back: 'M15 6l-6 6 6 6',
} as const
export type IconName = keyof typeof ICON_PATHS

export const STAR_PATH = 'M12 4l2.4 5 5.6.6-4.2 3.8 1.2 5.6L12 16.2 7 19l1.2-5.6L4 9.6l5.6-.6z'

export function Icon({
  name,
  size = 20,
  stroke = 'currentColor',
  width = 1.7,
  className,
}: {
  name: IconName
  size?: number
  stroke?: string
  width?: number
  className?: string
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICON_PATHS[name]} />
    </svg>
  )
}

/** The band star: filled amber at 3.5 and up, an outline otherwise. */
export function Star({ filled, size = 13 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#F2A93B' : 'none'} stroke={filled ? 'none' : '#C9C2BA'} strokeWidth={1.6} aria-hidden>
      <path d={STAR_PATH} />
    </svg>
  )
}

/** The mark: a triangle with a dot. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Deliberate">
      <path d="M4 20 12 4l8 16z" fill="#111111" />
      <circle cx="12" cy="15" r="2.4" fill="#FBF8F5" />
    </svg>
  )
}

/** Which glyph a concept wears, by what it is about. */
export const CONCEPT_ICON: Record<string, IconName> = {
  encapsulation: 'lock',
  abstraction: 'layers',
  cohesion: 'all',
  coupling: 'change',
  'association-modeling': 'structure',
  'domain-modeling': 'all',
  srp: 'all',
  'interface-design': 'layers',
  polymorphism: 'behaviour',
  'open-closed': 'change',
  lsp: 'layers',
  isp: 'layers',
  dip: 'structure',
  'composition-over-inheritance': 'structure',
  'state-modeling': 'state',
  immutability: 'lock',
  'error-modeling': 'behaviour',
  testability: 'rationale',
  extensibility: 'change',
  'concurrency-safety': 'concurrency',
  collaboration: 'behaviour',
  'design-rationale': 'rationale',
}
export function conceptIcon(id: string): IconName {
  return CONCEPT_ICON[id] ?? 'all'
}
