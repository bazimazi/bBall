import assert from 'node:assert/strict';
import { it, type TestContext } from 'node:test';
import { quickMatchRules, versusRules } from '../../src/core/modes/rules';
import { DEFAULT_BINDINGS } from '../../src/core/settings/controls';
import { DEFAULT_SETTINGS, type DeviceSettings } from '../../src/core/settings/store';
import { GameEngine } from '../../src/game/engine';
import type { World } from '../../src/game/world';
import { toScreenX, toScreenY } from '../../src/game/view';
import { abilityViews } from '../../src/game/abilities';

class TestElement extends EventTarget {
  tagName = 'CANVAS';
  isContentEditable = false;
}
class TestButton extends TestElement {}
class TestCanvas extends TestElement {
  width = 0;
  height = 0;
  style = {};
  getContext() {
    return {};
  }
  setPointerCapture() {}
}
class TestMedia extends EventTarget {
  matches = false;
}
class TestWindow extends EventTarget {
  innerWidth = 1000;
  innerHeight = 600;
  devicePixelRatio = 1;
  motion = new TestMedia();
  mediaQueries: string[] = [];
  matchMedia(query: string) {
    this.mediaQueries.push(query);
    return query.includes('reduced-motion') ? this.motion : new TestMedia();
  }
}

/** Run the real engine listeners without rendering or synthesising audio. */
function harness(
  t: TestContext,
  systemReducedMotion = false,
  preferences?: DeviceSettings,
  pixelRatio = 1
) {
  let nextFrame: FrameRequestCallback | null = null;
  const win = new TestWindow();
  win.devicePixelRatio = pixelRatio;
  win.motion.matches = systemReducedMotion;
  const doc = Object.assign(new EventTarget(), {
    documentElement: {},
    activeElement: null as TestElement | null,
    hidden: false
  });
  const replacements: Record<string, unknown> = {
    window: win,
    document: doc,
    HTMLElement: TestElement,
    Element: TestElement,
    HTMLButtonElement: TestButton,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      nextFrame = callback;
      return 1;
    },
    cancelAnimationFrame: () => {},
    getComputedStyle: () => ({ getPropertyValue: () => '0' })
  };
  const saved = Object.fromEntries(
    Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  for (const [key, value] of Object.entries(replacements)) {
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }
  const canvas = new TestCanvas();
  const engine = new GameEngine(canvas as unknown as HTMLCanvasElement);
  (engine as unknown as { renderer: { render: () => void } }).renderer.render = () => {};
  if (preferences) engine.setPreferences(preferences);
  engine.start();
  t.after(() => {
    engine.stop();
    for (const key of Object.keys(replacements)) {
      const original = saved[key];
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const world = (engine as unknown as { world: World }).world;
  const key = (name: string, modifier = false) => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), {
      key: name,
      ctrlKey: modifier
    });
    win.dispatchEvent(event);
    return event;
  };
  const pointer = (type: string, id: number, x: number, y: number, pointerType = 'touch') => {
    canvas.dispatchEvent(
      Object.assign(new Event(type), {
        pointerId: id,
        clientX: x,
        clientY: y,
        button: 0,
        pointerType
      })
    );
  };
  const advance = (milliseconds: number) => {
    const now = (engine as unknown as { lastTime: number }).lastTime + milliseconds;
    assert.ok(nextFrame);
    nextFrame(now);
  };
  return { engine, world, win, doc, canvas, key, pointer, advance };
}

const CUSTOM_KEYS = {
  ...DEFAULT_BINDINGS,
  up: ['i', 't'],
  down: ['k'],
  p2Up: ['a'],
  p2Down: ['d'],
  serve: ['b'],
  pause: ['o'],
  mute: ['n'],
  skill1: ['h']
};

