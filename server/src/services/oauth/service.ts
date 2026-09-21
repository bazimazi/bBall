/**
 * Social sign-in, end to end.
 *
 * Three steps, and the interesting decisions are all in the middle one.
 *
 * 1. {@link startOAuth} records a flow - state, nonce, PKCE verifier - and
 *    hands back the provider's authorization URL.
 * 2. {@link completeCallback} spends that flow, exchanges the code, verifies
 *    the ID token, and decides *which account this is*.
 * 3. {@link redeemHandoff} turns the one-time code from step 2 into a real
 *    session, optionally carrying a guest save across at the same time.
 *
 * ### Which account this is
 *
 * The rule, in order:
 *
 * - A linked `(provider, subject)` wins outright. That pairing is the only
 *   thing the provider guarantees is stable, and it is what the identity
 *   table keys on.
 * - Otherwise, an address the provider says it has **verified** may be linked
 *   to an existing account with that address. This is what makes signing in
 *   with Google work for someone who originally registered with a password.
 * - An **unverified** address is never linked and never used to create an
 *   account that collides with one. Doing so is the classic pre-hijack
 *   attack: register an account at the provider with someone else's address,
 *   never confirm it, and sign in as them here. The sign-in is refused with
 *   an explanation instead.
 * - Otherwise a new account is created.
 */

import { randomBytes } from 'node:crypto';

import type { LocalSaveDto } from '../../../../shared/protocol';
import { transaction } from '../../db/index';
import { AppError, conflict, forbidden, notFound } from '../../domain/errors';
import { newSecret } from '../../lib/ids';
import {
  consumeFlow,
  consumeHandoff,
  createFlow,
  createHandoff,
  FLOW_TTL_SECONDS
} from '../../repositories/oauth';
import {
  createUserWithIdentity,
  findUserByEmail,
  findUserById,
  findUserByIdentity,
  linkIdentity,
  markEmailVerified,
  normalizeEmail,
  type UserRow
} from '../../repositories/users';
import { ensureProfile, startSession, type RequestMeta } from '../auth';
import type { ServiceContext } from '../context';
import { claimLocalSave } from '../sync';
import { codeChallengeFor } from './idToken';
import type { OAuthRegistry } from './registry';
import { OAuthError, type ExchangeRequest, type OAuthIdentity } from './types';

export interface OAuthServices {
  readonly registry: OAuthRegistry;
}

function providerOrFail(registry: OAuthRegistry, id: string) {
  const provider = registry.get(id);
  if (!provider) throw notFound('That sign-in method is not available.');
  return provider;
}

// ------------------------------------------------------------------ start

export interface StartResult {
  readonly authorizeUrl: string;
  readonly state: string;
  readonly expiresAt: number;
}

export function startOAuth(
  context: ServiceContext,
  registry: OAuthRegistry,
  providerId: string
): StartResult {
  const provider = providerOrFail(registry, providerId);
  const now = context.now();

  const state = newSecret(24);
  const nonce = newSecret(16);
  // PKCE. The server is a confidential client and does not strictly need it,
  // but it costs nothing and closes code interception on the redirect.
  const codeVerifier = randomBytes(48).toString('base64url');
  const redirectUri = registry.redirectUri(provider.id);

  createFlow(context.db, { state, provider: provider.id, codeVerifier, nonce, redirectUri }, now);

  return {
    authorizeUrl: provider.authorizeUrl({
      state,
      nonce,
      codeChallenge: codeChallengeFor(codeVerifier),
      redirectUri
    }),
    state,
    expiresAt: now + FLOW_TTL_SECONDS * 1000
  };
}

// --------------------------------------------------------------- callback

export interface CallbackResult {
  /** The one-time code the game exchanges for a session. */
  readonly handoffCode: string;
  readonly provider: string;
  readonly created: boolean;
}

/**
 * A stand-in address for a provider that hands back no email at all.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve, so nothing will
 * ever try to deliver to it. The account is perfectly usable - it simply has
 * no address until the player adds one.
 */
function placeholderEmail(provider: string, subject: string): string {
  const digest = Buffer.from(subject).toString('base64url').slice(0, 24).toLowerCase();
  return `${provider}.${digest}@no-email.bball.invalid`;
}

