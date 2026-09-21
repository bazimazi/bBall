/**
 * Two things happening at once.
 *
 * Every progression write is a read-modify-write, which is exactly the shape
 * that loses data when it interleaves: two devices finishing a match at the
 * same moment would each read the same XP, add their own, and one of the two
 * would vanish. These tests fire the requests together and check that the
 * arithmetic still adds up.
 *
 * The protection is structural rather than hopeful - each write runs inside
 * one IMMEDIATE transaction, guarded by the profile's version column - so
 * these tests are here to prove the structure is actually in place.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { ProfileMutationResponse, RecordMatchResponse } from '../../shared/protocol';
import {
  auth,
  grindToLevel,
  makeServer,
  matchSubmission,
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

describe('concurrent progression writes', () => {
  it('loses nothing when ten matches land together', async () => {
    const user = await register(server.app);
    const submissions = Array.from({ length: 10 }, (_, i) =>
      matchSubmission({ clientMatchId: `parallel-match-${i}`, seconds: 60 })
    );

    const responses = await Promise.all(
      submissions.map((payload) =>
        server.app.inject({
          method: 'POST',
          url: '/v1/progression/match',
          headers: auth(user.accessToken),
          payload
        })
      )
    );

    assert.ok(responses.every((response) => response.statusCode === 200));

    const awarded = responses
      .map((response) => response.json<RecordMatchResponse>().summary.xpAwarded)
      .reduce((sum, xp) => sum + xp, 0);

    const me = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(user.accessToken)
    });
    const profile = me.json<{ profile: { xp: number; stats: { matches: number } } }>().profile;

    assert.equal(profile.stats.matches, 10);
    // Achievement bonuses are granted on top of the per-match awards, so the
    // total can be higher - but never lower, which is what a lost update
    // would look like.
    assert.ok(
      profile.xp >= awarded,
      `expected at least ${awarded} XP from ten matches, got ${profile.xp}`
    );
  });

  it('records the same match once when it is submitted twice at once', async () => {
    const user = await register(server.app);
    const payload = matchSubmission({ clientMatchId: 'racing-submission-1' });

    const [first, second] = await Promise.all([
      server.app.inject({
        method: 'POST',
        url: '/v1/progression/match',
        headers: auth(user.accessToken),
        payload
      }),
      server.app.inject({
        method: 'POST',
        url: '/v1/progression/match',
        headers: auth(user.accessToken),
        payload
      })
    ]);

    assert.equal(first?.statusCode, 200);
    assert.equal(second?.statusCode, 200);

    const bodies = [first, second].map((r) => r!.json<RecordMatchResponse>());
    const applied = bodies.filter((body) => !body.duplicate);
    assert.equal(applied.length, 1, 'exactly one of the two should have counted');

    const me = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(user.accessToken)
    });
    assert.equal(me.json<{ profile: { stats: { matches: number } } }>().profile.stats.matches, 1);
  });

  it('spends one point when the same talent is bought twice at once', async () => {
    const user = await register(server.app);
    const before = await grindToLevel(server, user.accessToken, 4);

    const payload = { talentId: 'power-strike', expectedRank: 0 };
    const responses = await Promise.all([
      server.app.inject({
        method: 'POST',
        url: '/v1/progression/talents/purchase',
        headers: auth(user.accessToken),
        payload
      }),
      server.app.inject({
        method: 'POST',
        url: '/v1/progression/talents/purchase',
        headers: auth(user.accessToken),
        payload
      })
    ]);

    const accepted = responses.filter((response) => response.statusCode === 200);
    assert.equal(accepted.length, 1, 'the second purchase should be refused as stale');
    assert.equal(responses.find((r) => r.statusCode !== 200)?.statusCode, 409);

    const profile = accepted[0]!.json<ProfileMutationResponse>().profile;
    assert.equal(profile.talents.ranks['power-strike'], 1);
    assert.ok(profile.talentPoints < before.talentPoints);
  });

  it('gives every write its own version', async () => {
    const user = await register(server.app);
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        server.app.inject({
          method: 'PATCH',
          url: '/v1/profile',
          headers: auth(user.accessToken),
          payload: { displayName: `Name ${i}` }
        })
      )
    );

    const versions = responses.map((r) => r.json<ProfileMutationResponse>().profile.version);
    assert.equal(new Set(versions).size, versions.length, 'versions should never collide');
  });

  it('applies a queue flushed twice in parallel exactly once', async () => {
    const user = await register(server.app);
    const ops = [
      { kind: 'match', opId: 'parallel-flush-op-1', payload: matchSubmission() },
      { kind: 'match', opId: 'parallel-flush-op-2', payload: matchSubmission() }
    ];

    await Promise.all([
      server.app.inject({
        method: 'POST',
        url: '/v1/sync/push',
        headers: auth(user.accessToken),
        payload: { baseVersion: user.profile.version, ops }
      }),
      server.app.inject({
        method: 'POST',
        url: '/v1/sync/push',
        headers: auth(user.accessToken),
        payload: { baseVersion: user.profile.version, ops }
      })
    ]);

    const me = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(user.accessToken)
    });
    assert.equal(me.json<{ profile: { stats: { matches: number } } }>().profile.stats.matches, 2);
  });
});
