/**
 * The providers themselves: endpoints, scopes and the two places they differ.
 *
 * Everything here is configuration for `createOidcProvider`. A new provider
 * is another function in this file and another case in the registry - there
 * is no new flow to implement and nothing outside this directory to change.
 */

import { createSign } from 'node:crypto';

import type { Fetcher } from './idToken';
import { createOidcProvider } from './oidc';
import { OAuthError, type OAuthProvider } from './types';

// ----------------------------------------------------------------- google

export interface GoogleConfig {
  readonly clientId: string;
  readonly clientSecret: string;
}

export function googleProvider(config: GoogleConfig, fetcher?: Fetcher): OAuthProvider {
  return createOidcProvider(
    {
      id: 'google',
      name: 'Google',
      clientId: config.clientId,
      clientSecret: () => config.clientSecret,
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
      // Google has used both spellings of its issuer for years, and both are
      // legitimate; accepting one of them would reject real tokens.
      issuers: ['https://accounts.google.com', 'accounts.google.com'],
      scope: 'openid email profile',
      extraAuthorizeParams: {
        // Without this, a returning player is signed straight back in as
        // whichever account the browser last used, with no way to pick.
        prompt: 'select_account'
      }
    },
    fetcher
  );
}

// ------------------------------------------------------------------ apple

export interface AppleConfig {
  /** The Services ID, which is Apple's name for the OAuth client id. */
  readonly clientId: string;
  readonly teamId: string;
  readonly keyId: string;
  /** The contents of the .p8 file, PEM encoded. */
  readonly privateKey: string;
}

/**
 * Apple's client secret is a short-lived signed assertion, not a string.
 *
 * It is an ES256 JWT signed with the private key from the developer portal,
 * valid for at most six months. Minting it per exchange rather than caching
 * it means there is no expiry to monitor and no secret sitting in memory any
 * longer than one request needs it.
 */
function appleClientSecret(config: AppleConfig, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const header = { alg: 'ES256', kid: config.keyId, typ: 'JWT' };
  const claims = {
    iss: config.teamId,
    iat: issuedAt,
    // Minutes, not months: it is used once, immediately.
    exp: issuedAt + 300,
    aud: 'https://appleid.apple.com',
    sub: config.clientId
  };

  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const signingInput = `${encode(header)}.${encode(claims)}`;

  try {
    const signer = createSign('SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(
      { key: config.privateKey, dsaEncoding: 'ieee-p1363' },
      'base64url'
    );
    return `${signingInput}.${signature}`;
  } catch (error) {
    throw new OAuthError(
      'apple',
      `could not sign the Apple client secret: ${(error as Error).message}`
    );
  }
}

export function appleProvider(config: AppleConfig, fetcher?: Fetcher): OAuthProvider {
  return createOidcProvider(
    {
      id: 'apple',
      name: 'Apple',
      clientId: config.clientId,
      clientSecret: () => appleClientSecret(config),
      authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
      tokenEndpoint: 'https://appleid.apple.com/auth/token',
      jwksUri: 'https://appleid.apple.com/auth/keys',
      issuers: ['https://appleid.apple.com'],
      scope: 'name email',
      extraAuthorizeParams: {
        // Apple requires form_post whenever name or email are requested.
        response_mode: 'form_post'
      },
      callbackIsPost: true,
      /**
       * Apple sends the player's name exactly once, in the callback form of
       * the very first authorization, and never again. If it is not taken
       * here it is gone for good.
       */
      nameFromForm(fields) {
        const raw = fields.user;
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw) as { name?: { firstName?: string; lastName?: string } };
          const first = parsed.name?.firstName?.trim();
          const last = parsed.name?.lastName?.trim();
          const full = [first, last].filter(Boolean).join(' ');
          return full.length > 0 ? full : null;
        } catch {
          return null;
        }
      }
    },
    fetcher
  );
}

/** Exported for the test that checks the assertion is well formed. */
export const __appleClientSecret = appleClientSecret;