it('remapped movement supports simultaneous alternates and releases by physical key', (t) => {
  const { engine, world, win, key, advance } = harness(t);
  engine.setPreferences({ ...DEFAULT_SETTINGS, autoServe: false, keyBindings: CUSTOM_KEYS });
  engine.play(quickMatchRules('rookie'));
  assert.equal(key('w').defaultPrevented, false);
  assert.equal(key('i', true).defaultPrevented, false);
  key('i');
  key('t');
  advance(30);
  const first = world.player.target;
  win.dispatchEvent(Object.assign(new Event('keyup'), { key: 'i' }));
  advance(30);
  assert.ok(world.player.target < first, 'the second held alternate continues moving');
  win.dispatchEvent(Object.assign(new Event('keyup'), { key: 't' }));
  const stopped = world.player.target;
  advance(30);
  assert.equal(world.player.target, stopped);

  engine.setPreferences({
    ...DEFAULT_SETTINGS,
    autoServe: false,
    keyBindings: { ...DEFAULT_BINDINGS, up: ['+'] }
  });
  win.dispatchEvent(Object.assign(new Event('keydown'), { key: '+', code: 'Equal' }));
  advance(30);
  win.dispatchEvent(Object.assign(new Event('keyup'), { key: '=', code: 'Equal' }));
  const released = world.player.target;
  advance(30);
  assert.equal(
    world.player.target,
    released,
    'releasing Shift before the key cannot stick movement'
  );
});

it('remapped serve, pause, mute and skill actions fire; replaced keys no longer fire', (t) => {
  const { engine, world, key, advance } = harness(t);
  engine.setPreferences({ ...DEFAULT_SETTINGS, autoServe: false, keyBindings: CUSTOM_KEYS });
  engine.play(quickMatchRules('rookie'));
  world.match.serveTimer = 0;
  key(' ');
  advance(16);
  assert.equal(world.match.status, 'serve');
  key('b');
  advance(16);
  assert.equal(world.match.status, 'play');
  const slots: number[] = [];
  engine.useAbility = (slot) => {
    slots.push(slot);
  };
  key('1');
  key('h');
  assert.deepEqual(slots, [0]);
  const muted = engine.getSnapshot().muted;
  key('n');
  assert.equal(engine.getSnapshot().muted, !muted);
  key('p');
  assert.equal(world.match.status, 'play');
  key('o');
  assert.equal(world.match.status, 'paused');
  key('o');
  assert.equal(world.match.status, 'resuming');
  key('Escape');
  assert.equal(world.match.status, 'paused');
});

it('custom keys steer each versus paddle independently and skill views retain empty-slot positions', (t) => {
  const { engine, world, key, advance } = harness(t);
  engine.setPreferences({ ...DEFAULT_SETTINGS, autoServe: false, keyBindings: CUSTOM_KEYS });
  engine.play(versusRules());
  assert.equal(engine.getSnapshot().objective, 'P1: I / T / K · P2: A / D');
  key('i');
  key('d');
  advance(30);
  assert.ok(world.player.target < 300);
  assert.ok(world.bot.target > 300);
  world.talents.slots = [{ id: 'power-strike', cooldown: 0, span: 0, lockout: 0 }];
  advance(16);
  assert.equal(engine.getSnapshot().abilities[0]!.slot, 0);
  world.talents.slots = [
    { id: null, cooldown: 0, span: 0, lockout: 0 },
    { id: 'power-strike', cooldown: 0, span: 0, lockout: 0 }
  ];
  assert.equal(abilityViews(world)[0]!.slot, 1);
  advance(16);
  assert.equal(engine.getSnapshot().abilities[0]!.slot, 1);
});

it('relative versus drags retain separate owners after crossing the midline', (t) => {
  const { engine, world, pointer } = harness(t);
  engine.setPreferences({ ...DEFAULT_SETTINGS, autoServe: false, touchMode: 'relative' });
  engine.play(versusRules());
  const point = (type: string, id: number, x: number, y: number) =>
    pointer(type, id, toScreenX(world.view, x, y), toScreenY(world.view, x, y));
  point('pointerdown', 1, world.view.w * 0.2, 100);
  point('pointerdown', 2, world.view.w * 0.8, 400);
  point('pointermove', 1, world.view.w * 0.8, 120);
  point('pointermove', 2, world.view.w * 0.2, 390);
  assert.ok(Math.abs(world.player.target - 320) < 1e-8);
  assert.ok(Math.abs(world.bot.target - 290) < 1e-8);
  point('pointerup', 1, world.view.w * 0.8, 120);
  point('pointerup', 2, world.view.w * 0.2, 390);
  assert.equal(world.match.serveRequested, false);
});

