/**
 * Anti-cheat.
 *
 * Every case here is a request an honest client would never send, checked at
 * the HTTP boundary so the test exercises the schema, the validator and the
 * service together. The two halves matter equally: implausible submissions
 * are refused, and plausible ones are *not* - a validator that rejects real
 * matches is worse than none at all, because it breaks the game for the
 * players who are not cheating.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { validateMatch } from '../src/domain/matchValidation';
import { createProfile } from '../../src/core/profile/defaults';
import type { PlayerProfile } from '../../src/core/profile/types';
import { xpToReach } from '../../src/core/progression/levels';
import { reconcile } from '../../src/core/talents/save';
import type { AbilityId, TalentId } from '../../src/core/talents/types';
import type { MatchSubmissionDto } from '../../shared/protocol';
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

/** Submit and return the status, without throwing on a refusal. */
async function submit(token: string, patch: Partial<MatchSubmissionDto>): Promise<number> {
  const response = await server.app.inject({
    method: 'POST',
    url: '/v1/progression/match',
    headers: auth(token),
    payload: matchSubmission(patch)
  });
  return response.statusCode;
}

describe('scorelines', () => {
  it('refuses a Quick Match that never reached the winning score', async () => {
    const user = await register(server.app);
    assert.equal(await submit(user.accessToken, { scoreYou: 3, scoreBot: 1 }), 422);
  });

  it('refuses a score past the winning score', async () => {
    const user = await register(server.app);
    assert.equal(await submit(user.accessToken, { scoreYou: 9, scoreBot: 2 }), 422);
  });

  it('refuses a winner who did not out-score the loser', async () => {
    const user = await register(server.app);
    assert.equal(await submit(user.accessToken, { won: true, scoreYou: 3, scoreBot: 5 }), 422);
  });

  it('refuses a shutout that conceded points', async () => {
    const user = await register(server.app);
    assert.equal(await submit(user.accessToken, { shutout: true, scoreBot: 3 }), 422);
  });

  it('refuses a comeback that was not a win', async () => {
    const user = await register(server.app);
    assert.equal(
      await submit(user.accessToken, { comeback: true, won: false, scoreYou: 2, scoreBot: 5 }),
      422
    );
  });

  it('refuses a scoreline below where the mode starts', async () => {
    const user = await register(server.app);
    // Two Down opens at 0-2, so the bot cannot finish on fewer than two.
    assert.equal(
      await submit(user.accessToken, {
        mode: 'challenge',
        challengeId: 'comeback',
        botId: 'pro',
        scoreYou: 3,
        scoreBot: 1
      }),
      422
    );
  });
});

describe('time and rallies', () => {
  it('refuses more returns than the time could hold', async () => {
    const user = await register(server.app);
    assert.equal(await submit(user.accessToken, { hits: 5000, seconds: 30 }), 422);
  });

  it('refuses a rally longer than the returns played', async () => {
    const user = await register(server.app);
    assert.equal(await submit(user.accessToken, { hits: 3, bestRally: 400, seconds: 600 }), 422);
  });

  it('refuses a match dated in the future', async () => {
    const user = await register(server.app);
    assert.equal(await submit(user.accessToken, { playedAt: Date.now() + 60 * 60 * 1000 }), 422);
  });

  it('refuses a stream of matches that adds up to more play than time allows', async () => {
    const user = await register(server.app);
    // Each of these is individually plausible; together they claim over two
    // hours of play inside one hour of wall clock.
    let refusals = 0;
    for (let i = 0; i < 40; i++) {
      const status = await submit(user.accessToken, { seconds: 240, hits: 60, bestRally: 20 });
      if (status === 422) refusals += 1;
    }
    assert.ok(refusals > 0, 'the play budget should eventually bite');
  });
});

describe('modes and opponents', () => {
  it('refuses Endless against anything but the wall', async () => {
    const user = await register(server.app);
    assert.equal(
      await submit(user.accessToken, { mode: 'endless', botId: 'legend', livesLeft: 0 }),
      422
    );
  });

  it('refuses the wall on the ranked ladder', async () => {
    const user = await register(server.app);
    assert.equal(await submit(user.accessToken, { mode: 'quick', botId: 'wall' }), 422);
  });

  it('refuses a challenge against the wrong opponent', async () => {
    const user = await register(server.app);
    assert.equal(
      await submit(user.accessToken, {
        mode: 'challenge',
        challengeId: 'needle',
        botId: 'legend',
        scoreYou: 3,
        scoreBot: 1
      }),
      422
    );
  });

  it('refuses a challenge that does not exist', async () => {
    const user = await register(server.app);
    assert.equal(
      await submit(user.accessToken, {
        mode: 'challenge',
        challengeId: 'free-xp',
        botId: 'amateur',
        scoreYou: 3,
        scoreBot: 1
      }),
      422
    );
  });

  it('refuses a mode that does not exist', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/match',
      headers: auth(user.accessToken),
      payload: { ...matchSubmission(), mode: 'freeplay' }
    });
    assert.equal(response.statusCode, 422);
  });

  it('refuses lives in a mode that has none', async () => {
    const user = await register(server.app);
    assert.equal(await submit(user.accessToken, { livesLeft: 3 }), 422);
  });
});

