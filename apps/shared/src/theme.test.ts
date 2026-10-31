import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, currentTheme, readStoredTheme, resolveTheme, setTheme } from './theme';

// Node has no DOM: stub just what theme.ts touches.
let store: Map<string, string>;
let osLight: boolean;
let root: { dataset: Record<string, string>; style: Record<string, string> };

beforeEach(() => {
  store = new Map();
  osLight = false;
  root = { dataset: {}, style: {} };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: osLight, addEventListener: () => {} }),
  });
  vi.stubGlobal('document', { documentElement: root });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('theme', () => {
  it('follows the OS until the user picks', () => {
    expect(resolveTheme()).toBe('dark');
    osLight = true;
    expect(resolveTheme()).toBe('light');
  });

  it('remembers the pick and applies it to <html>', () => {
    osLight = true;
    setTheme('dark');
    expect(store.get(THEME_STORAGE_KEY)).toBe('dark');
    expect(resolveTheme()).toBe('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(currentTheme()).toBe('dark');
  });

  it('ignores junk in storage', () => {
    store.set(THEME_STORAGE_KEY, 'sepia');
    expect(readStoredTheme()).toBeNull();
  });

  it('still switches when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(readStoredTheme()).toBeNull();
    setTheme('light');
    expect(currentTheme()).toBe('light');
  });
});
