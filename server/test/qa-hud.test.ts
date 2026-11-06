import assert from 'node:assert/strict';
import { it, type TestContext } from 'node:test';
import { stageById } from '../../src/core/campaign/journey';
import { ARENA_PRESETS } from '../../src/core/modes/arenas';
import {
  campaignRules,
  challengeRulesById,
  endlessRules,
  practiceRules,
  quickMatchRules
} from '../../src/core/modes/rules';
import { DEFAULT_SETTINGS } from '../../src/core/settings/store';
import { checkBossPhase, BANNER_TIME } from '../../src/game/arena';
import type { GameAudio } from '../../src/game/audio';
import { BALL_R, FIELD_H, PADDLE_INSET, PADDLE_W } from '../../src/game/constants';
import { collideCourse, createCourse } from '../../src/game/course';
import { GameEngine } from '../../src/game/engine';
import { scorePoint, startMatch } from '../../src/game/match';
import { Renderer } from '../../src/game/render/renderer';
import { forecast, nearCourse } from '../../src/game/trajectory';
import { toScreenX, toScreenY } from '../../src/game/view';
import { createWorld, placePaddles, type World } from '../../src/game/world';
import { seeded } from '../../src/core/util/random';

class TestElement extends EventTarget {
  tagName = 'DIV';
  isContentEditable = false;
  closest() {
    return null;
  }
}
class TestCanvas extends TestElement {
  override tagName = 'CANVAS';
  width = 0;
  height = 0;
  style = {};
  getContext() {
    return {};
  }
  setPointerCapture() {}
}
class TestWindow extends EventTarget {
  innerWidth = 1280;
  innerHeight = 800;
  devicePixelRatio = 1;
  matchMedia() {
    return { matches: false };
  }
}

