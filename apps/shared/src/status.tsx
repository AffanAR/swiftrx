// =============================================================================
//  SwiftRx Shared — Loading, error and crash screens
// =============================================================================
//  <PageBoundary> goes around a page's content (inside the app shell, so the
//  shell stays put): it shows <PageLoading> while the page's queries load and
//  <PageError> with a retry if one fails. <AppCrashBoundary> goes around the
//  whole app and catches anything else, so a bug shows a message instead of
//  a blank screen.
// =============================================================================

import * as React from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { reportClientError } from './errorReport';
import { Spinner } from './ui';

/** Shown while a page's data loads. The spinner waits a moment, so fast loads don't flash. */
export function PageLoading({ label = 'Loading…', delayMs = 200 }) {
  const [visible, setVisible] = React.useState(delayMs <= 0);
  React.useEffect(() => {
    if (delayMs <= 0) return;
    const t = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return (
    <div
      role="status"
      className="h-full min-h-[12rem] flex items-center justify-center text-sm text-ink-400"
    >
      {visible ? (
        <span className="inline-flex items-center gap-2 animate-fadeIn">
          <Spinner /> {label}
        </span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}

/** Shown when a page's data couldn't be loaded. */
export function PageError({
  error,
  onRetry,
  title = "Couldn't load this page",
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div className="p-8 max-w-xl mx-auto">
      <div role="alert" className="rx-card p-6 text-center animate-fadeIn">
        <h1 className="text-lg font-semibold text-ink-100">{title}</h1>
        <p className="mt-2 text-sm text-ink-400">{messageOf(error)}</p>
        {onRetry && (
          <button type="button" className="rx-btn-ghost mt-4 inline-flex" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

type BoundaryProps = {
  children: React.ReactNode;
  fallback: (error: Error, reset: () => void) => React.ReactNode;
  /** Called before the boundary clears its error, e.g. to reset failed queries. */
  onReset?: () => void;
};

/** Catches render errors below it and shows `fallback` instead. */
export class ErrorBoundary extends React.Component<BoundaryProps, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('SwiftRx:', error, info.componentStack);
    reportClientError(error);
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    return this.state.error
      ? this.props.fallback(this.state.error, this.reset)
      : this.props.children;
  }
}

/**
 * Loading and error states for a page whose hooks suspend (queries.ts). Give
 * it a `key` that changes on navigation, so an error on one page doesn't stick
 * to the next.
 */
export function PageBoundary({
  children,
  loadingLabel,
}: {
  children: React.ReactNode;
  loadingLabel?: string;
}) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          onReset={reset}
          fallback={(error, retry) => <PageError error={error} onRetry={retry} />}
        >
          <React.Suspense fallback={<PageLoading label={loadingLabel} />}>
            {children}
          </React.Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

/** The last line of defence around a whole app. */
export function AppCrashBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(error) => (
        <div className="h-full flex items-center justify-center p-6 bg-ink-900 text-ink-100">
          <div role="alert" className="rx-card p-6 max-w-md text-center">
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-ink-400">
              The page hit an error it couldn't recover from. Anything not yet saved on this page
              may be lost.
            </p>
            <button
              type="button"
              className="rx-btn-primary mt-4 inline-flex"
              onClick={() => window.location.reload()}
            >
              Reload the page
            </button>
            <details className="mt-4 text-left text-xs text-ink-500">
              <summary className="cursor-pointer">Details</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">{messageOf(error)}</pre>
            </details>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
