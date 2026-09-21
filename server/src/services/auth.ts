/**
 * Identity: registration, sign-in, session lifecycle, email verification,
 * password reset and account deletion.
 *
 * Three principles run through the whole file.
 *
 * **Nothing leaks whether an account exists.** Sign-in, password reset and
 * registration all answer the same way for a known and an unknown address,
 * and the sign-in path burns a comparable amount of CPU either way so the
 * answer cannot be timed either.
 *
 * **Sessions rotate.** A refresh token is spent the moment it is used. Seeing
 * a spent one again means a copy is loose, so the whole family is revoked.
 *
 * **Password changes end other sessions.** Changing or resetting a password
 * is the action a player takes when they believe someone else is in their
 * account; it would be useless if the intruder's session survived it.
 */

import type { AuthResponse, TokensDto, UserDto } from '../../../shared/protocol';
import { transaction, type Db } from '../db/index';
import {
  conflict,
  forbidden,
  invalidCredentials,
  invalidToken,
  sessionExpired,
  unauthenticated,
  validationFailed
} from '../domain/errors';
import { createServerProfile, toCloudProfile, type ServerProfile } from '../domain/profile';
import { newId } from '../lib/ids';
import {
  checkPasswordPolicy,
  fakeVerify,
  hashPassword,
  needsRehash,
  verifyPassword
} from '../lib/password';
import {
  fingerprint,
  hashToken,
  issueAccessToken,
  newRefreshToken,
  verifyAccessToken
} from '../lib/tokens';
import { insertProfile, loadProfile } from '../repositories/profiles';
import {
  createSession,
  findSessionById,
  findSessionByRefreshHash,
  isLive,
  revokeAllForUser,
  revokeFamily,
  revokeSession,
  rotateSession
} from '../repositories/sessions';
import {
  consumeEmailToken,
  createEmailToken,
  createUser,
  deleteUser,
  findUserByEmail,
  findUserById,
  listProviders,
  markEmailVerified,
  normalizeEmail,
  setPasswordHash,
  type UserRow
} from '../repositories/users';
import type { ServiceContext } from './context';
import { passwordResetMessage, verificationMessage } from './mail';

export interface RequestMeta {
  readonly ip?: string | undefined;
  readonly userAgent?: string | undefined;
}

export interface Principal {
  readonly userId: string;
  readonly sessionId: string;
  readonly emailVerified: boolean;
}

export function toUserDto(db: Db, user: UserRow): UserDto {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.email_verified === 1,
    createdAt: user.created_at,
    providers: listProviders(db, user.id)
  };
}

function issueTokens(
  context: ServiceContext,
  user: UserRow,
  session: { id: string },
  refreshToken: string,
  refreshExpiresAt: number
): TokensDto {
  const access = issueAccessToken(
    context.config.auth.secret,
    { sub: user.id, sid: session.id, ver: user.email_verified === 1 },
    context.config.auth.accessTtlSeconds,
    context.now()
  );
  return {
    accessToken: access.token,
    accessExpiresAt: access.expiresAt,
    refreshToken,
    refreshExpiresAt
  };
}

/** Start a session for a user who has just proved who they are. */
export function startSession(
  context: ServiceContext,
  user: UserRow,
  meta: RequestMeta
): { tokens: TokensDto; sessionId: string } {
  const now = context.now();
  const refreshToken = newRefreshToken();
  const session = createSession(
    context.db,
    {
      userId: user.id,
      refreshHash: hashToken(refreshToken),
      ttlSeconds: context.config.auth.refreshTtlSeconds,
      ipFingerprint: fingerprint(context.config.auth.secret, meta.ip),
      agentFingerprint: fingerprint(context.config.auth.secret, meta.userAgent)
    },
    now
  );
  return {
    tokens: issueTokens(context, user, session, refreshToken, session.expires_at),
    sessionId: session.id
  };
}

