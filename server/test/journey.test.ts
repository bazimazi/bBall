/**
 * The whole thing, end to end:
 *
 *   guest -> play -> create an account -> carry the progress over ->
 *   play offline -> reconnect -> synchronise -> continue on another device
 *
 * This is the test that would catch a design mistake the unit tests cannot:
 * the client and the server each behaving correctly while disagreeing with
 * each other. Everything below the browser is real - the actual profile
 * store, the actual outbox, the actual fetch wrapper with its retries and
 * token refresh, against the actual server over the actual HTTP routes.
 */

/* eslint-disable @typescript-eslint/consistent-type-imports --
   The client modules have to be imported *after* the fake browser is
   installed, so the only way to name their types up here is through
   `typeof import(...)`. */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { MatchResult } from '../../src/core/modes/types';
import type { MeResponse } from '../../shared/protocol';
import { installBrowser, settle, type FakeBrowser } from './browser';
import { auth, GOOD_PASSWORD, makeServer, uniqueEmail, type TestServer } from './helpers';

type ClientModules = {
  profileStore: typeof import('../../src/core/profile/store').profileStore;
  accountStore: typeof import('../../src/core/account/store').accountStore;
  progression: typeof import('../../src/core/account/progression');
  outbox: typeof import('../../src/core/account/outbox');
};

let server: TestServer;
let browser: FakeBrowser;
let client: ClientModules;

const email = uniqueEmail('journey');

/** A plausible Quick Match win, in the shape the engine publishes. */
function quickWin(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    mode: 'quick',
    ranked: true,
    botId: 'amateur',
    botRank: 2,
    won: true,
    scoreYou: 5,
    scoreBot: 2,
    bestRally: 16,
    hits: 44,
    seconds: 100,
    livesLeft: 0,
    objectiveMet: true,
    objective: null,
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
    shutout: false,
    comeback: false,
    abandoned: false,
    ...overrides
  };
}

before(async () => {
  server = await makeServer();
  browser = installBrowser(server.app);

  // Imported only now: the profile store reads localStorage as it is built,
  // so the browser has to exist first.
  client = {
    profileStore: (await import('../../src/core/profile/store')).profileStore,
    accountStore: (await import('../../src/core/account/store')).accountStore,
    progression: await import('../../src/core/account/progression'),
    outbox: await import('../../src/core/account/outbox')
  };
  client.accountStore.start();
});

after(async () => {
  browser.restore();
  await server.close();
});

