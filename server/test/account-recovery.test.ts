/* eslint-disable @typescript-eslint/consistent-type-imports -- Import client stores after installing the browser. */
import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';

import { installBrowser, settle, type FakeBrowser } from './browser';
import {
  GOOD_PASSWORD,
  makeServer,
  matchSubmission,
  register,
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
const email = uniqueEmail('recovery');
let userId: string;

async function until(done: () => boolean) {
  const deadline = Date.now() + 5_000;
  while (!done() && Date.now() < deadline) await settle(5);
  assert.ok(done(), 'account recovery did not settle');
}

// Recreate the relevant reload boundaries without changing a real player save:
// access token/cloud metadata are forgotten; the cookie, session and outbox remain.
function prepareBoot(cache: boolean) {
  const remembered = browser.storage.getItem('bball.session');
  assert.ok(remembered);
  profiles.signOut();
  session.clearSession();
  browser.storage.setItem('bball.session', remembered);
  if (!cache) browser.storage.removeItem(`bball.cloud.${userId}`);
  outbox.resetOutboxCache();
}

before(async () => {
  server = await makeServer();
  browser = installBrowser(server.app);
  profiles = (await import('../../src/core/profile/store')).profileStore;
  account = (await import('../../src/core/account/store')).accountStore;
  session = await import('../../src/core/account/session');
  outbox = await import('../../src/core/account/outbox');
  progression = await import('../../src/core/account/progression');
  account.start();
  await account.register(email, GOOD_PASSWORD, { displayName: 'Cloud player' });
  userId = profiles.getSnapshot().id;
});

after(async () => {
  await account.signOut();
  await settle(450);
  browser.restore();
  await server.close();
});

it('a returning account without a cached profile loads its cloud identity instead of syncing the guest', async () => {
  const guestId = profiles.guestProfile().id;
  prepareBoot(false);
  account.start();
  await until(
    () => account.getSnapshot().status === 'authenticated' && account.getSnapshot().sync === 'idle'
  );
  assert.equal(profiles.getCloudMeta()?.userId, userId);
  assert.equal(profiles.getSnapshot().id, userId);
  assert.equal(profiles.getSnapshot().name, 'Cloud player');
  assert.equal(profiles.guestProfile().id, guestId);
  assert.ok(browser.storage.getItem(`bball.cloud.${userId}`));
});

it('offline restoration retains the cached player, remembered session and queued changes until reconnect', async () => {
  browser.goOffline();
  progression.setLastBot('pro');
  progression.recordMatch({
    ...matchSubmission(),
    ranked: true,
    botRank: 2,
    objective: null,
    flicks: 0
  });
  const queued = browser.storage.getItem('bball.outbox');
  prepareBoot(true);
  account.start();
  await until(() => account.getSnapshot().sync === 'offline');
  assert.equal(account.getSnapshot().status, 'authenticated');
  assert.equal(profiles.getSnapshot().id, userId);
  assert.equal(profiles.getSnapshot().preferences.lastBot, 'pro');
  assert.ok(session.hasRememberedSession());
  assert.equal(browser.storage.getItem('bball.outbox'), queued);
  assert.equal(profiles.getSnapshot().stats.matches, 1);
  assert.equal(outbox.pendingCount(), 2);
  progression.setLastBot('elite');
  assert.equal(outbox.pendingCount(), 3);

  browser.goOnline();
  await until(() => account.getSnapshot().sync === 'idle' && outbox.pendingCount() === 0);
  assert.equal(account.getSnapshot().user?.id, userId);
  const { api } = await import('../../src/core/net/api');
  const remote = (await api.me()).profile;
  assert.equal(remote.preferences.lastBot, 'elite');
  assert.equal(remote.stats.matches, 1);
  assert.ok(remote.xp > 0);
  assert.equal(profiles.getSnapshot().xp, remote.xp);
  await account.flush();
  assert.equal((await api.me()).profile.stats.matches, 1, 'restored offline rewards apply once');
});

it('offline restoration without a cache keeps guest edits separate and retries on visible return', async () => {
  prepareBoot(false);
  const guestId = profiles.getSnapshot().id;
  browser.goOffline();
  account.start();
  await until(() => account.getSnapshot().sync === 'offline');
  assert.equal(account.getSnapshot().status, 'restoring');
  assert.ok(session.hasRememberedSession());
  assert.equal(profiles.getSnapshot().id, guestId);
  progression.setIdentity('Offline guest', 'ring');
  assert.equal(outbox.pendingCount(), 0, 'temporary guest edits cannot enter the account outbox');

  browser.goOnline(false);
  window.dispatchEvent(new Event('visibilitychange'));
  await until(
    () => account.getSnapshot().status === 'authenticated' && account.getSnapshot().sync === 'idle'
  );
  assert.equal(profiles.getSnapshot().id, userId);
  assert.equal(profiles.getSnapshot().name, 'Cloud player');
  assert.equal(profiles.guestProfile().id, guestId);
  assert.equal(profiles.guestProfile().name, 'Offline guest');
  const { api } = await import('../../src/core/net/api');
  assert.equal((await api.me()).profile.displayName, 'Cloud player');
});

it('a transient server failure preserves a cached session and queued operation for manual retry', async () => {
  progression.setLastBot('rookie');
  prepareBoot(true);
  const fetch = globalThis.fetch;
  globalThis.fetch = async (input, init) =>
    String(input).endsWith('/auth/refresh')
      ? new Response(JSON.stringify({ error: { code: 'INTERNAL', message: 'Try again later.' } }), {
          status: 503
        })
      : fetch(input, init);
  try {
    account.start();
    await until(() => account.getSnapshot().sync === 'error');
    assert.equal(account.getSnapshot().status, 'authenticated');
    assert.equal(account.getSnapshot().notice, 'Try again later.');
    assert.ok(session.hasRememberedSession());
    assert.equal(outbox.pendingCount(), 1);
    assert.equal(profiles.getSnapshot().id, userId);
  } finally {
    globalThis.fetch = fetch;
  }
  await account.flush();
  assert.equal(account.getSnapshot().sync, 'idle');
  assert.equal(outbox.pendingCount(), 0);
  assert.equal(profiles.getSnapshot().preferences.lastBot, 'rookie');
});

it('a request-time refresh failure keeps the account, and explicit retry can override a stale connectivity hint', async () => {
  const fetch = globalThis.fetch;
  let pulls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/sync/pull')) {
      pulls += 1;
      if (pulls === 1)
        return new Response(
          JSON.stringify({ error: { code: 'SESSION_EXPIRED', message: 'Expired.' } }),
          { status: 401 }
        );
      throw new TypeError('Network unavailable');
    }
    if (String(input).endsWith('/auth/refresh')) throw new TypeError('Network unavailable');
    return fetch(input, init);
  };
  try {
    await account.flush();
    assert.equal(account.getSnapshot().status, 'authenticated');
    assert.equal(account.getSnapshot().sync, 'offline');
    assert.ok(session.hasRememberedSession());
    assert.equal(profiles.getSnapshot().id, userId);
  } finally {
    globalThis.fetch = fetch;
  }

  const hint = Object.getOwnPropertyDescriptor(navigator, 'onLine')!;
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  try {
    const calls = browser.requests.length;
    await account.flush();
    assert.equal(browser.requests.length, calls, 'automatic flush respects the offline hint');
    await account.flush(true);
    assert.equal(account.getSnapshot().sync, 'idle');
    assert.equal(profiles.getSnapshot().id, userId);
    assert.ok(browser.requests.length > calls, 'explicit retry attempts the actual server');
  } finally {
    Object.defineProperty(navigator, 'onLine', hint);
  }
});

