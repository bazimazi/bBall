import assert from 'node:assert/strict';
import { it } from 'node:test';
import { AdaptiveCanvasQuality } from '../../src/game/render/quality';

it('transient stalls do not lower density; sustained pressure lowers it to a bounded floor', () => {
  const quality = new AdaptiveCanvasQuality();
  quality.sample(120);
  for (let i = 0; i < 130; i++) quality.sample(16);
  assert.equal(quality.ratio, 1.5);
  for (let i = 0; i < 60; i++) quality.sample(34);
  assert.equal(quality.ratio, 1.25);
  for (let i = 0; i < 300; i++) quality.sample(34);
  assert.equal(quality.ratio, 1);
});

it('recovery needs ten healthy seconds per step and never exceeds the automatic ceiling', () => {
  const quality = new AdaptiveCanvasQuality();
  for (let i = 0; i < 120; i++) quality.sample(34);
  assert.equal(quality.ratio, 1);
  for (let i = 0; i < 600; i++) quality.sample(16);
  assert.equal(quality.ratio, 1);
  for (let i = 0; i < 25; i++) quality.sample(16);
  assert.equal(quality.ratio, 1.25);
  for (let i = 0; i < 3000; i++) quality.sample(16);
  assert.equal(quality.ratio, 2);
});

it('severely overloaded frames still lower density instead of being mistaken for interruptions', () => {
  const quality = new AdaptiveCanvasQuality();
  for (let i = 0; i < 10; i++) quality.sample(400);
  assert.equal(quality.ratio, 1);
});

it('interruptions and explicit reset discard timing history without discarding learned density', () => {
  const quality = new AdaptiveCanvasQuality();
  for (let i = 0; i < 55; i++) quality.sample(34);
  for (const invalid of [1000, NaN, Infinity, 0, -1]) {
    assert.equal(quality.sample(invalid), false);
    assert.equal(quality.ratio, 1.5);
  }
  for (let i = 0; i < 55; i++) quality.sample(34);
  quality.reset();
  for (let i = 0; i < 5; i++) quality.sample(34);
  assert.equal(quality.ratio, 1.5);
});
