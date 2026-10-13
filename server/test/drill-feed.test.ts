import assert from 'node:assert/strict';
import { it } from 'node:test';
import { techniqueRules } from '../../src/core/modes/drills';
import { practiceRules } from '../../src/core/modes/rules';
import { courseSegments } from '../../src/game/course';
import { launchBall, scorePoint, startMatch } from '../../src/game/match';
import { step } from '../../src/game/simulation';
import { createWorld } from '../../src/game/world';
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
