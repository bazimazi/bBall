/**
 * A generic OpenID Connect provider.
 *
 * Google, Apple, Microsoft and most corporate identity providers differ only
 * in four URLs, a scope string and how the client authenticates itself at the
 * token endpoint. All of that is configuration, so all of them are this one
 * implementation with different values - which is the reason adding the next
 * provider is a config object rather than a new flow to get wrong.
 *
 * The parts that are not negotiable and so are not configurable: the
 * authorization code flow with PKCE, a nonce on every request, and a fully
 * verified ID token. See `idToken.ts` for what "fully verified" means.
 */

import { verifyIdToken, type Fetcher } from './idToken';
import {
  OAuthError,
  type AuthorizeRequest,
  type ExchangeRequest,
  type OAuthIdentity,
  type OAuthProvider
} from './types';

export interface OidcConfig {
  readonly id: string;
  readonly name: string;
  readonly clientId: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly jwksUri: string;
  readonly issuers: readonly string[];
  readonly scope: string;
  /**
   * How the client proves itself at the token endpoint.
   *
   * A static secret for most providers; Apple wants a short-lived signed JWT,
   * so this is a function rather than a string.
   */
  clientSecret(): string;
  /** Extra authorization parameters, such as Apple's `response_mode`. */
  readonly extraAuthorizeParams?: Record<string, string>;
  readonly callbackIsPost?: boolean;
  /** Pull a display name out of whatever the provider posted back. */
  nameFromForm?(fields: Record<string, string>): string | null;
}

interface TokenResponse {
  id_token?: string;
  access_token?: string;
  error?: string;
  error_description?: string;
}

export function createOidcProvider(config: OidcConfig, fetcher: Fetcher = fetch): OAuthProvider {
  return {
    id: config.id,
    name: config.name,
    ...(config.callbackIsPost === undefined ? {} : { callbackIsPost: config.callbackIsPost }),

    authorizeUrl(request: AuthorizeRequest): string {
      const url = new URL(config.authorizationEndpoint);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', request.redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', config.scope);
      url.searchParams.set('state', request.state);
      url.searchParams.set('nonce', request.nonce);
      url.searchParams.set('code_challenge', request.codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      for (const [key, value] of Object.entries(config.extraAuthorizeParams ?? {})) {
        url.searchParams.set(key, value);
      }
      return url.toString();
    },

    async exchange(request: ExchangeRequest): Promise<OAuthIdentity> {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: request.code,
        redirect_uri: request.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret(),
        code_verifier: request.codeVerifier
      });

      let payload: TokenResponse;
      try {
        const response = await fetcher(config.tokenEndpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            accept: 'application/json'
          },
          body: body.toString()
        });
        payload = (await response.json()) as TokenResponse;
        if (!response.ok) {
          // The provider's own error text is useful in a log and meaningless
          // to a player, so it goes no further than here.
          throw new Error(
            payload.error_description ?? payload.error ?? `status ${response.status}`
          );
        }
      } catch (error) {
        throw new OAuthError(config.id, `token exchange failed: ${(error as Error).message}`);
      }

      if (!payload.id_token) throw new OAuthError(config.id, 'token response had no id_token');

      const claims = await verifyIdToken({
        provider: config.id,
        token: payload.id_token,
        jwksUri: config.jwksUri,
        issuers: config.issuers,
        audience: config.clientId,
        nonce: request.nonce,
        fetcher,
        now: Date.now()
      });

      const email = typeof claims.email === 'string' ? claims.email : null;
      // Google sends a boolean; Apple sends the string "true".
      const verified = claims.email_verified === true || claims.email_verified === 'true';

      const fromToken =
        typeof claims.name === 'string'
          ? claims.name
          : typeof claims.given_name === 'string'
            ? claims.given_name
            : null;
      const fromForm = request.formFields
        ? (config.nameFromForm?.(request.formFields) ?? null)
        : null;

      return {
        subject: claims.sub!,
        email,
        emailVerified: verified,
        name: fromToken ?? fromForm
      };
    }
  };
}
