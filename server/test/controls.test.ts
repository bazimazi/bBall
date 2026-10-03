import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  DEFAULT_BINDINGS,
  assignKey,
  keyAction,
  keyList,
  validateBindings
} from '../../src/core/settings/controls';
import { PointerTracker } from '../../src/game/input';

it('bindings reject conflicts without losing the original action or its alternate', () => {
  const conflict = assignKey(DEFAULT_BINDINGS, 'up', 0, 'q');
  assert.equal(conflict.bindings, null);
  assert.match(conflict.error!, /Skill slot 1/);
  const changed = assignKey(DEFAULT_BINDINGS, 'up', 0, 'I');
  assert.ok(changed.bindings);
  assert.equal(keyAction(changed.bindings, 'i'), 'up');
  assert.equal(keyAction(changed.bindings, 'w'), undefined);
  assert.equal(keyAction(changed.bindings, 'q'), 'skill1');
  assert.equal(keyList(changed.bindings, 'serve'), 'Space / Enter');
  assert.deepEqual(DEFAULT_BINDINGS.up, ['w']);
});

it('corrupt, duplicate or reserved bindings fall back to a complete working map', () => {
  for (const value of [
    null,
    {},
    [],
    { ...DEFAULT_BINDINGS, serve: [] },
    { ...DEFAULT_BINDINGS, up: ['escape'] },
    { ...DEFAULT_BINDINGS, up: ['tab'] },
    { ...DEFAULT_BINDINGS, up: ['s'] },
    { ...DEFAULT_BINDINGS, up: ['i', 'i'] },
    { ...DEFAULT_BINDINGS, up: ['i', 't', 'y'] }
  ])
    assert.equal(validateBindings(value), DEFAULT_BINDINGS);
  const restored = validateBindings({ ...DEFAULT_BINDINGS, up: ['I'] });
  assert.deepEqual(restored.up, ['i']);
  assert.equal(assignKey(DEFAULT_BINDINGS, 'up', 0, 'Escape').bindings, null);
});

it('relative drag anchors safely, scales distance, and stops after cancellation', () => {
  const pointer = new PointerTracker();
  pointer.begin(1, 100, 100, 0, 'you', true);
  assert.equal(pointer.dragTarget(1, 100, 300, 1.5), 300);
  assert.equal(pointer.dragTarget(1, 120, 300, 1.5), 330);
  assert.equal(pointer.dragTarget(1, 110, 330, 1.5), 315);
  pointer.cancel(1);
  assert.equal(pointer.dragTarget(1, 140, 315, 1.5), 315);
});