describe('build claims', () => {
  it('refuses abilities used by a build with none equipped', async () => {
    const user = await register(server.app);
    assert.equal(
      await submit(user.accessToken, {
        talent: { ...matchSubmission().talent, abilitiesUsed: 12 }
      }),
      422
    );
  });

  it('refuses criticals from a build without Critical Strike', async () => {
    const user = await register(server.app);
    assert.equal(
      await submit(user.accessToken, { talent: { ...matchSubmission().talent, crits: 5 } }),
      422
    );
  });

  it('refuses a drive longer than the returns played', async () => {
    const user = await register(server.app);
    assert.equal(
      await submit(user.accessToken, {
        hits: 40,
        talent: { ...matchSubmission().talent, bestDrive: 99 }
      }),
      422
    );
  });
});

/** A level-50 profile owning exactly `ranks`, with `equipped` in its slots. */
function buildProfile(
  ranks: Partial<Record<TalentId, number>>,
  equipped: AbilityId[] = []
): PlayerProfile {
  const profile = createProfile();
  profile.xp = xpToReach(50);
  const slots: (AbilityId | null)[] = [null, null, null, null, null];
  equipped.forEach((id, i) => (slots[i] = id));
  profile.talents = reconcile({ ...profile.talents, ranks, equipped: slots }, 50);
  return profile;
}

function verdictFor(profile: PlayerProfile, patch: Partial<MatchSubmissionDto>) {
  return validateMatch(matchSubmission(patch), { profile, recentPlaySeconds: 0, now: Date.now() });
}

/**
 * Honest matches the validator used to refuse. Each of these is a build
 * playing exactly as the engine lets it - the other half of anti-cheat.
 */
describe('honest builds', () => {
  it('accepts earned Edge Pressure criticals without a critical-chance talent', () => {
    const profile = buildProfile({
      'heavy-impact': 3,
      'bank-shot': 2,
      momentum: 1,
      'edge-pressure': 2
    });
    assert.equal(profile.talents.ranks['edge-pressure'], 2);
    assert.equal(
      verdictFor(profile, { talent: { ...matchSubmission().talent, crits: 10 } }).ok,
      true
    );
  });

  it('includes return-earned shield recovery in the save ceiling', () => {
    const ranks = { shield: 1, fortify: 1, bastion: 2, clutch: 1 } as const;
    const patch = { talent: { ...matchSubmission().talent, shieldSaves: 5 } };
    const plain = buildProfile(ranks);
    const armored = buildProfile({ ...ranks, 'rally-armor': 2 });
    assert.equal(armored.talents.ranks['rally-armor'], 2);
    assert.equal(verdictFor(plain, patch).ok, false);
    assert.equal(verdictFor(armored, patch).ok, true);
    assert.equal(verdictFor(armored, { talent: { ...patch.talent, shieldSaves: 7 } }).ok, false);
  });

  const overloadBuild = {
    'power-strike': 1,
    overdrive: 2,
    'heavy-impact': 3,
    momentum: 2,
    overload: 1
  } as const;

  it('accepts an Overload whose four charged returns are all critical', () => {
    const profile = buildProfile(overloadBuild, ['overload']);
    assert.equal(profile.talents.ranks.overload, 1);
    // One cast, four critical returns - and no Critical Strike owned.
    const verdict = verdictFor(profile, {
      talent: { ...matchSubmission().talent, abilitiesUsed: 1, ultimates: 1, crits: 4 }
    });
    assert.equal(verdict.ok, true);
  });

  it('accepts one Power Strike cast charging two returns at Overdrive two', () => {
    const profile = buildProfile(overloadBuild, ['power-strike']);
    const verdict = verdictFor(profile, {
      talent: { ...matchSubmission().talent, abilitiesUsed: 1, powerStrikes: 2 }
    });
    assert.equal(verdict.ok, true);
  });

  it('still refuses more Power Strike returns than the casts could charge', () => {
    const profile = buildProfile(overloadBuild, ['power-strike']);
    const verdict = verdictFor(profile, {
      talent: { ...matchSubmission().talent, abilitiesUsed: 1, powerStrikes: 5 }
    });
    assert.equal(verdict.ok, false);
  });

  it('accepts a drive that ran across several won points', () => {
    const profile = buildProfile({});
    // Three points won on short rallies: a 12-return drive, a 6-long best rally.
    const verdict = verdictFor(profile, {
      bestRally: 6,
      hits: 30,
      talent: { ...matchSubmission().talent, bestDrive: 12 }
    });
    assert.equal(verdict.ok, true);
  });

  it('counts Aegis saves toward what the build could have saved', () => {
    const profile = buildProfile(
      { shield: 1, counterstrike: 1, bastion: 2, clutch: 2, fortify: 1, aegis: 1 },
      ['aegis']
    );
    assert.equal(profile.talents.ranks.aegis, 1);
    const verdict = verdictFor(profile, {
      seconds: 200,
      // More than one Shield charge could recharge in 200s; Aegis covers the rest.
      talent: { ...matchSubmission().talent, abilitiesUsed: 3, ultimates: 3, shieldSaves: 9 }
    });
    assert.equal(verdict.ok, true);
  });

  it('refuses saves from a Reckless build, which has none', () => {
    const profile = buildProfile({
      'heavy-impact': 3,
      'critical-strike': 1,
      reckless: 1,
      shield: 2
    });
    assert.equal(profile.talents.ranks.reckless, 1);
    const verdict = verdictFor(profile, {
      talent: { ...matchSubmission().talent, shieldSaves: 1 }
    });
    assert.equal(verdict.ok, false);
  });
});

