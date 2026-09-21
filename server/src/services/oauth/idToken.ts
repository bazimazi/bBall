/**
 * Verifying an OpenID Connect ID token.
 *
 * An ID token is the whole point of OIDC: it is the provider's signed
 * statement about who just signed in. Taking its claims without checking the
 * signature would mean anyone who can reach the callback can claim to be
 * anyone, so this is security-critical code and is written accordingly.
 *
 * Done by hand against node's crypto rather than through a JWT library, for
 * the same reason the access tokens are: the accepted algorithm comes from
 * the provider's own JWKS entry, `alg: none` has nowhere to land, and there
 * is no library setting that can quietly turn verification off.
 *
 * Checked, in order: the signature against the provider's published key, then
 * issuer, audience, expiry, issued-at and nonce. Signature first, always - an
 * expired token that was never signed by the provider must not be reported as
 * merely expired.
 */

import { createHash, createPublicKey, createVerify, timingSafeEqual } from 'node:crypto';

import { OAuthError } from './types';

export interface Jwk {
  kty: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
}

interface JwksDocument {
  keys?: Jwk[];
}

interface CachedKeys {
  readonly keys: Jwk[];
  readonly fetchedAt: number;
}

/** How long a provider's key set is reused before it is fetched again. */
const JWKS_TTL_MS = 60 * 60 * 1000;
/** A provider rotating a key mid-flight should not cost a sign-in, but a
 *  callback with a bogus `kid` must not be able to hammer the JWKS endpoint. */
const JWKS_MIN_REFETCH_MS = 60 * 1000;

const cache = new Map<string, CachedKeys>();

export type Fetcher = typeof fetch;

async function loadKeys(
  provider: string,
  jwksUri: string,
  fetcher: Fetcher,
  force: boolean,
  now: number
): Promise<Jwk[]> {
  const cached = cache.get(jwksUri);
  if (cached) {
    const age = now - cached.fetchedAt;
    if (!force && age < JWKS_TTL_MS) return cached.keys;
    if (force && age < JWKS_MIN_REFETCH_MS) return cached.keys;
  }

  let document: JwksDocument;
  try {
    const response = await fetcher(jwksUri, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`status ${response.status}`);
    document = (await response.json()) as JwksDocument;
  } catch (error) {
    // A stale key set is better than no sign-in at all while the provider's
    // endpoint is briefly unreachable.
    if (cached) return cached.keys;
    throw new OAuthError(provider, `could not fetch JWKS: ${(error as Error).message}`);
  }

  const keys = Array.isArray(document.keys) ? document.keys : [];
  cache.set(jwksUri, { keys, fetchedAt: now });
  return keys;
}

/** Test seam: forget every cached key set. */
export function clearJwksCache(): void {
  cache.clear();
}

interface Header {
  alg?: string;
  kid?: string;
  typ?: string;
}

export interface IdTokenClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  iat?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  given_name?: string;
  [key: string]: unknown;
}

function decode<T>(part: string): T {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
}

/**
 * Turn a JWK into a key node can verify with, and name the algorithm.
 *
 * The algorithm comes from the key, not from the token's own header, which is
 * what closes the classic confusion attacks: a token cannot nominate how it
 * would like to be checked.
 */
function keyFor(
  provider: string,
  jwk: Jwk
): { key: ReturnType<typeof createPublicKey>; algorithm: string } {
  try {
    const key = createPublicKey({ key: jwk as never, format: 'jwk' });
    if (jwk.kty === 'RSA') return { key, algorithm: 'RSA-SHA256' };
    if (jwk.kty === 'EC') return { key, algorithm: 'SHA256' };
    throw new Error(`unsupported key type ${jwk.kty}`);
  } catch (error) {
    throw new OAuthError(provider, `unusable signing key: ${(error as Error).message}`);
  }
}

function verifySignature(
  provider: string,
  jwk: Jwk,
  signingInput: string,
  signature: Buffer
): boolean {
  const { key, algorithm } = keyFor(provider, jwk);
  const verifier = createVerify(algorithm);
  verifier.update(signingInput);
  verifier.end();

  if (jwk.kty === 'EC') {
    // JWS packs an ECDSA signature as r||s; node expects DER unless told.
    return verifier.verify({ key, dsaEncoding: 'ieee-p1363' }, signature);
  }
  return verifier.verify(key, signature);
}

export interface VerifyOptions {
  readonly provider: string;
  readonly token: string;
  readonly jwksUri: string;
  /** Every issuer string the provider is allowed to use. */
  readonly issuers: readonly string[];
  readonly audience: string;
  readonly nonce: string;
  readonly fetcher: Fetcher;
  readonly now: number;
  /** Seconds of clock skew tolerated on expiry and issued-at. */
  readonly leewaySeconds?: number;
}

export async function verifyIdToken(options: VerifyOptions): Promise<IdTokenClaims> {
  const { provider } = options;
  const parts = options.token.split('.');
  if (parts.length !== 3) throw new OAuthError(provider, 'id_token is not a JWS');
  const [rawHeader, rawPayload, rawSignature] = parts as [string, string, string];

  let header: Header;
  let claims: IdTokenClaims;
  try {
    header = decode<Header>(rawHeader);
    claims = decode<IdTokenClaims>(rawPayload);
  } catch {
    throw new OAuthError(provider, 'id_token is not readable');
  }

  const signature = Buffer.from(rawSignature, 'base64url');
  const signingInput = `${rawHeader}.${rawPayload}`;

  // Try the matching key, then - once - a freshly fetched key set, because a
  // provider that has just rotated is the common reason a kid is unknown.
  let verified = false;
  for (const force of [false, true]) {
    const keys = await loadKeys(provider, options.jwksUri, options.fetcher, force, options.now);
    const candidates = header.kid ? keys.filter((key) => key.kid === header.kid) : keys;
    for (const jwk of candidates.length > 0 ? candidates : keys) {
      if (verifySignature(provider, jwk, signingInput, signature)) {
        verified = true;
        break;
      }
    }
    if (verified) break;
  }
  if (!verified) throw new OAuthError(provider, 'id_token signature does not verify');

  const leeway = options.leewaySeconds ?? 120;
  const seconds = Math.floor(options.now / 1000);

  if (typeof claims.iss !== 'string' || !options.issuers.includes(claims.iss)) {
    throw new OAuthError(provider, `unexpected issuer ${String(claims.iss)}`);
  }

  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(options.audience)) {
    // An ID token minted for a different client is a real attack, not a typo:
    // it is how one application's token gets replayed at another.
    throw new OAuthError(provider, 'id_token was issued for a different client');
  }

  if (typeof claims.exp !== 'number' || claims.exp + leeway <= seconds) {
    throw new OAuthError(provider, 'id_token has expired');
  }
  if (typeof claims.iat === 'number' && claims.iat - leeway > seconds) {
    throw new OAuthError(provider, 'id_token is dated in the future');
  }

  const expected = Buffer.from(options.nonce);
  const actual = Buffer.from(typeof claims.nonce === 'string' ? claims.nonce : '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    // The nonce ties this token to the authorization request we started, so a
    // token captured from another session cannot be replayed into ours.
    throw new OAuthError(provider, 'id_token nonce does not match the request');
  }

  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new OAuthError(provider, 'id_token has no subject');
  }

  return claims;
}

/** PKCE: the S256 challenge for a verifier. */
export function codeChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
