import { describe, expect, it } from 'vitest';

import { RateLimiter } from './rateLimit';

function limiter(max: number, windowMs: number, maxKeys?: number) {
  let t = 1_000_000;
  const l = new RateLimiter({ max, windowMs }, () => t, maxKeys);
  return {
    l,
    advance(ms: number) {
      t += ms;
    },
  };
}

describe('RateLimiter', () => {
  it('allows `max` hits per window, then says how long to wait', () => {
    const { l, advance } = limiter(3, 60_000);
    for (let i = 0; i < 3; i++) {
      expect(l.retryAfter('k')).toBe(0);
      l.hit('k');
    }
    expect(l.retryAfter('k')).toBe(60);
    advance(59_001);
    expect(l.retryAfter('k')).toBe(1);
    advance(999);
    expect(l.retryAfter('k')).toBe(0);
  });

  it('keeps keys apart', () => {
    const { l } = limiter(1, 60_000);
    l.hit('a');
    expect(l.retryAfter('a')).toBe(60);
    expect(l.retryAfter('b')).toBe(0);
  });

  it('starts a new window once the old one ends', () => {
    const { l, advance } = limiter(2, 1_000);
    l.hit('k');
    advance(1_000);
    l.hit('k');
    expect(l.retryAfter('k')).toBe(0);
    l.hit('k');
    expect(l.retryAfter('k')).toBe(1);
  });

  it('forgets a key on reset', () => {
    const { l } = limiter(1, 60_000);
    l.hit('k');
    l.reset('k');
    expect(l.retryAfter('k')).toBe(0);
  });

  it('holds a bounded number of keys, dropping ended windows first, then the oldest', () => {
    const { l, advance } = limiter(1, 1_000, 2);
    l.hit('old');
    advance(500);
    l.hit('newer');
    l.hit('newest'); // full: nothing has ended, so the oldest key goes
    expect(l.retryAfter('old')).toBe(0);
    expect(l.retryAfter('newer')).toBe(1);
    expect(l.retryAfter('newest')).toBe(1);

    advance(600); // 'newer' has ended now; 'newest' hasn't
    l.hit('another');
    expect(l.retryAfter('newest')).toBe(1);
    expect(l.retryAfter('another')).toBe(1);
  });
});
