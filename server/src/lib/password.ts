/**
 * Password hashing.
 *
 * scrypt from node's own crypto, with per-password salt and the cost
 * parameters stored alongside the digest:
 *
 *   scrypt$N=16384,r=8,p=1$<salt-b64url>$<digest-b64url>
 *
 * Two things make that format worth the extra characters. Parameters can be
 * raised later without invalidating existing hashes - {@link needsRehash}
 * spots an old one at the next successful sign-in and the caller re-hashes
 * in place. And the leading algorithm label leaves room for argon2id to be
 * dropped in beside scrypt with no migration: an `argon2id$...` hash simply
 * verifies through a different branch.
 *
 * A plaintext password never leaves this module, is never logged, and is
 * never stored in any form other than the digest below.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * The four-argument form, typed.
 *
 * node's callback signature takes an options object that promisify's own
 * declarations do not carry through, and those options are the entire point
 * here: they are the cost parameters.
 */
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions
) => Promise<Buffer>;

export interface ScryptParams {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly keyLength: number;
}

/**
 * OWASP's scrypt floor (N=2^14, r=8, p=1) - around 16 MB and ~50 ms of work
 * per attempt on server hardware, which is the point: it is cheap once at
 * sign-in and ruinous a billion times in an offline crack.
 */
export const DEFAULT_PARAMS: ScryptParams = { N: 16384, r: 8, p: 1, keyLength: 64 };

/** Test-only: the same construction at a cost that keeps a suite fast. */
export const FAST_PARAMS: ScryptParams = { N: 1024, r: 8, p: 1, keyLength: 64 };

const SALT_BYTES = 16;
/** scrypt needs roughly 128 * N * r bytes; give it headroom over the default. */
const maxmem = (params: ScryptParams) => 256 * params.N * params.r;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

export interface PasswordPolicyIssue {
  readonly path: string;
  readonly message: string;
}

/**
 * A deliberately short policy.
 *
 * Length does the work; composition rules mostly push people towards
 * `Password1!`. The only other checks are the ones that catch a password
 * which is certain to be guessed first.
 */
export function checkPasswordPolicy(
  password: string,
  context: { readonly email?: string } = {}
): PasswordPolicyIssue[] {
  const issues: PasswordPolicyIssue[] = [];
  if (password.length < PASSWORD_MIN) {
    issues.push({ path: 'password', message: `Use at least ${PASSWORD_MIN} characters.` });
  }
  if (password.length > PASSWORD_MAX) {
    issues.push({ path: 'password', message: `Use at most ${PASSWORD_MAX} characters.` });
  }
  if (/^(.)\1*$/.test(password) && password.length > 0) {
    issues.push({ path: 'password', message: 'That is the same character repeated.' });
  }
  const local = context.email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 3 && password.toLowerCase().includes(local)) {
    issues.push({ path: 'password', message: 'Do not put your email address in your password.' });
  }
  return issues;
}

function encode(params: ScryptParams, salt: Buffer, digest: Buffer): string {
  const meta = `N=${params.N},r=${params.r},p=${params.p}`;
  return `scrypt$${meta}$${salt.toString('base64url')}$${digest.toString('base64url')}`;
}

interface ParsedHash {
  readonly params: ScryptParams;
  readonly salt: Buffer;
  readonly digest: Buffer;
}

function parse(hash: string): ParsedHash | null {
  const parts = hash.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return null;
  const [, meta, saltPart, digestPart] = parts as [string, string, string, string];

  const params: Record<string, number> = {};
  for (const pair of meta.split(',')) {
    const [key, value] = pair.split('=');
    if (!key || value === undefined) return null;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return null;
    params[key] = parsed;
  }
  const N = params.N;
  const r = params.r;
  const p = params.p;
  if (!N || !r || !p) return null;

  try {
    const salt = Buffer.from(saltPart, 'base64url');
    const digest = Buffer.from(digestPart, 'base64url');
    if (salt.length === 0 || digest.length === 0) return null;
    return { params: { N, r, p, keyLength: digest.length }, salt, digest };
  } catch {
    return null;
  }
}

export async function hashPassword(
  password: string,
  params: ScryptParams = DEFAULT_PARAMS
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const digest = await scrypt(password.normalize('NFKC'), salt, params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: maxmem(params)
  });
  return encode(params, salt, digest);
}

/**
 * Verify a password against a stored hash.
 *
 * Returns false rather than throwing for a malformed hash, so a corrupted row
 * denies access instead of leaking a 500 that distinguishes it from a wrong
 * password.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const parsed = parse(hash);
  if (!parsed) return false;
  try {
    const candidate = await scrypt(password.normalize('NFKC'), parsed.salt, parsed.digest.length, {
      N: parsed.params.N,
      r: parsed.params.r,
      p: parsed.params.p,
      maxmem: maxmem(parsed.params)
    });
    return timingSafeEqual(candidate, parsed.digest);
  } catch {
    return false;
  }
}

/** True when a stored hash was made with weaker parameters than we use now. */
export function needsRehash(hash: string, params: ScryptParams = DEFAULT_PARAMS): boolean {
  const parsed = parse(hash);
  if (!parsed) return true;
  return (
    parsed.params.N < params.N ||
    parsed.params.r < params.r ||
    parsed.params.p < params.p ||
    parsed.digest.length < params.keyLength
  );
}

/**
 * Burn roughly the cost of a real verification.
 *
 * Called when no account exists for the submitted email, so "unknown address"
 * and "wrong password" take comparable time and the endpoint cannot be timed
 * to enumerate accounts.
 */
export async function fakeVerify(params: ScryptParams = DEFAULT_PARAMS): Promise<void> {
  await scrypt('bball-no-such-account', randomBytes(SALT_BYTES), params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: maxmem(params)
  });
}