/** The real engine and its listeners, with a root element whose style records CSS variables. */
function harness(t: TestContext) {
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const win = new TestWindow();
  const rootStyle = new Map<string, string>();
  const doc = Object.assign(new EventTarget(), {
    documentElement: {
      style: {
        setProperty: (name: string, value: string) => rootStyle.set(name, value),
        removeProperty: (name: string) => rootStyle.delete(name)
      }
    },
    activeElement: null,
    hidden: false
  });
  const replacements: Record<string, unknown> = {
    window: win,
    document: doc,
    HTMLElement: TestElement,
    Element: TestElement,
    HTMLButtonElement: TestElement,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    getComputedStyle: () => ({ getPropertyValue: () => '0' })
  };
  const saved = Object.fromEntries(
    Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  for (const [key, value] of Object.entries(replacements))
    Object.defineProperty(globalThis, key, { value, configurable: true });
  const canvas = new TestCanvas();
  const engine = new GameEngine(canvas as unknown as HTMLCanvasElement);
  (engine as unknown as { renderer: { render: () => void } }).renderer.render = () => {};
  engine.setPreferences({ ...DEFAULT_SETTINGS, autoServe: false });
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
  const layout = () => (engine as unknown as { layout: () => void }).layout();
  /** A pointer event; `on` picks the target: the canvas, or chrome over it (bubbling to window). */
  const pointer = (
    type: string,
    fieldX: number,
    fieldY: number,
    { id = 1, pointerType = 'mouse', on = 'canvas' as 'canvas' | 'chrome' } = {}
  ) => {
    const event = Object.assign(new Event(type), {
      pointerId: id,
      clientX: toScreenX(world.view, fieldX, fieldY),
      clientY: toScreenY(world.view, fieldX, fieldY),
      button: 0,
      pointerType
    });
    (on === 'canvas' ? canvas : win).dispatchEvent(event);
  };
  const advance = (milliseconds: number) => {
    const now = (engine as unknown as { lastTime: number }).lastTime + milliseconds;
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(now);
  };
  return { engine, world, win, canvas, rootStyle, layout, pointer, advance };
}

const px = (value: string | undefined) => Number.parseFloat(value ?? 'NaN');

it('pointer moves over the HUD chrome steer a mouse paddle; unowned touches over it do not', (t) => {
  const { engine, world, pointer } = harness(t);
  engine.play(quickMatchRules('rookie'));
  engine.serve();
  assert.equal(world.match.status, 'serve');
  // A mouse that arrives straight on a control is reaching for it, not steering.
  const resting = world.player.target;
  pointer('pointermove', 60, 140, { on: 'chrome' });
  assert.equal(world.player.target, resting);
  // Once it steers on the court, the skill strip and the match panel over the
  // court no longer interrupt it: it is still pointing at a paddle position.
  pointer('pointermove', 60, 420, { on: 'canvas' });
  assert.ok(Math.abs(world.player.target - 420) < 1e-8);
  pointer('pointermove', 60, 140, { on: 'chrome' });
  assert.ok(Math.abs(world.player.target - 140) < 1e-8);
  pointer('pointermove', 60, 420, { on: 'chrome' });
  assert.ok(Math.abs(world.player.target - 420) < 1e-8);
  // A finger that started on a HUD control owns nothing.
  pointer('pointermove', 60, 200, { on: 'chrome', pointerType: 'touch', id: 7 });
  assert.ok(Math.abs(world.player.target - 420) < 1e-8);
  // A drag that started on the court keeps steering wherever it travels.
  pointer('pointerdown', 60, 300, { pointerType: 'touch', id: 3 });
  pointer('pointermove', 60, 250, { on: 'chrome', pointerType: 'touch', id: 3 });
  assert.ok(Math.abs(world.player.target - 250) < 1e-8);
  engine.pause();
  pointer('pointermove', 60, 100, { on: 'chrome' });
  assert.equal(world.player.target, world.player.y, 'a paused court ignores the pointer');
});

it('the resume countdown keeps tracking the mouse while the paddle is held still', (t) => {
  const { engine, world, pointer, advance } = harness(t);
  engine.play(quickMatchRules('rookie'));
  engine.serve();
  advance(16);
  engine.pause();
  engine.resume();
  assert.equal(world.match.status, 'resuming');
  const held = world.player.y;
  pointer('pointermove', 60, 120);
  pointer('pointermove', 60, 110, { on: 'chrome' });
  assert.ok(Math.abs(world.player.target - 110) < 1e-8, 'the target follows the countdown');
  advance(250);
  assert.equal(world.match.status, 'resuming');
  assert.equal(world.player.y, held, 'the paddle itself waits for play');
  for (let i = 0; i < 8 && world.match.status === 'resuming'; i++) advance(250);
  assert.notEqual(world.match.status, 'resuming');
  advance(16);
  assert.ok(world.player.y < held, 'play resumes towards where the mouse went');
});

it('the paddle lanes and contact zones are published for the HUD in both orientations', (t) => {
  const { engine, world, win, rootStyle, layout } = harness(t);
  const face = PADDLE_INSET + PADDLE_W / 2 + BALL_R * 2;
  for (const [width, height] of [
    [1280, 800],
    [844, 390],
    [2560, 1080],
    [390, 844],
    [320, 568]
  ] as const) {
    win.innerWidth = width;
    win.innerHeight = height;
    layout();
    const { view } = world;
    const lane = {
      l: px(rootStyle.get('--court-lane-l')),
      r: px(rootStyle.get('--court-lane-r')),
      t: px(rootStyle.get('--court-lane-t')),
      b: px(rootStyle.get('--court-lane-b'))
    };
    for (const value of Object.values(lane)) assert.ok(Number.isFinite(value) && value >= 0);
    // Every point of either paddle's travel, out to a ball's width in front
    // of its face, falls inside the published lane.
    for (const [x, side] of [
      [face, 'you'],
      [view.w - face, 'bot']
    ] as const)
      for (const y of [0, FIELD_H / 2, FIELD_H]) {
        const sx = toScreenX(view, x, y);
        const sy = toScreenY(view, x, y);
        if (!view.rotated) {
          if (side === 'you') assert.ok(sx <= lane.l, `${width}x${height}: player lane`);
          else assert.ok(sx >= width - lane.r, `${width}x${height}: opponent lane`);
          assert.equal(lane.t + lane.b, 0);
        } else {
          if (side === 'you') assert.ok(sy >= height - lane.b, `${width}x${height}: player lane`);
          else assert.ok(sy <= lane.t, `${width}x${height}: opponent lane`);
          assert.equal(lane.l + lane.r, 0);
        }
      }
    // ...while leaving the court between them to the chrome.
    const along = view.rotated ? height : width;
    assert.ok(
      (view.rotated ? lane.t + lane.b : lane.l + lane.r) < along * 0.45,
      `${width}x${height}: lanes leave the middle free`
    );
  }
  engine.stop();
  assert.equal(rootStyle.size, 0, 'stopping the engine withdraws the lanes');
});

it('timed challenges publish a clock rounded the way the result is judged', (t) => {
  const { engine, world } = harness(t);
  engine.play(challengeRulesById('blitz')!);
  world.match.elapsed = 41.4;
  (engine as unknown as { publish: () => void }).publish();
  assert.deepEqual(engine.getSnapshot().clock, { elapsed: 41, limit: 70 });
  const first = engine.getSnapshot().clock;
  world.match.elapsed = 41.45;
  (engine as unknown as { publish: () => void }).publish();
  assert.equal(engine.getSnapshot().clock, first, 'an unchanged second keeps the snapshot');
  world.match.elapsed = 70.5;
  (engine as unknown as { publish: () => void }).publish();
  assert.deepEqual(engine.getSnapshot().clock, { elapsed: 71, limit: 70 });
  engine.play(quickMatchRules('rookie'));
  assert.equal(engine.getSnapshot().clock, null);
});

it('the live progress line carries waves and objective counters', (t) => {
  const { engine, world } = harness(t);
  engine.play(endlessRules({ waves: true }));
  assert.match(engine.getSnapshot().progress ?? '', /^Wave 1 · 0\/12 returns · \d+ lives$/);
  engine.play(quickMatchRules('rookie'));
  assert.equal(engine.getSnapshot().progress, null);
  const rally = challengeRulesById('long-rally')!;
  assert.equal(rally.objective?.id, 'rally');
  engine.play(rally);
  world.match.bestThisMatch = 7;
  (engine as unknown as { publish: () => void }).publish();
  assert.equal(engine.getSnapshot().progress, `Rally 7/${rally.objective!.value}`);
});

it('a boss keeps its name on the score panel, and its live tier after a phase', (t) => {
  const { engine, world } = harness(t);
  const rules = campaignRules(stageById('w6-24')!);
  engine.play(rules);
  assert.equal(engine.getSnapshot().opponentName, `${rules.boss!.name} · Pro`);
  world.match.status = 'play';
  world.match.score.you = 2;
  assert.ok(checkBossPhase(world));
  (engine as unknown as { publish: () => void }).publish();
  assert.equal(engine.getSnapshot().opponentName, `${rules.boss!.name} · Elite`);
  engine.play(quickMatchRules('pro'));
  assert.match(engine.getSnapshot().opponentName ?? '', /^Pro · /);
});

it('a best-of series is shown on the intro card and the HUD, and survives a rehearsal', (t) => {
  const { engine, world, advance } = harness(t);
  const rules = quickMatchRules('rookie', { series: 3 });
  const finish = (won: boolean) => {
    for (let i = 0; i < 20 && world.match.status !== 'over'; i++) {
      world.match.status = 'play';
      scorePoint(world, won ? 'you' : 'bot');
    }
    for (let i = 0; i < 400 && !engine.getSnapshot().result; i++) advance(50);
    assert.ok(engine.getSnapshot().result);
  };
  engine.play(rules);
  assert.deepEqual(engine.getSnapshot().series, { game: 1, length: 3, you: 0, foe: 0 });
  assert.match(world.fx.vsSub, /^Best of 3 · Quick Match/);
  finish(true);
  assert.deepEqual(engine.getSnapshot().series, { game: 1, length: 3, you: 1, foe: 0 });
  // A practice rehearsal in between is not part of the series...
  engine.play(practiceRules('rookie'));
  assert.equal(engine.getSnapshot().series, null);
  engine.quitToMenu();
  // ...and replaying the contract is its next game.
  engine.play(rules);
  assert.deepEqual(engine.getSnapshot().series, { game: 2, length: 3, you: 1, foe: 0 });
  assert.match(world.fx.vsSub, /^Game 2 · 1–0 · Quick Match/);
  finish(true);
  assert.deepEqual(engine.getSnapshot().series, { game: 2, length: 3, you: 2, foe: 0 });
  // A decided series starts over when it is replayed.
  engine.play(rules);
  assert.deepEqual(engine.getSnapshot().series, { game: 1, length: 3, you: 0, foe: 0 });
  // Leaving a series game for the menu ends the series.
  engine.quitToMenu();
  engine.play(rules);
  assert.deepEqual(engine.getSnapshot().series, { game: 1, length: 3, you: 0, foe: 0 });
  engine.play(quickMatchRules('rookie'));
  assert.equal(engine.getSnapshot().series, null);
});

const silent = new Proxy({}, { get: () => () => 0 }) as unknown as GameAudio;

it('the forecast broad phase never skips a step on which the course would act', () => {
  const courts = ARENA_PRESETS.filter(
    (preset) =>
      preset.arena.rails?.length ||
      preset.arena.gates?.length ||
      preset.arena.switches?.length ||
      preset.arena.zones?.length
  );
  assert.ok(courts.length >= 10);
  const random = seeded('qa-hud', 'broad-phase');
  let acted = 0;
  for (const preset of courts) {
    const w = createWorld(silent, 0);
    w.view.w = 1000;
    placePaddles(w);
    startMatch(w, quickMatchRules('elite', { arenaId: preset.id }));
    w.match.status = 'play';
    for (let sample = 0; sample < 1500; sample++) {
      w.arena.course = createCourse(w.arena.spec);
      w.arena.time = random() * 20;
      w.arena.course.time = w.arena.time - 1 / 120;
      const speed = 300 + random() * 1300;
      const angle = (random() - 0.5) * 2.2;
      const vx = Math.cos(angle) * speed * (random() < 0.5 ? -1 : 1);
      const vy = Math.sin(angle) * speed;
      const x = random() * w.view.w;
      const y = BALL_R + random() * (FIELD_H - 2 * BALL_R);
      Object.assign(w.ball, {
        px: x - vx / 120,
        py: y - vy / 120,
        x,
        y,
        vx,
        vy,
        speed,
        owner: random() < 0.5 ? 'you' : 'bot'
      });
      const before = JSON.stringify([w.ball, w.arena.course, w.botBrain, w.player.material]);
      const near = nearCourse(w.arena.spec!, w.view.w, w.ball);
      collideCourse(w);
      w.arena.course.time = w.arena.time - 1 / 120;
      const after = JSON.stringify([w.ball, w.arena.course, w.botBrain, w.player.material]);
      if (after !== before) {
        acted++;
        assert.ok(near, `${preset.id}: the course acted on a skipped step`);
      }
    }
  }
  assert.ok(acted > 100, 'the samples exercise real contacts');
});

it('a forecast across a brick wall leaves the live wall and course untouched', () => {
  const w = createWorld(silent, 0);
  w.view.w = 1000;
  placePaddles(w);
  startMatch(w, quickMatchRules('elite', { arenaId: 'siege-relay-1' }));
  w.match.status = 'play';
  Object.assign(w.ball, { px: 400, py: 300, x: 400, y: 300, vx: 900, vy: 40, speed: 901 });
  const bricks = w.arena.bricks;
  const before = JSON.stringify([w.arena, w.ball]);
  const y = forecast(w, w.bot.x);
  assert.ok(Number.isFinite(y));
  assert.equal(JSON.stringify([w.arena, w.ball]), before);
  assert.equal(w.arena.bricks, bricks);
  assert.equal(forecast(w, w.bot.x), y, 'repeated reads agree');
});

/** A 2D context that records where text is drawn and whether a band was filled. */
function recordingContext() {
  const texts: { text: string; x: number; y: number }[] = [];
  let fills = 0;
  let tx = 0;
  let ty = 0;
  let fontSize = 10;
  const target: Record<string, unknown> = {
    save() {},
    restore() {
      tx = 0;
      ty = 0;
    },
    translate(x: number, y: number) {
      tx += x;
      ty += y;
    },
    scale() {},
    fillRect() {
      fills++;
    },
    strokeText() {},
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x: tx + x, y: ty + y });
    },
    measureText(text: string) {
      return { width: text.length * fontSize * 0.6 };
    }
  };
  const ctx = new Proxy(target, {
    get: (object, key) => (key in object ? object[key as string] : () => {}),
    set: (object, key, value) => {
      if (key === 'font') fontSize = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(value)![1]!);
      object[key as string] = value;
      return true;
    }
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts, fills: () => fills };
}