describe('guest -> account -> offline -> reconnect -> second device', () => {
  let guestXp = 0;
  let guestSaveId = '';

  it('plays as a guest, with everything kept on the device', async () => {
    for (let i = 0; i < 3; i++) {
      client.progression.recordMatch(quickWin({ bestRally: 12 + i }));
    }
    await settle();

    const profile = client.profileStore.getSnapshot();
    guestXp = profile.xp;
    guestSaveId = profile.id;

    assert.ok(guestXp > 0, 'a guest should still earn XP');
    assert.equal(profile.stats.matches, 3);
    assert.equal(profile.stats.wins, 3);
    // Nothing went to the server, and nothing was queued for it.
    assert.equal(client.accountStore.getSnapshot().status, 'guest');
    assert.equal(client.outbox.pendingCount(), 0);
    assert.equal(
      browser.requests.length,
      0,
      'a guest session should make no network requests at all'
    );

    // And it really is on disk, under the guest key.
    assert.ok(browser.storage.getItem('bball.profile'));
  });

  it('creates an account and carries the guest progress into it', async () => {
    const outcome = await client.accountStore.register(email, GOOD_PASSWORD, {
      displayName: 'Traveller',
      claimGuestProgress: true
    });
    await settle();

    assert.ok(outcome);
    assert.equal(outcome.outcome, 'adopted');

    const account = client.accountStore.getSnapshot();
    assert.equal(account.status, 'authenticated');
    assert.equal(account.email, email);

    const profile = client.profileStore.getSnapshot();
    assert.ok(profile.xp >= guestXp, 'the account should hold at least the guest XP');
    assert.equal(profile.stats.matches, 3);

    // The guest save is parked, not destroyed: signing out must give it back.
    assert.equal(client.profileStore.guestProfile().id, guestSaveId);
    assert.ok(browser.storage.getItem('bball.profile'));
    assert.ok(
      browser.storage.getItem(`bball.cloud.${profile.id}`),
      'the cloud save should be cached under its own key'
    );
  });

  it('syncs each new match while it is online', async () => {
    client.progression.recordMatch(quickWin({ scoreYou: 5, scoreBot: 0, shutout: true }));
    await client.accountStore.flush();

    const me = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(await accessTokenFor(email))
    });
    const remote = me.json<MeResponse>().profile;

    assert.equal(remote.stats.matches, 4);
    assert.equal(remote.stats.shutouts, 1);
    assert.equal(client.outbox.pendingCount(), 0);
    // The server's number is the one on screen, not the client's guess.
    assert.equal(client.profileStore.getSnapshot().xp, remote.xp);
  });

  it('keeps playing offline, queueing everything', async () => {
    browser.goOffline();

    const before = client.profileStore.getSnapshot().xp;
    client.progression.recordMatch(quickWin({ bestRally: 24 }));
    client.progression.recordMatch(quickWin({ won: false, scoreYou: 1, scoreBot: 5 }));
    await client.accountStore.flush();

    const profile = client.profileStore.getSnapshot();
    // The game carried on: XP moved and the matches are in the local record.
    assert.ok(profile.xp > before);
    assert.equal(profile.stats.matches, 6);

    const account = client.accountStore.getSnapshot();
    assert.equal(account.sync, 'offline');
    assert.equal(account.pending, 2);
    assert.equal(client.outbox.pendingCount(), 2);
  });

  it('survives a restart while offline', async () => {
    // The queue is on disk, not in memory: a closed tab costs nothing.
    client.outbox.resetOutboxCache();
    assert.equal(client.outbox.pendingCount(), 2);
    assert.ok(browser.storage.getItem('bball.outbox'));
  });

  it('drains the queue when the connection comes back', async () => {
    browser.goOnline();
    await client.accountStore.flush();
    await settle();

    const account = client.accountStore.getSnapshot();
    assert.equal(account.sync, 'idle');
    assert.equal(account.pending, 0);

    const me = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(await accessTokenFor(email))
    });
    const remote = me.json<MeResponse>().profile;

    assert.equal(remote.stats.matches, 6, 'both offline matches should have landed');
    assert.equal(remote.stats.wins, 5);
    assert.equal(remote.stats.losses, 1);
    assert.equal(client.profileStore.getSnapshot().xp, remote.xp);
  });

  it('flushing again sends nothing and changes nothing', async () => {
    const before = client.profileStore.getSnapshot().xp;
    const calls = browser.requests.length;

    await client.accountStore.flush();
    await settle();

    assert.equal(client.profileStore.getSnapshot().xp, before);
    assert.ok(browser.requests.length > calls, 'a flush still checks in with the server');

    const me = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(await accessTokenFor(email))
    });
    assert.equal(me.json<MeResponse>().profile.stats.matches, 6);
  });

  it('picks up progress made on another device', async () => {
    // A second device: a plain API client with its own session, which is all
    // another device is from the server's point of view.
    const token = await accessTokenFor(email);
    const elsewhere = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/match',
      headers: auth(token),
      payload: {
        clientMatchId: 'other-device-match-1',
        mode: 'quick',
        botId: 'pro',
        won: true,
        scoreYou: 5,
        scoreBot: 4,
        bestRally: 30,
        hits: 90,
        seconds: 200,
        livesLeft: 0,
        objectiveMet: true,
        shutout: false,
        comeback: false,
        abandoned: false,
        talent: quickWin().talent,
        playedAt: Date.now()
      }
    });
    assert.equal(elsewhere.statusCode, 200);

    await client.accountStore.pull();

    const profile = client.profileStore.getSnapshot();
    assert.equal(profile.stats.matches, 7, 'the other device shows up on this one');
    assert.equal(profile.stats.bestRally, 30);
  });

  it('keeps demo mode out of the account entirely', async () => {
    const before = client.profileStore.getSnapshot();
    const calls = browser.requests.length;

    client.profileStore.startDemo(40);
    assert.equal(client.profileStore.getDemoLevel(), 40);

    client.progression.recordMatch(quickWin({ scoreYou: 5, scoreBot: 0, shutout: true }));
    client.progression.setLastBot('legend');
    await settle(450);

    // A demo is a throwaway view of the game at a level. Nothing it does may
    // reach the queue, and nothing may reach the network.
    assert.equal(client.outbox.pendingCount(), 0);
    assert.equal(browser.requests.length, calls);

    client.profileStore.endDemo();
    const after = client.profileStore.getSnapshot();
    assert.equal(client.profileStore.getDemoLevel(), null);
    assert.equal(after.xp, before.xp, 'the real save should be exactly as it was');
    assert.equal(after.stats.matches, before.stats.matches);
  });

  it('merges a match made here with one made there', async () => {
    const token = await accessTokenFor(email);

    // Both devices play while this one is offline.
    browser.goOffline();
    client.progression.recordMatch(quickWin({ bestRally: 9 }));
    await client.accountStore.flush();

    await server.app.inject({
      method: 'POST',
      url: '/v1/progression/match',
      headers: auth(token),
      payload: {
        clientMatchId: 'other-device-match-2',
        mode: 'quick',
        botId: 'pro',
        won: true,
        scoreYou: 5,
        scoreBot: 1,
        bestRally: 18,
        hits: 60,
        seconds: 150,
        livesLeft: 0,
        objectiveMet: true,
        shutout: false,
        comeback: false,
        abandoned: false,
        talent: quickWin().talent,
        playedAt: Date.now()
      }
    });

    browser.goOnline();
    await client.accountStore.flush();
    await settle();

    const profile = client.profileStore.getSnapshot();
    assert.equal(profile.stats.matches, 9, 'neither device lost its match');

    const account = client.accountStore.getSnapshot();
    assert.equal(account.pending, 0);
    // The player is told, rather than left to wonder why the number jumped.
    assert.ok(account.conflict, 'divergence should be surfaced');
  });

  it('gives the guest save back on sign out', async () => {
    const cloudXp = client.profileStore.getSnapshot().xp;
    await client.accountStore.signOut();
    await settle();

    const profile = client.profileStore.getSnapshot();
    assert.equal(client.accountStore.getSnapshot().status, 'guest');
    assert.equal(profile.id, guestSaveId, 'the guest save should come back untouched');
    assert.equal(profile.xp, guestXp);
    assert.equal(profile.stats.matches, 3);
    assert.notEqual(profile.xp, cloudXp);
    assert.equal(client.outbox.pendingCount(), 0);
  });

  it('signs back in and finds the cloud save exactly where it was left', async () => {
    const me = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(await accessTokenFor(email))
    });
    const remote = me.json<MeResponse>().profile;

    await client.accountStore.signIn(email, GOOD_PASSWORD);
    await settle();

    const profile = client.profileStore.getSnapshot();
    assert.equal(profile.xp, remote.xp);
    assert.equal(profile.stats.matches, 9);
    assert.equal(client.accountStore.getSnapshot().status, 'authenticated');
  });

  it('refuses a second claim of the same guest save', async () => {
    const outcome = await client.accountStore.claimGuestProgress();
    assert.equal(outcome.outcome, 'already-claimed');
  });
});

/** A fresh access token for the journey account, for out-of-band assertions. */
async function accessTokenFor(address: string): Promise<string> {
  const response = await server.app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email: address, password: GOOD_PASSWORD }
  });
  if (response.statusCode !== 200) {
    throw new Error(`login failed: ${response.statusCode} ${response.body}`);
  }
  return response.json<{ tokens: { accessToken: string } }>().tokens.accessToken;
}
