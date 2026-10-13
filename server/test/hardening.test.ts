/**
 * Regressions from a security and correctness review of the account layer.
 *
 * Each block pins one finding: a header the browser preflights, a form the
 * server could not read, a reset link burnt by a rejected password, a
 * revocation rolled back by the throw that followed it, a cookie that
 * survived "sign out", stored responses that outlived their account, a rate
 * limit that never knew who was asking, an offline evening refused as one
 * impossible hour. The tests are written against behaviour, so they say what
 * the fix promises rather than how it is built.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { ClaimResponse, OAuthCompleteResponse, SyncPushResponse } from '../../shared/protocol';
import { starXp } from '../../src/core/campaign/journey';
import { createProfile } from '../../src/core/profile/defaults';
import { PROFILE_VERSION } from '../../src/core/profile/schema';
import type { PlayerProfile } from '../../src/core/profile/types';
import { createTournament } from '../../src/core/tournament/bracket';
import { CLAIM_LIMITS } from '../src/domain/claim';
import { budgetTime, LIMITS } from '../src/domain/matchValidation';
import { OAuthError, type OAuthIdentity, type OAuthProvider } from '../src/services/oauth/types';
import {
  auth,
  GOOD_PASSWORD,
  makeServer,
  matchSubmission,
  register,
  uniqueEmail,
  type TestServer
} from './helpers';

/** A provider that signs in whoever the test scripted for a code. */
function scriptedProvider(): OAuthProvider & { identities: Map<string, OAuthIdentity> } {
  const identities = new Map<string, OAuthIdentity>();
  return {
    id: 'fake',
    name: 'Fake',
    identities,
    authorizeUrl: (request) => `https://provider.test/authorize?state=${request.state}`,
    async exchange(request) {
      const identity = identities.get(request.code);
      if (!identity) throw new OAuthError('fake', 'no scripted identity');
      return identity;
    }
  };
}

let server: TestServer;
let provider: ReturnType<typeof scriptedProvider>;

before(async () => {
  provider = scriptedProvider();
  server = await makeServer({}, { oauthProviders: [provider] });
});

after(async () => {
  await server.close();
});

function errorCode(response: { json<T>(): T }): string {
  return response.json<{ error: { code: string } }>().error.code;
}

function tokenFrom(text: string): string {
  const match = /token=([^\s&]+)/.exec(text);
  if (!match?.[1]) throw new Error(`no token in message: ${text.slice(0, 120)}`);
  return decodeURIComponent(match[1]);
}

async function socialSignIn(who: OAuthIdentity): Promise<OAuthCompleteResponse> {
  const code = `code-${Math.random().toString(36).slice(2)}`;
  provider.identities.set(code, who);
  const started = await server.app.inject({ method: 'POST', url: '/v1/auth/oauth/fake/start' });
  const { state } = started.json<{ state: string }>();
  const callback = await server.app.inject({
    method: 'GET',
    url: `/v1/auth/oauth/fake/callback?state=${encodeURIComponent(state)}&code=${code}`
  });
  const location = new URL(callback.headers.location as string);
  const params = new URLSearchParams(location.hash.slice(location.hash.indexOf('?') + 1));
  const handoff = params.get('code');
  assert.ok(handoff, `sign-in did not complete: ${params.get('reason') ?? ''}`);
  const completed = await server.app.inject({
    method: 'POST',
    url: '/v1/auth/oauth/complete',
    payload: { code: handoff }
  });
  assert.equal(completed.statusCode, 200);
  return completed.json<OAuthCompleteResponse>();
}

