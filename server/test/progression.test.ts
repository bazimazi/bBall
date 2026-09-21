/**
 * Server-authoritative progression.
 *
 * The theme: the client can say what it did, and nothing else. Every test
 * here either checks that the server derived a number the request never
 * carried, or that a request which tried to carry one got nowhere.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { levelOf, xpToReach } from '../../src/core/progression/levels';
import { costOfRank, talentById } from '../../src/core/talents/catalog';
import { earnedPoints } from '../../src/core/talents/save';
import type { ProfileMutationResponse } from '../../shared/protocol';
import {
  auth,
  grindToLevel,
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

describe('recording a match', () => {
  it('awards XP the client never sent', async () => {
    const user = await register(server.app);
    const result = await recordMatch(server.app, user.accessToken, matchSubmission());

    assert.ok(result.summary.xpAwarded > 0);
    assert.equal(result.profile.xp, result.summary.xpAfter);
    assert.equal(result.summary.xpBefore, 0);
    assert.ok(result.summary.lines.length > 0, 'the award should be itemised');
    assert.equal(result.duplicate, false);
  });

  it('derives the level from XP rather than taking one', async () => {
    const user = await register(server.app);
    const result = await recordMatch(server.app, user.accessToken, matchSubmission());
    assert.equal(result.profile.level, levelOf(result.profile.xp));
  });

  it('scales the award with the opponent, not with anything the client says', async () => {
    const rookie = await register(server.app);
    const legend = await register(server.app);

    const shared = {
      scoreYou: 5,
      scoreBot: 0,
      shutout: true,
      bestRally: 20,
      hits: 50,
      seconds: 120
    };
    const weak = await recordMatch(
      server.app,
      rookie.accessToken,
      matchSubmission({ ...shared, botId: 'rookie' })
    );
    const strong = await recordMatch(
      server.app,
      legend.accessToken,
      matchSubmission({ ...shared, botId: 'legend' })
    );

    assert.ok(
      strong.summary.xpAwarded > weak.summary.xpAwarded,
      'a Legend win should be worth more than a Rookie win'
    );
    assert.ok(strong.summary.multiplier > weak.summary.multiplier);
  });

  it('pays nothing for practice', async () => {
    const user = await register(server.app);
    const result = await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({ mode: 'practice' })
    );
    assert.equal(result.summary.xpAwarded, 0);
    assert.equal(result.profile.xp, 0);
    assert.equal(result.profile.stats.matches, 0);
  });

  it('pays nothing for a match that was quit', async () => {
    const user = await register(server.app);
    const result = await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({ abandoned: true, won: false, scoreYou: 2, scoreBot: 1 })
    );
    assert.equal(result.summary.xpAwarded, 0);
  });

  it('records lifetime and per-mode statistics', async () => {
    const user = await register(server.app);
    await recordMatch(server.app, user.accessToken, matchSubmission({ bestRally: 22 }));
    const result = await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({ won: false, scoreYou: 2, scoreBot: 5 })
    );

    assert.equal(result.profile.stats.matches, 2);
    assert.equal(result.profile.stats.wins, 1);
    assert.equal(result.profile.stats.losses, 1);
    assert.equal(result.profile.stats.bestRally, 22);
    assert.equal(result.profile.modeStats.quick?.matches, 2);
    assert.equal(result.profile.modeStats.quick?.wins, 1);
  });

  it('unlocks achievements and their cosmetics without being asked', async () => {
    const user = await register(server.app);
    const result = await recordMatch(server.app, user.accessToken, matchSubmission());

    assert.ok(
      result.summary.achievements.includes('first-win'),
      'winning a first match should unlock On the Board'
    );
    assert.ok(result.profile.achievements['first-win'] !== undefined);
  });

  it('bumps the profile version on every accepted write', async () => {
    const user = await register(server.app);
    const first = await recordMatch(server.app, user.accessToken, matchSubmission());
    const second = await recordMatch(server.app, user.accessToken, matchSubmission());
    assert.equal(second.profile.version, first.profile.version + 1);
  });
});

describe('duplicate submissions', () => {
  it('ignores the same match sent twice', async () => {
    const user = await register(server.app);
    const submission = matchSubmission();

    const first = await recordMatch(server.app, user.accessToken, submission);
    const second = await recordMatch(server.app, user.accessToken, submission);

    assert.equal(second.duplicate, true);
    assert.equal(second.profile.xp, first.profile.xp);
    assert.equal(second.profile.stats.matches, 1);
    // The replay returns the original summary, so a client that lost the
    // first response still has something to show the player.
    assert.equal(second.summary.xpAwarded, first.summary.xpAwarded);
  });

  it('replays the stored response for a repeated idempotency key', async () => {
    const user = await register(server.app);
    const submission = matchSubmission();
    const headers = { ...auth(user.accessToken), 'idempotency-key': 'fixed-key-1' };

    const first = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/match',
      headers,
      payload: submission
    });
    const second = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/match',
      headers,
      payload: submission
    });

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.deepEqual(second.json(), first.json());
  });

  it('refuses the same idempotency key for a different body', async () => {
    const user = await register(server.app);
    const headers = { ...auth(user.accessToken), 'idempotency-key': 'fixed-key-2' };

    await server.app.inject({
      method: 'POST',
      url: '/v1/progression/match',
      headers,
      payload: matchSubmission()
    });
    const second = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/match',
      headers,
      payload: matchSubmission()
    });

    assert.equal(second.statusCode, 409);
  });

  it('keeps two players' + ' matches apart even with the same client id', async () => {
    const a = await register(server.app);
    const b = await register(server.app);
    const submission = matchSubmission({ clientMatchId: 'shared-id-0001' });

    const first = await recordMatch(server.app, a.accessToken, submission);
    const second = await recordMatch(server.app, b.accessToken, submission);

    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, false);
    assert.ok(second.summary.xpAwarded > 0);
  });
});

describe('talents', () => {
  it('grants exactly one point per level', async () => {
    const user = await register(server.app);
    const profile = await grindToLevel(server, user.accessToken, 4);

    assert.equal(profile.talentPoints, earnedPoints(profile.level));
    assert.equal(profile.talentPoints, profile.level - 1);
  });

  it('spends a point on a purchase and refuses a rank the player cannot afford', async () => {
    const user = await register(server.app);
    const before = await grindToLevel(server, user.accessToken, 3);

    const bought = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/talents/purchase',
      headers: auth(user.accessToken),
      payload: { talentId: 'power-strike', expectedRank: 0 }
    });
    assert.equal(bought.statusCode, 200);

    const after = bought.json<ProfileMutationResponse>().profile;
    assert.equal(after.talents.ranks['power-strike'], 1);
    // The catalogue prices the first rank, not the test: whatever it costs,
    // exactly that much should have left the wallet.
    assert.equal(
      after.talentPoints,
      before.talentPoints - costOfRank(talentById('power-strike')!, 0)
    );
    // Buying the ability also slots it, exactly as the local store does.
    assert.ok(after.talents.equipped.includes('power-strike'));
  });

  it('refuses a purchase with a stale expected rank', async () => {
    const user = await register(server.app);
    await grindToLevel(server, user.accessToken, 4);

    await server.app.inject({
      method: 'POST',
      url: '/v1/progression/talents/purchase',
      headers: auth(user.accessToken),
      payload: { talentId: 'power-strike', expectedRank: 0 }
    });

    // The same request again: a double-tapped button, or a replayed packet.
    const again = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/talents/purchase',
      headers: auth(user.accessToken),
      payload: { talentId: 'power-strike', expectedRank: 0 }
    });
    assert.equal(again.statusCode, 409);
  });

  it('refuses a purchase with no points', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/talents/purchase',
      headers: auth(user.accessToken),
      payload: { talentId: 'power-strike', expectedRank: 0 }
    });
    assert.equal(response.statusCode, 422);
    assert.equal(response.json<{ error: { code: string } }>().error.code, 'REJECTED');
  });

  it('refuses a talent behind an unmet tier gate', async () => {
    const user = await register(server.app);
    await grindToLevel(server, user.accessToken, 4);

    // Overload sits at the bottom of the Power branch, behind eight points of
    // commitment. A level-4 player has three.
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/talents/purchase',
      headers: auth(user.accessToken),
      payload: { talentId: 'overload', expectedRank: 0 }
    });
    assert.equal(response.statusCode, 422);
  });

  it('refuses a talent id that does not exist', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/talents/purchase',
      headers: auth(user.accessToken),
      payload: { talentId: 'infinite-power', expectedRank: 0 }
    });
    assert.equal(response.statusCode, 422);
  });

  it('refunds every point on a respec', async () => {
    const user = await register(server.app);
    const start = await grindToLevel(server, user.accessToken, 4);

    await server.app.inject({
      method: 'POST',
      url: '/v1/progression/talents/purchase',
      headers: auth(user.accessToken),
      payload: { talentId: 'power-strike', expectedRank: 0 }
    });

    const respec = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/talents/respec',
      headers: auth(user.accessToken),
      payload: {}
    });
    assert.equal(respec.statusCode, 200);

    const after = respec.json<ProfileMutationResponse>().profile;
    assert.equal(after.talentPoints, start.talentPoints);
    assert.deepEqual(after.talents.ranks, {});
  });

  it('refuses to equip an ability the build does not own', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/abilities/equip',
      headers: auth(user.accessToken),
      payload: { slot: 0, abilityId: 'overload' }
    });
    assert.equal(response.statusCode, 422);
  });

  it('refuses a slot the player has not unlocked', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/abilities/equip',
      headers: auth(user.accessToken),
      payload: { slot: 4, abilityId: null }
    });
    assert.equal(response.statusCode, 422);
  });
});

describe('cosmetics', () => {
  it('refuses to equip something that is not unlocked', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/cosmetics/equip',
      headers: auth(user.accessToken),
      payload: { slot: 'accent', cosmeticId: 'accent-gold' }
    });
    assert.equal(response.statusCode, 422);
  });

  it('accepts one that is', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/cosmetics/equip',
      headers: auth(user.accessToken),
      payload: { slot: 'accent', cosmeticId: 'accent-violet' }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json<ProfileMutationResponse>().profile.equipped.accent, 'accent-violet');
  });

  it('refuses an item in the wrong slot', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/cosmetics/equip',
      headers: auth(user.accessToken),
      payload: { slot: 'ball', cosmeticId: 'accent-violet' }
    });
    assert.equal(response.statusCode, 422);
  });
});

describe('profile updates', () => {
  it('accepts a name and an avatar', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'PATCH',
      url: '/v1/profile',
      headers: auth(user.accessToken),
      payload: { displayName: '  Ace  ', avatar: 'bolt' }
    });
    assert.equal(response.statusCode, 200);

    const profile = response.json<ProfileMutationResponse>().profile;
    assert.equal(profile.displayName, 'Ace');
    assert.equal(profile.avatar, 'bolt');
  });

  it('refuses an avatar that does not exist', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'PATCH',
      url: '/v1/profile',
      headers: auth(user.accessToken),
      payload: { avatar: 'dragon' }
    });
    assert.equal(response.statusCode, 422);
  });

  it('ignores xp, level and talent points a client tries to set', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'PATCH',
      url: '/v1/profile',
      headers: auth(user.accessToken),
      payload: { displayName: 'Ace', xp: 1_000_000, level: 99, talentPoints: 50 }
    });
    // Strict schemas: an unexpected field is a refusal, not a silent drop, so
    // a client cannot discover that the field is being ignored.
    assert.equal(response.statusCode, 422);

    const me = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(user.accessToken)
    });
    assert.equal(me.json<{ profile: { xp: number } }>().profile.xp, 0);
  });

  it('refuses a write against a stale version', async () => {
    const user = await register(server.app);
    const current = await server.app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: auth(user.accessToken)
    });
    const version = current.json<{ profile: { version: number } }>().profile.version;

    const response = await server.app.inject({
      method: 'PATCH',
      url: '/v1/profile',
      headers: auth(user.accessToken),
      payload: { displayName: 'Stale', baseVersion: version - 1 }
    });
    assert.equal(response.statusCode, 409);
    assert.equal(response.json<{ error: { code: string } }>().error.code, 'VERSION_CONFLICT');
  });
});

describe('tournaments', () => {
  it('refuses a cup the player has not unlocked', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/tournament/start',
      headers: auth(user.accessToken),
      payload: { tier: 2 }
    });
    assert.equal(response.statusCode, 422);
  });

  it('runs a cup round by round and refuses a round out of order', async () => {
    const user = await register(server.app);

    const started = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/tournament/start',
      headers: auth(user.accessToken),
      payload: { tier: 0 }
    });
    assert.equal(started.statusCode, 201);
    assert.equal(started.json<ProfileMutationResponse>().profile.tournament?.round, 0);

    // The quarter-final of the Bronze Cup is against the Rookie, to three.
    const first = await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({
        mode: 'tournament',
        botId: 'rookie',
        scoreYou: 3,
        scoreBot: 1,
        tournamentRound: 0,
        tournamentTier: 0
      })
    );
    assert.equal(first.profile.tournament?.round, 1);

    // Claiming the round that was just played is refused.
    const replayRound = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/match',
      headers: auth(user.accessToken),
      payload: matchSubmission({
        mode: 'tournament',
        botId: 'rookie',
        scoreYou: 3,
        scoreBot: 1,
        tournamentRound: 0,
        tournamentTier: 0
      })
    });
    assert.equal(replayRound.statusCode, 422);
  });

  it('refuses a tournament match with no cup in progress', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/match',
      headers: auth(user.accessToken),
      payload: matchSubmission({ mode: 'tournament', botId: 'rookie', scoreYou: 3, scoreBot: 1 })
    });
    assert.equal(response.statusCode, 422);
  });

  it('allows only one cup at a time', async () => {
    const user = await register(server.app);
    await server.app.inject({
      method: 'POST',
      url: '/v1/progression/tournament/start',
      headers: auth(user.accessToken),
      payload: { tier: 0 }
    });
    const second = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/tournament/start',
      headers: auth(user.accessToken),
      payload: { tier: 0 }
    });
    assert.equal(second.statusCode, 409);
  });
});

describe('the XP curve is the one the client ships', () => {
  it('reaches the level the shared curve says it should', async () => {
    const user = await register(server.app);
    const profile = await grindToLevel(server, user.accessToken, 5);

    assert.ok(profile.xp >= xpToReach(profile.level));
    assert.ok(profile.xp < xpToReach(profile.level + 1));
  });
});
