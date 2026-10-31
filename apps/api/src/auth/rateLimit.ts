// =============================================================================
//  SwiftRx API — Rate limits
// =============================================================================
//  Fixed windows, counted in this process's memory. That fits one server (the
//  demo runs one); with several instances the counts would have to move to
//  the database or a shared store, or each instance would allow its own share.
// =============================================================================

export interface Limit {
  /** Hits allowed per window. */
  max: number;
  windowMs: number;
}

/** Failed sign-ins allowed before the server stops checking passwords for a while. */
export interface SignInLimits {
  /**
   * From one network address. Only failures count, so a hospital whose
   * doctors all sign in from behind one address isn't locked out by a busy
   * morning.
   */
  perAddress: Limit;
  /**
   * For one email, from anywhere: the fence against guessing one account's
   * password from many addresses. Anyone who knows an email can use it to keep
   * that account out for a window, so the window stays short.
   */
  perAccount: Limit;
}

const FIFTEEN_MINUTES = 15 * 60_000;

export const SIGN_IN_LIMITS: SignInLimits = {
  perAddress: { max: 20, windowMs: FIFTEEN_MINUTES },
  perAccount: { max: 10, windowMs: FIFTEEN_MINUTES },
};

interface Window {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: Limit,
    private readonly now: () => number,
    /** Keys kept at most, so a flood of new addresses or emails can't grow memory without end. */
    private readonly maxKeys = 10_000,
  ) {}

  /** Whole seconds until `key` may try again; 0 when it may now. */
  retryAfter(key: string): number {
    const w = this.current(key);
    return w && w.count >= this.limit.max ? Math.ceil((w.resetAt - this.now()) / 1000) : 0;
  }

  /** Count one hit against `key`. */
  hit(key: string): void {
    const w = this.current(key);
    if (w) {
      w.count += 1;
      return;
    }
    if (this.windows.size >= this.maxKeys) this.makeRoom();
    this.windows.set(key, { count: 1, resetAt: this.now() + this.limit.windowMs });
  }

  /** Forget `key`'s hits, e.g. after a successful sign-in. */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /** The key's window, unless it has run out. */
  private current(key: string): Window | undefined {
    const w = this.windows.get(key);
    if (w && w.resetAt <= this.now()) {
      this.windows.delete(key);
      return undefined;
    }
    return w;
  }

  /** Drop windows that have run out, then the oldest if it's still full. */
  private makeRoom(): void {
    const t = this.now();
    for (const [key, w] of this.windows) if (w.resetAt <= t) this.windows.delete(key);
    for (const key of this.windows.keys()) {
      if (this.windows.size < this.maxKeys) break;
      this.windows.delete(key);
    }
  }
}
