import { useEffect } from 'react';

export type Hotkey = {
  key: string;             // e.g. 'k', '1', 'Enter', 'Escape'
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
  return e.key.toLowerCase() === h.key.toLowerCase();
}

export function useHotkeys(hotkeys: Hotkey[]) {
  useEffect(() => {
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
  }, [hotkeys]);
}

// Tiny classnames helper
export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');
