import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

let checks = 0;
const check = async (name, test) => {
  await test();
  console.log(`✓ ${name}`);
  checks++;
};

// Production recorder/stores with substituted engine events, browser timelines
// and clocks. The real engine probes are covered by server/test/input.test.ts.
async function environment(enabled, test) {
  const vite = await createServer({
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
    logLevel: 'error'
  });
  const win = new Window({
    url: `https://bball.test/?experience=${enabled ? '1' : '0'}&token=KEEP_PRIVATE`
  });
  const original = new Map();
  const replace = (key, value) => {
    if (!original.has(key)) original.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true });
  };
  replace('window', win);
  replace('document', win.document);
  replace('navigator', win.navigator);
  Object.defineProperty(win.document, 'hidden', {
    value: false,
    writable: true,
    configurable: true
  });
  Object.defineProperty(win, 'innerWidth', { value: 1000, writable: true, configurable: true });
  Object.defineProperty(win, 'innerHeight', { value: 600, writable: true, configurable: true });
  const canvas = win.document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 600;
  win.document.body.append(canvas);
  let api;
  try {
    const bridge = await vite.ssrLoadModule('/src/dev/experienceBridge.ts');
    const { installExperience } = await vite.ssrLoadModule('/src/dev/experience.ts');
    const { profileStore } = await vite.ssrLoadModule('/src/core/profile/store.ts');
    const { settingsStore } = await vite.ssrLoadModule('/src/core/settings/store.ts');
    let now = 100;
    let clocks = 0;
    const timers = new Map();
    let timerId = 0;
    const entries = {};
    replace('performance', {
      now: () => {
        clocks++;
        return now;
      },
      getEntriesByType: (type) => entries[type] ?? []
    });
    replace('PerformanceObserver', undefined);
    replace('setTimeout', (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    });
    replace('clearTimeout', (id) => timers.delete(id));
    replace('fetch', () => {
      throw new Error('Diagnostics must not contact an API.');
    });
    const listeners = new Set();
    let resultId = 0;
    const engine = {
      frame: null,
      match: null,
      snapshot: { mode: 'journey', label: 'Warm-up', status: 'menu', resultId: 0, result: null },
      getSnapshot() {
        return this.snapshot;
      },
      getDiagnostics: () => ({
        fieldWidth: 1000,
        rotated: false,
        stageId: 'w1-1',
        bot: 'rookie',
        level: 1,
        effects: {},
        abilities: []
      }),
      subscribe(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
      observeFrames(callback) {
        this.frame = callback;
        return () => {
          if (this.frame === callback) this.frame = null;
        };
      },
      observeMatches(callback) {
        this.match = callback;
        return () => {
          if (this.match === callback) this.match = null;
        };
      },
      sample(at, phase = 'play') {
        now = at;
        this.frame?.({ timestampMs: at, phase, updateMs: 2, drawMs: 3, steps: 2 });
      },
      begin() {
        this.snapshot = { ...this.snapshot, status: 'serve', result: null };
        for (const listener of listeners) listener();
        this.match?.({
          kind: 'started',
          mode: 'journey',
          stageId: 'w1-1',
          bot: 'rookie',
          ranked: true,
          scoreYou: 0,
          scoreBot: 0,
          seconds: 0,
          hits: 0,
          bestRally: 0
        });
      },
      finish(won = true) {
        this.snapshot = {
          ...this.snapshot,
          status: 'over',
          resultId: ++resultId,
          result: {
            mode: 'journey',
            stageId: 'w1-1',
            botId: 'rookie',
            ranked: true,
            abandoned: false,
            won,
            objectiveMet: true,
            scoreYou: won ? 3 : 0,
            scoreBot: won ? 0 : 3,
            seconds: 60,
            hits: 12,
            bestRally: 8,
            privateProfile: 'KEEP_PRIVATE'
          }
        };
        for (const listener of listeners) listener();
      },
      quit() {
        this.match?.({
          kind: 'abandoned',
          mode: 'journey',
          stageId: 'w1-1',
          bot: 'rookie',
          ranked: true,
          scoreYou: 1,
          scoreBot: 2,
          seconds: 45,
          hits: 10,
          bestRally: 6
        });
        this.snapshot = { ...this.snapshot, status: 'menu', result: null };
        for (const listener of listeners) listener();
      }
    };
    const install = () => {
      api = installExperience();
      return api;
    };
    const clock = (value) => {
      now = value;
    };
    await test({
      win,
      canvas,
      bridge,
      install,
      engine,
      profileStore,
      settingsStore,
      timers,
      entries,
      clock,
      replace,
      clocks: () => clocks,
      listeners
    });
  } finally {
    api?.dispose();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await win.happyDOM.cancelAsync();
    win.close();
    await vite.close();
  }
}