function courtWorld(width: number, height: number): World {
  const w = createWorld(silent, 1);
  const rotated = height > width;
  const long = Math.max(width, height) - 28;
  const short = Math.min(width, height) - 28;
  const aspect = Math.min(2.15, Math.max(1.25, long / short));
  Object.assign(w.view, {
    vw: width,
    vh: height,
    cx: width / 2,
    cy: height / 2,
    rotated,
    w: FIELD_H * aspect,
    h: FIELD_H,
    scale: Math.min(long / (FIELD_H * aspect), short / FIELD_H)
  });
  placePaddles(w);
  return w;
}

it('an ace at the wall rises inside the viewport', () => {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390]
  ] as const) {
    for (const fieldY of [BALL_R, FIELD_H - BALL_R]) {
      const w = courtWorld(width, height);
      w.popups.spawn('ACE', 70, fieldY, 180, 26);
      w.popups.items.find((p) => p.alive)!.age = 0.5;
      const { ctx, texts } = recordingContext();
      (new Renderer(ctx) as unknown as { drawPopups: (w: World) => void }).drawPopups(w);
      const drawn = texts.find((entry) => entry.text === 'ACE');
      assert.ok(drawn);
      const half = 26 * w.view.scale * 0.6;
      assert.ok(drawn.y - half >= 0 && drawn.y + half <= height, `${width}x${height} y`);
      assert.ok(drawn.x - half >= 0 && drawn.x + half <= width, `${width}x${height} x`);
    }
  }
});

