import assert from 'node:assert/strict';
import { it } from 'node:test';
import { BALANCE } from '../../src/core/balance/config';
import type { GameAudio } from '../../src/game/audio';
import { BALL_R, FIXED_DT, PADDLE_W } from '../../src/game/constants';
import { movePaddle, stepBall } from '../../src/game/physics';
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

it('a wall and paddle contact in one step are resolved in the order they happen', () => {
  const contacts: string[] = [];
  const audio = new Proxy(
    {},
    {
      get: (_target, key) => () => {
        if (key === 'wall' || key === 'hit') contacts.push(String(key));
      }
    }
  ) as unknown as GameAudio;
  const world = createWorld(audio, 0);
  world.view.w = 1000;
  placePaddles(world);
  world.match.status = 'play';
  world.player.y = world.player.half;
  world.ball.x = world.player.x + PADDLE_W / 2 + BALL_R + 1;
  world.ball.y = BALL_R + 1;
  world.ball.vx = -1000;
  world.ball.vy = -500;
  world.ball.speed = Math.hypot(1000, 500);
  stepBall(world, FIXED_DT);
  assert.equal(world.match.rally, 1);
  assert.deepEqual(contacts, ['hit', 'wall']);
  assert.ok(world.ball.vy > 0, 'the outgoing ball must bounce off the wall');
  assert.ok(world.ball.y > BALL_R, 'remaining flight continues after the wall bounce');
});

it('a wall bounce does not invent a paddle hit from a straight chord through the bounce', () => {
  const world = createWorld(silent, 0);
  world.view.w = 1000;
  placePaddles(world);
  world.match.status = 'play';
  world.player.y = 72.3;
  world.ball.x = world.player.x + PADDLE_W / 2 + BALL_R + 4;
  world.ball.y = 14;
  world.ball.vx = -1200;
  world.ball.vy = -900;
  world.ball.speed = 1500;
  stepBall(world, FIXED_DT);
  assert.equal(world.match.rally, 0, 'the true contact height is 11, outside paddle reach');
});

it('return placement uses the moving paddle centre at contact time', () => {
  const world = createWorld(silent, 0);
  world.view.w = 1000;
  placePaddles(world);
  world.match.status = 'play';
  world.ball.speed = 600;
  world.ball.x = world.player.x + PADDLE_W / 2 + BALL_R + 1;
  world.ball.y = world.player.y;
  world.ball.vx = -600;
  world.ball.vy = 0;
  world.player.target = world.player.y + 100;
  movePaddle(world.player, FIXED_DT, 960);
  const atContact = 300 + 960 / 600;
  const raw = (300 - atContact) / world.player.half;
  const speed = 600 * world.tuning.speedPerHit;
  const vy = Math.sin(raw * 0.92) * speed + 960 * 0.26;
  const expected = Math.atan2(vy, Math.cos(raw * 0.92) * speed);
  stepBall(world, FIXED_DT);
  assert.equal(world.match.rally, 1);
  assert.ok(Math.abs(Math.atan2(world.ball.vy, world.ball.vx) - expected) < 1e-6);
});

it('a slowed incoming ball gives its outgoing return the full remaining clock time', () => {
  const world = createWorld(silent, 0);
  world.view.w = 1000;
  placePaddles(world);
  world.match.status = 'play';
  world.loadout = { ...world.loadout, effects: { ...world.loadout.effects, clutchSlow: 0.2 } };
  world.match.score.bot = world.match.winScore - 1;
  const face = world.player.x + PADDLE_W / 2 + BALL_R;
  world.ball.x = face + 1;
  world.ball.y = world.player.y;
  world.ball.speed = 600;
  world.ball.vx = -600;
  world.ball.vy = 0;
  stepBall(world, FIXED_DT);
  assert.equal(world.match.rally, 1);
  assert.ok(Math.abs(world.ball.speed - 600 * world.tuning.speedPerHit) < 1e-6);
  const remaining = FIXED_DT - 1 / (600 * 0.8);
  assert.ok(Math.abs(world.ball.x - (face + world.ball.speed * remaining)) < 1e-6);
});