async function push(token: string, ops: unknown[]): Promise<SyncPushResponse> {
  const response = await server.app.inject({
    method: 'POST',
    url: '/v1/sync/push',
    headers: auth(token),
    payload: { baseVersion: 0, ops }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json<SyncPushResponse>();
}

// ------------------------------------------------------------- transport

describe('cross-origin sync', () => {
  it('lets a packaged build preflight the device header that pull and push send', async () => {
    const response = await server.app.inject({
      method: 'OPTIONS',
      url: '/v1/sync/push',
      headers: {
        origin: 'tauri://localhost',
        'access-control-request-method': 'POST',
        'access-control-request-headers':
          'authorization,content-type,idempotency-key,x-bball-protocol,x-bball-device'
      }
    });
    assert.ok(response.statusCode < 300, `preflight refused: ${response.statusCode}`);
    assert.equal(response.headers['access-control-allow-origin'], 'tauri://localhost');
    const allowed = String(response.headers['access-control-allow-headers']).toLowerCase();
    for (const header of ['authorization', 'idempotency-key', 'x-bball-protocol', 'x-bball-device'])
      assert.ok(allowed.split(/\s*,\s*/).includes(header), `${header} is not allowed`);
  });
});

describe('rate limits', () => {
  it('counts a signed-in caller against its own account, not the shared address', async () => {
    const limited = await makeServer({ RATE_LIMIT_MAX: '3' });
    try {
      const first = await register(limited.app);
      const second = await register(limited.app);

      for (let i = 0; i < 3; i++) {
        const ok = await limited.app.inject({
          method: 'GET',
          url: '/v1/me',
          headers: auth(first.accessToken)
        });
        assert.equal(ok.statusCode, 200);
      }
      const throttled = await limited.app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: auth(first.accessToken)
      });
      assert.equal(throttled.statusCode, 429);

      // Same address, different account: a budget of its own.
      const other = await limited.app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: auth(second.accessToken)
      });
      assert.equal(other.statusCode, 200);

      // A token that does not verify is just an address.
      const forged = await limited.app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: auth(`${first.accessToken.slice(0, -4)}AAAA`)
      });
      assert.equal(forged.statusCode, 401);
    } finally {
      await limited.close();
    }
  });
});

// ---------------------------------------------------------------- sessions

describe('session lifecycle', () => {
  it('keeps the revocation of a disabled account even though the refresh fails', async () => {
    const user = await register(server.app);
    server.db.prepare("UPDATE users SET status = 'disabled' WHERE id = ?").run(user.userId);

    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: user.refreshToken }
    });
    assert.equal(response.statusCode, 401);

    const row = server.db
      .prepare('SELECT revoked_at, revoked_reason FROM sessions WHERE user_id = ?')
      .get(user.userId) as { revoked_at: number | null; revoked_reason: string | null };
    assert.ok(row.revoked_at !== null);
    assert.equal(row.revoked_reason, 'user-inactive');
  });

  it('clears the refresh cookie on the configured domain', async () => {
    const shared = await makeServer({ COOKIE_DOMAIN: 'example.test' });
    try {
      const user = await register(shared.app);
      for (const url of ['/v1/auth/logout']) {
        const response = await shared.app.inject({
          method: 'POST',
          url,
          payload: { refreshToken: user.refreshToken }
        });
        const cookie = String(response.headers['set-cookie']);
        assert.match(cookie, /bball_rt=;/);
        assert.match(cookie, /Domain=example\.test/i);
        assert.match(cookie, /Path=\/v1\/auth/);
      }
    } finally {
      await shared.close();
    }
  });

  it('answers an unverified account with EMAIL_NOT_VERIFIED, not a session failure', async () => {
    const strict = await makeServer({ REQUIRE_VERIFIED_EMAIL: 'true' });
    try {
      const user = await register(strict.app);
      const response = await strict.app.inject({
        method: 'POST',
        url: '/v1/sync/push',
        headers: auth(user.accessToken),
        payload: { baseVersion: 0, ops: [] }
      });
      assert.equal(response.statusCode, 403);
      assert.equal(errorCode(response), 'EMAIL_NOT_VERIFIED');
    } finally {
      await strict.close();
    }
  });
});

// ---------------------------------------------------------- password reset

