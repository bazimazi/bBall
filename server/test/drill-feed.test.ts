import assert from 'node:assert/strict';
import { it } from 'node:test';
import { techniqueRules } from '../../src/core/modes/drills';
import { practiceRules } from '../../src/core/modes/rules';
import { courseSegments } from '../../src/game/course';
import { launchBall, scorePoint, startMatch } from '../../src/game/match';
import { step } from '../../src/game/simulation';
import { createWorld } from '../../src/game/world';
import { BALL_R, FIELD_H, FIXED_DT } from '../../src/game/constants';
import { stepBall } from '../../src/game/physics';
import { techniqueGoalX, techniqueOutcome } from '../../src/game/technique';
import type { GameAudio } from '../../src/game/audio';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;

it('the gate shown during drill preparation is the gate the identical feed launches into', () => {
  const world = createWorld(silent, 1);
  world.autoServe = false;
  startMatch(world, techniqueRules('gate'));
  const opening = courseSegments(world.arena.spec, world.view.w, 0, world.arena.course);
  for (let i = 0; i < 30; i++) step(world, 0.1);
  assert.equal(world.match.status, 'serve');
  assert.equal(world.arena.time, 0);
  assert.ok(world.match.elapsed > 0, 'serve preparation still counts normal match time');
  assert.deepEqual(
    courseSegments(world.arena.spec, world.view.w, world.arena.time, world.arena.course),
    opening
  );
  assert.equal(world.ball.px, world.ball.x, 'the feed preview must not interpolate from mid-court');
  assert.equal(world.ball.owner, 'bot', 'the fixed incoming feed also previews its real owner');
  launchBall(world);
  assert.deepEqual(
    courseSegments(world.arena.spec, world.view.w, world.arena.time, world.arena.course),
    opening
  );
  step(world, 0.1);
  assert.ok(world.arena.time > 0, 'the moving opening runs as soon as the feed is live');
  world.arena.course.events.you.gates = 2;
  scorePoint(world, 'bot');
  assert.equal(world.arena.time, 0);
  assert.equal(world.arena.course.events.you.gates, 0, 'preparation starts a fresh attempt');
});

it('ordinary Practice hazards keep moving through the serve countdown', () => {
  const world = createWorld(silent, 1);
  world.autoServe = false;
  const rules = practiceRules('rookie');
  startMatch(world, {
    ...rules,
    modifiers: { ...rules.modifiers, arena: techniqueRules('gate').modifiers.arena }
  });
  step(world, 0.1);
  assert.equal(world.arena.time, 0.1);
});

it('every solo drill feeds from the actual court centre on first serve and retry', () => {
  for (const width of [750, 1290])
    for (const id of ['bank', 'gate', 'placement'] as const) {
      const world = createWorld(silent, 1);
      world.view.w = width;
      startMatch(world, techniqueRules(id));
      for (let attempt = 0; attempt < 2; attempt++) {
        assert.equal(world.ball.x, width / 2);
        assert.equal(world.ball.y, FIELD_H / 2);
        assert.equal(world.ball.px, world.ball.x);
        launchBall(world);
        assert.equal(world.ball.x, width / 2);
        assert.ok(world.ball.vx < 0, 'the centred feed comes to the player');
        scorePoint(world, 'bot');
      }
    }
});

it('a returned ball stays live through the old mid-court target and passes the absent bot', () => {
  const world = createWorld(silent, 1);
  startMatch(world, techniqueRules('placement'));
  launchBall(world);
  Object.assign(world.ball, {
    x: world.view.w * 0.8,
    y: FIELD_H / 2,
    vx: 400,
    vy: 0,
    owner: 'you'
  });
  assert.equal(techniqueOutcome(world), null, '80% of the board is not a goal');
  step(world, FIXED_DT);
  assert.equal(world.match.points, 0);
  assert.equal(world.match.status, 'play');
  world.ball.x = world.bot.x - 25;
  world.ball.y = world.bot.y;
  stepBall(world, 0.05);
  assert.ok(world.ball.vx > 0, 'a solo drill cannot be intercepted by an invisible opponent');
  assert.equal(world.match.points, 0);
});

it('drill target bands are judged at the exact far boundary, without fixed-step overshoot', () => {
  for (const width of [750, 1290]) {
    const world = createWorld(silent, 1);
    world.view.w = width;
    startMatch(world, techniqueRules('placement'));
    launchBall(world);
    const goalX = techniqueGoalX(width);
    const topTarget = FIELD_H * 0.38;
    Object.assign(world.ball, { x: goalX - 2, y: topTarget - 2, vx: 400, vy: 400, owner: 'you' });
    stepBall(world, 0.02);
    assert.equal(world.ball.x, width - BALL_R, 'ball touches the real court end');
    assert.ok(Math.abs(world.ball.y - topTarget) < 1e-9);
    assert.equal(techniqueOutcome(world), true, 'the crossing hits the edge of the band');
    step(world, FIXED_DT);
    assert.equal(world.match.score.you, 1);
  }
});

it('a missed far target flashes the far endpoint instead of the player goal', () => {
  const world = createWorld(silent, 1);
  startMatch(world, techniqueRules('placement'));
  launchBall(world);
  Object.assign(world.ball, { x: techniqueGoalX(world.view.w), y: FIELD_H / 2, owner: 'you' });
  assert.equal(techniqueOutcome(world), false);
  scorePoint(world, 'bot');
  assert.equal(world.fx.goalSide, 'bot');
  assert.equal(world.match.score.bot, 1);
  assert.equal(world.ball.x, world.view.w / 2, 'the next attempt resets to centre');
});
