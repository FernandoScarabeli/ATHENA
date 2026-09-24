export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'athena.theme';

export function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme selection still applies for the current session when storage is unavailable.
  }
}
