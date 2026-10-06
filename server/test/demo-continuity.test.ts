/* eslint-disable @typescript-eslint/consistent-type-imports -- Import client stores after installing the browser. */
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, it } from 'node:test';

import type { MatchResult } from '../../src/core/modes/types';
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
let profiles: typeof import('../../src/core/profile/store').profileStore;
let account: typeof import('../../src/core/account/store').accountStore;
let progression: typeof import('../../src/core/account/progression');
let api: typeof import('../../src/core/net/api').api;
let outbox: typeof import('../../src/core/account/outbox');
let deviceSave: typeof import('../../src/core/storage/localStore').localSaveStatus;

function quickWin(): MatchResult {
  return { ...matchSubmission(), ranked: true, botRank: 2, objective: null, flicks: 0 };
}

before(async () => {
  server = await makeServer();
  browser = installBrowser(server.app);
  profiles = (await import('../../src/core/profile/store')).profileStore;
  account = (await import('../../src/core/account/store')).accountStore;
  progression = await import('../../src/core/account/progression');
  api = (await import('../../src/core/net/api')).api;
  outbox = await import('../../src/core/account/outbox');
  deviceSave = (await import('../../src/core/storage/localStore')).localSaveStatus;
  account.start();
});

beforeEach(() => {
  browser.goOnline(false);
  profiles.reset();
  progression.setIdentity('Real guest', 'ring');
});

afterEach(async () => {
  browser.goOnline(false);
  profiles.endDemo();
  await account.signOut();
  await settle();
});

after(async () => {
  browser.restore();
  await server.close();
});

for (const endBeforeResponse of [false, true]) {
  it(`a pull crossing Demo ${endBeforeResponse ? 'exit' : 'entry'} updates the current real save`, async () => {
    await account.register(uniqueEmail('demo-delayed'), GOOD_PASSWORD, {
      displayName: 'Before sync'
    });
    await api.updateProfile({ displayName: 'Delayed update' });
    if (endBeforeResponse) profiles.startDemo(50);
    const fetch = globalThis.fetch;
    let release!: () => void;
    let arrived!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const started = new Promise<void>((resolve) => (arrived = resolve));
    globalThis.fetch = async (input, init) => {
      const response = await fetch(input, init);
      if (String(input).endsWith('/sync/pull')) {
        arrived();
        await held;
      }
      return response;
    };
    const pending = account.pull();
    try {
      await started;
      if (endBeforeResponse) profiles.endDemo();
      else profiles.startDemo(50);
      const visible = profiles.getSnapshot();
      release();
      await pending;
      if (endBeforeResponse) {
        assert.equal(profiles.getDemoLevel(), null);
        assert.equal(profiles.getSnapshot().name, 'Delayed update');
      } else {
        assert.ok(profiles.getSnapshot() === visible);
        assert.equal(profiles.getDemoLevel(), 50);
        profiles.endDemo();
        assert.equal(profiles.getSnapshot().name, 'Delayed update');
      }
    } finally {
      release();
      await pending;
      globalThis.fetch = fetch;
    }
  });
}

it('a background account pull updates the real save without replacing the demo', async () => {
  await account.register(uniqueEmail('demo-sync'), GOOD_PASSWORD, { displayName: 'Real account' });
  const userId = profiles.getSnapshot().id;
  const guestBytes = browser.storage.getItem('bball.profile');
  profiles.startDemo(40);
  progression.setIdentity('Demo draft', 'bolt');
  progression.recordMatch(quickWin());
  const demo = profiles.getSnapshot();
  let changes = 0;
  const unsubscribe = profiles.subscribe(() => changes++);
  await api.updateProfile({ displayName: 'Cloud update', avatar: 'grid' });

  try {
    await account.pull();

    assert.equal(profiles.getDemoLevel(), 40, 'background sync must keep the chosen demo level');
    assert.ok(profiles.getSnapshot() === demo, 'background sync must preserve the demo snapshot');
    assert.equal(changes, 0, 'a hidden account update must not replace the visible profile');
    assert.equal(outbox.pendingCount(), 0);
    assert.equal(browser.storage.getItem('bball.profile'), guestBytes);
    assert.equal(
      JSON.parse(browser.storage.getItem(`bball.cloud.${userId}`)!).data.name,
      'Cloud update'
    );
  } finally {
    unsubscribe();
  }
  profiles.endDemo();
  assert.equal(profiles.getSnapshot().id, userId);
  assert.equal(profiles.getSnapshot().name, 'Cloud update');
  assert.equal(profiles.getSnapshot().avatar, 'grid');
  assert.equal(profiles.getSnapshot().stats.matches, 0);
});

