import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, callApi } from './http';

// The page's surface is read once per page load, so each test loads the
// module afresh, as a new page would.
const freshPage = async (href: string) => {
  vi.stubGlobal('window', { location: new URL(href) });
  vi.stubGlobal('location', new URL(href));
  vi.resetModules();
  return { ...(await import('./http')), ...(await import('./auth')) };
};

afterEach(() => vi.unstubAllGlobals());

describe('withSurface', () => {
  it("adds the page's ?hospital= where the host names no hospital, even after the URL loses it", async () => {
    const { withSurface } = await freshPage('http://localhost:5174/rx?hospital=city-hospital');
    expect(withSurface('/api/auth/me')).toBe('/api/auth/me?hospital=city-hospital');
    expect(withSurface('/api/x?y=1')).toBe('/api/x?y=1&hospital=city-hospital');
    vi.stubGlobal('window', { location: new URL('http://localhost:5174/doctors') });
    expect(withSurface('/api/auth/me')).toBe('/api/auth/me?hospital=city-hospital');
  });

  it("leaves the URL alone on a hospital's own host and on the admin panel", async () => {
    const hospital = await freshPage(
      'https://city-hospital.swiftrx.com/rx?hospital=northstar-medical',
    );
    expect(hospital.withSurface('/api/auth/me')).toBe('/api/auth/me');
    const admin = await freshPage('http://localhost:5175/');
    expect(admin.withSurface('/api/auth/me')).toBe('/api/auth/me');
  });
});

describe('setPasswordUrl', () => {
  it('puts the token after #, on this portal', async () => {
    const { setPasswordUrl } = await freshPage(
      'http://localhost:5174/doctors?hospital=city-hospital',
    );
    expect(setPasswordUrl('tok')).toBe(
      'http://localhost:5174/set-password?hospital=city-hospital#tok',
    );
  });
});

describe('callApi', () => {
  it('sends JSON and returns JSON, null for 204', async () => {
    const stub = vi.fn<typeof fetch>(async () => new Response('{"a":1}', { status: 200 }));
    vi.stubGlobal('fetch', stub);
    expect(await callApi('/x', { method: 'POST', body: { b: 2 } })).toEqual({ a: 1 });
    expect(stub.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{"b":2}' });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => new Response(null, { status: 204 })),
    );
    expect(await callApi('/x', { method: 'POST' })).toBeNull();
  });

  it('throws ApiError with status 0 when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline')));
    const error = await callApi('/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0 });
  });
});