/** Load the profile, creating it if this is the account's first sight of one. */
export function ensureProfile(
  context: ServiceContext,
  user: UserRow,
  displayName?: string
): ServerProfile {
  const existing = loadProfile(context.db, user.id);
  if (existing) return existing;

  const now = context.now();
  const fallback = displayName?.trim() || user.email.split('@')[0] || 'Player';
  const server = createServerProfile(user.id, newId(), fallback, now);
  insertProfile(context.db, server);
  return loadProfile(context.db, user.id) ?? server;
}

// ------------------------------------------------------------- register

export interface RegisterInput {
  readonly email: string;
  readonly password: string;
  readonly displayName?: string | undefined;
}

export async function register(
  context: ServiceContext,
  input: RegisterInput,
  meta: RequestMeta
): Promise<{ user: UserRow; profile: ServerProfile; tokens: TokensDto; verifyToken: string }> {
  if (!context.config.auth.registrationOpen) {
    throw forbidden('New accounts are closed right now.');
  }

  const issues = checkPasswordPolicy(input.password, { email: input.email });
  if (issues.length > 0) throw validationFailed(issues);

  // Hashing is deliberately outside the transaction: it is the slow part, and
  // holding SQLite's write lock for fifty milliseconds per registration would
  // serialise the whole server behind it.
  const passwordHash = await hashPassword(input.password, context.passwordParams);
  const now = context.now();

  const created = transaction(context.db, () => {
    // The unique index is the real guard; this check is only here to turn a
    // constraint violation into a clean, intentional error.
    if (findUserByEmail(context.db, input.email)) return null;

    const user = createUser(context.db, { email: input.email, passwordHash }, now);
    const server = createServerProfile(
      user.id,
      newId(),
      input.displayName?.trim() || input.email.split('@')[0] || 'Player',
      now
    );
    insertProfile(context.db, server);
    const session = startSession(context, user, meta);

    const token = newRefreshToken();
    createEmailToken(
      context.db,
      user.id,
      'verify',
      hashToken(token),
      context.config.auth.emailTokenTtlSeconds,
      now
    );

    return {
      user,
      profile: loadProfile(context.db, user.id)!,
      tokens: session.tokens,
      verifyToken: token
    };
  });

  if (!created) throw conflict('That email is already registered.');

  await context.mailer.send(
    verificationMessage(created.user.email, context.config.http.publicAppUrl, created.verifyToken)
  );
  return created;
}

export function authResponse(
  context: ServiceContext,
  user: UserRow,
  profile: ServerProfile,
  tokens: TokensDto
): AuthResponse {
  return {
    user: toUserDto(context.db, user),
    tokens,
    profile: toCloudProfile(profile)
  };
}

// ---------------------------------------------------------------- login