it('registering during a guest demo claims only the real parked guest progress', async () => {
  progression.recordMatch(quickWin());
  const guest = profiles.getSnapshot();
  profiles.startDemo(400);
  progression.setIdentity('Throwaway identity', 'bolt');
  progression.recordMatch(quickWin());

  const previewId = profiles.guestProfile().id;
  const payload = profiles.guestSave();
  await account.register(uniqueEmail('demo-claim'), GOOD_PASSWORD, {
    displayName: 'Chosen name',
    claimGuestProgress: true
  });

  const remote = (await api.me()).profile;
  assert.equal(remote.xp, guest.xp);
  assert.equal(remote.stats.matches, guest.stats.matches);
  assert.equal(remote.displayName, 'Chosen name', 'registration keeps its own identity rules');
  assert.equal(previewId, guest.id, 'the claim preview must use the real guest');
  assert.equal(payload.saveId, guest.id);
  assert.deepEqual(payload.profile, guest);
  assert.equal(profiles.getDemoLevel(), null, 'sign-in ends the throwaway session');
  assert.equal(profiles.guestProfile().id, guest.id);
});

it('reconnecting during Demo drains real offline rewards once and preserves the demo build', async () => {
  await account.register(uniqueEmail('demo-offline'), GOOD_PASSWORD);
  const userId = profiles.getSnapshot().id;
  browser.goOffline();
  progression.recordMatch(quickWin());
  progression.setLastBot('elite');
  const expectedXp = profiles.getSnapshot().xp;
  assert.equal(outbox.pendingCount(), 2);
  profiles.startDemo(60);
  progression.setLastBot('legend');
  assert.ok(progression.buyTalent('heavy-impact'));
  progression.recordMatch(quickWin());
  const demo = profiles.getSnapshot();
  assert.equal(outbox.pendingCount(), 2, 'only the real offline work enters the outbox');

  browser.goOnline(false);
  await account.flush();
  await account.flush();

  assert.ok(profiles.getSnapshot() === demo);
  assert.equal(profiles.getDemoLevel(), 60);
  assert.equal(outbox.pendingCount(), 0);
  const remote = (await api.me()).profile;
  assert.equal(remote.xp, expectedXp);
  assert.equal(remote.stats.matches, 1);
  assert.equal(remote.preferences.lastBot, 'elite');
  assert.equal(remote.talents.ranks['heavy-impact'] ?? 0, 0);
  assert.equal(profiles.getCloudMeta()?.version, remote.version);
  profiles.endDemo();
  assert.equal(profiles.getSnapshot().xp, remote.xp);
  assert.equal(profiles.getSnapshot().preferences.lastBot, 'elite');
  assert.equal(profiles.getSnapshot().stats.matches, 1);
  // Recreate the cache/profile boundary, rather than claiming a process relaunch.
  profiles.signOut();
  assert.ok(profiles.restoreCachedCloud(userId));
  assert.equal(profiles.getSnapshot().xp, remote.xp);
  assert.equal(profiles.getSnapshot().stats.matches, 1);
});

it('switching demo levels uses the latest parked account and discards previous demo edits', async () => {
  await account.register(uniqueEmail('demo-reroll'), GOOD_PASSWORD, { displayName: 'Before sync' });
  profiles.startDemo(20);
  progression.setIdentity('Old demo draft', 'bolt');
  await api.updateProfile({ displayName: 'New real name', avatar: 'grid' });
  await account.pull();

  profiles.startDemo(80);

  assert.equal(profiles.getDemoLevel(), 80);
  assert.equal(profiles.getSnapshot().name, 'New real name');
  assert.equal(profiles.getSnapshot().avatar, 'grid');
  assert.equal(profiles.getSnapshot().stats.matches, 0);
  profiles.endDemo();
  assert.equal(profiles.getSnapshot().name, 'New real name');
  assert.equal(profiles.getSnapshot().xp, 0);
});