it('concurrent return/retry events share one restoration and keep edits made while the cached account restores', async () => {
  prepareBoot(true);
  const fetch = globalThis.fetch;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received = false;
  const before = browser.requests.filter((entry) => entry.url.endsWith('/auth/refresh')).length;
  globalThis.fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (String(input).endsWith('/auth/refresh')) {
      received = true;
      await gate;
    }
    return response;
  };
  try {
    account.start();
    await until(() => received);
    progression.setLastBot('legend');
    assert.equal(account.getSnapshot().status, 'restoring');
    assert.equal(outbox.pendingCount(), 1);
    const retries = [account.flush(), account.flush()];
    const { api } = await import('../../src/core/net/api');
    const authenticatedRequest = api.me();
    account.start();
    browser.goOnline();
    window.dispatchEvent(new Event('visibilitychange'));
    await settle(20);
    assert.equal(
      browser.requests.filter((entry) => entry.url.endsWith('/auth/refresh')).length - before,
      1
    );
    release();
    await Promise.all([...retries, authenticatedRequest]);
    await until(() => account.getSnapshot().sync === 'idle' && outbox.pendingCount() === 0);
    assert.equal(profiles.getSnapshot().preferences.lastBot, 'legend');
  } finally {
    release();
    globalThis.fetch = fetch;
  }
});

for (const phase of ['auth/refresh', 'me']) {
  it(`signing out during delayed ${phase} cannot restore the account or access token afterward`, async () => {
    await account.signIn(email, GOOD_PASSWORD);
    prepareBoot(true);
    const fetch = globalThis.fetch;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let received = false;
    globalThis.fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (String(input).endsWith(`/v1/${phase}`)) {
        received = true;
        await gate;
      }
      return response;
    };
    try {
      account.start();
      await until(() => received);
      const pending = account.flush();
      await account.signOut();
      release();
      await pending;
      assert.equal(account.getSnapshot().status, 'guest');
      assert.equal(session.currentAccessToken(), null);
      assert.equal(session.hasRememberedSession(), false);
      assert.equal(profiles.getCloudMeta(), null);
      assert.equal(profiles.getSnapshot().name, 'Offline guest');
    } finally {
      release();
      globalThis.fetch = fetch;
    }
  });
}

