import assert from 'node:assert/strict';
import { it } from 'node:test';
import { BALANCE } from '../../src/core/balance/config';
import type { GameAudio } from '../../src/game/audio';
import { BALL_R, FIXED_DT, PADDLE_W } from '../../src/game/constants';
import { stepBall } from '../../src/game/physics';
import { createWorld, placePaddles, type World } from '../../src/game/world';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;

function hit(world: World, side: 'you' | 'bot'): void {
  const paddle = side === 'you' ? world.player : world.bot;
  const dir = side === 'you' ? 1 : -1;
  world.ball.x = paddle.x + dir * (PADDLE_W / 2 + BALL_R + 1);
  world.ball.y = paddle.y;
  world.ball.vx = -dir * world.ball.speed;
  world.ball.vy = 0;
  const rally = world.match.rally;
  stepBall(world, FIXED_DT);
  assert.equal(world.match.rally, rally + 1);
  assert.ok(Math.abs(Math.hypot(world.ball.vx, world.ball.vy) - world.ball.speed) < 1e-6);
}

it('repeated boosted returns at the speed ceiling preserve normal rally pace', () => {
  const world = createWorld(silent, 0);
  world.view.w = 1000;
  placePaddles(world);
  world.match.status = 'play';
  world.ball.speed = world.tuning.maxSpeed;
  world.loadout = {
    ...world.loadout,
    effects: { ...world.loadout.effects, critChance: 1, critGrowth: 0.4 }
  };
  for (let i = 0; i < 40; i++) {
    hit(world, 'you');
    assert.ok(world.ball.speed > world.tuning.maxSpeed);
    hit(world, 'bot');
    assert.equal(world.ball.speed, world.tuning.maxSpeed);
    assert.equal(world.talents.surge, 0);
  }
});

it('below the ceiling, opponents still bleed only the boosted share of pace', () => {
  const world = createWorld(silent, 0);
  world.view.w = 1000;
  placePaddles(world);
  world.match.status = 'play';
  world.ball.speed = 600;
  world.talents.surge = 100;
  const plain = 500 * world.tuning.speedPerHit;
  const bonus = 100 * world.tuning.speedPerHit;
  hit(world, 'bot');
  assert.ok(Math.abs(world.ball.speed - (plain + bonus * (1 - BALANCE.ball.surgeBleed))) < 1e-6);
});

it('a parry plays its distinctive confirmation instead of the generic charged impact', () => {
  let parries = 0;
  let impacts = 0;
  const audio = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'guardHit' ? () => parries++ : key === 'impact' ? () => impacts++ : () => 0
    }
  ) as unknown as GameAudio;
  const world = createWorld(audio, 0);
  world.view.w = 1000;
  placePaddles(world);
  world.match.status = 'play';
  world.talents.guardWindow = 0.25;
  hit(world, 'you');
  assert.equal(parries, 1);
  assert.equal(impacts, 0);
});
