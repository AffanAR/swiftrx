// =============================================================================
//  SwiftRx Shared — Reusable Form + Identity Components
// =============================================================================

import * as React from 'react';
import { cx, AnimatedNumber } from './ui';
import type { Hospital } from './types';

export function TextField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  required,
  hint,
  rightAdornment,
  multiline,
}: {
  label: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'tel';
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
  hint?: string;
  rightAdornment?: React.ReactNode;
  multiline?: boolean;
}) {
  const id = React.useId();
  return (
    <label htmlFor={id} className="block">
      <span className="rx-label">
        {label}
        {required && <span className="text-rx-danger ml-0.5">*</span>}
      </span>
      <div className="relative">
        {multiline ? (
          <textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            required={required}
            rows={3}
            className="rx-input min-h-[88px] resize-y"
          />
        ) : (
          <input
            id={id}
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete={autoComplete}
            autoFocus={autoFocus}
            required={required}
            className="rx-input pr-10"
          />
        )}
        {rightAdornment && (
          <div className="absolute inset-y-0 right-2 flex items-center text-ink-400">
            {rightAdornment}
          </div>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </label>
  );
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  required,
  hint,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  required?: boolean;
  hint?: string;
}) {
  const id = React.useId();
  return (
    <label htmlFor={id} className="block">
      <span className="rx-label">
        {label}
        {required && <span className="text-rx-danger ml-0.5">*</span>}
      </span>
      <select
        id={id}
        className="rx-input"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-300 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
          checked ? 'bg-rx-accent' : 'bg-ink-700',
        )}
      >
        <span
          className={cx(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </button>
      <span>{label}</span>
      {hint && <span className="text-ink-500 text-xs">{hint}</span>}
    </label>
  );
}

export function Card({
  title,
  subtitle,
  right,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('rx-card p-5', className)}>
      {(title || subtitle || right) && (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            {subtitle && (
              <div className="text-[10px] uppercase tracking-wider text-ink-400">{subtitle}</div>
            )}
            {title && (
              <div className="mt-0.5 text-base font-semibold text-ink-100">{title}</div>
            )}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = 'accent',
  trend,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'accent' | 'warn' | 'focus' | 'danger';
  trend?: { delta: number; label: string };
}) {
  const colorClass =
    tone === 'focus' ? 'text-rx-focus'
    : tone === 'warn' ? 'text-rx-warn'
    : tone === 'danger' ? 'text-rx-danger'
    : 'text-rx-accent';
  return (
    <div className="rx-card rx-hover-lift p-4">
      <div className="text-[10px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className={cx('mt-1 text-2xl font-semibold font-mono', colorClass)}>
        <AnimatedNumber value={typeof value === 'number' ? value : 0} format={() => String(value)} />
      </div>
      <div className="mt-1 text-[11px] text-ink-500 flex items-center justify-between">
        <span>{hint}</span>
        {trend && (
          <span
            className={cx(
              'font-mono text-[10px]',
              trend.delta >= 0 ? 'text-rx-accent' : 'text-rx-danger',
            )}
          >
            {trend.delta >= 0 ? '▲' : '▼'} {Math.abs(trend.delta).toFixed(1)}% {trend.label}
          </span>
        )}
      </div>
    </div>
  );
}

export function HospitalBadge({ hospital }: { hospital: Hospital }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative h-9 w-9 rounded-lg bg-rx-accent/15 border border-rx-accent/30 flex items-center justify-center"
        style={hospital.primaryColor ? { boxShadow: `inset 0 0 0 1px ${hospital.primaryColor}30` } : undefined}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-rx-accent animate-float"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 21V8l9-5 9 5v13" strokeLinejoin="round" />
          <path d="M9 21v-7h6v7" strokeLinejoin="round" />
        </svg>
        <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-rx-accent animate-breathe" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-ink-100">{hospital.name}</div>
        <div className="text-xs text-ink-400">
          {hospital.city} · {hospital.plan.charAt(0).toUpperCase() + hospital.plan.slice(1)} plan
        </div>
      </div>
    </div>
  );
}

// Re-export AnimatedNumber from ui so consumers only need one import path.
export { AnimatedNumber } from './ui';
