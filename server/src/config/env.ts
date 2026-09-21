/**
 * Environment-based configuration.
 *
 * Every knob the server has is read here, once, and validated before anything
 * else starts. Nothing else in the codebase reads `process.env`.
 *
 * The rules that matter:
 *
 * - No secret and no connection string has a production default. In
 *   development and test a throwaway secret is generated in memory so the
 *   server is runnable straight from a clone; in production a missing or
 *   weak `AUTH_SECRET` is a startup failure, not a warning.
 * - Defaults differ per environment rather than being overridden at the call
 *   site, so "what does production do" is answerable from this file alone.
 */

import { randomBytes } from 'node:crypto';
import { z } from 'zod';

export type NodeEnv = 'development' | 'test' | 'production';

const csv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  )
  .pipe(z.array(z.string()));

const bool = z
  .string()
  .transform((value) => value === '1' || value.toLowerCase() === 'true')
  .pipe(z.boolean());

const int = (min: number, max: number) =>
  z
    .string()
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().min(min).max(max));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: int(0, 65535).default(8787),

  /** SQLite file, or ':memory:' for an ephemeral database. */
  DATABASE_FILE: z.string().default('./data/bball.db'),
  /** Seconds a busy writer waits for the lock before giving up. */
  DATABASE_BUSY_TIMEOUT_MS: int(0, 60_000).default(5000),

  /** HMAC key for access tokens. Required in production. */
  AUTH_SECRET: z.string().optional(),
  ACCESS_TOKEN_TTL_SECONDS: int(60, 60 * 60 * 24).default(900),
  REFRESH_TOKEN_TTL_SECONDS: int(600, 60 * 60 * 24 * 365).default(2592000),
  EMAIL_TOKEN_TTL_SECONDS: int(300, 60 * 60 * 24 * 7).default(86400),

  /** Allowed browser origins. Empty in production means "same origin only". */
  CORS_ORIGINS: csv.default([]),
  /** Set when the app is served from a different origin to the API. */
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('lax'),

  /** Public URL of the game, used to build verification and reset links. */
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5173'),

  /** Behind a load balancer this must be on for rate limiting to be correct. */
  TRUST_PROXY: bool.default(false),
  /** Largest accepted request body. Sync pushes are the biggest legitimate one. */
  BODY_LIMIT_BYTES: int(1024, 4 * 1024 * 1024).default(262144),

  RATE_LIMIT_WINDOW_SECONDS: int(1, 3600).default(60),
  RATE_LIMIT_MAX: int(1, 100_000).default(240),
  /** The tighter budget applied to every /v1/auth route. */
  AUTH_RATE_LIMIT_MAX: int(1, 10_000).default(20),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

  /** 'log' prints the message; 'noop' drops it; 'memory' keeps it for tests. */
  MAIL_DRIVER: z.enum(['log', 'noop', 'memory']).default('log'),
  MAIL_FROM: z.string().default('bBall <no-reply@bball.local>'),

  /** Turn off registration without a redeploy. */
  REGISTRATION_OPEN: bool.default(true),
  /** Require a verified email before progression can be written. */
  REQUIRE_VERIFIED_EMAIL: bool.default(false),

  /**
   * Origin the provider redirects back to, which is this API, not the game.
   * Defaults to PUBLIC_APP_URL, which is correct for the usual deployment
   * where the two are served together.
   */
  OAUTH_REDIRECT_BASE: z.string().url().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  /** Apple's Services ID; its "client id" is not the app's bundle id. */
  APPLE_CLIENT_ID: z.string().optional(),
  APPLE_TEAM_ID: z.string().optional(),
  APPLE_KEY_ID: z.string().optional(),
  /** Contents of the .p8 file. Newlines may be written as \n. */
  APPLE_PRIVATE_KEY: z.string().optional()
});

export interface AppConfig {
  readonly env: NodeEnv;
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly host: string;
  readonly port: number;
  readonly version: string;

  readonly database: {
    readonly file: string;
    readonly busyTimeoutMs: number;
  };

  readonly auth: {
    readonly secret: string;
    readonly accessTtlSeconds: number;
    readonly refreshTtlSeconds: number;
    readonly emailTokenTtlSeconds: number;
    readonly registrationOpen: boolean;
    readonly requireVerifiedEmail: boolean;
  };

  readonly http: {
    readonly corsOrigins: readonly string[];
    readonly cookieDomain: string | undefined;
    readonly cookieSameSite: 'strict' | 'lax' | 'none';
    readonly cookieSecure: boolean;
    readonly trustProxy: boolean;
    readonly bodyLimitBytes: number;
    readonly publicAppUrl: string;
  };

