/**
 * Theme resolution.
 *
 * Three states, not two: explicit light, explicit dark, and "follow the system",
 * which is the default. The inline script in the layout applies the stored choice
 * before first paint so there is no flash of the wrong theme.
 */
export type ThemeChoice = 'light' | 'dark' | 'system'

export const THEME_KEY = 'lld-theme'

/** Runs before hydration. Kept dependency-free and tiny on purpose. */
export const THEME_BOOTSTRAP = `
(function(){
  try {
    var stored = localStorage.getItem('${THEME_KEY}');
    var dark = stored === 'dark' ||
      ((!stored || stored === 'system') &&
       window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`.trim()

export function applyTheme(choice: ThemeChoice): void {
  const dark =
    choice === 'dark' ||
    (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  try {
    localStorage.setItem(THEME_KEY, choice)
  } catch {
    /* private mode — the theme still applies for this session */
  }
}

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    /* ignore */
  }
  return 'system'
}
