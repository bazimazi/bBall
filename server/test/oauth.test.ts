/**
 * Social sign-in.
 *
 * Two halves, and both matter.
 *
 * The flow itself is tested against a stand-in provider, so state, PKCE,
 * nonce, the handoff code, account linking and session issue all run for
 * real without reaching Google or Apple.
 *
 * ID token verification is tested directly, with generated keys, because it
 * is the part where a mistake is not a bug but a way to sign in as anybody.
 */

import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import type { OAuthCompleteResponse, OAuthProvidersResponse } from '../../shared/protocol';
import { PROFILE_VERSION } from '../../src/core/profile/schema';
import { createProfile } from '../../src/core/profile/defaults';
import { clearJwksCache, verifyIdToken, type Jwk } from '../src/services/oauth/idToken';
import { __appleClientSecret } from '../src/services/oauth/providers';
import {
  OAuthError,
  type AuthorizeRequest,
  type ExchangeRequest,
  type OAuthIdentity,
  type OAuthProvider
} from '../src/services/oauth/types';
import { auth, GOOD_PASSWORD, makeServer, register, uniqueEmail, type TestServer } from './helpers';

/**
 * A provider that answers from a script.
 *
 * It records what it was asked so the tests can assert that the server sent a
 * state, a nonce and a PKCE challenge, and that the verifier it later
 * presents is the one that matches.
 */
function fakeProvider(id = 'fake'): OAuthProvider & {
  identities: Map<string, OAuthIdentity>;
  seen: AuthorizeRequest[];
  exchanges: ExchangeRequest[];
} {
  const identities = new Map<string, OAuthIdentity>();
  const seen: AuthorizeRequest[] = [];
  const exchanges: ExchangeRequest[] = [];

  return {
    id,
    name: 'Fake',
    identities,
    seen,
    exchanges,
    authorizeUrl(request) {
      seen.push(request);
      const url = new URL(`https://provider.test/${id}/authorize`);
      url.searchParams.set('state', request.state);
      url.searchParams.set('nonce', request.nonce);
      url.searchParams.set('code_challenge', request.codeChallenge);
      url.searchParams.set('redirect_uri', request.redirectUri);
      return url.toString();
    },
    async exchange(request) {
      exchanges.push(request);
      const identity = identities.get(request.code);
      if (!identity) throw new OAuthError(id, `no scripted identity for ${request.code}`);
      return identity;
    }
  };
}

function identity(patch: Partial<OAuthIdentity> = {}): OAuthIdentity {
  return {
    subject: 'provider-subject-1',
    email: uniqueEmail('social'),
    emailVerified: true,
    name: 'Social Player',
    ...patch
  };
}

let server: TestServer;
let provider: ReturnType<typeof fakeProvider>;

before(async () => {
  provider = fakeProvider();
  server = await makeServer({}, { oauthProviders: [provider] });
});

after(async () => {
  await server.close();
});

/** Run the provider round trip and return the handoff code. */
async function signInWith(
  who: OAuthIdentity,
  code = `code-${Math.random().toString(36).slice(2)}`
) {
  provider.identities.set(code, who);

  const started = await server.app.inject({
    method: 'POST',
    url: '/v1/auth/oauth/fake/start'
  });
  assert.equal(started.statusCode, 200);
  const { state } = started.json<{ state: string }>();

  const callback = await server.app.inject({
    method: 'GET',
    url: `/v1/auth/oauth/fake/callback?state=${encodeURIComponent(state)}&code=${code}`
  });
  assert.equal(callback.statusCode, 302);

  const location = new URL(callback.headers.location as string);
  const params = new URLSearchParams(location.hash.slice(location.hash.indexOf('?') + 1));
  return {
    status: params.get('status'),
    handoff: params.get('code'),
    reason: params.get('reason')
  };
}

async function complete(handoff: string, claim?: unknown) {
  const response = await server.app.inject({
    method: 'POST',
    url: '/v1/auth/oauth/complete',
    payload: claim ? { code: handoff, claim } : { code: handoff }
  });
  return { statusCode: response.statusCode, body: response.json<OAuthCompleteResponse>() };
}

