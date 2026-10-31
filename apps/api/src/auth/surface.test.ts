import { describe, expect, it } from 'vitest';

import { surfaceOf } from './surface';

const at = (url: string) => surfaceOf(url, 'thesyndicate.bond');

describe('surfaceOf', () => {
  it('reads the admin panel from admin., www. and the bare root domain', () => {
    for (const host of ['admin.thesyndicate.bond', 'www.thesyndicate.bond', 'thesyndicate.bond']) {
      expect(at(`https://${host}/api/auth/login`)).toEqual({ kind: 'admin' });
    }
  });

  it('reads a hospital from its subdomain, ignoring case and the port', () => {
    expect(at('https://City-Hospital.thesyndicate.bond:8443/api/auth/me')).toEqual({
      kind: 'hospital',
      slug: 'city-hospital',
    });
    expect(at('http://city-hospital.localhost:5172/api/auth/me')).toEqual({
      kind: 'hospital',
      slug: 'city-hospital',
    });
  });

  it('takes ?hospital= only where the host names no subdomain', () => {
    expect(at('http://localhost:5174/api/auth/me?hospital=city-hospital')).toEqual({
      kind: 'hospital',
      slug: 'city-hospital',
    });
    expect(at('http://127.0.0.1:8080/api/auth/me?hospital=city-hospital')).toEqual({
      kind: 'hospital',
      slug: 'city-hospital',
    });
    expect(
      at('https://northstar-medical.thesyndicate.bond/api/auth/me?hospital=city-hospital'),
    ).toEqual({ kind: 'hospital', slug: 'northstar-medical' });
    expect(at('http://localhost:5175/api/auth/me')).toEqual({ kind: 'admin' });
  });

  it('refuses any other host', () => {
    expect(at('https://swiftrx.onrender.com/api/auth/me')).toEqual({ kind: 'unknown' });
    expect(at('https://thesyndicate.bond.evil.example/api/auth/me')).toEqual({ kind: 'unknown' });
  });
});
