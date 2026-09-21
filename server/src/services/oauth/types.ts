/**
 * What a sign-in provider has to be, and nothing more.
 *
 * Google and Apple are both OpenID Connect, and so is almost everything else
 * worth adding - Microsoft, GitHub's OIDC, Discord, a corporate IdP. So the
 * interface is the OIDC shape rather than anything Google-specific: build an
 * authorization URL, then turn the code that comes back into an identity.
 *
 * Adding a provider is one file implementing {@link OAuthProvider} and one
 * line in the registry. Nothing above this directory knows which providers
 * exist - the routes, the service and the client all read the registry.
 */

/**
 * Who the provider says this is.
 *
 * `subject` is the only field that is actually an identity. It is stable for
 * the lifetime of the account at that provider and is what
 * `auth_identities(provider, subject)` keys on. Everything else is a
 * convenience that may be missing, may change, and is never used on its own
 * to decide which account someone is signing in to - except `email`, and then
 * only under the rules set out in the sign-in service.
 */
export interface OAuthIdentity {
  readonly subject: string;
  readonly email: string | null;
  /** Whether the provider says it has verified that address. */
  readonly emailVerified: boolean;
  readonly name: string | null;
}

export interface AuthorizeRequest {
  readonly state: string;
  readonly nonce: string;
  /** PKCE challenge, S256 of the verifier. */
  readonly codeChallenge: string;
  readonly redirectUri: string;
}

export interface ExchangeRequest {
  readonly code: string;
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly redirectUri: string;
  /**
   * Fields the provider posted back to the callback alongside the code.
   *
   * Apple is why this exists: it sends the user's name once, in a form POST
   * on the very first authorization, and never again.
   */
  readonly formFields?: Record<string, string> | undefined;
}

export interface OAuthProvider {
  readonly id: string;
  readonly name: string;
  /**
   * Whether the provider answers the callback with a POST rather than a GET.
   *
   * Apple does, when name or email scopes are requested.
   */
  readonly callbackIsPost?: boolean;
  authorizeUrl(request: AuthorizeRequest): string;
  exchange(request: ExchangeRequest): Promise<OAuthIdentity>;
}

export class OAuthError extends Error {
  readonly provider: string;
  /** Safe to show a player; the message is for the log. */
  readonly publicMessage: string;

  constructor(provider: string, message: string, publicMessage = 'That sign-in did not complete.') {
    super(message);
    this.name = 'OAuthError';
    this.provider = provider;
    this.publicMessage = publicMessage;
  }
}
