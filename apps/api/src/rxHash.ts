// The fingerprint of a signed prescription: SHA-256 over a canonical JSON
// form of everything the apps see of it (SignedRx, without the hash itself).
// "Canonical" means object keys in sorted order and no optional field left as
// `undefined`, so the same prescription always hashes the same, whichever
// order Postgres hands back a jsonb object's keys in.
//
// The print shows it, and recomputing it from the stored rows shows whether
// anything changed since signing (the rows are append-only too, 0008).

import { createHash } from 'node:crypto';

import type { SignedRx } from '@swiftrx/shared/types';

export function rxHash(rx: Omit<SignedRx, 'recordHash'> & { recordHash?: string }): string {
  const { recordHash: _ignored, ...signed } = rx;
  void _ignored;
  return createHash('sha256').update(canonicalJson(signed), 'utf8').digest('hex');
}

/** JSON with sorted keys and no `undefined` members. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sorted(value));
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .sort()
        .map((k) => [k, sorted((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