describe('which providers exist', () => {
  it('lists the configured ones', async () => {
    const response = await server.app.inject({
      method: 'GET',
      url: '/v1/auth/oauth/providers'
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json<OAuthProvidersResponse>().providers, [
      { id: 'fake', name: 'Fake' }
    ]);
  });

  it('lists none when none are configured', async () => {
    const bare = await makeServer();
    try {
      const response = await bare.app.inject({
        method: 'GET',
        url: '/v1/auth/oauth/providers'
      });
      assert.deepEqual(response.json<OAuthProvidersResponse>().providers, []);
    } finally {
      await bare.close();
    }
  });

  it('refuses to start a provider that is not configured', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/google/start'
    });
    assert.equal(response.statusCode, 404);
  });

  it('refuses a provider id that is not a provider id', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/..%2F..%2Fetc/start'
    });
    assert.ok(response.statusCode >= 400);
  });
});

describe('starting a flow', () => {
  it('sends a state, a nonce and a PKCE challenge', async () => {
    const before = provider.seen.length;
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/fake/start'
    });
    assert.equal(response.statusCode, 200);

    const body = response.json<{ authorizeUrl: string; state: string; expiresAt: number }>();
    const request = provider.seen[before];
    assert.ok(request);
    assert.equal(request.state, body.state);
    assert.ok(request.nonce.length >= 16);
    assert.ok(request.codeChallenge.length >= 32);
    assert.match(request.redirectUri, /\/v1\/auth\/oauth\/fake\/callback$/);
    assert.ok(body.authorizeUrl.startsWith('https://provider.test/'));
    assert.ok(body.expiresAt > server.time());
  });

  it('gives every flow its own state', async () => {
    const states = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const response = await server.app.inject({
        method: 'POST',
        url: '/v1/auth/oauth/fake/start'
      });
      states.add(response.json<{ state: string }>().state);
    }
    assert.equal(states.size, 5);
  });
});