it('focused UI retains native Space and Enter activation after those keys are remapped', (t) => {
  const { engine, world, doc, key, advance } = harness(t);
  engine.setPreferences({
    ...DEFAULT_SETTINGS,
    autoServe: false,
    keyBindings: { ...DEFAULT_BINDINGS, up: [' '], serve: ['b'] }
  });
  engine.play(quickMatchRules('rookie'));
  const before = world.player.target;
  for (const focused of [
    new TestButton(),
    Object.assign(new TestElement(), { tagName: 'SUMMARY' }),
    Object.assign(new TestElement(), { tagName: 'A' })
  ]) {
    doc.activeElement = focused;
    assert.equal(key(' ').defaultPrevented, false);
    advance(30);
  }
  assert.equal(world.player.target, before);
  engine.setPreferences({
    ...DEFAULT_SETTINGS,
    keyBindings: { ...DEFAULT_BINDINGS, pause: ['enter'], serve: ['b'] }
  });
  for (const tagName of ['SUMMARY', 'A']) {
    doc.activeElement = Object.assign(new TestElement(), { tagName });
    assert.equal(key('Enter').defaultPrevented, false);
    assert.equal(world.match.status, 'serve');
  }
  doc.activeElement = null;
  engine.quitToMenu();
  assert.equal(key('Enter').defaultPrevented, false, 'pause mapping leaves menu keys alone');
});

it('relative touch works in either orientation, permits edge reversal and keeps mouse pointing direct', (t) => {
  const { engine, world, win, pointer } = harness(t);
  engine.setPreferences({
    ...DEFAULT_SETTINGS,
    autoServe: false,
    touchMode: 'relative',
    touchSensitivity: 1.5
  });
  engine.play(quickMatchRules('rookie'));
  for (const portrait of [false, true]) {
    win.innerWidth = portrait ? 600 : 1000;
    win.innerHeight = portrait ? 1000 : 600;
    (engine as unknown as { layout: () => void }).layout();
    world.player.target = 300;
    const point = (type: string, y: number, pointerType = 'touch') =>
      pointer(
        type,
        1,
        toScreenX(world.view, world.view.w / 3, y),
        toScreenY(world.view, world.view.w / 3, y),
        pointerType
      );
    point('pointerdown', 100);
    assert.equal(world.player.target, 300, 'placing a finger does not jump the paddle');
    point('pointermove', 120);
    assert.ok(Math.abs(world.player.target - 330) < 1e-8);
    point('pointermove', 1000);
    assert.equal(world.player.target, 600 - world.player.half);
    point('pointermove', 990);
    assert.ok(Math.abs(world.player.target - (600 - world.player.half - 15)) < 1e-8);
    point('pointerup', 990);
    assert.equal(world.match.serveRequested, false, 'dragging never serves');
    point('pointermove', 200, 'mouse');
    assert.ok(Math.abs(world.player.target - 200) < 1e-8);
    point('pointerdown', 100);
    (engine as unknown as { layout: () => void }).layout();
    point('pointermove', 150);
    assert.ok(Math.abs(world.player.target - 200) < 1e-8, 'resize drops a stale drag');
    point('pointerup', 150);
  }
});

