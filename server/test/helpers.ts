/**
 * Test scaffolding.
 *
 * Every suite builds a whole server - real routing, real plugins, real
 * middleware, real SQLite - over an in-memory database and a memory mailer,
 * and drives it through `app.inject()`. Nothing is mocked below the HTTP
 * boundary, so a test that passes here exercises the same code path a browser
 * would, minus the socket.
 *
 * The clock is injectable, which is what lets expiry, rotation and the daily
 * damper be tested without a suite that takes an hour to run.
 */

import type { FastifyInstance } from 'fastify';

import { buildApp, type BuildOptions, type BuiltApp } from '../src/app';
import { loadConfig, type AppConfig } from '../src/config/env';
import { MemoryMailer } from '../src/services/mail';
import type {
  AuthResponse,
  CloudProfileDto,
  MatchSubmissionDto,
  RecordMatchResponse
} from '../../shared/protocol';

/** A signing key that is obviously a test key and long enough to be accepted. */
const TEST_SECRET = 'test-secret-'.padEnd(48, 'x');

export function testConfig(patch: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_FILE: ':memory:',
    AUTH_SECRET: TEST_SECRET,
    MAIL_DRIVER: 'memory',
    PUBLIC_APP_URL: 'http://localhost:5173',
    CORS_ORIGINS: 'http://localhost:5173',
    // Generous by default: a suite should fail on behaviour, not on a limiter.
    // The rate-limit tests set their own.
    RATE_LIMIT_MAX: '100000',
    AUTH_RATE_LIMIT_MAX: '10000',
    ...patch
  });
}

export interface TestServer extends BuiltApp {
  readonly mailer: MemoryMailer;
  /** Move the injectable clock forward. */
  advance(ms: number): void;
  /** The current value of the injectable clock. */
  time(): number;
}

export async function makeServer(
  patch: Record<string, string> = {},
  /** Anything else `buildApp` takes - stand-in sign-in providers, mostly. */
  extra: Omit<BuildOptions, 'config' | 'mailer' | 'now'> = {}
): Promise<TestServer> {
  const config = testConfig(patch);
  const mailer = new MemoryMailer();

  let offset = 0;
  const built = await buildApp({ ...extra, config, mailer, now: () => Date.now() + offset });

  return {
    ...built,
    mailer,
    advance(ms: number) {
      offset += ms;
    },
    time() {
      return Date.now() + offset;
    },
    close: built.close
  };
}

// ------------------------------------------------------------------ auth

export interface TestUser {
  readonly email: string;
  readonly password: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly userId: string;
  readonly profile: CloudProfileDto;
}

let sequence = 0;

export function uniqueEmail(prefix = 'player'): string {
  sequence += 1;
  return `${prefix}.${sequence}.${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export const GOOD_PASSWORD = 'correct-horse-battery';

export async function register(
  app: FastifyInstance,
  overrides: { email?: string; password?: string; displayName?: string; claim?: unknown } = {}
): Promise<TestUser> {
  const email = overrides.email ?? uniqueEmail();
  const password = overrides.password ?? GOOD_PASSWORD;

  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: {
      email,
      password,
      ...(overrides.displayName ? { displayName: overrides.displayName } : {}),
      ...(overrides.claim ? { claim: overrides.claim } : {})
    }
  });

  if (response.statusCode !== 201) {
    throw new Error(`register failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json<AuthResponse>();
  return {
    email,
    password,
    accessToken: body.tokens.accessToken,
    refreshToken: body.tokens.refreshToken,
    userId: body.user.id,
    profile: body.profile
  };
}

export function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

// ------------------------------------------------------------- fixtures

let matchCounter = 0;

/**
 * A plausible Quick Match win.
 *
 * The defaults sit comfortably inside every anti-cheat rule, so a test that
 * wants to trip one changes exactly the field it is testing and nothing else
 * can be blamed for the rejection.
 */
export function matchSubmission(patch: Partial<MatchSubmissionDto> = {}): MatchSubmissionDto {
  matchCounter += 1;
  return {
    clientMatchId: `m-${matchCounter}-${Math.random().toString(36).slice(2, 10)}`,
    mode: 'quick',
    botId: 'amateur',
    won: true,
    scoreYou: 5,
    scoreBot: 3,
    bestRally: 14,
    hits: 40,
    seconds: 95,
    livesLeft: 0,
    objectiveMet: true,
    shutout: false,
    comeback: false,
    abandoned: false,
    talent: {
      abilitiesUsed: 0,
      powerStrikes: 0,
      dashes: 0,
      perfectGuards: 0,
      crits: 0,
      shieldSaves: 0,
      secondChances: 0,
      ultimates: 0,
      bestDrive: 0
    },
    playedAt: Date.now(),
    ...patch
  };
}

export async function recordMatch(
  app: FastifyInstance,
  token: string,
  submission: MatchSubmissionDto
): Promise<RecordMatchResponse> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/progression/match',
    headers: auth(token),
    payload: submission
  });
  if (response.statusCode !== 200) {
    throw new Error(`recordMatch failed: ${response.statusCode} ${response.body}`);
  }
  return response.json<RecordMatchResponse>();
}

/**
 * Play until the profile reaches at least `level`.
 *
 * Used by tests that need talent points without caring how they were earned:
 * the XP comes through the real reward path rather than being written into
 * the database, so these tests also prove that levelling works.
 *
 * The clock is advanced between matches because it has to be - the server
 * refuses more than ninety minutes of play per hour, and a loop that ignored
 * that would be testing the anti-cheat rule instead of the levelling.
 */
export async function grindToLevel(
  server: TestServer,
  token: string,
  level: number,
  max = 60
): Promise<CloudProfileDto> {
  for (let i = 0; i < max; i++) {
    const result = await recordMatch(
      server.app,
      token,
      matchSubmission({
        botId: 'legend',
        scoreYou: 5,
        scoreBot: 0,
        shutout: true,
        seconds: 120,
        playedAt: server.time()
      })
    );
    if (result.profile.level >= level) return result.profile;
    server.advance(10 * 60 * 1000);
  }
  throw new Error(`could not reach level ${level} in ${max} matches`);
}