describe('the callback', () => {
  it('creates an account and hands back a one-time code', async () => {
    const who = identity({ subject: 'new-player-1' });
    const result = await signInWith(who);

    assert.equal(result.status, 'ok');
    assert.ok(result.handoff);

    const { statusCode, body } = await complete(result.handoff!);
    assert.equal(statusCode, 200);
    assert.equal(body.created, true);
    assert.equal(body.provider, 'fake');
    assert.equal(body.user.email, who.email);
    assert.equal(body.user.emailVerified, true);
    assert.deepEqual(body.user.providers, ['fake']);
    assert.equal(body.profile.displayName, 'Social Player');

    // The session it issued is a real one.
    const me = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(body.tokens.accessToken)
    });
    assert.equal(me.statusCode, 200);
  });

  it('recognises the same provider account next time', async () => {
    const who = identity({ subject: 'returning-player-1' });
    const first = await complete((await signInWith(who)).handoff!);
    const second = await complete((await signInWith(who)).handoff!);

    assert.equal(first.body.created, true);
    assert.equal(second.body.created, false);
    assert.equal(second.body.user.id, first.body.user.id);
  });

  it('follows the subject, not the address, when the email changes', async () => {
    const first = await complete(
      (await signInWith(identity({ subject: 'moved-player-1', email: uniqueEmail('before') })))
        .handoff!
    );
    const second = await complete(
      (await signInWith(identity({ subject: 'moved-player-1', email: uniqueEmail('after') })))
        .handoff!
    );
    assert.equal(second.body.user.id, first.body.user.id);
  });

  it('links to an existing password account when the address is verified', async () => {
    const existing = await register(server.app);
    const result = await signInWith(
      identity({ subject: 'linking-player-1', email: existing.email, emailVerified: true })
    );
    const { body } = await complete(result.handoff!);

    assert.equal(body.created, false);
    assert.equal(body.user.id, existing.userId);
    // Both methods now work on the one account.
    assert.deepEqual([...body.user.providers].sort(), ['fake', 'password']);

    const stillWorks = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: existing.email, password: existing.password }
    });
    assert.equal(stillWorks.statusCode, 200);
  });

  it('refuses to link on an address the provider has not verified', async () => {
    const existing = await register(server.app);
    const result = await signInWith(
      identity({ subject: 'hijack-attempt-1', email: existing.email, emailVerified: false })
    );

    // This is the pre-hijack attack: claim someone's address at a provider,
    // never confirm it, and sign in as them here.
    assert.equal(result.status, 'failed');
    assert.ok(result.reason);
    assert.equal(result.handoff, null);
  });

  it('creates a usable account when the provider gives no address', async () => {
    const result = await signInWith(
      identity({ subject: 'private-player-1', email: null, emailVerified: false })
    );
    const { body } = await complete(result.handoff!);

    assert.equal(body.created, true);
    assert.equal(body.user.emailVerified, false);
    assert.match(body.user.email, /@no-email\.bball\.invalid$/);

    const me = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(body.tokens.accessToken)
    });
    assert.equal(me.statusCode, 200);
  });

  it('refuses a callback whose state we never issued', async () => {
    provider.identities.set('orphan-code', identity({ subject: 'orphan-1' }));
    const response = await server.app.inject({
      method: 'GET',
      url: '/v1/auth/oauth/fake/callback?state=not-a-real-state&code=orphan-code'
    });

    assert.equal(response.statusCode, 302);
    assert.match(response.headers.location as string, /status=failed/);
  });

  it('refuses a state that has already been used', async () => {
    const code = 'replay-code-1';
    provider.identities.set(code, identity({ subject: 'replay-player-1' }));

    const started = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/fake/start'
    });
    const { state } = started.json<{ state: string }>();
    const url = `/v1/auth/oauth/fake/callback?state=${encodeURIComponent(state)}&code=${code}`;

    const first = await server.app.inject({ method: 'GET', url });
    const second = await server.app.inject({ method: 'GET', url });

    assert.match(first.headers.location as string, /status=ok/);
    assert.match(second.headers.location as string, /status=failed/);
  });

  it('sends the player home when they cancel at the provider', async () => {
    const response = await server.app.inject({
      method: 'GET',
      url: '/v1/auth/oauth/fake/callback?error=access_denied&state=whatever'
    });
    assert.equal(response.statusCode, 302);
    assert.match(response.headers.location as string, /status=cancelled/);
  });

  it('never puts a token in the redirect', async () => {
    const result = await signInWith(identity({ subject: 'no-tokens-in-urls-1' }));
    assert.ok(result.handoff);
    // The handoff is worthless without the POST that redeems it.
    assert.ok(!result.handoff!.includes('.'), 'a handoff code is opaque, not a JWT');
  });

  it('expires a flow that is never answered', async () => {
    const short = await makeServer({}, { oauthProviders: [fakeProvider()] });
    try {
      const started = await short.app.inject({
        method: 'POST',
        url: '/v1/auth/oauth/fake/start'
      });
      const { state } = started.json<{ state: string }>();

      short.advance(11 * 60 * 1000);
      const response = await short.app.inject({
        method: 'GET',
        url: `/v1/auth/oauth/fake/callback?state=${encodeURIComponent(state)}&code=anything`
      });
      assert.match(response.headers.location as string, /status=failed/);
    } finally {
      await short.close();
    }
  });
});

describe('returning to a packaged build', () => {
  /** Start a flow as a desktop or mobile shell would, and follow the callback. */
  async function nativeCallback(query: (state: string) => string) {
    const started = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/fake/start',
      payload: { client: 'native' }
    });
    assert.equal(started.statusCode, 200);
    const { state } = started.json<{ state: string }>();

    const callback = await server.app.inject({
      method: 'GET',
      url: `/v1/auth/oauth/fake/callback?${query(state)}`
    });
    assert.equal(callback.statusCode, 302);
    return new URL(callback.headers.location as string);
  }

  it('sends a successful sign-in to the app scheme, not the web page', async () => {
    const code = 'native-success-1';
    provider.identities.set(code, identity({ subject: 'native-player-1' }));

    const location = await nativeCallback(
      (state) => `state=${encodeURIComponent(state)}&code=${code}`
    );

    assert.equal(location.protocol, 'bball:');
    assert.equal(location.searchParams.get('status'), 'ok');

    // The code that came back over the scheme is a real handoff.
    const handoff = location.searchParams.get('code');
    assert.ok(handoff);
    const { statusCode } = await complete(handoff!);
    assert.equal(statusCode, 200);
  });

  it('sends a cancelled sign-in there too', async () => {
    // The flow is never consumed on this path, so the return address has to
    // be read from the flow rather than from the result of spending it.
    const location = await nativeCallback(
      (state) => `state=${encodeURIComponent(state)}&error=access_denied`
    );

    assert.equal(location.protocol, 'bball:');
    assert.equal(location.searchParams.get('status'), 'cancelled');
  });

  it('leaves browsers on the web page', async () => {
    const code = 'web-default-1';
    provider.identities.set(code, identity({ subject: 'web-player-1' }));

    const started = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/fake/start'
    });
    const { state } = started.json<{ state: string }>();
    const callback = await server.app.inject({
      method: 'GET',
      url: `/v1/auth/oauth/fake/callback?state=${encodeURIComponent(state)}&code=${code}`
    });

    const location = new URL(callback.headers.location as string);
    assert.match(location.protocol, /^https?:$/);
    assert.ok(location.hash.startsWith('#/oauth?'));
  });

  it('refuses a return address the caller made up', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/fake/start',
      payload: { client: 'https://evil.test/steal' }
    });
    assert.ok(response.statusCode >= 400);
  });
});

