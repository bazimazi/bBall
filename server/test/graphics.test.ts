import assert from 'node:assert/strict';
import { it } from 'node:test';
import { quickMatchRules } from '../../src/core/modes/rules';
import type { GraphicsIntensity } from '../../src/core/settings/store';
import type { GameAudio } from '../../src/game/audio';
import { ultimateCast } from '../../src/game/casts';
import { launchBall, startMatch } from '../../src/game/match';
import { drawCasts } from '../../src/game/render/abilityFx';
import { applyGraphicsIntensity } from '../../src/game/render/graphics';
import { step } from '../../src/game/simulation';
import { createWorld } from '../../src/game/world';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;
const spark = { speed: 120, life: 1, size: 2, color: '#fff' };

it('graphics budgets reduce emitted particles and confetti and cap bursts immediately', () => {
  const world = createWorld(silent, 1);
  for (const [level, count, confetti, limit] of [
    ['high', 100, 50, 320],
    ['balanced', 50, 20, 160],
    ['low', 20, 0, 64]
  ] as const) {
    world.particles.clear();
    world.confetti.clear();
    applyGraphicsIntensity(world, level);
    world.particles.emit(0, 0, 100, spark);
    assert.equal(world.particles.items.filter((p) => p.alive).length, count);
    world.confetti.burst(0, 0, 50, [120]);
    assert.equal(world.confetti.items.filter((p) => p.alive).length, confetti);
    world.particles.emit(0, 0, 2000, spark);
    assert.equal(world.particles.items.filter((p) => p.alive).length, limit);
  }
  applyGraphicsIntensity(world, 'high');
  world.particles.emit(0, 0, 2000, spark);
  world.confetti.burst(0, 0, 50, [120]);
  applyGraphicsIntensity(world, 'low');
  assert.equal(world.particles.items.filter((p) => p.alive).length, 64);
  assert.equal(world.confetti.active, false);
  assert.equal(world.motion, 1);
  assert.equal(world.camera, 1);
});

it('smaller budgets stop floor simulation and simplify casts while preserving ultimate labels and timing', () => {
  const world = createWorld(silent, 1);
  world.grid.resize(world.view.w);
  world.grid.impulse(100, 100, 100);
  assert.equal(world.grid.active, true);
  applyGraphicsIntensity(world, 'balanced');
  world.grid.impulse(100, 100, 100);
  assert.equal(world.grid.active, false);
  let fullStrokes = 0;
  for (const level of ['high', 'balanced', 'low'] as const) {
    applyGraphicsIntensity(world, level);
    world.casts.clear();
    ultimateCast(world, 'overload', 0, 'Overload');
    assert.equal(world.fx.castLabel, 'Overload');
    assert.equal(world.fx.freeze, 0.07);
    assert.equal(world.fx.timeScale, 0.45);
    for (const cast of world.casts.items) if (cast.alive) cast.age = 0.1;
    let strokes = 0;
    const ctx = new Proxy(
      {},
      {
        get: (_, key) => {
          if (key === 'stroke') return () => strokes++;
          if (key === 'createRadialGradient' || key === 'createLinearGradient')
            return () => ({ addColorStop() {} });
          return () => {};
        }
      }
    ) as CanvasRenderingContext2D;
    drawCasts(ctx, world);
    if (level === 'high') {
      fullStrokes = strokes;
      applyGraphicsIntensity(world, 'balanced');
      strokes = 0;
      drawCasts(ctx, world);
      assert.ok(strokes < fullStrokes, 'a live High shockwave is hidden immediately on downgrade');
    }
    if (level === 'low') {
      assert.equal(strokes, 1, 'one small hue-coded ring replaces layered cast geometry');
      assert.ok(strokes < fullStrokes);
    }
  }
});

it('all intensity levels produce identical seeded gameplay, including ultimate hit-stop', () => {
  function run(level: GraphicsIntensity) {
    const world = createWorld(silent, 1);
    applyGraphicsIntensity(world, level);
    startMatch(world, { ...quickMatchRules('rookie'), seed: 'graphics-budget-regression' });
    launchBall(world);
    ultimateCast(world, 'overload', 0, 'Overload');
    for (let i = 0; i < 600; i++) step(world, 1 / 120);
    return {
      ball: world.ball,
      player: world.player,
      bot: world.bot,
      match: world.match,
      talents: world.talents,
      botTalents: world.botTalents
    };
  }
  const high = run('high');
  assert.deepEqual(run('balanced'), high);
  assert.deepEqual(run('low'), high);
});