describe('password reset', () => {
  it('does not burn the link on a password the policy refuses', async () => {
    const email = uniqueEmail();
    await register(server.app, { email });
    server.mailer.clear();
    await server.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email }
    });
    const token = tokenFrom(server.mailer.last(email)?.text ?? '');

    const weak = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token, password: 'short' }
    });
    assert.equal(weak.statusCode, 422);

    const good = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token, password: 'a-brand-new-passphrase' }
    });
    assert.equal(good.statusCode, 204);

    // And it is single use once it has actually been used.
    const again = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token, password: 'yet-another-passphrase' }
    });
    assert.equal(again.statusCode, 400);
  });

  it('gives a provider-only account a usable password identity', async () => {
    const email = uniqueEmail('social');
    const signedIn = await socialSignIn({
      subject: `reset-${email}`,
      email,
      emailVerified: true,
      name: 'Social'
    });
    assert.deepEqual(signedIn.user.providers, ['fake']);

    server.mailer.clear();
    await server.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email }
    });
    const reset = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token: tokenFrom(server.mailer.last(email)?.text ?? ''), password: GOOD_PASSWORD }
    });
    assert.equal(reset.statusCode, 204);

    const login = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: GOOD_PASSWORD }
    });
    assert.equal(login.statusCode, 200);
    const body = login.json<OAuthCompleteResponse>();
    assert.deepEqual([...body.user.providers].sort(), ['fake', 'password']);

    // Deletion now asks for that password, and accepts it.
    const deleted = await server.app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: auth(body.tokens.accessToken),
      payload: { password: GOOD_PASSWORD }
    });
    assert.equal(deleted.statusCode, 204);
  });
});

// ------------------------------------------------------------ idempotency

describe('stored responses', () => {
  it('stop replaying once they expire, and a reused key then records afresh', async () => {
    const user = await register(server.app);
    const key = 'expiring-key-1';
    const send = (lastBot: string) =>
      server.app.inject({
        method: 'POST',
        url: '/v1/sync/push',
        headers: { ...auth(user.accessToken), 'idempotency-key': key },
        payload: {
          baseVersion: 0,
          ops: [{ kind: 'preferences.update', opId: `pref-${lastBot}`, payload: { lastBot } }]
        }
      });

    assert.equal((await send('pro')).statusCode, 200);
    assert.equal((await send('elite')).statusCode, 409, 'a live key is bound to its body');

    server.advance(25 * 60 * 60 * 1000);
    // The old access token has expired with the clock; sign in again.
    const login = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: user.email, password: user.password }
    });
    const token = login.json<{ tokens: { accessToken: string } }>().tokens.accessToken;
    const later = await server.app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: { ...auth(token), 'idempotency-key': key },
      payload: {
        baseVersion: 0,
        ops: [{ kind: 'preferences.update', opId: 'pref-elite', payload: { lastBot: 'elite' } }]
      }
    });
    assert.equal(later.statusCode, 200);
    assert.equal(later.json<SyncPushResponse>().results[0]?.status, 'applied');

    const row = server.db
      .prepare(
        'SELECT request_hash, expires_at FROM idempotency_keys WHERE user_id = ? AND key = ?'
      )
      .get(user.userId, key) as { request_hash: string; expires_at: number };
    assert.ok(row.expires_at > server.time(), 'the reused key carries a fresh expiry');
  });

  it('are deleted with the account', async () => {
    const user = await register(server.app);
    await server.app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: { ...auth(user.accessToken), 'idempotency-key': 'deleted-key-1' },
      payload: { baseVersion: 0, ops: [] }
    });
    const count = () =>
      (
        server.db
          .prepare('SELECT COUNT(*) AS n FROM idempotency_keys WHERE user_id = ?')
          .get(user.userId) as { n: number }
      ).n;
    assert.equal(count(), 1);

    const deleted = await server.app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: auth(user.accessToken),
      payload: { password: user.password }
    });
    assert.equal(deleted.statusCode, 204);
    assert.equal(count(), 0);
  });
});

// -------------------------------------------------------------------- sync

