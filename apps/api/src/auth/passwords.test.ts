import { hash } from '@node-rs/argon2';
import { describe, expect, it } from 'vitest';

import { ARGON2_PARAMS, hashPassword, needsRehash, verifyPassword } from './passwords';

describe('passwords', () => {
  it('hashes with Argon2id at the OWASP minimum, salted', async () => {
    const a = await hashPassword('demo1234');
    const b = await hashPassword('demo1234');
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('demo1234');
  });

  it('verifies the right password and nothing else', async () => {
    const stored = await hashPassword('demo1234');
    expect(await verifyPassword(stored, 'demo1234')).toBe(true);
    expect(await verifyPassword(stored, 'demo12345')).toBe(false);
    expect(await verifyPassword(stored, 'Demo1234')).toBe(false);
    expect(await verifyPassword(stored, '')).toBe(false);
  });

  it('treats a missing, old-style or corrupt hash as a wrong password', async () => {
    expect(await verifyPassword(null, 'demo1234')).toBe(false);
    // The bcrypt hash the browser seed used to ship for demo1234.
    const bcrypt = '$2b$08$TAAUtqfRLUtpwnmRvcsNrOTdnQ2v6UMrM4Nx/IPQWkyYrSSwppW9K';
    expect(await verifyPassword(bcrypt, 'demo1234')).toBe(false);
    expect(await verifyPassword('$argon2id$garbage', 'demo1234')).toBe(false);
    const argon2i = await hash('demo1234', { ...ARGON2_PARAMS, algorithm: 1 });
    expect(await verifyPassword(argon2i, 'demo1234')).toBe(false);
  });

  it("asks for a new hash when the stored one's parameters aren't today's", async () => {
    expect(needsRehash(await hashPassword('x'))).toBe(false);
    const weaker = await hash('x', { memoryCost: 4096, timeCost: 1, parallelism: 1 });
    expect(needsRehash(weaker)).toBe(true);
    expect(needsRehash('$2b$08$abcdefghijklmnopqrstuv')).toBe(true);
  });
});
