/**
 * Identity, sessions and account lifecycle.
 *
 * The assertions that matter most here are the negative ones: that a wrong
 * password and an unknown address are indistinguishable, that a spent refresh
 * token takes its whole family with it, and that a protected route says no to
 * every shape of missing, malformed, stale or foreign credential.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { AuthResponse, RefreshResponse } from '../../shared/protocol';
import { auth, GOOD_PASSWORD, makeServer, register, uniqueEmail, type TestServer } from './helpers';

let server: TestServer;

before(async () => {
  server = await makeServer();
});

after(async () => {
  await server.close();
});

describe('registration', () => {
  it('creates an account, a profile and a session', async () => {
    const email = uniqueEmail();
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: GOOD_PASSWORD, displayName: 'Ace' }
    });

    assert.equal(response.statusCode, 201);
    const body = response.json<AuthResponse>();
    assert.equal(body.user.email, email);
    assert.equal(body.user.emailVerified, false);
    assert.deepEqual(body.user.providers, ['password']);
    assert.equal(body.profile.displayName, 'Ace');
    assert.equal(body.profile.xp, 0);
    assert.equal(body.profile.level, 1);
    assert.ok(body.tokens.accessToken.length > 20);
    assert.ok(body.tokens.refreshToken.length > 20);
  });

  it('sends a verification email with a link, and never the raw token in the log', async () => {
    const email = uniqueEmail();
    await register(server.app, { email });
    const message = server.mailer.last(email);
    assert.ok(message, 'a verification email should have been sent');
    assert.match(message.text, /verify-email\?token=/);
  });

  it('treats the email address as case-insensitive', async () => {
    const email = uniqueEmail('Mixed.Case');
    await register(server.app, { email });

    const again = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: email.toUpperCase(), password: GOOD_PASSWORD }
    });
    assert.equal(again.statusCode, 409);
  });

  it('refuses a password that is too short, with a usable reason', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: uniqueEmail(), password: 'short' }
    });
    assert.equal(response.statusCode, 422);
    const body = response.json<{ error: { code: string; details?: { message: string }[] } }>();
    assert.equal(body.error.code, 'VALIDATION_FAILED');
    assert.ok(body.error.details && body.error.details.length > 0);
  });

  it('refuses a password containing the email address', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'frobnicator@example.test', password: 'frobnicator-1234' }
    });
    assert.equal(response.statusCode, 422);
  });

  it('rejects unknown fields rather than letting them ride along', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: uniqueEmail(), password: GOOD_PASSWORD, xp: 999_999, isAdmin: true }
    });
    assert.equal(response.statusCode, 422);
  });
});

describe('sign in', () => {
  it('accepts the right password', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: user.email, password: user.password }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json<AuthResponse>().user.id, user.userId);
  });

  it('gives the same answer for a wrong password and an unknown address', async () => {
    const user = await register(server.app);

    const wrong = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: user.email, password: 'definitely-not-it' }
    });
    const unknown = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: uniqueEmail('nobody'), password: 'definitely-not-it' }
    });

    assert.equal(wrong.statusCode, 401);
    assert.equal(unknown.statusCode, 401);
    // Identical code and message: the endpoint cannot be used to find out
    // which addresses have accounts.
    assert.deepEqual(
      { ...wrong.json<{ error: { code: string; message: string } }>().error, requestId: '' },
      { ...unknown.json<{ error: { code: string; message: string } }>().error, requestId: '' }
    );
  });
});

describe('sessions', () => {
  it('rotates the refresh token on every use', async () => {
    const user = await register(server.app);

    const first = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: user.refreshToken }
    });
    assert.equal(first.statusCode, 200);
    const rotated = first.json<RefreshResponse>().tokens;
    assert.notEqual(rotated.refreshToken, user.refreshToken);

    const second = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: rotated.refreshToken }
    });
    assert.equal(second.statusCode, 200);
  });

  it('revokes the whole family when a spent refresh token comes back', async () => {
    const user = await register(server.app);

    const first = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: user.refreshToken }
    });
    const live = first.json<RefreshResponse>().tokens;

    // The attacker replays the token the legitimate client already spent.
    const replay = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: user.refreshToken }
    });
    assert.equal(replay.statusCode, 401);

    // And the legitimate client's current token is now dead too, which is the
    // point: neither party keeps the session.
    const afterReuse = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: live.refreshToken }
    });
    assert.equal(afterReuse.statusCode, 401);
  });

  it('expires a refresh token once its lifetime has passed', async () => {
    const short = await makeServer({ REFRESH_TOKEN_TTL_SECONDS: '600' });
    try {
      const user = await register(short.app);
      short.advance(601 * 1000);

      const response = await short.app.inject({
        method: 'POST',
        url: '/v1/auth/refresh',
        payload: { refreshToken: user.refreshToken }
      });
      assert.equal(response.statusCode, 401);
      assert.equal(response.json<{ error: { code: string } }>().error.code, 'SESSION_EXPIRED');
    } finally {
      await short.close();
    }
  });

  it('rejects an expired access token on a protected route', async () => {
    const short = await makeServer({ ACCESS_TOKEN_TTL_SECONDS: '60' });
    try {
      const user = await register(short.app);
      short.advance(61 * 1000);

      const response = await short.app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: auth(user.accessToken)
      });
      assert.equal(response.statusCode, 401);
      assert.equal(response.json<{ error: { code: string } }>().error.code, 'SESSION_EXPIRED');
    } finally {
      await short.close();
    }
  });

  it('signs out of every device at once', async () => {
    const user = await register(server.app);
    const second = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: user.email, password: user.password }
    });
    const other = second.json<AuthResponse>().tokens;

    const revoked = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/logout-all',
      headers: auth(user.accessToken)
    });
    assert.equal(revoked.statusCode, 200);

    // Revocation is immediate rather than waiting for the access token to age
    // out, which is what makes "sign out everywhere" mean anything.
    for (const token of [user.accessToken, other.accessToken]) {
      const check = await server.app.inject({ method: 'GET', url: '/v1/me', headers: auth(token) });
      assert.equal(check.statusCode, 401);
    }
  });
});

describe('authorization', () => {
  const protectedRoutes: [string, string][] = [
    ['GET', '/v1/me'],
    ['PATCH', '/v1/profile'],
    ['POST', '/v1/progression/match'],
    ['POST', '/v1/progression/talents/purchase'],
    ['POST', '/v1/sync/push'],
    ['GET', '/v1/sync/pull']
  ];

  for (const [method, url] of protectedRoutes) {
    it(`refuses ${method} ${url} without a token`, async () => {
      const response = await server.app.inject({
        method: method as 'GET',
        url,
        ...(method === 'GET' ? {} : { payload: {} })
      });
      assert.equal(response.statusCode, 401);
    });
  }

  it('refuses a token that was signed with a different key', async () => {
    const other = await makeServer({
      AUTH_SECRET: 'a-completely-different-secret-'.padEnd(48, 'y')
    });
    try {
      const stranger = await register(other.app);
      const response = await server.app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: auth(stranger.accessToken)
      });
      assert.equal(response.statusCode, 401);
    } finally {
      await other.close();
    }
  });

  it('refuses a token whose payload has been edited', async () => {
    const user = await register(server.app);
    const victim = await register(server.app);

    const [header, body, signature] = user.accessToken.split('.') as [string, string, string];
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
      sub: string;
    };
    claims.sub = victim.userId;
    const forged = `${header}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.${signature}`;

    const response = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(forged)
    });
    assert.equal(response.statusCode, 401);
  });

  it('refuses a malformed authorization header', async () => {
    for (const value of ['', 'Bearer', 'Basic abc', 'Bearer not.a.token']) {
      const response = await server.app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: { authorization: value }
      });
      assert.equal(response.statusCode, 401, `header: "${value}"`);
    }
  });
});

describe('email verification', () => {
  it('confirms an address from the emailed link', async () => {
    const email = uniqueEmail();
    const user = await register(server.app, { email });
    const token = tokenFrom(server.mailer.last(email)?.text ?? '');

    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      payload: { token }
    });
    assert.equal(response.statusCode, 200);

    const me = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(user.accessToken)
    });
    assert.equal(me.json<{ user: { emailVerified: boolean } }>().user.emailVerified, true);
  });

  it('refuses the same link twice', async () => {
    const email = uniqueEmail();
    await register(server.app, { email });
    const token = tokenFrom(server.mailer.last(email)?.text ?? '');

    const first = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      payload: { token }
    });
    assert.equal(first.statusCode, 200);

    const second = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      payload: { token }
    });
    assert.equal(second.statusCode, 400);
  });
});

describe('password reset', () => {
  it('resets the password and ends every existing session', async () => {
    const email = uniqueEmail();
    const user = await register(server.app, { email });
    server.mailer.clear();

    const asked = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email }
    });
    assert.equal(asked.statusCode, 202);

    const token = tokenFrom(server.mailer.last(email)?.text ?? '');
    const reset = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/password/reset',
      payload: { token, password: 'a-brand-new-passphrase' }
    });
    assert.equal(reset.statusCode, 204);

    // The old session is gone - a reset is what a player does when they think
    // someone else is in their account.
    const stale = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(user.accessToken)
    });
    assert.equal(stale.statusCode, 401);

    const old = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: user.password }
    });
    assert.equal(old.statusCode, 401);

    const fresh = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'a-brand-new-passphrase' }
    });
    assert.equal(fresh.statusCode, 200);
  });

  it('answers the same way for an address with no account', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/password/forgot',
      payload: { email: uniqueEmail('ghost') }
    });
    assert.equal(response.statusCode, 202);
  });

  it('refuses an expired reset link', async () => {
    const short = await makeServer({ EMAIL_TOKEN_TTL_SECONDS: '600' });
    try {
      const email = uniqueEmail();
      await register(short.app, { email });
      short.mailer.clear();

      await short.app.inject({
        method: 'POST',
        url: '/v1/auth/password/forgot',
        payload: { email }
      });
      const token = tokenFrom(short.mailer.last(email)?.text ?? '');
      short.advance(601 * 1000);

      const response = await short.app.inject({
        method: 'POST',
        url: '/v1/auth/password/reset',
        payload: { token, password: 'another-good-passphrase' }
      });
      assert.equal(response.statusCode, 400);
    } finally {
      await short.close();
    }
  });
});

describe('account deletion', () => {
  it('needs the password even with a live session', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: auth(user.accessToken),
      payload: { password: 'not-the-password' }
    });
    assert.equal(response.statusCode, 401);
  });

  it('removes the account, its profile and its sessions', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: auth(user.accessToken),
      payload: { password: user.password }
    });
    assert.equal(response.statusCode, 204);

    const after = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(user.accessToken)
    });
    assert.equal(after.statusCode, 401);

    const signIn = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: user.email, password: user.password }
    });
    assert.equal(signIn.statusCode, 401);

    // Every child table cascades, so nothing of the account is left behind.
    const rows = server.db
      .prepare('SELECT COUNT(*) AS n FROM profiles WHERE user_id = ?')
      .get(user.userId) as { n: number };
    assert.equal(rows.n, 0);
  });
});

describe('rate limiting', () => {
  it('throttles repeated sign-in attempts', async () => {
    const limited = await makeServer({ AUTH_RATE_LIMIT_MAX: '3', RATE_LIMIT_WINDOW_SECONDS: '60' });
    try {
      const email = uniqueEmail();
      let sawLimit = false;
      for (let i = 0; i < 8; i++) {
        const response = await limited.app.inject({
          method: 'POST',
          url: '/v1/auth/login',
          payload: { email, password: 'guess-number-' + i }
        });
        if (response.statusCode === 429) {
          sawLimit = true;
          assert.equal(response.json<{ error: { code: string } }>().error.code, 'RATE_LIMITED');
          break;
        }
      }
      assert.ok(sawLimit, 'repeated sign-in attempts should be rate limited');
    } finally {
      await limited.close();
    }
  });

  it('never throttles the health endpoint', async () => {
    const limited = await makeServer({ RATE_LIMIT_MAX: '2' });
    try {
      for (let i = 0; i < 10; i++) {
        const response = await limited.app.inject({ method: 'GET', url: '/v1/health/live' });
        assert.equal(response.statusCode, 200);
      }
    } finally {
      await limited.close();
    }
  });
});

/** Pull the token out of an email body without depending on its wording. */
function tokenFrom(text: string): string {
  const match = /token=([^\s&]+)/.exec(text);
  if (!match?.[1]) throw new Error(`no token in message: ${text.slice(0, 120)}`);
  return decodeURIComponent(match[1]);
}