  readonly rateLimit: {
    readonly windowSeconds: number;
    readonly max: number;
    readonly authMax: number;
  };

  readonly logLevel: string;
  readonly mail: {
    readonly driver: 'log' | 'noop' | 'memory';
    readonly from: string;
  };

  readonly oauth: {
    /** Where providers redirect back to. Callbacks hang off this origin. */
    readonly redirectBase: string;
    /** Absent when the credentials are not configured; the provider is then simply not offered. */
    readonly google: { readonly clientId: string; readonly clientSecret: string } | undefined;
    readonly apple:
      | {
          readonly clientId: string;
          readonly teamId: string;
          readonly keyId: string;
          readonly privateKey: string;
        }
      | undefined;
  };
}

export class ConfigError extends Error {}

function defaultLogLevel(env: NodeEnv): string {
  if (env === 'test') return 'silent';
  return env === 'production' ? 'info' : 'debug';
}

/**
 * Build the config for a process.
 *
 * `source` is injectable so tests can build a server without touching the
 * ambient environment.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(`Invalid environment:\n${lines.join('\n')}`);
  }
  const raw = parsed.data;
  const env = raw.NODE_ENV;
  const isProduction = env === 'production';

  // A production deployment must bring its own signing key. Anything shorter
  // than 32 characters is treated as absent rather than quietly accepted.
  let secret = raw.AUTH_SECRET?.trim() ?? '';
  if (secret.length < 32) {
    if (isProduction) {
      throw new ConfigError('AUTH_SECRET must be set to at least 32 characters in production.');
    }
    // Ephemeral: restarting the dev server invalidates outstanding tokens,
    // which is the correct trade for never shipping a default secret.
    secret = randomBytes(48).toString('base64url');
  }

  if (isProduction && raw.DATABASE_FILE === ':memory:') {
    throw new ConfigError('DATABASE_FILE must point at a durable file in production.');
  }

  return {
    env,
    isProduction,
    isTest: env === 'test',
    host: raw.HOST,
    port: raw.PORT,
    version: process.env.npm_package_version ?? '1.0.0',

    database: {
      file: raw.DATABASE_FILE,
      busyTimeoutMs: raw.DATABASE_BUSY_TIMEOUT_MS
    },

    auth: {
      secret,
      accessTtlSeconds: raw.ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlSeconds: raw.REFRESH_TOKEN_TTL_SECONDS,
      emailTokenTtlSeconds: raw.EMAIL_TOKEN_TTL_SECONDS,
      registrationOpen: raw.REGISTRATION_OPEN,
      requireVerifiedEmail: raw.REQUIRE_VERIFIED_EMAIL
    },

    http: {
      corsOrigins: raw.CORS_ORIGINS,
      cookieDomain: raw.COOKIE_DOMAIN,
      cookieSameSite: raw.COOKIE_SAMESITE,
      // Secure cookies are mandatory in production, and impossible over plain
      // http in development, so this follows the environment rather than a flag.
      cookieSecure: isProduction,
      trustProxy: raw.TRUST_PROXY,
      bodyLimitBytes: raw.BODY_LIMIT_BYTES,
      publicAppUrl: raw.PUBLIC_APP_URL.replace(/\/+$/, '')
    },

    rateLimit: {
      windowSeconds: raw.RATE_LIMIT_WINDOW_SECONDS,
      max: raw.RATE_LIMIT_MAX,
      authMax: raw.AUTH_RATE_LIMIT_MAX
    },

    logLevel: raw.LOG_LEVEL ?? defaultLogLevel(env),
    mail: { driver: raw.MAIL_DRIVER, from: raw.MAIL_FROM },

    oauth: {
      redirectBase: (raw.OAUTH_REDIRECT_BASE ?? raw.PUBLIC_APP_URL).replace(/\/+$/, ''),
      // A provider appears only when it is completely configured. Half a set
      // of credentials is a deployment mistake, and offering a button that
      // cannot work is worse than not offering one.
      google:
        raw.GOOGLE_CLIENT_ID && raw.GOOGLE_CLIENT_SECRET
          ? { clientId: raw.GOOGLE_CLIENT_ID, clientSecret: raw.GOOGLE_CLIENT_SECRET }
          : undefined,
      apple:
        raw.APPLE_CLIENT_ID && raw.APPLE_TEAM_ID && raw.APPLE_KEY_ID && raw.APPLE_PRIVATE_KEY
          ? {
              clientId: raw.APPLE_CLIENT_ID,
              teamId: raw.APPLE_TEAM_ID,
              keyId: raw.APPLE_KEY_ID,
              // Environment variables cannot hold real newlines everywhere,
              // so the usual escaped form is accepted too.
              privateKey: raw.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n')
            }
          : undefined
    }
  };
}