it('canvas quality preserves the live world, both touch owners and held keys in either orientation', (t) => {
  const { engine, world, win, canvas, pointer, key, advance } = harness(t, true);
  win.devicePixelRatio = 3;
  for (const portrait of [false, true]) {
    win.innerWidth = portrait ? 600 : 1000;
    win.innerHeight = portrait ? 1000 : 600;
    (engine as unknown as { layout: () => void }).layout();
    for (const effects of ['full', 'calm'] as const) {
      const preferences = {
        ...DEFAULT_SETTINGS,
        autoServe: false,
        touchMode: 'relative' as const,
        effects
      };
      engine.setPreferences(preferences);
      engine.play(versusRules());
      engine.serve();
      advance(16);
      assert.equal(world.match.status, 'play');
      const point = (type: string, id: number, x: number, y: number) =>
        pointer(type, id, toScreenX(world.view, x, y), toScreenY(world.view, x, y));
      point('pointerdown', 1, world.view.w * 0.2, 100);
      point('pointerdown', 2, world.view.w * 0.8, 400);
      key('w');
      const state = () => JSON.stringify({ ...world, view: { ...world.view, dpr: 0 } });
      const before = state();
      const snapshot = engine.getSnapshot();
      for (const [canvasQuality, dpr] of [
        ['balanced', 1.5],
        ['low', 1],
        ['high', 2.5]
      ] as const) {
        engine.setPreferences({ ...preferences, canvasQuality });
        assert.equal(world.view.dpr, dpr);
        assert.equal(canvas.width, win.innerWidth * dpr);
        assert.equal(canvas.height, win.innerHeight * dpr);
        assert.equal(state(), before, 'only the backing pixel ratio changes');
        assert.equal(engine.getSnapshot(), snapshot);
      }
      const playerTarget = world.player.target;
      const botTarget = world.bot.target;
      point('pointermove', 1, world.view.w * 0.8, 120);
      point('pointermove', 2, world.view.w * 0.2, 390);
      assert.ok(Math.abs(world.player.target - playerTarget - 20) < 1e-8);
      assert.ok(Math.abs(world.bot.target - botTarget + 10) < 1e-8);
      const steered = world.player.target;
      advance(16);
      assert.ok(world.player.target < steered, 'the held movement key survives a quality change');
      win.dispatchEvent(Object.assign(new Event('keyup'), { key: 'w' }));
    }
  }
});

it('canvas quality set before engine startup survives resize and orientation changes', (t) => {
  const { engine, world, win, canvas } = harness(
    t,
    false,
    {
      ...DEFAULT_SETTINGS,
      canvasQuality: 'low'
    },
    3
  );
  assert.equal(world.view.dpr, 1);
  assert.equal(canvas.width, win.innerWidth);
  for (const portrait of [false, true]) {
    win.innerWidth = portrait ? 600 : 1000;
    win.innerHeight = portrait ? 1000 : 600;
    (engine as unknown as { layout: () => void }).layout();
    assert.equal(world.view.dpr, 1);
    assert.equal(canvas.width, win.innerWidth);
    assert.equal(canvas.height, win.innerHeight);
    assert.equal(world.view.rotated, portrait);
  }
});

it('the engine lesson can be replayed and exited without changing device preferences', (t) => {
  const { engine, world, key, win, advance } = harness(t);
  engine.setPreferences({ ...DEFAULT_SETTINGS, autoServe: false, effects: 'calm' });
  engine.learn();
  assert.equal(engine.getSnapshot().tutorialStep, 'move');
  key('ArrowUp');
  for (let i = 0; i < 30 && engine.getSnapshot().tutorialStep === 'move'; i++) advance(40);
  win.dispatchEvent(Object.assign(new Event('keyup'), { key: 'ArrowUp' }));
  assert.equal(engine.getSnapshot().tutorialStep, 'return');
  engine.replay();
  assert.equal(engine.getSnapshot().tutorialStep, 'move');
  engine.quitToMenu();
  assert.equal(engine.getSnapshot().tutorialStep, null);
  assert.equal(world.autoServe, false);
  assert.equal(world.motion, 0.25);
  engine.play(quickMatchRules('rookie'));
  assert.equal(engine.getSnapshot().tutorialStep, null);
  assert.equal(engine.getSnapshot().mode, 'quick');
});

it('HUD goal snapshots stay stable between meaningful changes and include live rally progress', (t) => {
  const { engine, world, advance } = harness(t);
  engine.setPreferences({ ...DEFAULT_SETTINGS, autoServe: false });
  engine.play({
    ...quickMatchRules('rookie'),
    goals: [
      { id: 'rally', value: 8 },
      { id: 'flicks', value: 2 }
    ]
  });
  world.match.serveTimer = 0;
  const before = engine.getSnapshot().goals;
  advance(40);
  assert.equal(engine.getSnapshot().goals, before);
  world.match.rally = 8;
  advance(40);
  const reached = engine.getSnapshot().goals;
  assert.notEqual(reached, before);
  assert.equal(reached[1]!.progress, 'Rally 8/8');
  assert.equal(reached[1]!.state, 'reached');
  advance(40);
  assert.equal(engine.getSnapshot().goals, reached);
});

