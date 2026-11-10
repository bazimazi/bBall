/* eslint-disable @typescript-eslint/consistent-type-imports -- Import client stores after installing the browser. */
/**
 * Regressions from the menus/meta QA pass: saved-build renames, cup give-up
 * records and account failure wording.
 */
import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import type { MatchResult } from '../../src/core/modes/types';
import { createProfile } from '../../src/core/profile/defaults';
import { xpToReach } from '../../src/core/progression/levels';
import { talentBuildOn } from '../../src/core/talents/builds';
import { respec } from '../../src/core/talents/save';
import type { SyncPushResponse } from '../../shared/protocol';
import { installBrowser, settle, type FakeBrowser } from './browser';
import {
  auth,
  GOOD_PASSWORD,
  grindToLevel,
  makeServer,
  matchSubmission,
  register,
  uniqueEmail,
  type TestServer
} from './helpers';

let server: TestServer;
let browser: FakeBrowser;
let profiles: typeof import('../../src/core/profile/store').profileStore;
let account: typeof import('../../src/core/account/store').accountStore;
let progression: typeof import('../../src/core/account/progression');
let api: typeof import('../../src/core/net/api').api;
let errors: typeof import('../../src/core/i18n/errors');
let net: typeof import('../../src/core/net/client');

function quickWin(patch: Partial<MatchResult> = {}): MatchResult {
  return {
    ...matchSubmission(),
    ranked: true,
    botRank: 2,
    objective: null,
    flicks: 0,
    ...patch
  } as MatchResult;
}

before(async () => {
  server = await makeServer({ ACCESS_TOKEN_TTL_SECONDS: '3600' });
  browser = installBrowser(server.app);
  profiles = (await import('../../src/core/profile/store')).profileStore;
  account = (await import('../../src/core/account/store')).accountStore;
  progression = await import('../../src/core/account/progression');
  api = (await import('../../src/core/net/api')).api;
  errors = await import('../../src/core/i18n/errors');
  net = await import('../../src/core/net/client');
  // The wording checks below are written against English; Persian is the default.
  (await import('../../src/core/settings/store')).settingsStore.update({ language: 'en' });
  account.start();
});

beforeEach(() => {
  browser.goOnline(false);
  profiles.reset();
});

afterEach(async () => {
  browser.goOnline(false);
  await account.signOut();
  await settle();
});

after(async () => {
  browser.restore();
  await server.close();
});

describe('saved build rename', () => {
  it('changes only the label: saved ranks, skills and the live build stay put', () => {
    let p = createProfile();
    p.xp = xpToReach(20);
    p.talents.ranks = { 'power-strike': 1 };
    p.talents.equipped = ['power-strike'];
    p = talentBuildOn(p, 0, 'save', 'Before')!;
    p.talents = respec(p.talents, 20);
    const before = JSON.stringify(p.talents.presets![0]);
    const live = JSON.stringify({ ranks: p.talents.ranks, equipped: p.talents.equipped });

    const renamed = talentBuildOn(p, 0, 'rename', '  After  ')!;
    assert.equal(renamed.talents.presets![0]!.name, 'After');
    assert.deepEqual(renamed.talents.presets![0]!.ranks, { 'power-strike': 1 });
    assert.deepEqual(renamed.talents.presets![0]!.equipped, ['power-strike']);
    assert.equal(
      JSON.stringify({ ranks: renamed.talents.ranks, equipped: renamed.talents.equipped }),
      live,
      'renaming must not touch the live build'
    );
    assert.equal(JSON.stringify(p.talents.presets![0]), before, 'the input profile is untouched');
    assert.equal(renamed.talents.stats.respecs, p.talents.stats.respecs);

    assert.equal(talentBuildOn(p, 0, 'rename', '   '), null, 'a blank name is refused');
    assert.equal(talentBuildOn(p, 1, 'rename', 'Nothing here'), null, 'an empty slot has no name');
    assert.equal(talentBuildOn(p, 9, 'rename', 'Out of range'), null);
    assert.equal(talentBuildOn(p, 1, 'save', '   ')!.talents.presets![1]!.name, 'Build 2');
  });

  it('round-trips through sync, keeps the saved ranks and refuses a blank rename', async () => {
    const user = await register(server.app);
    const levelled = await grindToLevel(server, user.accessToken, 3);
    const send = (baseVersion: number, ops: unknown[]) =>
      server.app.inject({
        method: 'POST',
        url: '/v1/sync/push',
        headers: auth(user.accessToken),
        payload: { baseVersion, ops }
      });

    const saved = await send(levelled.version, [
      {
        kind: 'talent.purchase',
        opId: 'qa-rename-buy',
        payload: { talentId: 'power-strike', expectedRank: 0 }
      },
      {
        kind: 'talent.build',
        opId: 'qa-rename-save',
        payload: { slot: 0, action: 'save', name: 'Before' }
      },
      { kind: 'talent.respec', opId: 'qa-rename-respec', payload: {} },
      {
        kind: 'talent.build',
        opId: 'qa-rename',
        payload: { slot: 0, action: 'rename', name: 'After' }
      }
    ]);
    assert.equal(saved.statusCode, 200, saved.body);
    const body = saved.json<SyncPushResponse>();
    assert.deepEqual(
      body.results.map((r) => r.status),
      ['applied', 'applied', 'applied', 'applied']
    );
    const preset = body.profile.talents.presets?.[0];
    assert.equal(preset?.name, 'After');
    assert.deepEqual(preset?.ranks, { 'power-strike': 1 });
    assert.deepEqual(body.profile.talents.ranks, {}, 'rename after a respec keeps the respec');

    const empty = await send(body.profile.version, [
      {
        kind: 'talent.build',
        opId: 'qa-rename-empty',
        payload: { slot: 1, action: 'rename', name: 'X' }
      }
    ]);
    assert.equal(empty.json<SyncPushResponse>().results[0]?.status, 'rejected');

    for (const payload of [
      { slot: 0, action: 'rename', name: '   ' },
      { slot: 0, action: 'rename' }
    ]) {
      const blank = await send(body.profile.version, [
        { kind: 'talent.build', opId: 'qa-rename-blank', payload }
      ]);
      assert.equal(blank.statusCode, 422, blank.body);
      assert.equal(blank.json().error.code, 'VALIDATION_FAILED');
    }
  });

  it('a rename made on this device reaches the account', async () => {
    await account.register(uniqueEmail('qa-rename'), GOOD_PASSWORD, {});
    // Queued while offline, so both ops travel in the same push.
    browser.goOffline();
    assert.equal(progression.talentBuild(0, 'save', 'Device build'), true);
    assert.equal(progression.talentBuild(0, 'rename', 'Renamed here'), true);
    assert.equal(profiles.getSnapshot().talents.presets?.[0]?.name, 'Renamed here');
    browser.goOnline(false);
    await account.flush(true);
    await settle();
    const cloud = await api.pull('qa-device');
    assert.equal(cloud.profile.talents.presets?.[0]?.name, 'Renamed here');
    assert.equal(profiles.getSnapshot().talents.presets?.[0]?.name, 'Renamed here');
  });
});

