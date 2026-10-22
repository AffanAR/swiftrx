import { Link } from 'react-router-dom';
import { LiveDot } from '@swiftrx/shared';

export function TenantNotFound() {
  return (
    <div className="min-h-full flex items-center justify-center p-6 relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 rx-bg-grid opacity-40" />
      <div aria-hidden className="pointer-events-none absolute inset-0 rx-bg-radial-focus" />
      <div className="rx-card max-w-md w-full p-8 animate-fadeIn">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-rx-warn/15 border border-rx-warn/30 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 text-rx-warn"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M12 9v4M12 17h.01M10.3 3.86l-8.4 14.5A2 2 0 0 0 3.62 21h16.76a2 2 0 0 0 1.72-2.64l-8.4-14.5a2 2 0 0 0-3.4 0z"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-ink-100">Hospital portal not found</h1>
        </div>
        <p className="text-sm text-ink-300 leading-relaxed">
          This subdomain isn't registered with SwiftRx. If you're a new hospital, ask your
          administrator to provision a tenant. If you arrived here from a link, double-check the
          URL.
        </p>
        <p className="mt-4 text-xs text-ink-500 font-mono break-all">
          host:{' '}
          <span className="text-ink-300">
            {typeof window !== 'undefined' ? window.location.hostname : '—'}
          </span>
        </p>
        <div className="mt-6 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-400">
            <LiveDot color="bg-rx-warn" /> Unknown tenant
          </span>
          <Link to="/" className="rx-btn-ghost ml-auto">
            Try again
          </Link>
        </div>
      </div>
    </div>
  );
}
