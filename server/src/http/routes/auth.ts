/**
 * /v1/auth - registration, sign-in, sessions, email and password lifecycle.
 *
 * The refresh token is returned in the body *and* set as an httpOnly cookie.
 * Browsers should use the cookie: it is scoped to this path, marked httpOnly
 * so no script can read it, and marked Secure in production. The body copy is
 * for callers that have no cookie jar at all - a native shell, a test, a
 * future mobile build - which would otherwise be unable to hold a session.
 *
 * Every response on this router is deliberately uninformative about which
 * accounts exist. Registration with a taken address, sign-in with an unknown
 * one and a reset for nobody all look the same from outside.
 */

import type { FastifyInstance } from 'fastify';

import type {
  AuthResponse,
  ClaimOutcomeDto,
  MeResponse,
  RefreshResponse
} from '../../../../shared/protocol';
import type { AppConfig } from '../../config/env';
import { unauthenticated } from '../../domain/errors';
import { toCloudProfile } from '../../domain/profile';
import { loadProfile } from '../../repositories/profiles';
import { findUserById } from '../../repositories/users';
import {
  changePassword,
  confirmEmail,
  deleteAccount,
  login,
  logout,
  logoutEverywhere,
  refresh,
  register,
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  toUserDto
} from '../../services/auth';
import type { ServiceContext } from '../../services/context';
import { claimLocalSave } from '../../services/sync';
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema
} from '../schemas';
import { parse } from '../validate';
import {
  makeRequireAuth,
  principalOf,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  requestMeta
} from '../plugins/auth';
import { authRateLimit } from '../plugins/security';

function cookieOptions(config: AppConfig, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: config.http.cookieSecure,
    sameSite: config.http.cookieSameSite,
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeSeconds,
    ...(config.http.cookieDomain ? { domain: config.http.cookieDomain } : {})
  } as const;
}

export function registerAuthRoutes(app: FastifyInstance, context: ServiceContext): void {
  const requireAuth = makeRequireAuth(context);
  const limited = authRateLimit(context.config);
  const ttl = context.config.auth.refreshTtlSeconds;

  app.post('/v1/auth/register', { config: limited }, async (request, reply) => {
    const input = parse(registerSchema, request.body);
    const created = await register(
      context,
      {
        email: input.email,
        password: input.password,
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {})
      },
      requestMeta(request)
    );

    // A guest save offered at sign-up is claimed in the same call, so the
    // player never sees a moment where their account exists but their
    // progress does not.
    let claim: ClaimOutcomeDto | undefined;
    let profile = created.profile;
    if (input.claim) {
      const result = claimLocalSave(context, created.user.id, input.claim);
      claim = result.claim;
      profile = result.profile;
    }

    void reply.setCookie(
      REFRESH_COOKIE,
      created.tokens.refreshToken,
      cookieOptions(context.config, ttl)
    );

    const payload: AuthResponse = {
      user: toUserDto(context.db, created.user),
      tokens: created.tokens,
      profile: toCloudProfile(profile),
      ...(claim ? { claim } : {})
    };
    return reply.code(201).send(payload);
  });

  app.post('/v1/auth/login', { config: limited }, async (request, reply) => {
    const input = parse(loginSchema, request.body);
    const result = await login(context, input.email, input.password, requestMeta(request));

    void reply.setCookie(
      REFRESH_COOKIE,
      result.tokens.refreshToken,
      cookieOptions(context.config, ttl)
    );

    const payload: AuthResponse = {
      user: toUserDto(context.db, result.user),
      tokens: result.tokens,
      profile: toCloudProfile(result.profile)
    };
    return reply.send(payload);
  });

  app.post('/v1/auth/refresh', { config: limited }, async (request, reply) => {
    const input = parse(refreshSchema, request.body ?? {});
    const token = input.refreshToken ?? request.cookies[REFRESH_COOKIE];
    if (!token) throw unauthenticated('no refresh token supplied');

    const tokens = refresh(context, token, requestMeta(request));
    void reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(context.config, ttl));

    const payload: RefreshResponse = { tokens };
    return reply.send(payload);
  });

  app.post('/v1/auth/logout', async (request, reply) => {
    const input = parse(refreshSchema, request.body ?? {});
    logout(context, input.refreshToken ?? request.cookies[REFRESH_COOKIE]);
    void reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return reply.code(204).send();
  });

  app.post('/v1/auth/logout-all', { preHandler: requireAuth }, async (request, reply) => {
    const revoked = logoutEverywhere(context, principalOf(request).userId);
    void reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return reply.send({ revoked });
  });

  app.post(
    '/v1/auth/verify-email/request',
    { preHandler: requireAuth, config: limited },
    async (request, reply) => {
      await requestEmailVerification(context, principalOf(request).userId);
      // 202 either way: whether a message was actually sent is not something
      // the caller needs, and saying so leaks account state.
      return reply.code(202).send();
    }
  );

  app.post('/v1/auth/verify-email/confirm', { config: limited }, async (request, reply) => {
    const input = parse(verifyEmailSchema, request.body);
    const user = confirmEmail(context, input.token);
    const profile = loadProfile(context.db, user.id);
    const payload: MeResponse | { user: ReturnType<typeof toUserDto> } = profile
      ? { user: toUserDto(context.db, user), profile: toCloudProfile(profile) }
      : { user: toUserDto(context.db, user) };
    return reply.send(payload);
  });

  app.post('/v1/auth/password/forgot', { config: limited }, async (request, reply) => {
    const input = parse(forgotPasswordSchema, request.body);
    await requestPasswordReset(context, input.email);
    return reply.code(202).send();
  });

  app.post('/v1/auth/password/reset', { config: limited }, async (request, reply) => {
    const input = parse(resetPasswordSchema, request.body);
    await resetPassword(context, input.token, input.password);
    void reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return reply.code(204).send();
  });

  app.post(
    '/v1/auth/password/change',
    { preHandler: requireAuth, config: limited },
    async (request, reply) => {
      const input = parse(changePasswordSchema, request.body);
      await changePassword(context, principalOf(request), input.currentPassword, input.newPassword);
      void reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
      return reply.code(204).send();
    }
  );

  app.delete('/v1/me', { preHandler: requireAuth, config: limited }, async (request, reply) => {
    const input = parse(deleteAccountSchema, request.body);
    await deleteAccount(context, principalOf(request), input.password);
    void reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return reply.code(204).send();
  });

  app.get('/v1/me', { preHandler: requireAuth }, async (request, reply) => {
    const principal = principalOf(request);
    const user = findUserById(context.db, principal.userId);
    const profile = loadProfile(context.db, principal.userId);
    if (!user || !profile) throw unauthenticated('user or profile missing');

    const payload: MeResponse = {
      user: toUserDto(context.db, user),
      profile: toCloudProfile(profile)
    };
    return reply.send(payload);
  });
}