describe('redeeming the handoff', () => {
  it('works exactly once', async () => {
    const result = await signInWith(identity({ subject: 'single-use-1' }));
    const first = await complete(result.handoff!);
    assert.equal(first.statusCode, 200);

    const second = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/complete',
      payload: { code: result.handoff }
    });
    assert.equal(second.statusCode, 400);
  });

  it('refuses a code nobody issued', async () => {
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/oauth/complete',
      payload: { code: 'x'.repeat(40) }
    });
    assert.equal(response.statusCode, 400);
  });

  it('expires', async () => {
    const short = await makeServer({}, { oauthProviders: [provider] });
    try {
      provider.identities.set('expiring-code-1', identity({ subject: 'expiring-1' }));
      const started = await short.app.inject({
        method: 'POST',
        url: '/v1/auth/oauth/fake/start'
      });
      const { state } = started.json<{ state: string }>();
      const callback = await short.app.inject({
        method: 'GET',
        url: `/v1/auth/oauth/fake/callback?state=${encodeURIComponent(state)}&code=expiring-code-1`
      });
      const location = new URL(callback.headers.location as string);
      const handoff = new URLSearchParams(location.hash.slice(location.hash.indexOf('?') + 1)).get(
        'code'
      );

      short.advance(3 * 60 * 1000);
      const response = await short.app.inject({
        method: 'POST',
        url: '/v1/auth/oauth/complete',
        payload: { code: handoff }
      });
      assert.equal(response.statusCode, 400);
    } finally {
      await short.close();
    }
  });

  it('carries a guest save over at the same time', async () => {
    const base = createProfile(Date.now() - 86_400_000);
    const save = {
      schemaVersion: PROFILE_VERSION,
      saveId: 'oauth-guest-save-1',
      updatedAt: Date.now(),
      profile: {
        ...base,
        id: 'oauth-guest-save-1',
        xp: 900,
        stats: { ...base.stats, matches: 12, wins: 8, playSeconds: 1800, bestRally: 25 }
      }
    };

    const result = await signInWith(identity({ subject: 'claiming-player-1' }));
    const { body } = await complete(result.handoff!, save);

    assert.equal(body.claim?.outcome, 'adopted');
    assert.ok(body.profile.xp >= 900);
    assert.equal(body.profile.stats.matches, 12);
  });
});

describe('an account with no password', () => {
  it('cannot be signed in to with one', async () => {
    const who = identity({ subject: 'passwordless-1' });
    await complete((await signInWith(who)).handoff!);

    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: who.email, password: GOOD_PASSWORD }
    });
    assert.equal(response.statusCode, 401);
  });

  it('can still be deleted, on the strength of the session alone', async () => {
    const { body } = await complete(
      (await signInWith(identity({ subject: 'deletable-1' }))).handoff!
    );

    const response = await server.app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: auth(body.tokens.accessToken),
      payload: {}
    });
    assert.equal(response.statusCode, 204);
  });

  it('still requires the password when there is one', async () => {
    const existing = await register(server.app);
    const response = await server.app.inject({
      method: 'DELETE',
      url: '/v1/me',
      headers: auth(existing.accessToken),
      payload: {}
    });
    assert.equal(response.statusCode, 401);
  });
});

// ------------------------------------------------------ id token checking

