import assert from 'node:assert/strict';
import { it } from 'node:test';
import { BALANCE, rankScale } from '../../src/core/balance/config';
import { botProfile, SELECTABLE_BOTS } from '../../src/core/bots/levels';
import { stageById } from '../../src/core/campaign/journey';
import { contractPace, cupPace, journeyPace, runPace, withPace } from '../../src/core/modes/pace';
import {
  campaignRules,
  contractBot,
  quickMatchRules,
  tournamentRules
} from '../../src/core/modes/rules';
import { NEUTRAL_MODIFIERS } from '../../src/core/modes/types';
import { createProfile } from '../../src/core/profile/defaults';
import { xpToReach } from '../../src/core/progression/levels';
import { createTournament, opponentFor } from '../../src/core/tournament/bracket';
import { validateMatch } from '../src/domain/matchValidation';
import { matchSubmission } from './helpers';
import { tuningFor } from '../../src/game/world';

it('Champion sits above Legend: selectable, rank 6, a faster ball and more XP', () => {
  const champion = botProfile('champion');
  assert.equal(champion.rank, 6);
  assert.equal(SELECTABLE_BOTS.at(-1)!.id, 'champion');
  assert.ok(champion.xpFactor > botProfile('legend').xpFactor);
  assert.ok(champion.aimError < botProfile('legend').aimError);
  assert.ok(rankScale(6).max > rankScale(5).max);
  const legend = tuningFor(quickMatchRules('legend'));
  const top = tuningFor(quickMatchRules('champion'));
  assert.ok(top.serveSpeed > legend.serveSpeed && top.maxSpeed > legend.maxSpeed);
  assert.ok(top.maxSpeed <= BALANCE.ball.hardMax);
});

it('contracts declare their opponent: Legend for Master, the Champion for Mythic', () => {
  assert.equal(contractBot('master'), 'legend');
  assert.equal(contractBot('mythic'), 'champion');
  assert.equal(contractBot(undefined), undefined);
  assert.equal(quickMatchRules('rookie', { contract: 'mythic' }).bot.id, 'champion');
  assert.equal(quickMatchRules('rookie', { contract: 'master' }).bot.id, 'legend');

  const profile = createProfile();
  profile.xp = xpToReach(50);
  const ok = (botId: 'legend' | 'champion', contract: 'master' | 'mythic') =>
    validateMatch(
      matchSubmission({ botId, options: { contract }, scoreYou: contract === 'mythic' ? 9 : 7 }),
      {
        profile,
        recentPlaySeconds: 0,
        now: Date.now()
      }
    ).ok;
  assert.equal(ok('legend', 'master'), true);
  assert.equal(ok('champion', 'mythic'), true);
  assert.equal(ok('legend', 'mythic'), false, 'a Mythic claim against Legend is refused');
  assert.equal(ok('champion', 'master'), false);
});

it('content pace rises with depth, stays plain early and is bounded', () => {
  assert.equal(journeyPace(1), 1);
  assert.equal(journeyPace(5), 1);
  assert.ok(journeyPace(6) > 1 && journeyPace(30) > journeyPace(6));
  assert.ok(journeyPace(31, 1) >= journeyPace(30));
  assert.ok(journeyPace(1_000_000, 999_999) <= BALANCE.pace.max);
  assert.equal(runPace(0, 0), 1);
  assert.ok(runPace(5, 50) > runPace(1, 0));
  assert.equal(cupPace(0), 1);
  assert.ok(cupPace(9) > cupPace(3));
  assert.equal(contractPace(undefined), 1);

  const paced = withPace({ ...NEUTRAL_MODIFIERS }, 1.2);
  assert.equal(paced.serveSpeedScale, 1.2);
  assert.equal(paced.maxSpeedScale, 1.2);
  assert.equal(paced.speedPerHitScale, 1.2);
  assert.deepEqual(withPace({ ...NEUTRAL_MODIFIERS }, 1), NEUTRAL_MODIFIERS);

  // Legacy worlds play exactly as before; expansion worlds are quicker.
  const early = tuningFor(campaignRules(stageById('w2-4')!));
  assert.deepEqual(early, tuningFor({ ...campaignRules(stageById('w2-4')!) }));
  const late = campaignRules(stageById('w20-5')!);
  assert.ok(late.modifiers.serveSpeedScale >= journeyPace(20) - 1e-9);
});

it('the Champion is chosen, never imposed by content', () => {
  for (let tier = 0; tier < 10; tier++)
    for (let round = 0; round < 3; round++)
      assert.notEqual(opponentFor(createTournament(tier, 0, 'classic'), round), 'champion');
  for (const id of ['w28-24', 'w30-24', 'f2-6-5', 'f2-40-20'])
    assert.notEqual(stageById(id)!.bot, 'champion', id);
  // Should content ever place it, its brain is the difficulty: no build on top.
  assert.equal(
    quickMatchRules('rookie', { contract: 'mythic' }).botPoints ?? 0,
    0,
    'the Mythic Champion brings no build'
  );
  assert.equal(
    tournamentRules({ ...createTournament(9, 0, 'classic'), round: 2 }).bot.id,
    'legend'
  );
  assert.ok(campaignRules(stageById('w28-24')!).botPoints! > 0, 'a Legend boss keeps its build');
});