describe('sync replays', () => {
  it('reports a recorded refusal again instead of calling it a duplicate', async () => {
    const user = await register(server.app);
    const op = { kind: 'run.pick', opId: 'pick-without-run-1', payload: { boonId: 'anything' } };

    const first = await push(user.accessToken, [op]);
    assert.equal(first.results[0]?.status, 'rejected');
    assert.equal(first.results[0]?.code, 'NOT_FOUND');

    // The first response was lost; the client sends the op again.
    const second = await push(user.accessToken, [op]);
    assert.equal(second.results[0]?.status, 'rejected');
    assert.equal(second.results[0]?.code, 'NOT_FOUND');
    assert.equal(second.results[0]?.reason, first.results[0]?.reason);
  });
});

// ------------------------------------------------------------- play budget

describe('the play budget', () => {
  it('places offline play in the hours it was played, not the moment it arrived', async () => {
    const user = await register(server.app);
    // Three hours later the player reconnects with an evening of matches.
    server.advance(3.5 * 60 * 60 * 1000);
    const token = (
      await server.app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: user.email, password: user.password }
      })
    ).json<{ tokens: { accessToken: string } }>().tokens.accessToken;

    const start = server.time() - 3 * 60 * 60 * 1000;
    const ops = Array.from({ length: 30 }, (_, i) => {
      const submission = matchSubmission({
        seconds: 240,
        hits: 60,
        bestRally: 20,
        playedAt: start + i * 6 * 60 * 1000
      });
      return { kind: 'match', opId: submission.clientMatchId, payload: submission };
    });
    // Two hours of play in all - more than one hour's budget, but never more
    // than forty minutes inside any hour it was actually played in.
    const response = await push(token, ops);
    const refused = response.results.filter((result) => result.status === 'rejected');
    assert.deepEqual(refused, []);
    assert.equal(response.profile.stats.matches, 30);
  });

  it('still refuses more play than an hour holds, wherever it is placed', async () => {
    const user = await register(server.app);
    const at = server.time();
    const ops = Array.from({ length: 30 }, () => {
      const submission = matchSubmission({ seconds: 240, hits: 60, bestRally: 20, playedAt: at });
      return { kind: 'match', opId: submission.clientMatchId, payload: submission };
    });
    const response = await push(user.accessToken, ops);
    assert.ok(response.results.some((result) => result.status === 'rejected'));
  });

  it('only believes a timestamp inside bounds the server can stand behind', () => {
    const now = 1_000_000_000_000;
    const hour = 60 * 60 * 1000;
    // Played an hour ago, account a week old: believed.
    assert.equal(budgetTime(now - hour, now - 168 * hour, now), now - hour);
    // Before the account existed: counted on arrival.
    assert.equal(budgetTime(now - 2 * hour, now - hour, now), now);
    // Older than the lookback: counted on arrival.
    assert.equal(budgetTime(now - LIMITS.playedAtLookbackMs - 1, 0, now), now);
    // A little ahead of the server's clock: within the skew allowance.
    assert.equal(budgetTime(now + 60_000, 0, now), now + 60_000);
  });
});

// ------------------------------------------------------------------ claims

describe('claiming a guest save', () => {
  function guestSave(patch: Partial<PlayerProfile>) {
    const base = createProfile(Date.now() - 86_400_000);
    const profile: PlayerProfile = {
      ...base,
      id: `guest-hardening-${Math.random().toString(36).slice(2)}`,
      xp: 600,
      stats: {
        ...base.stats,
        matches: 12,
        wins: 8,
        losses: 4,
        rallyHits: 300,
        bestRally: 20,
        playSeconds: 1800
      },
      ...patch
    };
    return {
      schemaVersion: PROFILE_VERSION,
      saveId: profile.id,
      updatedAt: profile.updatedAt,
      profile
    };
  }

  it('never imports a cup in progress', async () => {
    const user = await register(server.app);
    const save = guestSave({ tournament: { ...createTournament(9), round: 5 } });
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/sync/claim',
      headers: auth(user.accessToken),
      payload: { save }
    });
    assert.equal(response.statusCode, 200);
    const body = response.json<ClaimResponse>();
    assert.notEqual(body.claim.outcome, 'rejected');
    assert.equal(body.profile.tournament, null);
  });

  it('values a Journey star at the highest rate the client pays', () => {
    assert.equal(CLAIM_LIMITS.xpPerStar, starXp(30));
  });
});