await environment(false, async ({ bridge, install, engine, clocks, win }) => {
  await check('ordinary play installs no recorder or menu timing', async () => {
    bridge.experienceEngine(engine);
    assert.equal(install(), null);
    assert.equal(win.bballExperience, undefined);
    assert.equal(await bridge.loadMenu('Settings', async () => 42), 42);
    await assert.rejects(
      bridge.loadMenu('Settings', async () => {
        throw new Error('load failed');
      }),
      /load failed/
    );
    assert.equal(clocks(), 0);
    assert.deepEqual(bridge.experienceBoot(), { engineStartedAtMs: null, menuLoads: [] });
  });
});

await environment(true, async (fixture) => {
  const {
    bridge,
    engine,
    install,
    clock,
    timers,
    win,
    profileStore,
    settingsStore,
    entries,
    replace,
    listeners
  } = fixture;
  bridge.experienceEngine(engine);
  let api = install();
  await check(
    'opt-in capture preserves profiles and records real intervals with unsupported signals unavailable',
    async () => {
      const profile = JSON.stringify(profileStore.getSnapshot());
      const settings = JSON.stringify(settingsStore.getSnapshot());
      const writes = win.localStorage.length;
      assert.ok(install() === api, 'repeated install must share the recorder');
      assert.throws(() => api.start({ label: 'rally', refreshHz: 0 }));
      api.start({ label: 'rally', refreshHz: 60 });
      assert.throws(() => api.start({ label: 'another', refreshHz: 60 }));
      assert.throws(() => api.json(), /Stop the capture/);
      engine.sample(100);
      engine.sample(116);
      engine.sample(164);
      api.stop();
      const report = api.report();
      assert.deepEqual(report.supported, { firstInput: false, longTasks: false });
      assert.equal(report.firstInput, null);
      assert.equal(report.startup.navigation, null);
      assert.equal(report.captures[0].summary.frameIntervalMs.p95, 48);
      assert.equal(report.captures[0].context.engine.fieldWidth, 1000);
      assert.equal(timers.size, 0);
      assert.equal(engine.frame, null);
      assert.equal(JSON.stringify(profileStore.getSnapshot()), profile);
      assert.equal(JSON.stringify(settingsStore.getSnapshot()), settings);
      assert.equal(win.localStorage.length, writes);
    }
  );

  await check(
    'hidden pages, viewport changes and changed preferences end a capture before mixing contexts',
    async () => {
      api.reset();
      for (const cause of ['hidden', 'resize', 'settings', 'pagehide']) {
        clock(200);
        api.start({ label: cause, refreshHz: 60 });
        engine.sample(201);
        if (cause === 'hidden') {
          win.document.hidden = true;
          win.document.dispatchEvent(new win.Event('visibilitychange'));
        }
        if (cause === 'resize') {
          win.innerWidth = 900;
          win.dispatchEvent(new win.Event('resize'));
        }
        if (cause === 'settings') settingsStore.update({ effects: 'calm' });
        if (cause === 'pagehide') win.dispatchEvent(new win.Event('pagehide'));
        assert.equal(api.status().active, null);
        assert.equal(
          api.report().captures.at(-1).reason,
          ['hidden', 'pagehide'].includes(cause) ? 'hidden' : 'context-changed'
        );
        assert.equal(timers.size, 0);
        assert.equal(engine.frame, null);
        win.document.hidden = false;
        win.innerWidth = 1000;
      }
      settingsStore.update({ effects: 'full' });
      win.document.hidden = true;
      assert.throws(() => api.start({ label: 'hidden', refreshHz: 60 }), /visible game/);
      win.document.hidden = false;
    }
  );

  await check(
    'menu import timings preserve success and errors; completed timers detach frame capture',
    async () => {
      api.reset();
      clock(300);
      assert.equal(
        await bridge.loadMenu('Settings', async () => {
          clock(340);
          return 42;
        }),
        42
      );
      await assert.rejects(
        bridge.loadMenu('Profile', async () => {
          clock(350);
          throw new Error('chunk failed');
        }),
        /chunk failed/
      );
      assert.deepEqual(
        api.report().startup.menuLoads.map(({ page, durationMs, outcome }) => ({
          page,
          durationMs,
          outcome
        })),
        [
          { page: 'Settings', durationMs: 40, outcome: 'loaded' },
          { page: 'Profile', durationMs: 10, outcome: 'failed' }
        ]
      );
      api.start({ label: 'timer', refreshHz: 120, seconds: 1 });
      engine.sample(360);
      clock(1350);
      [...timers.values()][0]();
      assert.equal(api.report().captures[0].reason, 'duration');
      assert.equal(engine.frame, null);
      assert.equal(timers.size, 0);
    }
  );

  await check(
    'attempts keep start labels/builds, include quits once and return immutable snapshots without private data',
    async () => {
      api.reset();
      profileStore.setIdentity('KEEP_PRIVATE', 'ring');
      api.configure({
        participantCode: 'N01',
        skillGroup: 'new',
        input: 'keyboard',
        build: 'review-build',
        password: 'KEEP_PRIVATE'
      });
      engine.begin();
      const open = api.report();
      settingsStore.update({ canvasQuality: 'low' });
      api.configure({ skillGroup: 'experienced' });
      engine.finish();
      for (const listener of listeners) listener();
      assert.equal(
        open.attempts[0].outcome,
        'open',
        'earlier reports cannot change with later events'
      );
      let report = api.report();
      assert.equal(report.attempts.length, 1);
      assert.equal(report.attempts[0].outcome, 'won');
      assert.equal(report.attempts[0].session.skillGroup, 'new');
      assert.equal(report.attempts[0].contextAtStart.quality, 'high');
      engine.begin();
      engine.quit();
      engine.quit();
      report = api.report();
      assert.equal(report.attempts.length, 2);
      assert.equal(report.attempts[1].outcome, 'abandoned');
      assert.equal(report.attempts[1].seconds, 45);
      assert.ok(!api.json().includes('KEEP_PRIVATE'));
      assert.ok(!api.json().includes(profileStore.getSnapshot().id));
      engine.finish(false);
      assert.equal(
        api.report().attempts.at(-1).partial,
        true,
        'a result without a captured start is marked partial'
      );
    }
  );

  await check(
    'bounded records still finalize the last attempt and reset never reuses record identifiers',
    async () => {
      api.reset();
      for (let i = 0; i < 200; i++) {
        engine.begin();
        engine.finish();
      }
      const before = api.report();
      assert.equal(before.attempts.length, 200);
      assert.equal(before.attempts[199].outcome, 'won');
      engine.begin();
      engine.finish();
      assert.equal(api.report().attempts.length, 200);
      api.reset();
      engine.begin();
      engine.finish();
      assert.ok(api.report().attempts[0].id > before.attempts[199].id);
      for (let i = 0; i < 12; i++) {
        clock(2000 + i);
        api.start({ label: 'bound', refreshHz: 60 });
        api.stop();
      }
      assert.throws(() => api.start({ label: 'extra', refreshHz: 60 }), /Export and reset/);
      const last = api.report().captures.at(-1).id;
      api.reset();
      api.start({ label: 'fresh', refreshHz: 60 });
      api.stop();
      assert.ok(api.report().captures[0].id > last);
    }
  );

  await check(
    'engine replacement ends capture, marks an open trial interrupted and leaves no stale hooks',
    async () => {
      api.reset();
      clock(2500);
      engine.begin();
      api.start({ label: 'replacement', refreshHz: 60 });
      engine.sample(2501);
      bridge.experienceEngine(null);
      assert.equal(api.report().captures[0].reason, 'disposed');
      assert.equal(api.report().attempts[0].outcome, 'interrupted');
      assert.equal(engine.frame, null);
      assert.equal(engine.match, null);
      assert.equal(timers.size, 0);
      assert.equal(listeners.size, 0);
      bridge.experienceEngine(engine);
      assert.equal(listeners.size, 1);
    }
  );

  await check(
    'supported browser timings export safe fields and overlapping long tasks without account URLs',
    async () => {
      api.dispose();
      const observers = [];
      class Observer {
        static supportedEntryTypes = ['first-input', 'longtask'];
        pending = [];
        disconnected = false;
        constructor() {
          observers.push(this);
        }
        observe(options) {
          this.type = options.type;
          assert.equal(options.buffered, true);
        }
        takeRecords() {
          const pending = this.pending;
          this.pending = [];
          return pending;
        }
        disconnect() {
          this.disconnected = true;
        }
      }
      replace('PerformanceObserver', Observer);
      entries.navigation = [
        {
          type: 'navigate',
          responseStart: 5,
          responseEnd: 10,
          domInteractive: 15,
          domContentLoadedEventEnd: 20,
          loadEventEnd: 0
        }
      ];
      entries.paint = [{ name: 'first-contentful-paint', startTime: 25 }];
      entries.resource = [
        { name: 'https://bball.test/assets/index-abc123.js?token=KEEP_PRIVATE', duration: 10 },
        { name: 'https://bball.test/v1/me?email=KEEP_PRIVATE', duration: 99 }
      ];
      api = install();
      clock(3000);
      api.start({ label: 'timings', refreshHz: 60 });
      engine.sample(3001);
      clock(3100);
      api.stop();
      observers[0].pending.push({
        entryType: 'first-input',
        name: 'pointerdown',
        startTime: 10,
        processingStart: 14,
        processingEnd: 18,
        target: 'KEEP_PRIVATE'
      });
      observers[1].pending.push(
        { entryType: 'longtask', startTime: 2990, duration: 70 },
        { entryType: 'longtask', startTime: 3200, duration: 70 }
      );
      const report = api.report();
      assert.deepEqual(report.firstInput, { event: 'pointerdown', delayMs: 4, processingMs: 4 });
      assert.equal(report.startup.navigation.loadEventEndMs, null);
      assert.equal(report.startup.firstContentfulPaintMs, 25);
      assert.deepEqual(report.startup.assets, [{ file: 'index-abc123.js', durationMs: 10 }]);
      assert.equal(report.captures[0].longTasks.length, 1);
      assert.ok(!api.json().includes('KEEP_PRIVATE'));
      api.dispose();
      assert.ok(observers.every((observer) => observer.disconnected));
      assert.equal(listeners.size, 0);
      assert.equal(engine.frame, null);
      assert.equal(engine.match, null);
      assert.equal(timers.size, 0);
      assert.throws(() => api.start({ label: 'disposed', refreshHz: 60 }), /not available/);
    }
  );

  await check(
    'refused timing observers clean up and remain unavailable without affecting the engine',
    async () => {
      let disconnected = 0;
      class RefusedObserver {
        static supportedEntryTypes = ['first-input', 'longtask'];
        observe() {
          throw new Error('unsupported');
        }
        disconnect() {
          disconnected++;
        }
      }
      replace('PerformanceObserver', RefusedObserver);
      api = install();
      assert.deepEqual(api.report().supported, { firstInput: false, longTasks: false });
      assert.equal(disconnected, 2);
      assert.equal(listeners.size, 1);
      api.dispose();
      assert.equal(listeners.size, 0);
    }
  );
});
console.log(
  `${checks} experience capture checks passed (substitute clocks/events; no physical performance measurements).`
);