describe('id token verification', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...(publicKey.export({ format: 'jwk' }) as Jwk), kid: 'test-key-1', alg: 'RS256' };

  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });

  const JWKS_URI = 'https://provider.test/jwks';
  const ISSUER = 'https://provider.test';
  const AUDIENCE = 'client-id-1';

  /** Serves the key set, and nothing else. */
  const fetcher = (async (input: RequestInfo | URL) => {
    if (input.toString() !== JWKS_URI) throw new Error('unexpected fetch');
    return new Response(JSON.stringify({ keys: [jwk] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  function sign(
    claims: Record<string, unknown>,
    key: KeyObject = privateKey,
    kid = 'test-key-1'
  ): string {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const input = `${encode({ alg: 'RS256', kid, typ: 'JWT' })}.${encode(claims)}`;
    const signer = createSign('RSA-SHA256');
    signer.update(input);
    signer.end();
    return `${input}.${signer.sign(key, 'base64url')}`;
  }

  const baseClaims = (patch: Record<string, unknown> = {}) => {
    const now = Math.floor(Date.now() / 1000);
    return {
      iss: ISSUER,
      aud: AUDIENCE,
      sub: 'subject-1',
      iat: now,
      exp: now + 600,
      nonce: 'nonce-1',
      email: 'player@provider.test',
      email_verified: true,
      ...patch
    };
  };

  const verify = (token: string, nonce = 'nonce-1') =>
    verifyIdToken({
      provider: 'fake',
      token,
      jwksUri: JWKS_URI,
      issuers: [ISSUER],
      audience: AUDIENCE,
      nonce,
      fetcher,
      now: Date.now()
    });

  before(() => clearJwksCache());

  it('accepts a properly signed token', async () => {
    const claims = await verify(sign(baseClaims()));
    assert.equal(claims.sub, 'subject-1');
    assert.equal(claims.email, 'player@provider.test');
  });

  it('rejects a token signed with someone else' + "'s key", async () => {
    await assert.rejects(() => verify(sign(baseClaims(), other.privateKey)), OAuthError);
  });

  it('rejects a token whose payload was edited after signing', async () => {
    const token = sign(baseClaims());
    const [header, , signature] = token.split('.') as [string, string, string];
    const tampered = Buffer.from(JSON.stringify(baseClaims({ sub: 'somebody-else' }))).toString(
      'base64url'
    );
    await assert.rejects(() => verify(`${header}.${tampered}.${signature}`), OAuthError);
  });

  it('rejects a token issued for a different client', async () => {
    await assert.rejects(() => verify(sign(baseClaims({ aud: 'another-app' }))), OAuthError);
  });

  it('rejects a token from a different issuer', async () => {
    await assert.rejects(() => verify(sign(baseClaims({ iss: 'https://evil.test' }))), OAuthError);
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    await assert.rejects(() => verify(sign(baseClaims({ exp: now - 3600 }))), OAuthError);
  });

  it('rejects a token replayed from another sign-in attempt', async () => {
    await assert.rejects(
      () => verify(sign(baseClaims({ nonce: 'someone-elses-nonce' }))),
      OAuthError
    );
  });

  it('rejects an unsigned token', async () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const none = `${encode({ alg: 'none', typ: 'JWT' })}.${encode(baseClaims())}.`;
    await assert.rejects(() => verify(none), OAuthError);
  });

  it('rejects a token that is not a token', async () => {
    await assert.rejects(() => verify('not.a.jwt'), OAuthError);
  });
});

describe("apple's client secret", () => {
  it('is a well-formed ES256 assertion', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();

    const secret = __appleClientSecret(
      { clientId: 'com.example.bball', teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey: pem },
      Date.now()
    );

    const [header, payload, signature] = secret.split('.') as [string, string, string];
    const decoded = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as {
      alg: string;
      kid: string;
    };
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      iss: string;
      aud: string;
      sub: string;
      exp: number;
      iat: number;
    };

    assert.equal(decoded.alg, 'ES256');
    assert.equal(decoded.kid, 'KEY1234567');
    assert.equal(claims.iss, 'TEAM123456');
    assert.equal(claims.aud, 'https://appleid.apple.com');
    assert.equal(claims.sub, 'com.example.bball');
    assert.ok(claims.exp > claims.iat);
    // Used once, immediately: it has no business living for six months.
    assert.ok(claims.exp - claims.iat <= 600);
    // P-1363 encoding: 32 bytes of r and 32 of s.
    assert.equal(Buffer.from(signature, 'base64url').length, 64);
  });
});
