import type { Config } from 'tailwindcss'

/**
 * The reference tokens from the design: warm ground, beige panels, four rotating
 * pastels, black as the only accent. One look, no dark theme — the design defines
 * one, and a second one would be invented rather than designed.
 *
 * The old role names (`surface`, `ink-muted`, `positive`…) are kept as aliases
 * onto the new palette so nothing renders off-palette while screens are moved
 * over; new code uses the names in the first block.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.ts'],
  theme: {
    extend: {
      colors: {
        // ground and panels
        ground: '#FBF8F5',
        panel: '#F3ECE6',
        line: '#E8E1DA',
        soft: '#F1EEEA',
        skel: '#EAE2DA',
        dashed: '#C9C2BA',
        // ink
        ink: '#222222',
        'ink-strong': '#111111',
        'ink-2': '#3D3D3D',
        'ink-3': '#5C5C5C',
        muted: '#6E6E6E',
        faint: '#9A9A9A',
        'black-hover': '#2E2E2E',
        // the four pastels, and their two-tone partners
        blush: '#F5C6C8',
        'blush-deep': '#EFA8AD',
        apricot: '#F8D9B7',
        'apricot-deep': '#F4C48F',
        lilac: '#D8D3F6',
        'lilac-ring': '#EDEAFB',
        mint: '#BCEAD4',
        // accents
        dot: '#F07A8A',
        star: '#F2A93B',
        'tint-rose': '#C9767D',
        'tint-amber': '#C98F4E',
        'tint-violet': '#6F68B8',
        'tint-green': '#4E9E77',
        // aliases for components not yet moved over
        canvas: '#FBF8F5',
        surface: '#FFFFFF',
        raised: '#F1EEEA',
        'ink-muted': '#6E6E6E',
        'ink-faint': '#9A9A9A',
        brand: '#111111',
        'brand-soft': '#F1EEEA',
        positive: '#4E9E77',
        caution: '#C98F4E',
        critical: '#C9767D',
        machine: '#6F68B8',
        judged: '#6F68B8',
      },
      fontFamily: {
        sans: ['var(--font-sora)', 'Sora', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'Menlo', 'monospace'],
      },
      borderRadius: { md: '12px', lg: '14px', xl: '16px', '2xl': '20px', '3xl': '24px', '4xl': '32px' },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,.04)',
        lift: '0 2px 4px rgba(0,0,0,.06), 0 12px 32px rgba(0,0,0,.08)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-500px 0' }, '100%': { backgroundPosition: '500px 0' } },
      },
      animation: { shimmer: 'shimmer 1.6s linear infinite' },
    },
  },
  plugins: [],
}
export default config
