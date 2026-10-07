import assert from 'node:assert/strict';
import { it } from 'node:test';
import { ARENA_PRESETS, arenaPreset, presetsOn } from '../../src/core/modes/arenas';
import { quickMatchRules } from '../../src/core/modes/rules';
import { createRun, encounterFor } from '../../src/core/run/run';
import { arenaForce, bend, rescaleArena, updateArena, wellPolarity } from '../../src/game/arena';
import type { GameAudio } from '../../src/game/audio';
import { startMatch } from '../../src/game/match';
import { createWorld } from '../../src/game/world';

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;

function court(id: string) {
  const world = createWorld(silent, 0);
  world.view.w = 1000;
  const base = quickMatchRules('pro');
  startMatch(world, { ...base, modifiers: { ...base.modifiers, arena: arenaPreset(id)!.arena } });
  world.match.status = 'play';
  return world;
}

it('opposing wind lanes blend at midfield and reverse together', () => {
  const world = court('jetstream');
  const force = { x: 0, y: 0 };
  const left = arenaForce(world, 250, 300, force).y;
  assert.equal(arenaForce(world, 750, 300, force).y, -left);
  assert.equal(arenaForce(world, 500, 300, force).y, 0);
  updateArena(world, 6);
  assert.equal(arenaForce(world, 250, 300, force).y, -left);
});

it('the breathing well smoothly changes from attraction to repulsion', () => {
  const world = court('heartbeat');
  const force = { x: 0, y: 0 };
  const pull = arenaForce(world, 650, 300, force).x;
  assert.ok(pull < 0);
  world.arena.time = 2;
  assert.ok(Math.abs(wellPolarity(world)) < 1e-10);
  world.arena.time = 4;
  assert.equal(arenaForce(world, 650, 300, force).x, -pull);
});

it('sliding posts stay on their rails across time, resize, and paused play', () => {
  const world = court('switchback');
  updateArena(world, 1.5);
  const [a, b] = world.arena.bumpers;
  assert.ok(a && b);
  assert.ok(Math.abs(a.y - 465) < 1e-8);
  assert.ok(Math.abs(b.y - 135) < 1e-8);
  world.view.w = 750;
  rescaleArena(world);
  assert.equal(a.x, 315);
  assert.ok(Math.abs(a.y - 465) < 1e-8);
  world.match.status = 'over';
  updateArena(world, 1);
  assert.equal(world.arena.time, 1.5);
});

it('mixed forces preserve pace and forward progress at every polarity', () => {
  for (const id of ['jetstream', 'heartbeat', 'storm-gates', 'rift-tide', 'storm-forge']) {
    const world = court(id);
    world.arena.intensity = 2;
    for (const dir of [-1, 1]) {
      const velocity = { x: dir * 900, y: 0 };
      for (let i = 0; i < 1200; i++) {
        world.arena.time = i / 120;
        bend(world, 550, 200, velocity, 900, 1 / 120);
        assert.ok(Math.abs(Math.hypot(velocity.x, velocity.y) - 900) < 1e-8);
        assert.equal(Math.sign(velocity.x), dir);
        assert.ok(Math.abs(velocity.x) >= 900 * Math.cos(1.12) - 1e-8);
      }
    }
  }
});

it('new courts leave past daily pools and in-progress run encounters intact', () => {
  assert.equal(presetsOn('2026-10-03').length, 8);
  assert.equal(presetsOn('2026-10-04').length, 14);
  assert.equal(presetsOn('2026-10-08').length, ARENA_PRESETS.length);
  const old = createRun('old-run', 3, Date.parse('2026-10-03T12:00:00Z'));
  const oldNames = new Set(presetsOn('2026-10-03').map((p) => p.name));
  for (const stage of [0, 1, 3, 4, 6, 7]) {
    const encounter = encounterFor(old, stage);
    assert.ok(oldNames.has(encounter.courtName!));
    assert.deepEqual(encounterFor(old, stage), encounter);
  }
});
