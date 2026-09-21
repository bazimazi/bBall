/**
 * Local and cloud, reconciled.
 *
 * Two halves. Claiming a guest save has to be generous enough that a player
 * never loses a week of offline progress by making an account, and strict
 * enough that a hand-edited localStorage entry buys nothing. Pushing a queue
 * has to be idempotent, order-preserving, and survivable when one entry in it
 * has gone stale.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { MAX_SYNC_OPS } from '../../shared/protocol';
import type { ClaimResponse, SyncOp, SyncPushResponse } from '../../shared/protocol';
import { createProfile } from '../../src/core/profile/defaults';
import type { PlayerProfile } from '../../src/core/profile/types';
import { PROFILE_VERSION } from '../../src/core/profile/schema';
import {
  auth,
  makeServer,
  matchSubmission,
  recordMatch,
  register,
  type TestServer
} from './helpers';

let server: TestServer;

before(async () => {
  server = await makeServer();
});

after(async () => {
  await server.close();
});

let saveCounter = 0;

/**
 * A guest save that looks like real play.
 *
 * `xp` and the statistics are consistent with each other, so the honest path
 * through the claim validator is exercised by default and a test that wants
 * to break one of them changes only that field.
 */
function guestSave(patch: Partial<PlayerProfile> = {}, saveId?: string) {
  saveCounter += 1;
  const base = createProfile(Date.now() - 86_400_000);
  const profile: PlayerProfile = {
    ...base,
    id: saveId ?? `guest-save-${saveCounter}`,
    name: 'Guest',
    xp: 1200,
    stats: {
      ...base.stats,
      matches: 18,
      wins: 11,
      losses: 7,
      pointsWon: 62,
      pointsLost: 48,
      rallyHits: 540,
      bestRally: 31,
      bestStreak: 4,
      playSeconds: 2400,
      shutouts: 2
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

async function claim(token: string, save: ReturnType<typeof guestSave>) {
  const response = await server.app.inject({
    method: 'POST',
    url: '/v1/sync/claim',
    headers: auth(token),
    payload: { save }
  });
  return { statusCode: response.statusCode, body: response.json<ClaimResponse>() };
}

describe('claiming a guest save', () => {
  it('adopts it wholesale into an empty account', async () => {
    const user = await register(server.app);
    const save = guestSave();

    const { statusCode, body } = await claim(user.accessToken, save);
    assert.equal(statusCode, 200);
    assert.equal(body.claim.outcome, 'adopted');
    assert.ok(body.profile.xp >= 1200, `expected at least the claimed XP, got ${body.profile.xp}`);
    assert.equal(body.profile.stats.matches, 18);
    assert.ok(body.profile.level > 1);
  });

  it('keeps the account identity rather than the guest name', async () => {
    const user = await register(server.app, { displayName: 'Ace' });
    const { body } = await claim(user.accessToken, guestSave());
    assert.equal(body.profile.displayName, 'Ace');
  });

  it('grants the achievements the imported record earns', async () => {
    const user = await register(server.app);
    const { body } = await claim(user.accessToken, guestSave());
    // Eleven wins and a 31 rally: On the Board, Rally Builder, Hat-trick.
    assert.ok(body.profile.achievements['first-win'] !== undefined);
    assert.ok(body.profile.achievements['rally-20'] !== undefined);
  });

  it('is idempotent on the save id', async () => {
    const user = await register(server.app);
    const save = guestSave();

    const first = await claim(user.accessToken, save);
    const second = await claim(user.accessToken, save);

    assert.equal(first.body.claim.outcome, 'adopted');
    assert.equal(second.body.claim.outcome, 'already-claimed');
    assert.equal(second.body.profile.xp, first.body.profile.xp);
  });

  it('merges rather than overwrites when the account already has progress', async () => {
    const user = await register(server.app);
    await recordMatch(server.app, user.accessToken, matchSubmission({ bestRally: 44 }));

    const before = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(user.accessToken)
    });
    const cloudXp = before.json<{ profile: { xp: number } }>().profile.xp;

    const { body } = await claim(user.accessToken, guestSave());
    assert.equal(body.claim.outcome, 'merged');
    // Nothing is ever subtracted: the better of the two survives on both axes.
    assert.ok(body.profile.xp >= cloudXp);
    assert.equal(body.profile.stats.bestRally, 44);
    assert.equal(body.profile.stats.matches, 18);
  });

  it('caps XP at what the save' + "'s own record could have paid", async () => {
    const user = await register(server.app);
    // Two matches, four minutes of play, and a claim of a million XP.
    const { body } = await claim(
      user.accessToken,
      guestSave({
        xp: 1_000_000,
        stats: {
          ...createProfile().stats,
          matches: 2,
          wins: 2,
          playSeconds: 240,
          rallyHits: 40,
          bestRally: 12
        }
      })
    );

    assert.equal(body.claim.outcome, 'adopted');
    // Two matches can be worth at most twice the per-match ceiling, plus
    // whatever achievements those two matches genuinely earned.
    assert.ok(
      body.profile.xp < 2000,
      `expected the claim to be trimmed, got ${body.profile.xp} XP`
    );
    assert.ok(body.claim.notes.some((note) => note.toLowerCase().includes('xp')));
  });

  it('trims statistics that do not fit the time played', async () => {
    const user = await register(server.app);
    const { body } = await claim(
      user.accessToken,
      guestSave({
        xp: 500,
        stats: {
          ...createProfile().stats,
          matches: 100_000,
          wins: 100_000,
          playSeconds: 60,
          rallyHits: 5_000_000,
          bestRally: 900_000
        }
      })
    );
    assert.ok(body.profile.stats.matches < 100, 'an impossible match count should be trimmed');
    assert.ok(body.profile.stats.rallyHits < 5_000_000);
  });

  it('does not import cosmetics the save has not earned', async () => {
    const user = await register(server.app);
    const { body } = await claim(
      user.accessToken,
      guestSave({
        // 'accent-gold' is behind the Gold Cup achievement.
        unlocks: ['accent-teal', 'accent-gold', 'ball-nova', 'arena-grid']
      })
    );
    assert.ok(!body.profile.unlocks.includes('accent-gold'));
    assert.ok(!body.profile.unlocks.includes('ball-nova'));
  });

  it('does not import talent ranks the surviving level cannot pay for', async () => {
    const user = await register(server.app);
    const { body } = await claim(
      user.accessToken,
      guestSave({
        xp: 800,
        talents: {
          points: 999,
          ranks: { 'power-strike': 1, overload: 1, zenith: 1, echo: 1, aegis: 1 },
          equipped: ['overload', 'zenith', 'echo', 'aegis', 'slipstream'],
          stats: createProfile().talents.stats
        }
      })
    );

    const spent = Object.keys(body.profile.talents.ranks).length;
    assert.ok(spent <= 2, `a level-${body.profile.level} save cannot own ${spent} talents`);
    assert.ok(body.profile.talentPoints < 999);
  });

  it('rejects a payload that is not a profile', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/sync/claim',
      headers: auth(user.accessToken),
      payload: { save: { schemaVersion: 2, saveId: 'broken-save-1', updatedAt: 1, profile: 42 } }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json<ClaimResponse>().claim.outcome, 'rejected');
  });

  it('rejects a save with nothing in it', async () => {
    const user = await register(server.app);
    const { body } = await claim(
      user.accessToken,
      guestSave({ xp: 0, stats: createProfile().stats })
    );
    assert.equal(body.claim.outcome, 'rejected');
  });

  it('keeps one player' + "'s claim out of another's account", async () => {
    const a = await register(server.app);
    const b = await register(server.app);
    const save = guestSave();

    await claim(a.accessToken, save);
    const other = await claim(b.accessToken, save);

    // The same save id under a different account is a fresh claim, not a
    // replay of someone else's.
    assert.equal(other.body.claim.outcome, 'adopted');
    assert.equal(other.body.profile.userId, b.userId);
  });
});

