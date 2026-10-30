import { afterEach, describe, expect, it, vi } from 'vitest';
import { hospitalPortalUrl, normalizeSlug, resolveSurface } from './tenant';

const resolve = (host: string, path = '/', query = '') =>
  resolveSurface(host, path, new URLSearchParams(query));

const NO_HOSPITAL = { surface: 'admin', subdomain: null, hospitalSlug: null, source: 'domain' };

describe('normalizeSlug', () => {
  it('lowercases and dash-separates free text', () => {
    expect(normalizeSlug('  City Hospital ')).toBe('city-hospital');
    expect(normalizeSlug('St. Mary’s & Co!')).toBe('st-mary-s-co');
  });
});

describe('resolveSurface', () => {
  describe('?hospital= query fallback', () => {
    it('picks the hospital from the query when the host names none', () => {
      expect(resolve('demo.trycloudflare.com', '/', 'hospital=City Hospital')).toEqual({
        surface: 'hospital',
        subdomain: 'city-hospital',
        hospitalSlug: 'city-hospital',
        source: 'query',
      });
      expect(resolve('localhost', '/', 'hospital=northstar-medical')).toMatchObject({
        surface: 'hospital',
        hospitalSlug: 'northstar-medical',
        source: 'query',
      });
    });

    it("can't override a hospital or admin subdomain", () => {
      expect(resolve('city-hospital.localhost', '/', 'hospital=northstar-medical')).toMatchObject({
        surface: 'hospital',
        hospitalSlug: 'city-hospital',
        source: 'domain',
      });
      expect(
        resolve('city-hospital.swiftrx.com', '/rx', 'hospital=northstar-medical&as=rx'),
      ).toMatchObject({ surface: 'rx', hospitalSlug: 'city-hospital', source: 'domain' });
      expect(resolve('admin.swiftrx.com', '/', 'hospital=city-hospital')).toMatchObject({
        surface: 'admin',
        hospitalSlug: null,
        source: 'domain',
      });
    });

    it("opens that hospital's Rx pad under /rx", () => {
      expect(resolve('localhost', '/rx', 'hospital=city-hospital')).toMatchObject({
        surface: 'rx',
        hospitalSlug: 'city-hospital',
        source: 'query',
      });
    });

    it('opens the admin panel for as=admin', () => {
      expect(resolve('localhost', '/', 'hospital=x&as=admin')).toMatchObject({
        surface: 'admin',
        hospitalSlug: null,
        source: 'query',
      });
    });
  });

  describe('dev hosts', () => {
    it('gives plain localhost and IP addresses no hospital', () => {
      expect(resolve('localhost')).toEqual(NO_HOSPITAL);
      expect(resolve('127.0.0.1')).toEqual(NO_HOSPITAL);
      expect(resolve('192.168.1.20')).toEqual(NO_HOSPITAL);
    });

    it('maps admin.localhost to the admin panel', () => {
      expect(resolve('admin.localhost')).toMatchObject({ surface: 'admin', subdomain: 'admin' });
    });

    it('maps <slug>.localhost to that hospital, and /rx to its Rx pad', () => {
      expect(resolve('city-hospital.localhost')).toMatchObject({
        surface: 'hospital',
        hospitalSlug: 'city-hospital',
        source: 'domain',
      });
      expect(resolve('city-hospital.localhost', '/rx')).toMatchObject({
        surface: 'rx',
        hospitalSlug: 'city-hospital',
      });
    });
  });

  describe('production hosts', () => {
    it('sends the apex and www to the admin panel', () => {
      expect(resolve('swiftrx.com')).toEqual(NO_HOSPITAL);
      expect(resolve('www.swiftrx.com')).toEqual(NO_HOSPITAL);
      expect(resolve('admin.swiftrx.com')).toMatchObject({ surface: 'admin', subdomain: 'admin' });
    });

    it('maps <slug>.swiftrx.com to that hospital, and /rx to its Rx pad', () => {
      expect(resolve('city-hospital.swiftrx.com')).toMatchObject({
        surface: 'hospital',
        hospitalSlug: 'city-hospital',
      });
      expect(resolve('city-hospital.swiftrx.com', '/rx/')).toMatchObject({
        surface: 'rx',
        hospitalSlug: 'city-hospital',
      });
    });
  });

  it('reports other hosts as unknown', () => {
    expect(resolve('example.org')).toEqual({
      surface: 'unknown',
      subdomain: null,
      hospitalSlug: null,
      source: 'none',
    });
  });

  describe('a custom root domain (VITE_ROOT_DOMAIN)', () => {
    const onDemo = (host: string, path = '/') =>
      resolveSurface(host, path, new URLSearchParams(), 'thesyndicate.bond');

    it('sends the apex, www and admin to the admin panel', () => {
      expect(onDemo('thesyndicate.bond')).toEqual(NO_HOSPITAL);
      expect(onDemo('www.thesyndicate.bond')).toEqual(NO_HOSPITAL);
      expect(onDemo('admin.thesyndicate.bond')).toMatchObject({
        surface: 'admin',
        subdomain: 'admin',
      });
    });

    it('maps <slug>.<root> to that hospital, and /rx to its Rx pad', () => {
      expect(onDemo('City-Hospital.thesyndicate.bond')).toMatchObject({
        surface: 'hospital',
        hospitalSlug: 'city-hospital',
      });
      expect(onDemo('city-hospital.thesyndicate.bond', '/rx')).toMatchObject({
        surface: 'rx',
        hospitalSlug: 'city-hospital',
      });
    });

    it('reports other domains, including the default one, as unknown', () => {
      for (const host of [
        'city-hospital.swiftrx.com',
        'swiftrx.onrender.com',
        'evilthesyndicate.bond',
      ]) {
        expect(onDemo(host).surface).toBe('unknown');
      }
    });
  });
});

describe('hospitalPortalUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const openAt = (href: string) => vi.stubGlobal('window', { location: new URL(href) });

  it('keeps the scheme and port of the admin.<base> host it is opened from', () => {
    openAt('https://admin.thesyndicate.bond/hospitals/city-hospital');
    expect(hospitalPortalUrl('city-hospital')).toBe('https://city-hospital.thesyndicate.bond');
    openAt('http://admin.localhost:5172/hospitals/city-hospital');
    expect(hospitalPortalUrl('city-hospital')).toBe('http://city-hospital.localhost:5172');
  });

  it('goes through the dev gateway from the admin dev server', () => {
    openAt('http://localhost:5175/hospitals/city-hospital');
    expect(hospitalPortalUrl('city-hospital')).toBe('http://city-hospital.localhost:5172');
  });

  it('uses the root domain everywhere else', () => {
    openAt('https://swiftrx.com/hospitals/city-hospital');
    expect(hospitalPortalUrl('city-hospital')).toBe('https://city-hospital.swiftrx.com');
  });
});
