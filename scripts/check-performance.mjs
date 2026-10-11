import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

/* global window, CanvasRenderingContext2D */
// Controlled frame pressure verifies adaptation, not physical-device speed.
// This fixture is available only from this checker, never from a shipped build.
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0"><canvas></canvas>
<script type="module">
import { GameEngine } from '/src/game/engine.ts';
import { DEFAULT_SETTINGS } from '/src/core/settings/store.ts';
import { versusRules } from '/src/core/modes/rules.ts';
const canvas = document.querySelector('canvas');
const engine = new GameEngine(canvas);
let settings = { ...DEFAULT_SETTINGS, musicVolume: 0, sfxVolume: 0, haptics: false, autoServe: false };
engine.setPreferences(settings);
engine.start();
engine.play(versusRules());
window.performanceReview = {
  engine,
  set(patch) { settings = { ...settings, ...patch }; engine.setPreferences(settings); },
  drawCost() {
    const ctx = canvas.getContext('2d');
    const methods = ['stroke', 'fill', 'fillRect', 'strokeRect', 'drawImage'];
    const originals = methods.map(name => ctx[name]);
    let calls = 0;
    try {
      methods.forEach((name, i) => {
        ctx[name] = function (...args) { calls++; return originals[i].apply(this, args); };
      });
      engine.renderer.render(engine.world);
      return calls;
    } finally {
      methods.forEach((name, i) => { ctx[name] = originals[i]; });
    }
  },
  state() { return { snapshot: engine.getSnapshot(), width: canvas.width, height: canvas.height, paints: window.paints }; }
};
</script></body></html>`;

const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, open: false, hmr: false },
  plugins: [
    {
      name: 'performance-fixture',
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url !== '/__performance-review') return next();
          res.setHeader('Content-Type', 'text/html');
          res.end(await vite.transformIndexHtml(req.url, fixture));
        });
      }
    }
  ]
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 844, height: 390 }
  ]) {
    const page = await browser.newPage({
      viewport,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.paints = 0;
      const fillRect = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function (...args) {
        window.paints++;
        return fillRect.apply(this, args);
      };
      window.framePressure = true;
      const request = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) =>
        request((now) => {
          // Deliberately consume CPU without substituting the browser's timestamps.
          if (window.framePressure) {
            const start = performance.now();
            while (performance.now() - start < 26) {
              /* controlled load */
            }
          }
          callback(now);
        });
    });
    await page.goto(new URL('/__performance-review', server.resolvedUrls.local[0]).href);
    await page.waitForFunction(() => !!window.performanceReview);
    await page.waitForFunction(
      () => {
        const state = window.performanceReview.state();
        return state.width === window.innerWidth && state.height === window.innerHeight;
      },
      null,
      { timeout: 15_000 }
    );
    const state = () => page.evaluate(() => window.performanceReview.state());
    const low = await state();
    assert.equal(low.snapshot.status, 'serve');
    assert.ok(low.paints > 0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    assert.equal(
      (await state()).width,
      low.width,
      'system motion preferences must not affect density'
    );
    await page.evaluate(() => window.performanceReview.engine.pause());
    await page.waitForTimeout(150);
    const paused = await state();
    await page.waitForTimeout(250);
    assert.deepEqual(await state(), paused, 'a paused court must stop painting');
    await page.evaluate(() => window.performanceReview.set({ canvasQuality: 'high' }));
    await page.waitForTimeout(150);
    const high = await state();
    assert.equal(high.width, Math.round(viewport.width * 2.5));
    assert.ok(high.paints > paused.paints, 'quality changes must repaint a paused court');
    await page.waitForTimeout(200);
    assert.deepEqual(await state(), high);
    const costs = await page.evaluate(() => {
      const result = {};
      for (const graphicsIntensity of ['high', 'balanced', 'low']) {
        window.performanceReview.set({ graphicsIntensity });
        result[graphicsIntensity] = window.performanceReview.drawCost();
      }
      return result;
    });
    assert.ok(costs.balanced < costs.high, 'Balanced must submit fewer decorative drawing calls');
    assert.ok(costs.low < costs.balanced, 'Low must submit fewer drawing calls than Balanced');
    await page.evaluate(() => {
      window.performanceReview.set({ effects: 'calm' });
      window.performanceReview.engine.quitToMenu();
    });
    await page.waitForTimeout(150);
    const calm = await state();
    await page.waitForTimeout(200);
    assert.deepEqual(await state(), calm, 'Calm menu backdrop must stop painting');
    await page.evaluate(() =>
      window.performanceReview.set({ effects: 'full', graphicsIntensity: 'low' })
    );
    await page.waitForTimeout(150);
    const lowMenu = await state();
    await page.waitForTimeout(200);
    assert.deepEqual(
      await state(),
      lowMenu,
      'Low intensity must stop menu painting with Full effects'
    );
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.performanceReview.engine.stop());
    await page.close();
    console.log(
      `✓ ${viewport.width}×${viewport.height} at DPR 3: Auto under load, fixed High, graphics drawing budgets ${JSON.stringify(costs)}, paused/Calm/Low paint suppression and system-motion independence`
    );
  }
} finally {
  await browser?.close();
  await server.close();
}