it('a banner raised mid-rally is a brief edge notice; a serve banner keeps its card', () => {
  for (const [width, height] of [
    [1280, 800],
    [390, 844]
  ] as const) {
    const w = courtWorld(width, height);
    const renderer = new Renderer(recordingContext().ctx) as unknown as {
      drawBanner: (w: World, cx: number, cy: number, s: number) => void;
    };
    const draw = (age: number) => {
      const recording = recordingContext();
      (renderer as unknown as { ctx: CanvasRenderingContext2D }).ctx = recording.ctx;
      w.fx.bannerTimer = BANNER_TIME - age;
      renderer.drawBanner(w, w.view.cx, w.view.cy, w.view.scale);
      return recording;
    };
    w.fx.bannerText = 'Rally pressure';
    w.fx.bannerSub = 'Both paddles narrow from return 25 · resets next serve';
    w.match.status = 'play';
    w.match.rally = 25;
    const shown = draw(0.3);
    assert.equal(shown.fills(), 0, 'no band across the court');
    const title = shown.texts.find((entry) => entry.text === 'RALLY PRESSURE')!;
    assert.ok(title);
    if (!w.view.rotated)
      assert.ok(title.y < w.view.cy - (FIELD_H * w.view.scale) / 2 + 40, 'against the top wall');
    else assert.ok(title.y < w.view.cy, 'short of the centre line');
    assert.equal(draw(1.4).texts.length, 0, 'gone well before the serve banner would be');
    // The same banner continuing after the point keeps its compact form.
    w.match.status = 'serve';
    assert.equal(draw(1.5).fills(), 0);
    // A banner raised over a serve is the full card.
    w.fx.bannerTimer = 0;
    draw(BANNER_TIME);
    const card = draw(0.3);
    assert.ok(card.fills() > 0);
  }
});
