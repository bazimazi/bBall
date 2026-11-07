import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { botProfile } from '../../src/core/bots/levels';
import { frontierStage } from '../../src/core/campaign/expansion';
import { starXp } from '../../src/core/campaign/journey';
import { COSMETICS, isUnlocked } from '../../src/core/cosmetics/catalog';
import { applyLootReward } from '../../src/core/loot/rewards';
import type { MatchResult } from '../../src/core/modes/types';
import { createProfile } from '../../src/core/profile/defaults';
import { applyMatchResult } from '../../src/core/progression/apply';
import { createRun } from '../../src/core/run/run';
import { EMPTY_MATCH_STATS } from '../../src/core/talents/types';
import { readSpread, strainOf } from '../../src/game/ai';
import type { GameAudio } from '../../src/game/audio';
import { FIELD_H } from '../../src/game/constants';
import { createWorld, placePaddles } from '../../src/game/world';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;

function result(patch: Partial<MatchResult> = {}): MatchResult {
  return {
    mode: 'quick',
    ranked: true,
    botId: 'amateur',
    botRank: 2,
    won: true,
    scoreYou: 5,
    scoreBot: 3,
    bestRally: 10,
    hits: 30,
    seconds: 90,
    livesLeft: 0,
    objectiveMet: true,
    objective: null,
    talent: { ...EMPTY_MATCH_STATS },
    flicks: 0,
    shutout: false,
    comeback: false,
    abandoned: false,
    ...patch
  };
}

describe('bot errors follow the shot', () => {
  const setup = () => {
    const world = createWorld(silent, 1);
    world.view.w = 1000;
    placePaddles(world);
    world.bot.y = FIELD_H / 2;
    world.ball.x = 300;
    world.ball.y = FIELD_H / 2;
    world.ball.vx = 700;
    world.ball.vy = 0;
    world.ball.speed = 700;
    world.ball.heft = 0;
    return world;
  };

  it('a ball straight at the bot strains nothing; a wide one does', () => {
    const world = setup();
    assert.equal(strainOf(world, world.bot, world.bot.y), 0);
    const wide = strainOf(world, world.bot, world.bot.y + 240);
    assert.ok(wide > 0.2, `a wide crossing strains the bot (${wide})`);
    world.ball.vx = 1400;
    assert.ok(strainOf(world, world.bot, world.bot.y + 240) > wide, 'faster is harder');
  });

  it('every tier reads an easy ball better and a stretching one far worse', () => {
    const world = setup();
    for (const id of ['amateur', 'pro', 'elite', 'legend', 'champion'] as const) {
      const p = botProfile(id);
      const easy = readSpread(world, p, 0, 0);
      const hard = readSpread(world, p, 0, 0.5);
      assert.ok(easy < p.aimError, `${id}: an easy flat ball reads better than plain aim`);
      assert.ok(hard > easy * 2.5, `${id}: a sprint loosens the read sharply`);
    }
  });

  it('a steep arrival loosens the read, less for composed bots', () => {
    const world = setup();
    const flat = readSpread(world, botProfile('pro'), 0, 0);
    world.ball.vy = 600;
    assert.ok(readSpread(world, botProfile('pro'), 0, 0) > flat);
    const proSteep = readSpread(world, botProfile('pro'), 0, 0) - flat;
    world.ball.vy = 0;
    const legendFlat = readSpread(world, botProfile('legend'), 0, 0);
    world.ball.vy = 600;
    const legendSteep = readSpread(world, botProfile('legend'), 0, 0) - legendFlat;
    assert.ok(legendSteep < proSteep);
  });
});

describe('reward incentives', () => {
  it('Quick wins pay a Tactic Thread; Quick losses pay none', () => {
    const profile = createProfile();
    // A mode already seen, so no discovery bonus muddies the count.
    profile.progress.loot.seenModes.push('quick');
    const won = applyLootReward(profile, result({ won: true }), false, 0);
    assert.equal(won.items.threads, 1);
    const lost = applyLootReward(
      profile,
      result({ won: false, scoreYou: 2, scoreBot: 5 }),
      false,
      0
    );
    assert.equal(lost.items.threads, 0);
  });

  it('Frontier stars start at the world-16 rate and climb a world per sector', () => {
    const star = (sector: number) => {
      const stage = frontierStage(sector, 1);
      const summary = applyMatchResult(
        createProfile(),
        result({ mode: 'campaign', stageId: stage.id, botId: stage.bot, botRank: 4 })
      );
      return summary.award.extras.find((line) => /star/.test(line.label));
    };
    const first = star(1);
    assert.ok(first, 'a first Frontier clear pays its star');
    assert.equal(first.xp % starXp(16), 0);
    const later = star(30);
    assert.ok(later && later.xp % starXp(30) === 0, 'the rate reaches the cap');
  });

  it('the opening Gauntlet encounter pays as a match, later wins pay the run bonus', () => {
    const profile = createProfile();
    profile.progress.run = createRun('review-seed', 0);
    const opener = applyMatchResult(
      profile,
      result({ mode: 'run', runStage: 0, scoreYou: 3, scoreBot: 1 })
    );
    assert.equal(
      opener.award.extras.find((line) => line.label === 'Gauntlet win'),
      undefined
    );
    const later = createProfile();
    later.progress.run = { ...createRun('review-seed', 0), stage: 1 };
    const second = applyMatchResult(
      later,
      result({ mode: 'run', runStage: 1, scoreYou: 3, scoreBot: 1 })
    );
    assert.ok(second.award.extras.some((line) => line.label === 'Gauntlet win'));
  });

  it('the anti-farm day follows the match and never rolls backwards', () => {
    const profile = createProfile();
    profile.daily = { day: '2026-11-05', matches: 30 };
    const today = applyMatchResult(profile, result({ day: '2026-11-06' }));
    assert.equal(today.award.damped, false, 'a new day starts undamped');
    const back = createProfile();
    back.daily = { day: '2026-11-06', matches: 30 };
    const late = applyMatchResult(back, result({ day: '2026-11-05' }));
    assert.equal(late.award.damped, true, 'a late result from yesterday does not reset today');
  });

  it('levels 30 to 90 keep paying in cosmetics', () => {
    const levels = COSMETICS.flatMap((item) =>
      item.unlock.type === 'level' ? [item.unlock.level] : []
    );
    for (const level of [35, 40, 45, 55, 60, 70, 80, 90]) assert.ok(levels.includes(level));
    const ball = COSMETICS.find((item) => item.id === 'ball-level-35')!;
    assert.equal(isUnlocked(ball, 34, new Set()), false);
    assert.equal(isUnlocked(ball, 35, new Set()), true);
  });
});
