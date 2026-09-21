/**
 * Building the server.
 *
 * `buildApp` returns a Fastify instance that has never touched the network,
 * which is what lets the whole suite run against `app.inject()` - real
 * routing, real plugins, real middleware, no ports and no sockets. Everything
 * that would otherwise be ambient - the database, the clock, the mailer - is
 * passed in.
 *
 * The logger is configured here rather than at the call site because its
 * redaction list is a security control, not a preference: `authorization`,
 * `cookie` and `set-cookie` carry live credentials, and a log line is the
 * easiest place in a system to leak one.
 */

import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

import { HEADER_REQUEST_ID } from '../../shared/protocol';
import { loadConfig, type AppConfig } from './config/env';
import { createDatabase, type Db } from './db/index';
import { registerAuthRoutes } from './http/routes/auth';
import { registerConfigRoutes } from './http/routes/config';
import { registerHealthRoutes } from './http/routes/health';
import { registerOAuthRoutes } from './http/routes/oauth';
import { registerProgressionRoutes } from './http/routes/progression';
import { registerSyncRoutes } from './http/routes/sync';
import { registerErrorHandler } from './http/plugins/errors';
import { registerSecurity } from './http/plugins/security';
import { passwordParamsFor, type ServiceContext } from './services/context';
import { createMailer, type Mailer } from './services/mail';
import { createOAuthRegistry } from './services/oauth/registry';
import type { OAuthProvider } from './services/oauth/types';

export interface BuildOptions {
  readonly config?: AppConfig;
  /** Supply one to share a database across a test's assertions. */
  readonly db?: Db;
  readonly mailer?: Mailer;
  /**
   * Social sign-in providers to use instead of the configured ones.
   *
   * Tests hand in a stand-in so the whole flow - state, PKCE, nonce, handoff,
   * account linking - runs without reaching Google or Apple.
   */
  readonly oauthProviders?: readonly OAuthProvider[];
  /** A frozen or scripted clock, for tests that care about expiry. */
  readonly now?: () => number;
}

export interface BuiltApp {
  readonly app: FastifyInstance;
  readonly context: ServiceContext;
  readonly config: AppConfig;
  readonly db: Db;
  /** Closes the HTTP server and the database together. */
  close(): Promise<void>;
}

export async function buildApp(options: BuildOptions = {}): Promise<BuiltApp> {
  const config = options.config ?? loadConfig();
  const ownsDb = options.db === undefined;
  const db =
    options.db ??
    createDatabase({
      file: config.database.file,
      busyTimeoutMs: config.database.busyTimeoutMs
    });

  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'req.body.password',
          'req.body.newPassword',
          'req.body.currentPassword',
          'req.body.token',
          'req.body.refreshToken'
        ],
        censor: '[redacted]'
      },
      // The default serialiser logs the whole request; this one logs what an
      // operator needs and nothing a player owns.
      serializers: {
        req(request) {
          return { method: request.method, url: request.url };
        }
      }
    },
    // A caller-supplied request id would let one client poison another's logs.
    genReqId: () => randomUUID(),
    trustProxy: config.http.trustProxy,
    bodyLimit: config.http.bodyLimitBytes,
    routerOptions: { ignoreTrailingSlash: true }
  });

  await registerSecurity(app, config);
  await app.register(cookie, {});

  app.addHook('onSend', (request, reply, payload, done) => {
    void reply.header(HEADER_REQUEST_ID, request.id as string);
    done(null, payload);
  });

  const context: ServiceContext = {
    db,
    config,
    mailer: options.mailer ?? createMailer(config.mail.driver, app.log),
    oauth: createOAuthRegistry(config, options.oauthProviders),
    log: app.log,
    passwordParams: passwordParamsFor(config),
    now: options.now ?? (() => Date.now())
  };

  registerErrorHandler(app);

  registerHealthRoutes(app, context);
  registerConfigRoutes(app, context);
  registerAuthRoutes(app, context);
  registerOAuthRoutes(app, context);
  registerProgressionRoutes(app, context);
  registerSyncRoutes(app, context);

  await app.ready();

  return {
    app,
    context,
    config,
    db,
    async close() {
      await app.close();
      if (ownsDb) db.close();
    }
  };
}
