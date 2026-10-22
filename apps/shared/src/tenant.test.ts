import { describe, expect, it } from 'vitest';
import { normalizeSlug, resolveSurface } from './tenant';

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
  describe('?hospital= query override', () => {
    it('picks the hospital from the query on any host', () => {
      expect(resolve('demo.trycloudflare.com', '/', 'hospital=City Hospital')).toEqual({
        surface: 'hospital',
        subdomain: 'city-hospital',
        hospitalSlug: 'city-hospital',
        source: 'query',
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
});
