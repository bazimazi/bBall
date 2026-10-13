/* eslint-disable @typescript-eslint/consistent-type-imports -- Import client stores after installing the browser. */
/**
 * Client-side regressions from the account-layer review, against the real
 * client modules and the real server (see `browser.ts`).
 *
 * - An operation the server could not apply for a transient reason stays
 *   queued and is sent again, instead of being dropped as if refused.
 * - A social sign-in link this device never started is refused, and refusing
 *   it does not throw away the queue of the account that is signed in.
 * - Two tabs racing to refresh one cookie do not sign the player out.
 */

import assert from 'node:assert/strict';
import { after, afterEach, before, it } from 'node:test';

import { installBrowser, settle, type FakeBrowser } from './browser';
import {
  GOOD_PASSWORD,
  makeServer,
  matchSubmission,
  uniqueEmail,
  type TestServer
} from './helpers';

let server: TestServer;
let browser: FakeBrowser;
let account: typeof import('../../src/core/account/store').accountStore;
let profiles: typeof import('../../src/core/profile/store').profileStore;
let session: typeof import('../../src/core/account/session');
let outbox: typeof import('../../src/core/account/outbox');
let progression: typeof import('../../src/core/account/progression');
let practice: typeof import('../../src/core/account/localPractice');
let api: typeof import('../../src/core/net/api').api;
let installedFetch: typeof fetch;
let userId: string;

async function until(done: () => boolean, what: string) {
  const deadline = Date.now() + 5_000;
  while (!done() && Date.now() < deadline) await settle(5);
  assert.ok(done(), what);
}

const calls = (path: string) => browser.requests.filter((r) => r.url.endsWith(path)).length;

before(async () => {
  server = await makeServer();
  browser = installBrowser(server.app);
  installedFetch = globalThis.fetch;
  profiles = (await import('../../src/core/profile/store')).profileStore;
  account = (await import('../../src/core/account/store')).accountStore;
  session = await import('../../src/core/account/session');
  outbox = await import('../../src/core/account/outbox');
  progression = await import('../../src/core/account/progression');
  practice = await import('../../src/core/account/localPractice');
  api = (await import('../../src/core/net/api')).api;
  account.start();
  await account.register(uniqueEmail('hardening'), GOOD_PASSWORD, { displayName: 'Hardened' });
  userId = profiles.getSnapshot().id;
});

afterEach(async () => {
  globalThis.fetch = installedFetch;
  if (!browser.online) browser.goOnline();
  await until(
    () => outbox.pendingCount() === 0 && account.getSnapshot().sync !== 'syncing',
    'the queue drains between tests'
  );
});

after(async () => {
  await account.signOut();
  await settle(450);
  browser.restore();
  await server.close();
});

it('keeps an operation the server could not apply and sends it again', async () => {
  // Stand in for a server fault on the match, once: the server reports it
  // INTERNAL and leaves it unrecorded, which is exactly what this models.
  let faulted = false;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await installedFetch(input, init);
    if (faulted || !String(input).endsWith('/v1/sync/push')) return response;
    faulted = true;
    const body = (await response.json()) as { results: { kind: string }[] };
    body.results = body.results.map((result) =>
      result.kind === 'match'
        ? {
            ...result,
            status: 'rejected',
            code: 'INTERNAL',
            reason: 'That change could not be applied.'
          }
        : result
    );
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  progression.recordMatch({
    ...matchSubmission(),
    ranked: true,
    botRank: 2,
    objective: null,
    flicks: 0
  });
  await account.flush();

  assert.ok(faulted);
  assert.equal(outbox.pendingCount(), 1, 'a transient failure stays queued');
  assert.deepEqual(
    practice.localPracticeRecords(userId),
    [],
    'and is not filed as practice the server refused'
  );
  assert.equal(account.getSnapshot().conflict, null);

  // The scheduled flush sends it again; the server knows it, and it resolves.
  await until(() => outbox.pendingCount() === 0, 'the retried operation resolves');
  assert.equal((await api.me()).profile.stats.matches, 1);
  assert.deepEqual(practice.localPracticeRecords(userId), []);
});

it('refuses a sign-in link this device never started, and keeps the queue', async () => {
  browser.goOffline();
  progression.setLastBot('pro');
  assert.equal(outbox.pendingCount(), 1);
  const before = calls('/v1/auth/oauth/complete');

  // No pending flow at all.
  await account.completeOAuth('someone-elses-handoff', 'fake');
  assert.match(account.getSnapshot().notice ?? '', /not started from this device/);
  assert.equal(account.getSnapshot().user?.id, userId);
  assert.equal(outbox.pendingCount(), 1);

  // A pending flow for a different provider is not a match either.
  session.rememberPendingOAuth({
    provider: 'google',
    claimGuestProgress: true,
    startedAt: Date.now()
  });
  await account.completeOAuth('someone-elses-handoff', 'fake');
  assert.match(account.getSnapshot().notice ?? '', /not started from this device/);
  assert.equal(outbox.pendingCount(), 1);
  assert.equal(account.getSnapshot().status, 'authenticated');

  assert.equal(calls('/v1/auth/oauth/complete'), before, 'nothing was sent to redeem it');
  browser.goOnline();
});

it('survives two tabs refreshing the same cookie at once', async () => {
  const before = calls('/v1/auth/refresh');
  let raced = false;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (raced || !String(input).endsWith('/v1/auth/refresh')) return installedFetch(input, init);
    raced = true;
    // The other tab sends the shared cookie first and wins; this tab's
    // request left with the same cookie and arrives holding a spent copy.
    const otherTab = installedFetch('/v1/auth/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    const mine = installedFetch(input, init);
    return otherTab.then(() => mine);
  }) as typeof fetch;

  const refreshTokens = (account as unknown as { refreshTokens(): Promise<boolean> }).refreshTokens;
  const ok = await refreshTokens.call(account);

  assert.equal(ok, true, 'the late tab recovers instead of signing out');
  assert.equal(calls('/v1/auth/refresh') - before, 3, 'other tab, this tab, one retry');
  assert.equal(account.getSnapshot().status, 'authenticated');
  assert.equal((await api.me()).user.id, userId);
});