it('movement keys leave menu navigation alone and browser shortcuts are preserved', (t) => {
  const { engine, world, key } = harness(t);
  assert.equal(key('ArrowDown').defaultPrevented, false);
  engine.play(quickMatchRules('rookie'));
  assert.equal(key('ArrowDown').defaultPrevented, true);
  assert.equal(key('p', true).defaultPrevented, false);
  assert.equal(world.match.status, 'serve');
});

it('touch drags do not launch a serve and extra fingers cannot steal control', (t) => {
  const { engine, world, pointer } = harness(t);
  engine.play(quickMatchRules('rookie'));
  const timer = world.match.serveTimer;
  pointer('pointerdown', 1, 100, 200);
  assert.equal(world.match.serveTimer, timer);
  const target = world.player.target;
  pointer('pointerdown', 2, 100, 450);
  pointer('pointermove', 2, 100, 500);
  assert.equal(world.player.target, target);
  pointer('pointermove', 1, 100, 350);
  pointer('pointerup', 1, 100, 350);
  assert.equal(world.match.serveRequested, false);
  pointer('pointerdown', 3, 100, 250);
  pointer('pointerup', 3, 100, 250);
  assert.equal(world.match.serveRequested, true);
});

it('pause discards queued steering, and blur cancels a resume countdown', (t) => {
  const { engine, world, win, key } = harness(t);
  engine.play(quickMatchRules('rookie'));
  world.player.target = 100;
  world.player.vy = 960;
  world.bot.target = 450;
  engine.pause();
  assert.equal(world.player.target, world.player.y);
  assert.equal(world.player.vy, 0);
  assert.equal(world.bot.target, 450, 'the opponent retains the read it made before pause');
  engine.resume();
  assert.equal(engine.getSnapshot().resumeIn, 3);
  win.dispatchEvent(new Event('blur'));
  assert.equal(world.match.status, 'paused');
  assert.equal(engine.getSnapshot().resumeIn, 0);
  engine.resume();
  key('Escape');
  assert.equal(world.match.status, 'paused');
});

it('system reduced motion is ignored at startup and on changes; explicit game settings control effects', (t) => {
  const { engine, world, win } = harness(t, true);
  const tuning = { ...world.tuning };
  assert.equal(world.motion, 1);
  assert.equal(world.camera, 1);
  assert.ok(win.mediaQueries.every((query) => !query.includes('reduced-motion')));
  engine.setPreferences({ ...DEFAULT_SETTINGS, effects: 'calm', autoServe: false });
  assert.equal(world.motion, 0.25);
  assert.equal(world.camera, 0);
  assert.equal(world.autoServe, false);
  assert.deepEqual(world.tuning, tuning);
  engine.setPreferences(DEFAULT_SETTINGS);
  assert.equal(world.motion, 1);
  assert.equal(world.camera, 1);
  win.motion.matches = false;
  win.motion.dispatchEvent(new Event('change'));
  assert.equal(world.motion, 1);
  assert.equal(world.camera, 1);
  engine.setPreferences({ ...DEFAULT_SETTINGS, shake: 'gentle' });
  win.motion.matches = true;
  win.motion.dispatchEvent(new Event('change'));
  assert.equal(world.motion, 1);
  assert.equal(world.camera, 0.45);
  assert.deepEqual(world.tuning, tuning);
});

it('the real frame clock resumes on time after slow motion and holds paused camera offsets', (t) => {
  const { engine, world, advance } = harness(t);
  engine.play(quickMatchRules('rookie'));
  engine.serve();
  advance(16);
  world.fx.timeScale = 0.32;
  world.fx.shake = 5;
  world.fx.shakeX = 2;
  world.fx.shakeY = 3;
  world.fx.shakeRot = 0.01;
  engine.pause();
  advance(250);
  assert.deepEqual([world.fx.shakeX, world.fx.shakeY, world.fx.shakeRot], [2, 3, 0.01]);
  const before = { ...world.ball };
  engine.resume();
  for (let i = 0; i < 5; i++) advance(250);
  assert.equal(world.match.status, 'resuming');
  assert.deepEqual(world.ball, before);
  advance(250);
  assert.equal(world.match.status, 'play');
  assert.deepEqual(world.ball, before);
  advance(40);
  assert.notEqual(world.ball.x, before.x);
});
