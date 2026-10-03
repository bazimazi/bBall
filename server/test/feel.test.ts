import assert from 'node:assert/strict';
import { it } from 'node:test';
import { quickMatchRules, versusRules } from '../../src/core/modes/rules';
import type { GameAudio } from '../../src/game/audio';
import { FIXED_DT, RESUME_DELAY } from '../../src/game/constants';
import { PointerTracker } from '../../src/game/input';
import { pauseMatch, requestServe, resumeMatch, startMatch } from '../../src/game/match';
import { step } from '../../src/game/simulation';
import { createWorld, placePaddles, type World } from '../../src/game/world';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;

function ready(): World {
  const world = createWorld(silent, 1);
  world.view.w = 1000;
  placePaddles(world);
  startMatch(world, quickMatchRules('rookie'));
  return world;
}

function frozenState(world: World): string {
  return JSON.stringify({
    ball: world.ball,
    player: world.player,
    bot: world.bot,
    arena: world.arena,
    fx: world.fx,
    talents: world.talents,
    elapsed: world.match.elapsed,
    particles: world.particles.items,
    replay: world.replay
  });
}

it('pause freezes the entire court, effects and skill timers', () => {
  const world = ready();
  requestServe(world);
  step(world, FIXED_DT);
  world.fx.freeze = 0.05;
  world.fx.flash = 0.4;
  world.player.target = 100;
  world.talents.slots = [{ id: 'power-strike', cooldown: 8, span: 8, lockout: 0.2 }];
  assert.ok(pauseMatch(world));
  const before = frozenState(world);
  for (let i = 0; i < 1200; i++) step(world, FIXED_DT);
  assert.equal(frozenState(world), before);
});

it('resume counts three beats with the rally frozen and can be paused again', () => {
  const world = ready();
  world.match.status = 'play';
  world.fx.timeScale = 0.32;
  pauseMatch(world);
  resumeMatch(world);
  const before = frozenState(world);
  for (let i = 0; i < Math.round(RESUME_DELAY / FIXED_DT) - 1; i++) step(world, FIXED_DT);
  assert.equal(world.match.status, 'resuming');
  assert.equal(frozenState(world), before);
  pauseMatch(world);
  assert.equal(world.match.status, 'paused');
  assert.equal(world.match.resumeTo, 'play');
  resumeMatch(world);
  for (let i = 0; i < Math.round(RESUME_DELAY / FIXED_DT); i++) step(world, FIXED_DT);
  assert.equal(world.match.status, 'play');
  assert.equal(frozenState(world), before);
});

it('instant resume is available and manual serving waits for a deliberate request', () => {
  const world = ready();
  world.autoServe = false;
  pauseMatch(world);
  resumeMatch(world, false);
  assert.equal(world.match.status, 'serve');
  for (let i = 0; i < 240; i++) step(world, FIXED_DT);
  assert.equal(world.match.status, 'serve');
  assert.equal(world.match.serveTimer, 0);
  const elapsed = world.match.elapsed;
  const courtTime = world.arena.time;
  world.player.target = 100;
  world.talents.slots = [{ id: 'power-strike', cooldown: 8, span: 8, lockout: 0.2 }];
  for (let i = 0; i < 1200; i++) step(world, FIXED_DT);
  assert.equal(world.player.y, 100, 'the player can aim while waiting');
  assert.equal(world.match.elapsed, elapsed);
  assert.equal(world.arena.time, courtTime);
  assert.equal(world.talents.slots[0]!.cooldown, 8, 'waiting cannot farm skill recovery');
  requestServe(world);
  step(world, FIXED_DT);
  assert.equal(world.match.status, 'play');
  assert.equal(world.fx.vsTimer, 0, 'the intro never covers a live return');
  assert.equal(world.fx.bannerTimer, 0);
});

it('normal serve timing and both versus paddles still work', () => {
  const world = ready();
  for (let i = 0; i < 240; i++) step(world, FIXED_DT);
  assert.equal(world.match.status, 'play');
  startMatch(world, versusRules());
  world.autoServe = false;
  world.match.serveTimer = 0;
  world.player.target = 100;
  world.bot.target = 500;
  for (let i = 0; i < 120; i++) step(world, FIXED_DT);
  assert.equal(world.player.y, 100);
  assert.equal(world.bot.y, 500);
  assert.equal(world.match.status, 'serve');
});

it('calm mode keeps the attract court still without freezing a live match', () => {
  const world = createWorld(silent, 0.25);
  const before = frozenState(world);
  for (let i = 0; i < 120; i++) step(world, FIXED_DT);
  assert.equal(frozenState(world), before);
  startMatch(world, quickMatchRules('rookie'));
  requestServe(world);
  step(world, FIXED_DT);
  const x = world.ball.x;
  step(world, FIXED_DT);
  assert.notEqual(world.ball.x, x);
});

it('a drag, cancellation or long hold cannot accidentally serve', () => {
  const pointers = new PointerTracker();
  pointers.begin(1, 100, 100, 0, 'you', true);
  pointers.move(1, 100, 130);
  assert.equal(pointers.end(1, 100, 100, 200), false, 'returning to the start is still a drag');
  pointers.begin(1, 100, 100, 0, 'you', true);
  pointers.cancel(1);
  assert.equal(pointers.end(1, 100, 100, 200), false);
  pointers.begin(1, 100, 100, 0, 'you', true);
  assert.equal(pointers.end(1, 100, 100, 900), false);
  pointers.begin(1, 100, 100, 0, 'you', true);
  assert.equal(pointers.end(1, 101, 102, 200), true);
  pointers.begin(1, 100, 100, 0, 'you', false);
  assert.equal(
    pointers.end(1, 100, 100, 200),
    false,
    'a gesture begun in play cannot start the next point'
  );
});

it('each paddle keeps its pointer owner until release, including two-player touch', () => {
  const pointers = new PointerTracker();
  assert.ok(pointers.begin(1, 100, 100, 0, 'you', false));
  assert.equal(pointers.begin(2, 110, 110, 0, 'you', false), false);
  assert.equal(pointers.move(2, 120, 200), undefined);
  assert.ok(pointers.begin(3, 800, 100, 0, 'bot', false));
  assert.equal(pointers.move(1, 900, 200), 'you', 'crossing the midline keeps the original side');
  assert.equal(pointers.move(3, 100, 300), 'bot');
  pointers.clear();
  assert.equal(pointers.move(1, 100, 200), undefined);
  assert.ok(pointers.begin(2, 100, 100, 0, 'you', false));
});
