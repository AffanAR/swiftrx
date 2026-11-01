import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchDemoAccounts,
  fetchSession,
  signIn,
  signInErrorMessage,
  signOut,
  type SignInFailure,
} from './auth';
import type { AuthSession } from './types';

const AUTH: AuthSession = {
  session: {
    role: 'doctor',
    userId: 'd_001',
    hospitalSlug: 'city-hospital',
    issuedAt: 0,
    expiresAt: 43_200_000,
    email: 'ayesha@city-hospital.com',
    name: 'Dr. Ayesha Khan',
    licenseNo: 'BMDC A-44121',
  },
  user: {
    id: 'd_001',
    email: 'ayesha@city-hospital.com',
    name: 'Dr. Ayesha Khan',
    role: 'doctor',
    hospitalSlug: 'city-hospital',
    licenseNo: 'BMDC A-44121',
    status: 'active',
    createdAt: '2024-08-15T10:00:00.000Z',
  },
  memberships: [{ hospitalSlug: 'city-hospital', role: 'doctor' }],
};

/** Stub fetch with one answer, and return the stub to inspect its calls. */
function serverAnswers(status: number, body?: unknown, headers: Record<string, string> = {}) {
  const stub = vi.fn<typeof fetch>(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
      }),
  );
  vi.stubGlobal('fetch', stub);
  return stub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('signIn', () => {
  it('posts the credentials as JSON, naming the hospital, and returns the session', async () => {
    const stub = serverAnswers(200, AUTH);
    expect(await signIn('ayesha@city-hospital.com', 'demo1234', 'city-hospital')).toEqual({
      ok: true,
      auth: AUTH,
    });
    const [url, init] = stub.mock.calls[0];
    expect(url).toBe('/api/auth/login?hospital=city-hospital');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'ayesha@city-hospital.com',
      password: 'demo1234',
    });
  });

  it('names no hospital at the admin panel', async () => {
    const stub = serverAnswers(200, AUTH);
    await signIn('admin@swiftrx.com', 'admin1234');
    expect(stub.mock.calls[0][0]).toBe('/api/auth/login');
  });

  it("passes on the server's reason", async () => {
    serverAnswers(401, { error: 'Incorrect email or password.', reason: 'invalid-credentials' });
    expect(await signIn('a@b.c', 'x')).toEqual({ ok: false, reason: 'invalid-credentials' });
    serverAnswers(403, { error: '…', reason: 'wrong-hospital' });
    expect(await signIn('a@b.c', 'x', 'city-hospital')).toEqual({
      ok: false,
      reason: 'wrong-hospital',
    });
  });

  it('reads how long to wait from Retry-After', async () => {
    serverAnswers(429, { reason: 'rate-limited' }, { 'Retry-After': '120' });
    expect(await signIn('a@b.c', 'x')).toEqual({
      ok: false,
      reason: 'rate-limited',
      retryAfterSeconds: 120,
    });
  });

  it("reports 'unavailable' when the server can't be reached or answers nonsense", async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')));
    expect(await signIn('a@b.c', 'x')).toEqual({ ok: false, reason: 'unavailable' });

    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => new Response('<h1>Bad gateway</h1>', { status: 502 })),
    );
    expect(await signIn('a@b.c', 'x')).toEqual({ ok: false, reason: 'unavailable' });

    serverAnswers(500, { error: 'Something went wrong.' });
    expect(await signIn('a@b.c', 'x')).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('fetchSession', () => {
  it("returns the server's session, or null when there is none", async () => {
    const stub = serverAnswers(200, AUTH);
    expect(await fetchSession('city-hospital')).toEqual(AUTH);
    expect(stub.mock.calls[0][0]).toBe('/api/auth/me?hospital=city-hospital');

    serverAnswers(200, null);
    expect(await fetchSession('city-hospital')).toBeNull();
  });

  it('throws when the server fails', async () => {
    serverAnswers(503, { error: 'The API is unavailable.' });
    await expect(fetchSession()).rejects.toThrow(/503/);
  });
});

describe('signOut', () => {
  it('posts to the logout route, naming the hospital', async () => {
    const stub = serverAnswers(204);
    await signOut('city-hospital');
    expect(stub.mock.calls[0][0]).toBe('/api/auth/logout?hospital=city-hospital');
    expect(stub.mock.calls[0][1]?.method).toBe('POST');
  });

  it('throws when the server fails', async () => {
    serverAnswers(500, {});
    await expect(signOut()).rejects.toThrow(/500/);
  });
});

describe('fetchDemoAccounts', () => {
  it('lists what the server lists, and nothing when it lists nothing or fails', async () => {
    const accounts = [
      { email: 'ayesha@city-hospital.com', password: 'demo1234', name: 'Ayesha', role: 'doctor' },
    ];
    const stub = serverAnswers(200, { accounts });
    expect(await fetchDemoAccounts('city-hospital')).toEqual(accounts);
    expect(stub.mock.calls[0][0]).toBe('/api/auth/demo-accounts?hospital=city-hospital');

    serverAnswers(503, { error: 'The API is unavailable.' });
    expect(await fetchDemoAccounts()).toEqual([]);

    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')));
    expect(await fetchDemoAccounts()).toEqual([]);
  });
});

describe('signInErrorMessage', () => {
  it('words every reason', () => {
    const reasons: SignInFailure[] = [
      'invalid-credentials',
      'rate-limited',
      'no-hospital',
      'disabled',
      'invited',
      'wrong-role',
      'wrong-hospital',
      'hospital-suspended',
      'unavailable',
    ];
    for (const reason of reasons) expect(signInErrorMessage({ reason })).toMatch(/\w/);
  });

  it("doesn't say which of the email and the password was wrong", () => {
    expect(signInErrorMessage({ reason: 'invalid-credentials' })).toBe(
      'Incorrect email or password.',
    );
  });

  it('says how many minutes to wait, rounded up', () => {
    expect(signInErrorMessage({ reason: 'rate-limited', retryAfterSeconds: 30 })).toMatch(
      /in 1 minute\.$/,
    );
    expect(signInErrorMessage({ reason: 'rate-limited', retryAfterSeconds: 61 })).toMatch(
      /in 2 minutes\.$/,
    );
  });
});
