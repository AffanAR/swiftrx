// Light / dark theme. The colors live in shared.css as CSS variables, switched
// by `data-theme` on <html>. Each index.html runs a copy of `applyTheme` inline
// before first paint, so a reload doesn't flash the wrong theme.

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'swiftrx:theme';

/** The theme the user picked in this browser, or null to follow the OS. */
export function readStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function osTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function resolveTheme(): Theme {
  return readStoredTheme() ?? osTheme();
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

const listeners = new Set<() => void>();
let watchingOs = false;

function notify() {
  applyTheme(resolveTheme());
  listeners.forEach((l) => l());
}

/** Remembers the user's pick in this browser and applies it. */
export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked (private mode, policy): the pick lasts until reload.
    applyTheme(theme);
    listeners.forEach((l) => l());
    return;
  }
  notify();
}

/** For useSyncExternalStore: follows the OS setting until the user picks. */
export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  if (!watchingOs) {
    watchingOs = true;
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        if (!readStoredTheme()) notify();
      });
    } catch {
      // No matchMedia (old browser or tests): nothing to follow.
    }
  }
  return () => {
    listeners.delete(listener);
  };
}

/** The theme on <html> right now (what's on screen). */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}
