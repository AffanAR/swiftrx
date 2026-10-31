// =============================================================================
//  SwiftRx API — Passwords
// =============================================================================
//  Argon2id through @node-rs/argon2. Its native code comes prebuilt for each
//  platform as an optional dependency, so installing it runs no script and
//  needs no compiler, and it hashes on libuv's thread pool, so a sign-in
//  doesn't hold up other requests. (Node 24.7 added crypto.argon2(); the
//  library can go once every host runs that. Render runs Node 22 today.)
//
//  The parameters are OWASP's minimum for Argon2id: 19 MiB of memory, two
//  passes, one lane; about 40 ms on a laptop. Each hash records its own
//  parameters, so raising them later changes new hashes only, and
//  needsRehash() upgrades an old one at its owner's next sign-in.
// =============================================================================

import { hash, parseOptions, verify } from '@node-rs/argon2';
import { randomUUID } from 'node:crypto';

export const ARGON2_PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

const ARGON2ID_PREFIX = '$argon2id$';

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_PARAMS);
}

/**
 * Whether `password` matches the stored hash. No hash (a user who hasn't set
 * a password, or no such user at all) or a hash that isn't Argon2id is a
 * mismatch, never an error, and still costs one full Argon2 run, so the
 * response time doesn't tell an attacker whether the account exists.
 */
export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  const usable = stored !== null && stored.startsWith(ARGON2ID_PREFIX);
  try {
    const matches = await verify(usable ? stored : await timingDecoy(), password);
    return usable && matches;
  } catch {
    // A corrupt hash reads as a wrong password.
    return false;
  }
}

/** Whether a hash that just verified was made with other parameters than today's. */
export function needsRehash(stored: string): boolean {
  try {
    const used = parseOptions(stored);
    return (
      !stored.startsWith(ARGON2ID_PREFIX) ||
      used.memoryCost !== ARGON2_PARAMS.memoryCost ||
      used.timeCost !== ARGON2_PARAMS.timeCost ||
      used.parallelism !== ARGON2_PARAMS.parallelism
    );
  } catch {
    return true;
  }
}

let decoy: Promise<string> | undefined;

/** A hash of a random password with today's parameters, made once on first use. */
function timingDecoy(): Promise<string> {
  decoy ??= hashPassword(randomUUID());
  return decoy;
}