it('a delayed restored profile cannot replace a newer sign-in on the same device', async () => {
  await account.signIn(email, GOOD_PASSWORD);
  prepareBoot(true);
  const second = await register(server.app, { displayName: 'Second player' });
  const fetch = globalThis.fetch;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received = false;
  globalThis.fetch = async (input, init) => {
    const response = await fetch(input, init);
    if (String(input).endsWith('/v1/me')) {
      received = true;
      await gate;
    }
    return response;
  };
  try {
    account.start();
    await until(() => received);
    const pending = account.flush();
    await account.signIn(second.email, second.password);
    const token = session.currentAccessToken();
    release();
    await pending;
    assert.equal(account.getSnapshot().user?.id, second.userId);
    assert.equal(profiles.getSnapshot().id, second.userId);
    assert.equal(profiles.getSnapshot().name, 'Second player');
    assert.equal(session.storedSession()?.userId, second.userId);
    assert.equal(session.currentAccessToken(), token);
    assert.equal(profiles.guestProfile().name, 'Offline guest');
  } finally {
    release();
    globalThis.fetch = fetch;
  }
  await account.signOut({ forget: true });
});

for (const phase of ['auth/refresh', 'sync/pull']) {
  it(`a delayed ${phase} from an older signed-in account cannot retry or resolve work for a new sign-in`, async () => {
    await account.signIn(email, GOOD_PASSWORD);
    const second = await register(server.app, { displayName: 'Other player' });
    const fetch = globalThis.fetch;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let received = false;
    let oldPulls = 0;
    globalThis.fetch = async (input, init) => {
      if (phase === 'auth/refresh' && String(input).endsWith('/sync/pull') && !received) {
        oldPulls += 1;
        return new Response(
          JSON.stringify({ error: { code: 'SESSION_EXPIRED', message: 'Expired.' } }),
          { status: 401 }
        );
      }
      const response = await fetch(input, init);
      if (String(input).endsWith(`/v1/${phase}`)) {
        received = true;
        await gate;
      }
      return response;
    };
    try {
      const pending = account.flush();
      await until(() => received);
      await account.signIn(second.email, second.password);
      const token = session.currentAccessToken();
      progression.setLastBot('legend');
      release();
      await pending;
      assert.equal(account.getSnapshot().status, 'authenticated');
      assert.equal(account.getSnapshot().user?.id, second.userId);
      assert.equal(profiles.getSnapshot().id, second.userId);
      assert.equal(session.currentAccessToken(), token);
      assert.equal(
        outbox.pendingCount(),
        1,
        'an old response cannot resolve the new account operation'
      );
      if (phase === 'auth/refresh') assert.equal(oldPulls, 1, 'an obsolete request cannot retry');
    } finally {
      release();
      globalThis.fetch = fetch;
    }
    await account.flush();
    assert.equal(outbox.pendingCount(), 0);
    const { api } = await import('../../src/core/net/api');
    assert.equal((await api.me()).profile.preferences.lastBot, 'legend');
    await account.signOut({ forget: true });
  });
}

it('network backoff cannot retry an older queued push using a newer account', async () => {
  await account.signIn(email, GOOD_PASSWORD);
  const second = await register(server.app, { displayName: 'Retry player' });
  const fetch = globalThis.fetch;
  let failed = false;
  let pushes = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/sync/push')) {
      pushes += 1;
      if (!failed) {
        failed = true;
        throw new TypeError('Lost connection');
      }
    }
    return fetch(input, init);
  };
  try {
    progression.setLastBot('pro');
    const pending = account.flush();
    await until(() => failed);
    await account.signIn(second.email, second.password);
    progression.setLastBot('legend');
    await pending;
    assert.equal(pushes, 1, 'the old queued body must stop before retry');
    assert.equal(account.getSnapshot().user?.id, second.userId);
    assert.equal(profiles.getSnapshot().preferences.lastBot, 'legend');
    assert.equal(outbox.pendingCount(), 1);
  } finally {
    globalThis.fetch = fetch;
  }
  await account.flush();
  const { api } = await import('../../src/core/net/api');
  assert.equal((await api.me()).profile.preferences.lastBot, 'legend');
  await account.signOut({ forget: true });
});

it('a genuinely ended session returns to the guest and clears account-only queued work', async () => {
  await account.signIn(email, GOOD_PASSWORD);
  const { api } = await import('../../src/core/net/api');
  await api.logout(session.storedRefreshToken());
  progression.setLastBot('amateur');
  prepareBoot(true);
  account.start();
  await until(() => account.getSnapshot().status === 'guest');
  assert.equal(session.hasRememberedSession(), false);
  assert.equal(outbox.pendingCount(), 0);
  assert.equal(profiles.getCloudMeta(), null);
  assert.equal(profiles.getSnapshot().name, 'Offline guest');
  assert.match(account.getSnapshot().notice ?? '', /session ended/i);
});
