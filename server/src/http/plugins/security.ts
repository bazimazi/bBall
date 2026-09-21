/**
 * Transport-level defences: headers, origins and request budgets.
 *
 * None of this replaces authorisation - every protected route checks the
 * caller itself - but each piece closes a door that authorisation alone
 * leaves open:
 *
 * - **CORS** is an allowlist, never a reflection of whatever `Origin` arrived.
 *   With credentials enabled, `*` is not merely lax, it is forbidden by the
 *   specification, and reflecting the caller's own origin is the same hole
 *   with extra steps.
 * - **Helmet** sets the headers that keep a JSON API from being framed,
 *   sniffed or referred elsewhere. The CSP is strict because this server
 *   returns JSON: it never needs to load anything.
 * - **HSTS** is set in production only. Sent over plain http in development
 *   it would pin localhost to https in the developer's browser for a year.
 * - **Rate limits** come in two budgets. The general one is sized for a game
 *   client that syncs after each match; the auth one is much tighter, because
 *   that is where guessing happens.
 */

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { AppConfig } from '../../config/env';
import { AppError } from '../../domain/errors';

/**
 * The key a rate limit counts against.
 *
 * A signed-in caller is counted per account, so one player on a shared
 * network cannot exhaust the budget for everyone behind the same address, and
 * a single account cannot multiply its budget by changing addresses.
 */
function limitKey(request: FastifyRequest): string {
  const principal = request.principal;
  return principal ? `user:${principal.userId}` : `ip:${request.ip}`;
}

export async function registerSecurity(app: FastifyInstance, config: AppConfig): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"]
      }
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: config.isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: false }
      : false
  });

  const allowed = new Set(config.http.corsOrigins);
  await app.register(cors, {
    origin(origin, callback) {
      // No Origin header at all is a non-browser caller - curl, a native app,
      // a health check. CORS has nothing to say about those.
      if (!origin) return callback(null, true);
      if (allowed.has(origin)) return callback(null, true);
      // Refusing without an error keeps the browser's message honest ("not
      // allowed by CORS") instead of turning it into a 500.
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization', 'idempotency-key', 'x-bball-protocol'],
    exposedHeaders: ['x-request-id', 'retry-after'],
    maxAge: 600
  });

  await app.register(rateLimit, {
    global: true,
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowSeconds * 1000,
    keyGenerator: limitKey,
    // Health checks must never be throttled: a limiter that hides a liveness
    // probe turns a busy minute into a restart loop.
    allowList: (request) => request.url.startsWith('/v1/health'),
    // Handed back as an AppError so it lands in the one error handler and
    // comes out in the same envelope as every other refusal - the client has
    // a single shape to parse, whoever said no.
    errorResponseBuilder: (_request, context) =>
      new AppError('RATE_LIMITED', 'Too many requests. Wait a moment.', {
        retryAfter: Math.max(1, Math.ceil(context.ttl / 1000))
      })
  });
}

/** The tighter budget applied to sign-in, registration and reset. */
export function authRateLimit(config: AppConfig) {
  return {
    rateLimit: {
      max: config.rateLimit.authMax,
      timeWindow: config.rateLimit.windowSeconds * 1000,
      keyGenerator: limitKey
    }
  };
}
