import React from 'react';
import { Kbd, cx } from '@swiftrx/shared';
import { useApp, actions, MIN_OVERRIDE_REASON } from '../store';
import { signAndPrint } from '../print';

/**
 * Opens when Sign & Print hits critical safety alerts (allergies). The doctor
 * must record a reason to sign anyway; it is stored on the signed Rx and in
 * the audit log. Esc cancels, Cmd/Ctrl+Enter signs.
 */
export function SafetyOverrideModal() {
  const alerts = useApp((s) => s.overridePrompt);
  const open = alerts !== null;
  const [reason, setReason] = React.useState('');
  const reasonRef = React.useRef<HTMLTextAreaElement>(null);
  // Latest confirm handler, so the window listener below never sees a stale reason.
  const confirmRef = React.useRef<() => void>(() => {});

  React.useEffect(() => {
    if (open) {
      setReason('');
      requestAnimationFrame(() => reasonRef.current?.focus());
    }
  }, [open]);

  // Capture phase + stopPropagation keeps Esc / Cmd+Enter away from the
  // workspace hotkeys (Esc = clear pad, Cmd+Enter = Sign & Print).
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        actions.cancelOverride();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        confirmRef.current();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open]);

  if (!alerts) return null;

  const trimmed = reason.trim();
  const canSign = trimmed.length >= MIN_OVERRIDE_REASON;
  const confirm = () => {
    if (canSign) signAndPrint(trimmed);
  };
  confirmRef.current = confirm;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/70 backdrop-blur-sm animate-fadeIn"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) actions.cancelOverride();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="override-title"
    >
      <div className="w-[min(560px,92vw)] rounded-xl border border-rx-danger/50 bg-ink-800 shadow-2xl">
        <div className="px-5 py-3 border-b border-ink-700">
          <h3 id="override-title" className="text-base font-semibold tracking-tight text-rx-danger">
            ⚠ Critical alert — override required
          </h3>
          <p className="text-xs text-ink-400">
            This prescription can't be signed as it is. To sign anyway, record your clinical reason.
          </p>
        </div>

        <div className="p-5 space-y-4">
          <ul className="space-y-1">
            {alerts.map((a, i) => (
              <li
                key={i}
                className="text-sm px-2.5 py-1.5 rounded bg-rx-danger/15 text-rx-danger border border-rx-danger/30"
              >
                <span className="font-semibold uppercase tracking-wider text-[11px] mr-1.5">
                  [{a.type.replace('_', ' ')}]
                </span>
                {a.message}
              </li>
            ))}
          </ul>

          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-ink-400 mb-1">Reason for override</span>
            <textarea
              ref={reasonRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Reaction on record was mild intolerance, not anaphylaxis; discussed with patient."
              className="w-full rounded-md border border-ink-700 bg-ink-900/40 px-3 py-2 text-sm text-ink-100 outline-none focus:border-rx-focus resize-y"
            />
          </label>
          <p className="text-xs text-ink-500">Saved on the prescription and in the audit log under your name.</p>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-ink-700 bg-ink-900/40">
          <div className={cx('text-xs font-mono', canSign ? 'text-rx-accent' : 'text-ink-400')}>
            {trimmed.length}/{MIN_OVERRIDE_REASON}+ characters
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => actions.cancelOverride()}
              className="px-3 py-2 rounded-md border border-ink-700 text-ink-200 hover:bg-ink-700/40 text-sm"
            >
              Cancel <Kbd>Esc</Kbd>
            </button>
            <button
              onClick={confirm}
              disabled={!canSign}
              className={cx(
                'px-4 py-2 rounded-md font-semibold text-sm flex items-center gap-2 transition-colors',
                canSign
                  ? 'bg-rx-danger text-white hover:bg-rx-danger/80'
                  : 'bg-ink-700 text-ink-400 cursor-not-allowed',
              )}
            >
              Override &amp; sign <Kbd dark>⌘↵</Kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