export async function login(
  context: ServiceContext,
  email: string,
  password: string,
  meta: RequestMeta
): Promise<{ user: UserRow; profile: ServerProfile; tokens: TokensDto }> {
  const user = findUserByEmail(context.db, email);

  if (!user || !user.password_hash) {
    // Spend roughly the same time as a real verification so the absence of an
    // account cannot be measured.
    await fakeVerify(context.passwordParams);
    throw invalidCredentials(user ? 'no password identity' : 'unknown email');
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw invalidCredentials('bad password');
  if (user.status !== 'active') throw invalidCredentials(`status=${user.status}`);

  // Sign-in is the natural moment to upgrade a hash made with older, cheaper
  // parameters: the plaintext is in hand and the cost is already paid.
  if (needsRehash(user.password_hash, context.passwordParams)) {
    const upgraded = await hashPassword(password, context.passwordParams);
    setPasswordHash(context.db, user.id, upgraded, context.now());
  }

  return transaction(context.db, () => {
    const profile = ensureProfile(context, user);
    const session = startSession(context, user, meta);
    return { user, profile, tokens: session.tokens };
  });
}

// -------------------------------------------------------------- refresh

export function refresh(
  context: ServiceContext,
  refreshToken: string,
  meta: RequestMeta
): TokensDto {
  const now = context.now();
  const hash = hashToken(refreshToken);

  const presented = findSessionByRefreshHash(context.db, hash);
  if (!presented) throw sessionExpired('unknown refresh token');

  if (presented.revoked_at !== null) {
    // A token that has already been spent is being presented again. Either it
    // was stolen or the legitimate client kept a copy; there is no way to tell
    // which, and only one safe answer.
    //
    // The revocation happens in its own transaction, before the throw. Doing
    // it inside the transaction that then throws would roll the revocation
    // back, which is the exact opposite of what is wanted - the whole family
    // must be dead even though the request fails.
    const revoked = transaction(context.db, () =>
      revokeFamily(context.db, presented.family_id, 'reuse-detected', now)
    );
    context.log.warn(
      { sessionId: presented.id, userId: presented.user_id, revoked },
      'auth: refresh token reuse detected, family revoked'
    );
    throw sessionExpired('refresh token reuse');
  }

  return transaction(context.db, () => {
    const session = findSessionByRefreshHash(context.db, hash);
    if (!session || session.revoked_at !== null) throw sessionExpired('refresh token spent');
    if (session.expires_at <= now) throw sessionExpired('refresh token expired');

    const user = findUserById(context.db, session.user_id);
    if (!user || user.status !== 'active') {
      revokeSession(context.db, session.id, 'user-inactive', now);
      throw sessionExpired('user inactive');
    }

    const nextToken = newRefreshToken();
    const next = rotateSession(
      context.db,
      session,
      hashToken(nextToken),
      context.config.auth.refreshTtlSeconds,
      now
    );
    // Keep the fingerprints fresh so a session list shows where it is now.
    context.db
      .prepare('UPDATE sessions SET ip_fingerprint = ?, agent_fingerprint = ? WHERE id = ?')
      .run(
        fingerprint(context.config.auth.secret, meta.ip),
        fingerprint(context.config.auth.secret, meta.userAgent),
        next.id
      );

    return issueTokens(context, user, next, nextToken, next.expires_at);
  });
}

export function logout(context: ServiceContext, refreshToken: string | undefined): void {
  if (!refreshToken) return;
  const session = findSessionByRefreshHash(context.db, hashToken(refreshToken));
  if (session) revokeSession(context.db, session.id, 'logout', context.now());
}

export function logoutEverywhere(context: ServiceContext, userId: string): number {
  return revokeAllForUser(context.db, userId, 'logout-all', context.now());
}

// ------------------------------------------------------- access control

/**
 * Turn a bearer token into a principal.
 *
 * The signature check is stateless; the session lookup that follows is one
 * primary-key hit and is what makes "sign out everywhere" take effect
 * immediately rather than whenever the access token happens to expire. On an
 * embedded database that lookup is measured in microseconds, which is a price
 * worth paying for revocation that actually revokes.
 */
export function authenticate(context: ServiceContext, bearer: string | undefined): Principal {
  if (!bearer) throw unauthenticated('missing bearer token');

  const result = verifyAccessToken(context.config.auth.secret, bearer, context.now());
  if (!result.ok) {
    if (result.reason === 'expired') throw sessionExpired('access token expired');
    throw unauthenticated(`access token ${result.reason}`);
  }

  const session = findSessionById(context.db, result.claims.sid);
  if (!session || session.user_id !== result.claims.sub) {
    throw unauthenticated('session missing');
  }
  if (!isLive(session, context.now())) throw sessionExpired('session revoked or expired');

  return {
    userId: result.claims.sub,
    sessionId: result.claims.sid,
    emailVerified: result.claims.ver === true
  };
}

// ------------------------------------------------------ email lifecycle

export async function requestEmailVerification(
  context: ServiceContext,
  userId: string
): Promise<void> {
  const user = findUserById(context.db, userId);
  if (!user || user.email_verified === 1) return;

  const token = newRefreshToken();
  createEmailToken(
    context.db,
    user.id,
    'verify',
    hashToken(token),
    context.config.auth.emailTokenTtlSeconds,
    context.now()
  );
  await context.mailer.send(
    verificationMessage(user.email, context.config.http.publicAppUrl, token)
  );
}

export function confirmEmail(context: ServiceContext, token: string): UserRow {
  const row = consumeEmailToken(context.db, 'verify', hashToken(token), context.now());
  if (!row) throw invalidToken('verify token not live');
  markEmailVerified(context.db, row.user_id, context.now());
  const user = findUserById(context.db, row.user_id);
  if (!user) throw invalidToken('verify token user missing');
  return user;
}

/**
 * Begin a password reset.
 *
 * Returns nothing and throws nothing for an unknown address: the endpoint
 * answers 202 either way, so it cannot be used to discover who has an
 * account.
 */
export async function requestPasswordReset(context: ServiceContext, email: string): Promise<void> {
  const user = findUserByEmail(context.db, email);
  if (!user || user.status !== 'active') {
    context.log.info({ email: normalizeEmail(email).slice(0, 3) }, 'auth: reset for unknown email');
    return;
  }

  const token = newRefreshToken();
  createEmailToken(
    context.db,
    user.id,
    'reset',
    hashToken(token),
    context.config.auth.emailTokenTtlSeconds,
    context.now()
  );
  await context.mailer.send(
    passwordResetMessage(user.email, context.config.http.publicAppUrl, token)
  );
}

export async function resetPassword(
  context: ServiceContext,
  token: string,
  password: string
): Promise<void> {
  const row = consumeEmailToken(context.db, 'reset', hashToken(token), context.now());
  if (!row) throw invalidToken('reset token not live');

  const user = findUserById(context.db, row.user_id);
  if (!user) throw invalidToken('reset token user missing');

  const issues = checkPasswordPolicy(password, { email: user.email });
  if (issues.length > 0) throw validationFailed(issues);

  const hash = await hashPassword(password, context.passwordParams);
  transaction(context.db, () => {
    setPasswordHash(context.db, user.id, hash, context.now());
    // A reset is what someone does when they think their account is not their
    // own any more. Leaving other sessions alive would defeat it.
    revokeAllForUser(context.db, user.id, 'password-reset', context.now());
    // Proving control of the mailbox is at least as strong as the original
    // verification click.
    markEmailVerified(context.db, user.id, context.now());
  });
}

export async function changePassword(
  context: ServiceContext,
  principal: Principal,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = findUserById(context.db, principal.userId);
  if (!user || !user.password_hash) throw unauthenticated('no password identity');

  const ok = await verifyPassword(currentPassword, user.password_hash);
  if (!ok) throw invalidCredentials('bad current password');

  const issues = checkPasswordPolicy(newPassword, { email: user.email });
  if (issues.length > 0) throw validationFailed(issues);

  const hash = await hashPassword(newPassword, context.passwordParams);
  transaction(context.db, () => {
    setPasswordHash(context.db, user.id, hash, context.now());
    revokeAllForUser(context.db, user.id, 'password-change', context.now());
  });
}

// ------------------------------------------------------ account removal

export async function deleteAccount(
  context: ServiceContext,
  principal: Principal,
  password: string | undefined
): Promise<void> {
  const user = findUserById(context.db, principal.userId);
  if (!user) throw unauthenticated('user missing');

  // Deletion is irreversible, so it asks for the password again even though
  // the caller already holds a live session. An account that only ever signed
  // in through a provider has none to ask for, and the live session is then
  // the whole proof available.
  if (user.password_hash) {
    if (!password) throw invalidCredentials('no password supplied on delete');
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) throw invalidCredentials('bad password on delete');
  }

  transaction(context.db, () => {
    revokeAllForUser(context.db, user.id, 'account-deleted', context.now());
    // Every table cascades from users, so this really does remove the
    // profile, the match history and the progression log with it.
    deleteUser(context.db, user.id);
  });
  context.log.info({ userId: user.id }, 'auth: account deleted');
}
