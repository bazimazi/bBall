import assert from 'node:assert/strict';
import { it } from 'node:test';
import { SELECTABLE_BOTS } from '../../src/core/bots/levels';
import { practiceRules, quickMatchRules } from '../../src/core/modes/rules';
import { createProfile } from '../../src/core/profile/defaults';
import { applyMatchResult } from '../../src/core/progression/apply';
import { BALANCE } from '../../src/core/balance/config';
import type { GameAudio } from '../../src/game/audio';
import { FIXED_DT, FIELD_H } from '../../src/game/constants';
import { publishResult, startMatch } from '../../src/game/match';
import { step } from '../../src/game/simulation';
import { createWorld, placePaddles, tuningFor } from '../../src/game/world';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;

it('Relaxed Practice has a slower serve, ceiling and growth for all bots, with normal paddle controls', () => {
  for (const bot of SELECTABLE_BOTS) {
    const normal = practiceRules(bot.id);
    const relaxed = practiceRules(bot.id, 'relaxed');
    const a = tuningFor(normal);
    const b = tuningFor(relaxed);
    assert.ok(b.serveSpeed < a.serveSpeed);
    assert.ok(b.maxSpeed < a.maxSpeed);
    assert.ok(b.speedPerHit < a.speedPerHit);
    assert.ok(b.serveSpeed >= BALANCE.ball.hardMin);
    assert.equal(relaxed.modifiers.playerPaddleScale, normal.modifiers.playerPaddleScale);
    assert.equal(relaxed.ranked, false);
    assert.deepEqual(tuningFor(quickMatchRules(bot.id)), a);
  }
});

it('a Relaxed Practice match finishes through real physics without XP or saved progression', () => {
  const world = createWorld(silent, 1);
  world.view.w = 1000;
  placePaddles(world);
  world.replays = false;
  startMatch(world, practiceRules('rookie', 'relaxed'));
  for (let point = 0; point < 5; point++) {
    world.match.status = 'play';
    world.fx.freeze = 0;
    world.player.y = world.player.target = 90;
    Object.assign(world.ball, {
      x: world.player.x + 100,
      y: FIELD_H / 2,
      vx: -world.tuning.serveSpeed,
      vy: 0,
      speed: world.tuning.serveSpeed
    });
    for (let i = 0; i < 500 && world.match.status === 'play'; i++) step(world, FIXED_DT);
    assert.equal(world.match.score.bot, point + 1);
    assert.ok(Number.isFinite(world.ball.x));
  }
  assert.equal(world.match.status, 'over');
  publishResult(world);
  assert.equal(world.match.result?.ranked, false);
  const profile = createProfile();
  const summary = applyMatchResult(profile, world.match.result!);
  assert.equal(summary.profile, profile);
  assert.equal(summary.xpAfter, summary.xpBefore);
  assert.equal(world.loadout, world.baseLoadout);
});