describe('request shape', () => {
  it('refuses a negative score', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/match',
      headers: auth(user.accessToken),
      payload: { ...matchSubmission(), scoreYou: -5 }
    });
    assert.equal(response.statusCode, 422);
  });

  it('refuses a body carrying fields the protocol does not have', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/match',
      headers: auth(user.accessToken),
      payload: { ...matchSubmission(), xpAwarded: 1_000_000 }
    });
    assert.equal(response.statusCode, 422);
  });

  it('refuses a body that is not an object', async () => {
    const user = await register(server.app);
    const response = await server.app.inject({
      method: 'POST',
      url: '/v1/progression/match',
      headers: { ...auth(user.accessToken), 'content-type': 'application/json' },
      payload: '"just a string"'
    });
    assert.ok(response.statusCode >= 400);
  });

  it('refuses a body over the size limit', async () => {
    const small = await makeServer({ BODY_LIMIT_BYTES: '2048' });
    try {
      const user = await register(small.app);
      const response = await small.app.inject({
        method: 'POST',
        url: '/v1/progression/match',
        headers: auth(user.accessToken),
        payload: { ...matchSubmission(), clientMatchId: 'x'.repeat(8000) }
      });
      assert.equal(response.statusCode, 413);
      assert.equal(response.json<{ error: { code: string } }>().error.code, 'PAYLOAD_TOO_LARGE');
    } finally {
      await small.close();
    }
  });
});

describe('honest matches are still accepted', () => {
  it('accepts a long endless run', async () => {
    const user = await register(server.app);
    const result = await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({
        mode: 'endless',
        botId: 'wall',
        won: false,
        scoreYou: 0,
        scoreBot: 3,
        bestRally: 120,
        hits: 320,
        seconds: 600,
        livesLeft: 0,
        objectiveMet: true
      })
    );
    assert.ok(result.summary.xpAwarded > 0);
    assert.equal(result.profile.stats.endlessBest, 120);
  });

  it('accepts a long, close five-setter', async () => {
    const user = await register(server.app);
    const result = await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({ scoreYou: 5, scoreBot: 4, bestRally: 61, hits: 240, seconds: 900 })
    );
    assert.ok(result.summary.xpAwarded > 0);
  });

  it('accepts a very fast shutout against a weak bot', async () => {
    const user = await register(server.app);
    const result = await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({
        botId: 'rookie',
        scoreYou: 5,
        scoreBot: 0,
        shutout: true,
        bestRally: 2,
        hits: 6,
        seconds: 14
      })
    );
    assert.ok(result.summary.xpAwarded > 0);
  });
});

describe('the validator on its own', () => {
  it('corrects an objective the client got wrong instead of trusting it', () => {
    const profile = createProfile();
    const verdict = validateMatch(
      matchSubmission({
        mode: 'challenge',
        challengeId: 'long-rally',
        botId: 'pro',
        scoreYou: 3,
        scoreBot: 1,
        bestRally: 4,
        hits: 20,
        seconds: 120,
        // The client claims the 25-rally objective was met on a 4 rally.
        objectiveMet: true
      }),
      { profile, recentPlaySeconds: 0, now: Date.now() }
    );

    assert.equal(verdict.ok, true);
    if (!verdict.ok) return;
    assert.equal(verdict.result.objectiveMet, false);
    assert.ok(verdict.notes.some((note) => note.includes('objectiveMet')));
  });

  it('replaces the ranked flag with the mode' + "'s own", () => {
    const profile = createProfile();
    const verdict = validateMatch(matchSubmission({ mode: 'practice' }), {
      profile,
      recentPlaySeconds: 0,
      now: Date.now()
    });
    assert.equal(verdict.ok, true);
    if (!verdict.ok) return;
    assert.equal(verdict.result.ranked, false);
  });

  it('gives a stable code for each rejection', () => {
    const profile = createProfile();
    const verdict = validateMatch(matchSubmission({ hits: 9000, seconds: 10 }), {
      profile,
      recentPlaySeconds: 0,
      now: Date.now()
    });
    assert.equal(verdict.ok, false);
    if (verdict.ok) return;
    assert.equal(verdict.code, 'impossible-duration');
  });
});
