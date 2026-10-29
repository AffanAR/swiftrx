import { describe, expect, it } from 'vitest';
import { login, verifyPassword } from './auth';
import { MOCK_USERS } from './mockDb';

describe('verifyPassword', () => {
  const demo = MOCK_USERS.find((u) => u.email === 'ayesha@city-hospital.com')!;

  it('accepts the documented demo password', () => {
    expect(verifyPassword(demo, 'demo1234')).toBe(true);
  });

  it('rejects a wrong password', () => {
    expect(verifyPassword(demo, 'demo12345')).toBe(false);
    expect(verifyPassword(demo, '')).toBe(false);
  });

  it('never stores a plaintext password', () => {
    for (const user of MOCK_USERS) {
      expect(user.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(user).not.toHaveProperty('password');
    }
  });
});

describe('login', () => {
  it('signs in a seeded doctor with the right tenant', () => {
    const r = login({
      email: 'ayesha@city-hospital.com',
      password: 'demo1234',
      expectedRole: 'doctor',
      hospitalSlug: 'city-hospital',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user.id).toBe('d_001');
      expect(r.session).not.toHaveProperty('passwordHash');
    }
  });

  it('rejects a wrong password', () => {
    const r = login({
      email: 'ayesha@city-hospital.com',
      password: 'nope',
      expectedRole: 'doctor',
      hospitalSlug: 'city-hospital',
    });
    expect(r).toEqual({ ok: false, reason: 'wrong-password' });
  });

  it('rejects the right password at the wrong tenant', () => {
    const r = login({
      email: 'ayesha@city-hospital.com',
      password: 'demo1234',
      expectedRole: 'doctor',
      hospitalSlug: 'northstar-medical',
    });
    expect(r).toEqual({ ok: false, reason: 'wrong-hospital' });
  });

  it('rejects a doctor signing in as a platform admin', () => {
    const r = login({
      email: 'ayesha@city-hospital.com',
      password: 'demo1234',
      expectedRole: 'platform_admin',
    });
    expect(r).toEqual({ ok: false, reason: 'wrong-role' });
  });

  it('signs in the platform admin', () => {
    const r = login({
      email: 'admin@swiftrx.com',
      password: 'admin1234',
      expectedRole: 'platform_admin',
    });
    expect(r.ok).toBe(true);
  });
});