function resolveAccount(
  context: ServiceContext,
  providerId: string,
  identity: OAuthIdentity
): { user: UserRow; created: boolean } {
  const linked = findUserByIdentity(context.db, providerId, identity.subject);
  if (linked) {
    if (linked.status !== 'active') throw forbidden('That account is not available.');
    // A provider confirming the address later is worth recording.
    if (identity.email && identity.emailVerified && linked.email_verified === 0) {
      markEmailVerified(context.db, linked.id, context.now());
      return { user: findUserById(context.db, linked.id) ?? linked, created: false };
    }
    return { user: linked, created: false };
  }

  const email = identity.email?.trim();
  if (email) {
    const existing = findUserByEmail(context.db, email);
    if (existing) {
      if (!identity.emailVerified) {
        // See the note at the top of this file: linking on an unverified
        // address is how an account gets taken over.
        throw conflict(
          'That address already has a bBall account. Sign in with your password first, then link this method.',
          { internal: `unverified ${providerId} email collision for ${normalizeEmail(email)}` }
        );
      }
      if (existing.status !== 'active') throw forbidden('That account is not available.');
      linkIdentity(context.db, existing.id, providerId, identity.subject, context.now());
      if (existing.email_verified === 0) markEmailVerified(context.db, existing.id, context.now());
      return { user: findUserById(context.db, existing.id) ?? existing, created: false };
    }
  }

  if (!context.config.auth.registrationOpen) {
    throw forbidden('New accounts are closed right now.');
  }

  const user = createUserWithIdentity(
    context.db,
    {
      email: email ?? placeholderEmail(providerId, identity.subject),
      emailVerified: Boolean(email) && identity.emailVerified,
      provider: providerId,
      subject: identity.subject
    },
    context.now()
  );
  ensureProfile(context, user, identity.name ?? undefined);
  return { user, created: true };
}

export interface CallbackInput {
  readonly providerId: string;
  readonly state: string;
  readonly code: string;
  readonly formFields?: Record<string, string> | undefined;
}

export async function completeCallback(
  context: ServiceContext,
  registry: OAuthRegistry,
  input: CallbackInput
): Promise<CallbackResult> {
  const provider = providerOrFail(registry, input.providerId);

  // Spent before the exchange, so a replayed callback cannot get a second
  // trip to the provider out of one authorization.
  const flow = consumeFlow(context.db, input.state, context.now());
  if (!flow || flow.provider !== provider.id) {
    throw new AppError('INVALID_TOKEN', 'That sign-in attempt has expired. Try again.', {
      internal: `no live flow for state on ${provider.id}`
    });
  }

  const request: ExchangeRequest = {
    code: input.code,
    codeVerifier: flow.code_verifier,
    nonce: flow.nonce,
    redirectUri: flow.redirect_uri,
    formFields: input.formFields
  };

  let identity: OAuthIdentity;
  try {
    identity = await provider.exchange(request);
  } catch (error) {
    if (error instanceof OAuthError) {
      context.log.warn({ provider: provider.id, err: error.message }, 'oauth: exchange failed');
      throw new AppError('INVALID_TOKEN', error.publicMessage, { internal: error.message });
    }
    throw error;
  }

  const handoffCode = newSecret(32);
  const { created } = transaction(context.db, () => {
    const resolved = resolveAccount(context, provider.id, identity);
    ensureProfile(context, resolved.user, identity.name ?? undefined);
    createHandoff(
      context.db,
      {
        code: handoffCode,
        userId: resolved.user.id,
        provider: provider.id,
        createdUser: resolved.created
      },
      context.now()
    );
    return resolved;
  });

  context.log.info({ provider: provider.id, created }, 'oauth: sign-in completed');
  return { handoffCode, provider: provider.id, created };
}

// ---------------------------------------------------------------- redeem

export interface RedeemResult {
  readonly user: UserRow;
  readonly tokens: ReturnType<typeof startSession>['tokens'];
  readonly provider: string;
  readonly created: boolean;
  readonly claimed: Awaited<ReturnType<typeof claimLocalSave>>['claim'] | null;
}

/**
 * Turn a handoff code into a session.
 *
 * Also the moment a guest save can be carried over, because it is the first
 * point at which the game is talking to us again and knows what it has - the
 * provider round trip happens in a browser context that may not be the one
 * holding the save.
 */
export function redeemHandoff(
  context: ServiceContext,
  code: string,
  meta: RequestMeta,
  claim?: LocalSaveDto
): RedeemResult {
  return transaction(context.db, () => {
    const handoff = consumeHandoff(context.db, code, context.now());
    if (!handoff) {
      throw new AppError('INVALID_TOKEN', 'That sign-in has expired. Try again.', {
        internal: 'no live handoff'
      });
    }

    const user = findUserById(context.db, handoff.user_id);
    if (!user || user.status !== 'active') {
      throw new AppError('INVALID_TOKEN', 'That sign-in has expired. Try again.', {
        internal: 'handoff user missing or inactive'
      });
    }

    ensureProfile(context, user);
    const session = startSession(context, user, meta);

    const claimed = claim ? claimLocalSave(context, user.id, claim).claim : null;

    return {
      user,
      tokens: session.tokens,
      provider: handoff.provider,
      created: handoff.created_user === 1,
      claimed
    };
  });
}
