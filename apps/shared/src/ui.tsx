// =============================================================================
//  SwiftRx Shared — UI Primitives
// =============================================================================
//  Reusable animated bits so the three apps feel like one product. Each app
//  also has its own tailwind.config.js that mirrors the keyframes / classes
//  used here.
// =============================================================================

import * as React from 'react';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('h-4 w-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function LiveDot({
  className,
  color = 'bg-rx-accent',
}: {
  className?: string;
  color?: string;
}) {
  return (
    <span className={cx('relative inline-flex items-center justify-center', className)}>
      <span
        className={cx(
          'absolute inline-flex h-full w-full rounded-full opacity-60 animate-breathe',
          color,
        )}
        aria-hidden
      />
      <span className={cx('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  );
}

export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center', className)} aria-hidden>
      <span className="rx-typing-dot" />
      <span className="rx-typing-dot" />
      <span className="rx-typing-dot" />
    </span>
  );
}

export function AnimatedNumber({
  value,
  duration = 600,
  format = (n) => n.toLocaleString(),
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [shown, setShown] = React.useState(value);
  const prev = React.useRef(value);

  React.useEffect(() => {
    const from = prev.current;
    const to = value;
    if (from === to) return;
    const startedAt = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className={className}>{format(shown)}</span>;
}

export function ProgressBar({
  value,
  tone = 'accent',
  className,
}: {
  value: number;
  tone?: 'accent' | 'warn' | 'danger' | 'focus';
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const barColor =
    tone === 'warn' ? 'bg-rx-warn'
    : tone === 'danger' ? 'bg-rx-danger'
    : tone === 'focus' ? 'bg-rx-focus'
    : 'bg-rx-accent';
  return (
    <div
      className={cx('relative h-1 w-full overflow-hidden rounded-full bg-ink-800/80', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx('h-full rounded-full transition-[width] duration-500 ease-out', barColor)}
        style={{ width: `${pct}%` }}
      />
      <div className="pointer-events-none absolute inset-0 rx-shimmer animate-shimmer opacity-50" aria-hidden />
    </div>
  );
}

/**
 * StaggeredList — animates its direct children in with a small per-item delay,
 * so the first appears immediately and the rest follow in `stepMs` steps.
 */
export function StaggeredList({
  children,
  stepMs = 40,
  initialMs = 0,
  className,
  itemClassName,
  as: As = 'div',
}: {
  children: React.ReactNode;
  stepMs?: number;
  initialMs?: number;
  className?: string;
  itemClassName?: string;
  as?: keyof JSX.IntrinsicElements;
}) {
  const arr = React.Children.toArray(children);
  return (
    <As className={className}>
      {arr.map((child, i) => (
        <div
          key={(child as any)?.key ?? i}
          className={cx('animate-fadeIn will-change-transform', itemClassName)}
          style={{ animationDelay: `${initialMs + i * stepMs}ms` }}
        >
          {child}
        </div>
      ))}
    </As>
  );
}

export function Kbd({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span
      className={cx(
        'font-mono text-[10px] px-1.5 py-0.5 rounded border',
        dark ? 'bg-ink-900/40 text-ink-100 border-ink-900/40' : 'bg-ink-700 text-ink-200 border-ink-600',
      )}
    >
      {children}
    </span>
  );
}