describe('cup give-up records', () => {
  it('reads as the round never played and never replaces a title from the same ladder', () => {
    profiles.startTournament(0);
    profiles.applyResult(quickWin({ mode: 'tournament', tournamentRound: 0 }));
    profiles.abandonTournament();
    const gaveUp = profiles.getSnapshot().lastTournament!;
    assert.equal(gaveUp.champion, false);
    assert.equal(gaveUp.round, 1, 'the semi-final, the round that was never played');
    assert.ok(gaveUp.results.every((result) => result.won));

    profiles.startTournament(0, 'ladder');
    for (let round = 0; round < 6; round++)
      profiles.applyResult(quickWin({ mode: 'tournament', tournamentRound: round }));
    const title = profiles.getSnapshot().lastTournament!;
    assert.equal(title.champion, true, 'a won ladder season is recorded as a title');
    assert.ok(profiles.getSnapshot().tournament, 'the ladder runs on into the next season');
    profiles.applyResult(quickWin({ mode: 'tournament', tournamentRound: 0 }));
    profiles.abandonTournament();
    assert.equal(profiles.getSnapshot().tournament, null);
    assert.deepEqual(profiles.getSnapshot().lastTournament, title);

    // A different, later cup is the last cup, whatever came before it.
    profiles.startTournament(0);
    profiles.abandonTournament();
    assert.equal(profiles.getSnapshot().lastTournament?.champion, false);
  });
});

describe('account failure wording', () => {
  const synthetic = (status: number) =>
    new net.ApiError(status, {
      code: status >= 500 ? 'INTERNAL' : 'BAD_REQUEST',
      message: 'Something went wrong. Try again.',
      requestId: ''
    });

  it('blames the server, not the player, and promises sync only to a signed-in player', () => {
    // The device is online; only the server is out of reach.
    const unreachable = new net.NetworkError('No connection.');
    const guest = errors.accountErrorText(unreachable, false);
    assert.match(guest, /account server/);
    assert.doesNotMatch(guest, /sync|No connection/);
    assert.match(errors.accountErrorText(unreachable, true), /will sync later/);
    assert.match(
      errors.accountErrorText(new net.NetworkError('The server took too long to answer.'), false),
      /took too long/
    );

    for (const status of [404, 502, 503]) {
      const text = errors.accountErrorText(synthetic(status), false);
      assert.match(text, /not available/, `HTTP ${status} without the API's JSON`);
      assert.doesNotMatch(text, /Something went wrong/);
    }

    const wrongPassword = new net.ApiError(401, {
      code: 'INVALID_CREDENTIALS',
      message: 'That email and password do not match.',
      requestId: 'req-1'
    });
    assert.equal(
      errors.accountErrorText(wrongPassword, false),
      'That email and password do not match.'
    );
    assert.equal(
      errors.accountErrorText(new Error('boom'), false),
      'Something went wrong. Try again.'
    );
  });

  it('says so when the device itself is offline', () => {
    browser.goOffline();
    const guest = errors.accountErrorText(new net.NetworkError('No connection.'), false);
    assert.match(guest, /This device is offline/);
    assert.doesNotMatch(guest, /sync/);
    assert.match(
      errors.accountErrorText(new net.NetworkError('No connection.'), true),
      /will sync when you reconnect/
    );
  });
});
