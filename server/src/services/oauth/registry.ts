/**
 * Which providers this deployment actually has.
 *
 * Built once from configuration. A provider whose credentials are missing is
 * simply absent - it is not listed to the client, and its routes answer 404 -
 * so turning Apple on is an environment change rather than a release, and a
 * half-configured provider can never show a button that does not work.
 */

import type { OAuthProviderDto } from '../../../../shared/protocol';
import type { AppConfig } from '../../config/env';
import type { Fetcher } from './idToken';
import { appleProvider, googleProvider } from './providers';
import type { OAuthProvider } from './types';

export interface OAuthRegistry {
  /** What the client is told exists. */
  list(): OAuthProviderDto[];
  get(id: string): OAuthProvider | null;
  /** The callback URL registered with the provider, per provider. */
  redirectUri(id: string): string;
  readonly enabled: boolean;
}

export function createOAuthRegistry(
  config: AppConfig,
  overrides?: readonly OAuthProvider[],
  fetcher?: Fetcher
): OAuthRegistry {
  const providers = new Map<string, OAuthProvider>();

  // Tests hand in their own provider so the whole flow - state, PKCE, nonce,
  // handoff, account linking - can be exercised without reaching the network.
  if (overrides) {
    for (const provider of overrides) providers.set(provider.id, provider);
  } else {
    if (config.oauth.google) providers.set('google', googleProvider(config.oauth.google, fetcher));
    if (config.oauth.apple) providers.set('apple', appleProvider(config.oauth.apple, fetcher));
  }

  return {
    enabled: providers.size > 0,
    list: () =>
      [...providers.values()].map((provider) => ({ id: provider.id, name: provider.name })),
    get: (id) => providers.get(id) ?? null,
    redirectUri: (id) => `${config.oauth.redirectBase}/v1/auth/oauth/${id}/callback`
  };
}
