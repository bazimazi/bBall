import assert from 'node:assert/strict';
import { it, type TestContext } from 'node:test';
import { heatHue } from '../../src/game/palette';
import { GlowCache } from '../../src/game/render/glow';
import {
  createView,
  layoutView,
  screenToFieldX,
  screenToFieldY,
  toScreenX,
  toScreenY
} from '../../src/game/view';

function replaceGlobals(t: TestContext, replacements: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(replacements)) {
    const saved = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => {
      if (saved) Object.defineProperty(globalThis, key, saved);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
}

/** Counts sprite creation; no pixels, browser timing or GPU work are simulated. */
function sprites(t: TestContext) {
  let creations = 0;
  const context = {
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    beginPath() {},
    moveTo() {},
    arcTo() {},
    closePath() {},
    fill() {}
  };
  replaceGlobals(t, {
    document: {
      createElement: () => {
        creations++;
        return { getContext: () => context };
      }
    }
  });
  return { cache: new GlowCache(), creations: () => creations };
}

it('quality caps backing pixels without changing court geometry or CSS input coordinates', (t) => {
  const window = { innerWidth: 1200, innerHeight: 800, devicePixelRatio: 3 };
  replaceGlobals(t, {
    window,
    document: { documentElement: {} },
    getComputedStyle: () => ({ getPropertyValue: () => '0' })
  });
  const canvas = { width: 0, height: 0, style: {} } as HTMLCanvasElement;
  for (const portrait of [false, true]) {
    window.innerWidth = portrait ? 800 : 1200;
    window.innerHeight = portrait ? 1200 : 800;
    const high = createView();
    layoutView(high, canvas, 'high');
    assert.equal(canvas.width * canvas.height, 6_000_000);
    const geometry = { ...high, dpr: 1 };
    for (const [quality, dpr, pixels] of [
      ['balanced', 1.5, 2_160_000],
      ['low', 1, 960_000]
    ] as const) {
      const view = createView();
      layoutView(view, canvas, quality);
      assert.equal(view.dpr, dpr);
      assert.equal(canvas.width * canvas.height, pixels);
      assert.deepEqual({ ...view, dpr: 1 }, geometry);
      assert.equal(canvas.style.width, `${window.innerWidth}px`);
      assert.equal(canvas.style.height, `${window.innerHeight}px`);
      for (const [x, y] of [
        [0, 0],
        [view.w / 3, 217],
        [view.w, view.h]
      ]) {
        const sx = toScreenX(view, x!, y!);
        const sy = toScreenY(view, x!, y!);
        assert.equal(sx, toScreenX(high, x!, y!));
        assert.equal(sy, toScreenY(high, x!, y!));
        assert.ok(Math.abs(screenToFieldX(view, sx, sy) - x!) < 1e-8);
        assert.ok(Math.abs(screenToFieldY(view, sx, sy) - y!) < 1e-8);
      }
    }
  }
});

it('quality preserves fractional device density and avoids resetting an unchanged canvas', (t) => {
  const window = { innerWidth: 401, innerHeight: 801, devicePixelRatio: 1.25 };
  replaceGlobals(t, {
    window,
    document: { documentElement: {} },
    getComputedStyle: () => ({ getPropertyValue: () => '0' })
  });
  let width = 0,
    height = 0,
    resets = 0;
  const canvas = {
    get width() {
      return width;
    },
    set width(value: number) {
      width = value;
      resets++;
    },
    get height() {
      return height;
    },
    set height(value: number) {
      height = value;
      resets++;
    },
    style: {}
  } as HTMLCanvasElement;
  const view = createView();
  layoutView(view, canvas, 'high');
  assert.equal(view.dpr, 1.25);
  assert.equal(width, 501);
  assert.equal(height, 1001);
  assert.equal(resets, 2);
  layoutView(view, canvas, 'balanced');
  assert.equal(view.dpr, 1.25);
  assert.equal(resets, 2, 'same backing dimensions must preserve the drawing context');
  for (const ratio of [0, 0.75, 1, 2, 3]) {
    window.devicePixelRatio = ratio;
    for (const [quality, cap] of [
      ['high', 2.5],
      ['balanced', 1.5],
      ['low', 1]
    ] as const) {
      layoutView(view, canvas, quality);
      assert.equal(view.dpr, Math.min(cap, Math.max(1, ratio)));
    }
  }
});

it('glows reuse circular hue buckets while keeping light, saturation and sprite kinds distinct', (t) => {
  const { cache, creations } = sprites(t);
  const dot = cache.dot(0);
  for (const hue of [360, -360, 720, -720, 359, -1, 1]) assert.equal(cache.dot(hue), dot);
  const bar = cache.bar(0);
  for (const hue of [360, -360, 359]) assert.equal(cache.bar(hue), bar);
  assert.equal(creations(), 2);
  assert.notEqual(dot, bar);
  assert.notEqual(cache.dot(0, 60), dot);
  assert.notEqual(cache.dot(0, 62, 80), dot);
  assert.notEqual(cache.bar(0, 58), bar);
  assert.notEqual(cache.dot(4), dot);
  cache.clear();
  assert.notEqual(cache.dot(0), dot);
  assert.notEqual(cache.bar(0), bar);
});

it('each glow cache caps at 96 sprites and evicts only the least recently used entry', (t) => {
  const { cache, creations } = sprites(t);
  for (const kind of ['dot', 'bar'] as const) {
    const sample = (i: number) => cache[kind]((i % 90) * 4, i < 90 ? 60 : 62);
    const stored = Array.from({ length: 96 }, (_, i) => sample(i));
    assert.equal(sample(0), stored[0], 'a cache hit refreshes recency');
    const before = creations();
    sample(96);
    assert.equal(creations(), before + 1);
    assert.equal(sample(0), stored[0]);
    assert.equal(sample(2), stored[2], 'overflow must not clear the entire cache');
    assert.notEqual(sample(1), stored[1], 'the oldest unused entry was evicted');
  }
});

it('a long warming comet rally keeps frequently drawn paddle and ambient glows cached', (t) => {
  const { cache, creations } = sprites(t);
  const paddle = cache.dot(172, 62);
  const ambient = cache.dot(280, 62, 80);
  for (let frame = 0; frame < 600; frame++) {
    assert.equal(cache.dot(172, 62), paddle);
    cache.dot(344, 62);
    const hue = heatHue(frame % 2 ? 342 : 171, frame / 599);
    cache.dot(hue, 62);
    cache.dot(hue, 64);
    for (const hue of [280, 296, 312, 328, 340]) cache.dot(hue, 62, 80);
    assert.equal(cache.dot(280, 62, 80), ambient);
  }
  // Fixed call workload, not a real-time simulation or an FPS benchmark.
  // Whole-cache eviction previously constructed 112 sprites for this workload.
  assert.equal(creations(), 101);
});
