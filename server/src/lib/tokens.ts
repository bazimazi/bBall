/**
 * Access and refresh tokens.
 *
 * Two different mechanisms on purpose:
 *
 * - **Access tokens** are short-lived, stateless and signed (compact JWS,
 *   HS256). Every protected request verifies one without touching the
 *   database, which is what keeps the hot path - recording a match - a single
 *   write rather than a read plus a write.
 * - **Refresh tokens** are long-lived, opaque and stateful. Only a SHA-256 of
 *   the token is stored, so a database leak does not hand out sessions, and
 *   every use rotates the token. Re-use of an already-rotated token is taken
 *   as theft and kills the whole family.
 *
 * The signing is done by hand against node's crypto rather than through a JWT
 * library: the only algorithm accepted is the one we issue, so the classic
 * `alg: none` and RS256/HS256 confusion attacks have nowhere to land.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface AccessClaims {
  /** Subject: the user id. */
  readonly sub: string;
  /** Session id, so a revoked session's access token can be denied early. */
  readonly sid: string;
  /** Issued at, epoch seconds. */
  readonly iat: number;
  /** Expiry, epoch seconds. */
  readonly exp: number;
  /** True when the account's email has been verified. */
  readonly ver: boolean;
}

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

function sign(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function issueAccessToken(
  secret: string,
  claims: Omit<AccessClaims, 'iat' | 'exp'>,
  ttlSeconds: number,
  now = Date.now()
): { token: string; expiresAt: number } {
  const iat = Math.floor(now / 1000);
  const exp = iat + ttlSeconds;
  const payload: AccessClaims = { ...claims, iat, exp };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${HEADER}.${body}`;
  return { token: `${data}.${sign(secret, data)}`, expiresAt: exp * 1000 };
}

export type AccessTokenFailure = 'malformed' | 'bad-signature' | 'expired';

export type AccessTokenResult =
  | { readonly ok: true; readonly claims: AccessClaims }
  | { readonly ok: false; readonly reason: AccessTokenFailure };

/**
 * Verify a token and return its claims.
 *
 * Signature first, expiry second: an expired token that was never signed by
 * us must not be reported as merely expired.
 */
export function verifyAccessToken(
  secret: string,
  token: string,
  now = Date.now()
): AccessTokenResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [header, body, signature] = parts as [string, string, string];
  if (header !== HEADER) return { ok: false, reason: 'malformed' };

  const expected = sign(secret, `${header}.${body}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad-signature' };
  }

  let claims: AccessClaims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as AccessClaims;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    typeof claims.sub !== 'string' ||
    typeof claims.sid !== 'string' ||
    typeof claims.exp !== 'number'
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (claims.exp * 1000 <= now) return { ok: false, reason: 'expired' };
  return { ok: true, claims };
}

/** A fresh opaque refresh token. 32 bytes of entropy, URL-safe. */
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * The value actually stored.
 *
 * A plain SHA-256 is right here and a password hash would be wrong: the input
 * is already 256 bits of uniform randomness, so there is nothing to brute
 * force, and the lookup happens on every refresh.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * A one-way fingerprint for an IP address or user agent.
 *
 * Sessions record where they were created so a player can recognise them, but
 * the raw address is personal data that the session table has no business
 * keeping. Salting with the server secret stops the digest being reversible
 * through a dictionary of every IPv4 address.
 */
export function fingerprint(secret: string, value: string | undefined): string | null {
  if (!value) return null;
  return createHmac('sha256', secret).update(value).digest('hex').slice(0, 32);
}
