import { useEffect } from 'react';

export type Hotkey = {
  key: string;             // e.g. 'k', '1', 'Enter', 'Escape'
  code?: string;           // physical key, e.g. 'Digit1' — matched instead of `key` when set
  meta?: boolean;          // Cmd/Ctrl
  shift?: boolean;
  alt?: boolean;
  description?: string;
  handler: (e: KeyboardEvent) => void;
  // If true, fire even when typing inside an input
  allowInInputs?: boolean;
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

function matches(e: KeyboardEvent, h: Hotkey): boolean {
  // Cmd on macOS, Ctrl elsewhere — unified
  const meta = isMac ? e.metaKey : e.ctrlKey;
  if (!!h.meta !== meta) return false;
  if (!!h.shift !== e.shiftKey) return false;
  if (!!h.alt !== e.altKey) return false;
  // Option/Alt combos change e.key on macOS (Option+1 → '¡'), so match the
  // physical key when a code is given.
  if (h.code) return e.code === h.code;
  return e.key.toLowerCase() === h.key.toLowerCase();
}

export function useHotkeys(hotkeys: Hotkey[], enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      for (const h of hotkeys) {
        if (!matches(e, h)) continue;
        if (inEditable && !h.allowInInputs) continue;
        h.handler(e);
        // Only prevent default if not in editable (we want Tab to still work normally)
        if (!inEditable || h.allowInInputs) e.preventDefault();
        break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeys, enabled]);
}

// Tiny classnames helper
export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');