describe('pushing a queue', () => {
  const op = (kind: SyncOp['kind'], opId: string, payload: unknown): SyncOp =>
    ({ kind, opId, payload }) as SyncOp;

  async function push(token: string, baseVersion: number, ops: SyncOp[]) {
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: auth(token),
      payload: { baseVersion, ops }
    });
    return { statusCode: response.statusCode, body: response.json<SyncPushResponse>() };
  }

  it('applies a batch in order and returns the authoritative profile', async () => {
    const user = await register(server.app);
    const { statusCode, body } = await push(user.accessToken, user.profile.version, [
      op('match', 'op-batch-a-1', matchSubmission()),
      op('match', 'op-batch-a-2', matchSubmission({ won: false, scoreYou: 1, scoreBot: 5 })),
      op('profile.update', 'op-batch-a-3', { displayName: 'Queued' })
    ]);

    assert.equal(statusCode, 200);
    assert.deepEqual(
      body.results.map((r) => r.status),
      ['applied', 'applied', 'applied']
    );
    assert.equal(body.profile.stats.matches, 2);
    assert.equal(body.profile.displayName, 'Queued');
    assert.ok(body.results[0]?.summary, 'a match op should carry its own summary back');
  });

  it('applies an operation once, however many times the queue is flushed', async () => {
    const user = await register(server.app);
    const ops = [op('match', 'op-repeat-b-1', matchSubmission())];

    const first = await push(user.accessToken, user.profile.version, ops);
    const second = await push(user.accessToken, first.body.profile.version, ops);

    assert.equal(first.body.results[0]?.status, 'applied');
    assert.equal(second.body.results[0]?.status, 'duplicate');
    assert.equal(second.body.profile.xp, first.body.profile.xp);
    assert.equal(second.body.profile.stats.matches, 1);
  });

  it('refuses one bad operation without losing the rest of the batch', async () => {
    const user = await register(server.app);
    const { body } = await push(user.accessToken, user.profile.version, [
      op('match', 'op-mixed-c-1', matchSubmission()),
      // No points, so this cannot succeed.
      op('talent.purchase', 'op-mixed-c-2', { talentId: 'power-strike', expectedRank: 0 }),
      op('match', 'op-mixed-c-3', matchSubmission())
    ]);

    assert.deepEqual(
      body.results.map((r) => r.status),
      ['applied', 'rejected', 'applied']
    );
    assert.equal(body.results[1]?.code, 'REJECTED');
    assert.ok(body.results[1]?.reason);
    assert.equal(body.profile.stats.matches, 2);
  });

  it('reports divergence when the profile moved on elsewhere', async () => {
    const user = await register(server.app);
    // Another device records a match, moving the version on.
    await recordMatch(server.app, user.accessToken, matchSubmission());

    const { body } = await push(user.accessToken, user.profile.version, [
      op('match', 'op-diverge-d-1', matchSubmission())
    ]);

    assert.equal(body.diverged, true);
    // Divergence is information, not a failure: the queued match still lands.
    assert.equal(body.results[0]?.status, 'applied');
    assert.equal(body.profile.stats.matches, 2);
  });

  it('refuses a batch larger than the protocol allows', async () => {
    const user = await register(server.app);
    const ops = Array.from({ length: MAX_SYNC_OPS + 1 }, (_, i) =>
      op('match', `op-oversize-e-${i}`, matchSubmission())
    );
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: auth(user.accessToken),
      payload: { baseVersion: 1, ops }
    });
    assert.equal(response.statusCode, 422);
  });

  it('refuses an operation of an unknown kind', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: auth(user.accessToken),
      payload: {
        baseVersion: 1,
        ops: [{ kind: 'grant.xp', opId: 'op-unknown-f-1', payload: { xp: 999_999 } }]
      }
    });
    assert.equal(response.statusCode, 422);
  });

  it('accepts an empty push as a way of asking for the current profile', async () => {
    const user = await register(server.app);
    const { statusCode, body } = await push(user.accessToken, user.profile.version, []);
    assert.equal(statusCode, 200);
    assert.equal(body.results.length, 0);
    assert.equal(body.profile.userId, user.userId);
  });
});

describe('pulling', () => {
  it('returns the server copy and its clock', async () => {
    const user = await register(server.app);
    await recordMatch(server.app, user.accessToken, matchSubmission());

    const response = await server.app.inject({
      method: 'GET',
      url: '/v1/sync/pull',
      headers: { ...auth(user.accessToken), 'x-bball-device': 'dev-test-0001' }
    });

    assert.equal(response.statusCode, 200);
    const body = response.json<{ profile: { stats: { matches: number } }; serverTime: number }>();
    assert.equal(body.profile.stats.matches, 1);
    assert.ok(body.serverTime > 0);

    // The device is remembered, which is what lets the server tell a player
    // that another one has been playing.
    const rows = server.db
      .prepare('SELECT COUNT(*) AS n FROM sync_state WHERE user_id = ? AND device_id = ?')
      .get(user.userId, 'dev-test-0001') as { n: number };
    assert.equal(rows.n, 1);
  });
});
