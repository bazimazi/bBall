/**
 * Turning a request into a principal.
 *
 * `requireAuth` runs as a preHandler on every protected route rather than as
 * a global hook with an exemption list. An allowlist of public routes is one
 * forgotten entry away from exposing an endpoint; an explicit preHandler is
 * one forgotten entry away from a route that nobody can call, which fails
 * loudly in the first test that touches it.
 */

import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import { unauthenticated } from '../../domain/errors';
import { authenticate, type Principal } from '../../services/auth';
import type { ServiceContext } from '../../services/context';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireAuth`. Absent on public routes. */
    principal?: Principal;
  }
}

/** The refresh cookie's name and the path it is scoped to. */
export const REFRESH_COOKIE = 'bball_rt';
export const REFRESH_COOKIE_PATH = '/v1/auth';

function bearerFrom(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;
  const [scheme, value] = header.split(' ');
  if (!value || scheme?.toLowerCase() !== 'bearer') return undefined;
  return value.trim();
}

export function makeRequireAuth(context: ServiceContext): preHandlerHookHandler {
  return function requireAuth(request: FastifyRequest, _reply: FastifyReply, done) {
    try {
      request.principal = authenticate(context, bearerFrom(request));
      done();
    } catch (error) {
      done(error as Error);
    }
  };
}

/**
 * Additionally require a verified email address.
 *
 * Off by default: making a player check their inbox before they can save a
 * match is a good way to lose them. It exists so a deployment that wants the
 * stricter rule can turn it on with `REQUIRE_VERIFIED_EMAIL` rather than a
 * code change.
 */
export function makeRequireVerified(context: ServiceContext): preHandlerHookHandler {
  return function requireVerified(request: FastifyRequest, _reply: FastifyReply, done) {
    if (!context.config.auth.requireVerifiedEmail) return done();
    if (request.principal?.emailVerified) return done();
    done(unauthenticated('email not verified') as Error);
  };
}

export function principalOf(request: FastifyRequest): Principal {
  const principal = request.principal;
  if (!principal) throw unauthenticated('route ran without requireAuth');
  return principal;
}

export function requestMeta(request: FastifyRequest): {
  ip: string | undefined;
  userAgent: string | undefined;
} {
  return { ip: request.ip, userAgent: request.headers['user-agent'] };
}
