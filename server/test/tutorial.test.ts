import assert from 'node:assert/strict';
import { it } from 'node:test';
import { quickMatchRules } from '../../src/core/modes/rules';
import type { GameAudio } from '../../src/game/audio';
import { FIXED_DT, FIELD_H } from '../../src/game/constants';
import {
  pauseMatch,
  requestServe,
  resumeMatch,
  scorePoint,
  startMatch
} from '../../src/game/match';
import { step } from '../../src/game/simulation';
import { DEFAULT_LOADOUT } from '../../src/game/talents';
import { advanceTutorial, startTutorial } from '../../src/game/tutorial';
import { createWorld, placePaddles, type World } from '../../src/game/world';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;

function tickUntil(world: World, condition: () => boolean): void {
  for (let i = 0; i < 2400 && !condition(); i++) step(world, FIXED_DT);
  assert.ok(condition(), 'the lesson should make progress without a timeout');
}

function ready(width = 1000): World {
  const world = createWorld(silent, 1);
  world.view.w = width;
  placePaddles(world);
  startTutorial(world);
  return world;
}

function align(world: World): void {
  world.player.target = world.tutorial!.targetY;
  tickUntil(world, () => Math.abs(world.player.y - world.player.target) < 0.01);
}

it('the lesson waits for actual movement and a deliberate launch under either serve setting', () => {
  for (const autoServe of [true, false]) {
    const world = ready();
    world.autoServe = autoServe;
    const x = world.ball.x;
    requestServe(world);
    for (let i = 0; i < 600; i++) step(world, FIXED_DT);
    advanceTutorial(world);
    assert.equal(world.tutorial!.step, 'move');
    assert.equal(world.ball.x, x);
    align(world);
    assert.equal(world.tutorial!.step, 'return');
    for (let i = 0; i < 600; i++) step(world, FIXED_DT);
    assert.equal(world.match.status, 'serve');
    requestServe(world);
    step(world, FIXED_DT);
    assert.equal(world.match.status, 'play');
    assert.ok(world.ball.vx < 0);
  }
});

it('real returns and outer contact complete the lesson on short and long courts', () => {
  for (const width of [900, 1000, 1800]) {
    const world = ready(width);
    world.view.rotated = width === 900;
    align(world);
    align(world);
    requestServe(world);
    tickUntil(world, () => world.tutorial!.cleared);
    assert.equal(world.match.hits, 1);
    assert.ok(world.ball.vx > 0, 'the real contact sent the ball back');
    advanceTutorial(world);
    assert.equal(world.tutorial!.step, 'angle');

    // A centre return is a safe retry, rather than a falsely completed lesson.
    world.player.target = world.ball.y;
    tickUntil(world, () => world.player.y === world.player.target);
    requestServe(world);
    tickUntil(world, () => world.tutorial!.feedback === 'centre');
    assert.equal(world.tutorial!.cleared, false);
    advanceTutorial(world);
    assert.equal(world.tutorial!.step, 'angle');
    tickUntil(world, () => world.tutorial!.flightLeft === 0);

    align(world);
    requestServe(world);
    tickUntil(world, () => world.tutorial!.cleared);
    assert.ok(Math.abs(world.player.hitY / world.player.half) >= 0.45);
    assert.ok(Math.abs(world.ball.vy) > 0, 'placement produced an actual angled return');
    advanceTutorial(world);
    assert.equal(world.tutorial!.step, 'complete');
    assert.equal(world.match.result, null);
    assert.deepEqual(world.match.score, { you: 0, bot: 0 });
  }
});

it('misses reset the same shot with no penalty, replay, finish or result id', () => {
  const world = ready();
  align(world);
  world.player.target = FIELD_H - world.player.half;
  tickUntil(world, () => world.player.y === world.player.target);
  const id = world.match.resultId;
  requestServe(world);
  tickUntil(world, () => world.tutorial!.feedback === 'miss');
  assert.equal(world.match.status, 'serve');
  assert.equal(world.ball.vx, 0);
  assert.equal(world.ball.x, world.view.w * 0.68);
  for (let i = 0; i < 20; i++) scorePoint(world, i % 2 ? 'you' : 'bot');
  assert.deepEqual(world.match.score, { you: 0, bot: 0 });
  assert.equal(world.match.result, null);
  assert.equal(world.match.resultId, id);
  assert.equal(world.replay.pending, 0);
});

it('pausing freezes the incoming lesson shot and leaving restores the ordinary build and rules', () => {
  const world = ready();
  const build = { ...DEFAULT_LOADOUT, paddleSpeed: 1234 };
  world.baseLoadout = build;
  world.autoServe = false;
  align(world);
  requestServe(world);
  step(world, FIXED_DT);
  pauseMatch(world);
  const ball = { ...world.ball };
  const lesson = { ...world.tutorial };
  for (let i = 0; i < 120; i++) step(world, FIXED_DT);
  assert.deepEqual(world.ball, ball);
  assert.deepEqual(world.tutorial, lesson);
  resumeMatch(world, false);
  step(world, FIXED_DT);
  assert.notEqual(world.ball.x, ball.x);
  startMatch(world, quickMatchRules('rookie'));
  assert.equal(world.tutorial, null);
  assert.equal(world.loadout, build);
  assert.equal(world.autoServe, false, 'the lesson does not overwrite the device preference');
  assert.equal(world.rules.ranked, true);
  assert.notEqual(world.tuning.serveSpeed, 270);
});