it('a failed account-cache write during Demo retries the latest real profile without saving demo edits', async () => {
  await account.register(uniqueEmail('demo-cache'), GOOD_PASSWORD, { displayName: 'Before sync' });
  const userId = profiles.getSnapshot().id;
  const key = `bball.cloud.${userId}`;
  const guestBytes = browser.storage.getItem('bball.profile');
  profiles.startDemo(90);
  progression.setIdentity('Never save this', 'bolt');
  const demo = profiles.getSnapshot();
  const write = browser.storage.setItem;
  browser.storage.setItem = (record, value) => {
    if (record === key) throw new DOMException('Storage full', 'QuotaExceededError');
    write.call(browser.storage, record, value);
  };
  try {
    await api.updateProfile({ displayName: 'First update' });
    await account.pull();
    assert.equal(deviceSave.getSnapshot(), 'unsaved');
    assert.equal(deviceSave.retry(), false);
    await api.updateProfile({ displayName: 'Latest update' });
    await account.pull();
    assert.ok(profiles.getSnapshot() === demo);
    assert.equal(JSON.parse(browser.storage.getItem(key)!).data.name, 'Before sync');
  } finally {
    browser.storage.setItem = write;
  }

  assert.equal(deviceSave.retry(), true);
  assert.equal(deviceSave.getSnapshot(), 'saved');
  const cache = JSON.parse(browser.storage.getItem(key)!).data;
  assert.equal(cache.id, userId);
  assert.equal(cache.name, 'Latest update');
  assert.equal(cache.xp, 0);
  assert.equal(browser.storage.getItem('bball.profile'), guestBytes);
  assert.ok(profiles.getSnapshot() === demo);
  profiles.endDemo();
  assert.equal(profiles.getSnapshot().name, cache.name);
});

it('a fresh guest demo cannot create an import offer or claim throwaway XP', async () => {
  const guest = profiles.getSnapshot();
  const guestBytes = browser.storage.getItem('bball.profile');
  profiles.startDemo(999);
  progression.recordMatch(quickWin());
  progression.setLastBot('legend');
  assert.equal(profiles.guestProfile().xp, 0);
  assert.equal(profiles.guestProfile().stats.matches, 0);
  assert.equal(profiles.guestSave().saveId, guest.id);
  assert.equal(browser.storage.getItem('bball.profile'), guestBytes);

  await account.register(uniqueEmail('demo-empty'), GOOD_PASSWORD, { claimGuestProgress: true });

  assert.equal((await api.me()).profile.xp, 0);
  assert.equal((await api.me()).profile.stats.matches, 0);
  assert.equal(profiles.guestProfile().id, guest.id);
});

it('a manual guest claim during an account demo updates only the parked account and rewards once', async () => {
  progression.recordMatch(quickWin());
  const guest = profiles.getSnapshot();
  await account.register(uniqueEmail('demo-manual-claim'), GOOD_PASSWORD);
  profiles.startDemo(120);
  progression.setIdentity('Demo identity', 'bolt');
  const demo = profiles.getSnapshot();

  await account.claimGuestProgress();
  await account.claimGuestProgress();

  assert.ok(profiles.getSnapshot() === demo);
  assert.equal(profiles.getDemoLevel(), 120);
  assert.equal(profiles.guestProfile().id, guest.id);
  assert.equal((await api.me()).profile.xp, guest.xp);
  assert.equal((await api.me()).profile.stats.matches, guest.stats.matches);
  profiles.endDemo();
  assert.equal(profiles.getSnapshot().xp, guest.xp);
  assert.equal(profiles.getSnapshot().stats.matches, guest.stats.matches);
});

it('forgetting an account during Demo clears a failed hidden-cache write and restores the real guest', async () => {
  const guest = profiles.getSnapshot();
  await account.register(uniqueEmail('demo-forget'), GOOD_PASSWORD);
  const key = `bball.cloud.${profiles.getSnapshot().id}`;
  profiles.startDemo(70);
  const write = browser.storage.setItem;
  browser.storage.setItem = (record, value) => {
    if (record === key) throw new DOMException('Storage full', 'QuotaExceededError');
    write.call(browser.storage, record, value);
  };
  try {
    await account.pull();
    assert.equal(deviceSave.getSnapshot(), 'unsaved');
    await account.signOut({ forget: true });
  } finally {
    browser.storage.setItem = write;
  }
  assert.equal(profiles.getDemoLevel(), null);
  assert.equal(profiles.getSnapshot().id, guest.id);
  assert.equal(profiles.getCloudMeta(), null);
  assert.equal(deviceSave.retry(), true);
  assert.equal(browser.storage.getItem(key), null, 'retry cannot resurrect the forgotten account');
});
