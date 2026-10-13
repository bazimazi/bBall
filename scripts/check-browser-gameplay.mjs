import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

/* global window, PointerEvent, requestAnimationFrame, cancelAnimationFrame */

// The capture exists only in this checker's Vite server. Production has no test API.
// UI smoke tests use real pointer/keyboard input. Longer matches use an AI input
// driver and accelerated engine frames, retaining real physics, result publishing
// and React/progression integration. Scores/results are never injected.
const server = await createServer({
  logLevel: 'error',
  cacheDir: '.temp/vite-browser-gameplay',
  server: { host: '127.0.0.1', port: 0, open: false, hmr: false },
  plugins: [
    {
      name: 'browser-gameplay-observer',
      enforce: 'pre',
      transform(source, id) {
        if (id.replaceAll('\\', '/').endsWith('/src/game/engine.ts'))
          return source.replace(
            'start(): () => void {',
            'start(): () => void { globalThis.__browserEngine = this;'
          );
        if (id.replaceAll('\\', '/').endsWith('/src/ui/App.tsx'))
          return source.replace(
            'const flow = useGameFlow(engine, snapshot);',
            'const flow = useGameFlow(engine, snapshot); globalThis.__browserFlow = flow;'
          );
      }
    }
  ]
});
const checks = [];
const errors = [];
let browser;
let page;
async function check(name, run) {
  if (process.env.GAMEPLAY_FILTER && !new RegExp(process.env.GAMEPLAY_FILTER).test(name)) return;
  await run();
  checks.push({ name, passed: true });
  console.log(`PASS ${name}`);
}
async function command(method, ...args) {
  await page.evaluate(([method, args]) => window.__browserFlow[method](...args), [method, args]);
  await page.waitForFunction(() =>
    ['serve', 'play'].includes(window.__browserEngine.getSnapshot().status)
  );
}
async function info() {
  return page.evaluate(() => {
    const e = window.__browserEngine;
    return {
      snapshot: e.getSnapshot(),
      rules: e.world.rules,
      player: e.world.player,
      bot: e.world.bot,
      field: e.world.view,
      loadout: e.world.loadout,
      clock: { elapsed: e.world.match.elapsed, serveTimer: e.world.match.serveTimer },
      screen: window.__browserFlow.screen,
      route: window.__browserFlow.routeResult
    };
  });
}
async function complete(pilot = 'miss', limit = 1200) {
  const result = await page.evaluate(
    async ([pilot, limit]) => {
      const e = window.__browserEngine;
      const { driveAi } = await import('/src/game/ai.ts');
      const { createBrain } = await import('/src/game/world.ts');
      const { botProfile } = await import('/src/core/bots/levels.ts');
      const brain = createBrain(botProfile(pilot === 'expert' ? 'legend' : 'pro'));
      const render = e.renderer.render;
      e.renderer.render = () => {};
      cancelAnimationFrame(e.frameHandle);
      let frames = 0;
      try {
        while (!e.getSnapshot().result && frames < limit * 60) {
          const w = e.world;
          if (w.match.status === 'play' || w.match.status === 'serve') {
            if (pilot === 'miss') w.player.target = w.ball.y < 300 ? 580 : 20;
            else {
              const y = w.player.y;
              driveAi(w, w.player, brain, 1 / 60);
              w.player.y = y;
            }
            if (w.rules.versus) w.bot.target = pilot === 'miss' ? w.ball.y : 300;
          }
          e.frame(e.lastTime + 1000 / 60);
          cancelAnimationFrame(e.frameHandle);
          frames++;
          if (
            ![w.ball.x, w.ball.y, w.ball.vx, w.ball.vy, w.player.y, w.bot.y].every(Number.isFinite)
          )
            throw new Error('Non-finite gameplay state');
          if (frames % 600 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
        return { result: e.getSnapshot().result, frames, snapshot: e.getSnapshot() };
      } finally {
        e.renderer.render = render;
        e.lastTime = performance.now();
        e.frameHandle = requestAnimationFrame(e.frame);
      }
    },
    [pilot, limit]
  );
  assert.ok(
    result.result,
    `Match did not end within ${limit}s: ${JSON.stringify(result.snapshot)}`
  );
  await page.waitForFunction(() => window.__browserFlow.screen === 'result');
  await page.locator('section [data-screen-heading]').waitFor();
  assert.equal(result.result.abandoned, false);
  return result.result;
}
async function home() {
  await page.evaluate(() => window.__browserFlow.leaveResult('home'));
  await page.getByRole('button', { name: 'More modes', exact: true }).waitFor();
}
async function pauseResume() {
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  const before = await info();
  await page.waitForTimeout(150);
  const after = await info();
  assert.equal(after.snapshot.status, 'paused');
  assert.equal(before.player.y, after.player.y);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.waitForFunction(() =>
    ['serve', 'play'].includes(window.__browserEngine.getSnapshot().status)
  );
}
try {
  await mkdir('.temp/browser-gameplay', { recursive: true });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(12_000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/v1/auth/oauth/providers', (route) =>
    route.fulfill({ json: { providers: [] } })
  );
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.waitForFunction(() => window.__browserEngine && window.__browserFlow);

  await check(
    'Quick Match: UI launch, pointer, keyboard, pause/resume, loss and retry',
    async () => {
      await page.getByRole('button', { name: 'More modes', exact: true }).click();
      await page.getByRole('button', { name: /^Quick Match/ }).click();
      await page.getByRole('button', { name: /^Rookie/ }).click();
      await page.getByRole('button', { name: 'Pause game', exact: true }).waitFor();
      const field = (await info()).field;
      const sx = field.cx + (100 - 300) * (field.rotated ? field.scale : 0);
      const sy = field.cy + (100 - 300) * (field.rotated ? 0 : field.scale);
      await page.mouse.move(sx, sy);
      await page.waitForTimeout(200);
      assert.ok(Math.abs((await info()).player.target - 100) < 2, 'pointer maps to field');
      await page.keyboard.down('ArrowDown');
      await page.waitForTimeout(150);
      await page.keyboard.up('ArrowDown');
      assert.ok((await info()).player.target > 100, 'keyboard moves paddle');
      await pauseResume();
      const result = await complete();
      assert.equal(result.mode, 'quick');
      await page.getByRole('button', { name: 'Play again', exact: true }).click();
      assert.equal((await info()).snapshot.scoreBot, 0);
      await complete();
      await home();
    }
  );

  for (const bot of ['rookie', 'amateur', 'pro', 'elite', 'legend'])
    await check(`Quick ${bot}: completed result and encounter rehearsal return`, async () => {
      await command('startQuick', bot);
      const original = await complete();
      const playedBuild = (await info()).loadout;
      await page.getByRole('button', { name: 'Start three-point practice', exact: true }).click();
      assert.equal((await info()).rules.ranked, false);
      assert.deepEqual((await info()).loadout, playedBuild, 'rehearsal retains completed build');
      await complete();
      await page.getByRole('button', { name: 'Back to result', exact: true }).click();
      const restored = await page.evaluate(() => window.__browserFlow.result);
      assert.deepEqual(restored, original);
      await home();
    });

  for (const contract of ['master', 'mythic'])
    await check(`Quick ${contract} contract: score, modifiers and result`, async () => {
      await command('startQuick', 'pro', { contract, arenaId: 'post', personality: 'banker' });
      assert.equal((await info()).rules.winScore, contract === 'master' ? 7 : 9);
      await complete();
      await home();
    });

  await check('Quick best-of-three: three completed games and series replay', async () => {
    await command('startQuick', 'rookie', { series: 3 });
    for (let game = 0; game < 2; game++) {
      await complete();
      const series = await page.evaluate(() => window.__browserFlow.series);
      assert.equal(series.games, game + 1);
      assert.equal(series.foe, game + 1);
      await page.getByRole('button', { name: game === 0 ? /^Game 2/ : /^New series/ }).click();
    }
    assert.equal((await page.evaluate(() => window.__browserFlow.series)).games, 0);
    await complete();
    await home();
  });

  for (const pace of ['normal', 'relaxed'])
    await check(`Practice ${pace}: pause, frame-step, restart and no rewards`, async () => {
      await page.evaluate(async (pace) => {
        const { settingsStore } = await import('/src/core/settings/store.ts');
        settingsStore.update({ practicePace: pace });
      }, pace);
      await command('startPractice', 'amateur', { arenaId: 'post' });
      const profile = await page.evaluate(async () =>
        (await import('/src/core/profile/store.ts')).profileStore.getSnapshot()
      );
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Pause game', exact: true }).click();
      const beforeStep = (await info()).clock;
      await page.getByRole('button', { name: 'Step 0.1 seconds', exact: true }).click();
      assert.equal((await info()).snapshot.status, 'paused');
      const afterStep = (await info()).clock;
      assert.ok(
        afterStep.elapsed > beforeStep.elapsed || afterStep.serveTimer < beforeStep.serveTimer,
        'Step advances the paused simulation'
      );
      await page.getByRole('button', { name: 'Restart', exact: true }).click();
      await complete();
      const after = await page.evaluate(async () =>
        (await import('/src/core/profile/store.ts')).profileStore.getSnapshot()
      );
      assert.equal(after.xp, profile.xp);
      assert.deepEqual(after.stats, profile.stats);
      await home();
    });

  for (const technique of ['bank', 'gate', 'placement'])
    await check(`Technique ${technique}: three misses, retry, no progression`, async () => {
      await command('startTechnique', technique);
      const result = await complete();
      assert.equal(result.technique, technique);
      assert.equal(result.scoreBot, 3);
      assert.equal(result.ranked, false);
      await page.getByRole('button', { name: 'Practise again', exact: true }).click();
      assert.equal((await info()).snapshot.scoreBot, 0);
      await complete();
      await page.getByRole('button', { name: 'Practice', exact: true }).click();
      await page.getByRole('heading', { name: 'Practice', exact: true }).waitFor();
      await home();
    });

  for (const day of ['2026-10-13', 'm2-2026-10-13', '2026-10-12'])
    await check(`Daily ${day}: completion, replay and practice restoration`, async () => {
      await command('startDaily', day);
      const result = await complete();
      assert.equal(result.mode, 'daily');
      await page.getByRole('button', { name: 'Start three-point practice', exact: true }).click();
      await pauseResume();
      await page.getByRole('button', { name: 'Pause game', exact: true }).click();
      await page.getByRole('button', { name: 'Back to result', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => window.__browserFlow.result), result);
      await home();
    });

  await check('Journey opening: natural win, stars, next-stage result action', async () => {
    await command('startStage', 'w1-1');
    const result = await complete('ai');
    assert.equal(result.mode, 'campaign');
    assert.equal(result.won, true);
    await page.getByRole('button', { name: /^Next ·/ }).click();
    assert.equal((await info()).rules.stageId, 'w1-2');
    await complete();
    await home();
  });

  const catalogue = await page.evaluate(async () => {
    const { BOSSES } = await import('/src/core/modes/bosses.ts');
    const { CHALLENGES } = await import('/src/core/modes/challenges.ts');
    const { ARENA_PRESETS } = await import('/src/core/modes/arenas.ts');
    return {
      bosses: BOSSES.map((b) => ({ id: b.spec.id, phases: b.spec.phases.length })),
      challenges: CHALLENGES.map((c) => c.id),
      courts: ARENA_PRESETS.map((c) => ({ id: c.id, arena: c.arena }))
    };
  });
  for (const court of catalogue.courts)
    await check(`Court ${court.id}: selected geometry and completed loss`, async () => {
      await command('startQuick', 'amateur', { arenaId: court.id });
      assert.deepEqual(
        (await info()).rules.modifiers.arena,
        court.arena,
        'selected court is applied'
      );
      await complete();
      await home();
    });
  for (const boss of catalogue.bosses)
    for (let bossPhase = 0; bossPhase <= boss.phases; bossPhase++)
      await check(
        `Boss drill ${boss.id} phase ${bossPhase}: selected rules and completed loss`,
        async () => {
          await command('startPractice', 'pro', { bossId: boss.id, bossPhase });
          const actual = (await info()).rules;
          const expected = await page.evaluate(
            async ({ bossId, bossPhase }) => {
              const { practiceRules } = await import('/src/core/modes/rules.ts');
              const { settingsStore } = await import('/src/core/settings/store.ts');
              return practiceRules('pro', settingsStore.getSnapshot().practicePace, {
                bossId,
                bossPhase
              });
            },
            { bossId: boss.id, bossPhase }
          );
          assert.equal(actual.boss.phases.length, 0);
          assert.deepEqual(actual.modifiers, expected.modifiers);
          assert.deepEqual(actual.bot, expected.bot);
          assert.equal(actual.practiceBallRank, expected.practiceBallRank);
          await complete();
          await home();
        }
      );

  for (const format of ['classic', 'marathon', 'ladder'])
    await check(`Tournament ${format}: real round result, loss and return`, async () => {
      await command('startCup', 0, format);
      const result = await complete();
      assert.equal(result.mode, 'tournament');
      await home();
      await page.evaluate(() => window.__browserFlow.abandonCup());
    });

  for (const format of ['sprint', 'expedition', 'endless'])
    await check(`Gauntlet ${format}: completion, heart loss and rematch state`, async () => {
      await command('startRun', 0, format);
      const before = await page.evaluate(
        async () =>
          (await import('/src/core/profile/store.ts')).profileStore.getSnapshot().progress.run
      );
      const result = await complete();
      assert.equal(result.mode, 'run');
      const after = await page.evaluate(
        async () =>
          (await import('/src/core/profile/store.ts')).profileStore.getSnapshot().progress.run
      );
      assert.equal(after.hearts, before.hearts - 1);
      await page.getByRole('button', { name: 'Rematch', exact: true }).click();
      await complete();
      await home();
      await page.evaluate(() => window.__browserFlow.abandonRun());
    });

  for (const id of [...catalogue.challenges, 'contract-1'])
    await check(`Challenge ${id}: completed loss and objective result`, async () => {
      await command('startChallenge', id);
      const result = await complete();
      assert.equal(result.mode, 'challenge');
      assert.equal(typeof result.objectiveMet, 'boolean');
      await home();
    });

  for (const waves of [false, true])
    await check(`Endless ${waves ? 'waves' : 'classic'}: life exhaustion and replay`, async () => {
      await command('pickMode', 'endless', { waves, arenaId: 'post' });
      const result = await complete();
      assert.equal(result.mode, 'endless');
      await page.getByRole('button', { name: 'Run again', exact: true }).click();
      assert.equal((await info()).snapshot.lives, (await info()).snapshot.maxLives);
      await complete();
      await home();
    });

  for (const duel of [undefined, 'speed', 'precision'])
    await check(
      `Versus ${duel ?? 'standard'}: both sides, mirrored court and results`,
      async () => {
        await command('pickMode', 'versus', { duel, mirror: true, arenaId: 'post', series: 3 });
        const state = await info();
        assert.equal(state.rules.versus, true);
        assert.equal(state.player.half, state.bot.half);
        const result = await complete();
        assert.equal(result.mode, 'versus');
        assert.equal(result.ranked, false);
        await home();
      }
    );

  for (const code of ['BB1-FRIENDS', 'BB1-ROADMAP'])
    await check(
      `Shared ${code}: neutral rules, life exhaustion, copy text and replay`,
      async () => {
        await command('startShared', code);
        const state = await info();
        assert.equal(state.rules.neutralBuild, true);
        assert.equal(state.snapshot.sharedReturns, 0);
        const result = await complete();
        assert.equal(result.sharedCode, code);
        assert.equal(result.ranked, false);
        assert.ok(await page.locator('textarea').inputValue());
        await page.getByRole('button', { name: 'Replay challenge', exact: true }).click();
        assert.equal((await info()).snapshot.sharedReturns, 0);
        await complete();
        await home();
      }
    );

  for (const route of ['placement', 'banks', 'timing'])
    await check(`Route ${route}: failed step, retry, saved cursor and reload`, async () => {
      await command('startRoute', route);
      await complete();
      const progress = (await info()).route;
      assert.equal(progress.step, 0);
      assert.equal(progress.attempts, 1);
      await page.getByRole('button', { name: 'Continue route', exact: true }).click();
      await complete();
      assert.equal((await info()).route.attempts, 2);
      await page.getByRole('button', { name: 'Short sessions', exact: true }).click();
      await page.reload();
      await page.waitForFunction(() => window.__browserEngine && window.__browserFlow);
      await page.getByRole('button', { name: 'More modes', exact: true }).click();
      await page.getByRole('button', { name: /^Short sessions/ }).click();
      await page
        .getByText(/0\/3 completed · 2 attempts · 0 route clears/)
        .first()
        .waitFor();
      const saved = await page.evaluate(async (id) => {
        const { loadRoutes } = await import('/src/core/modes/routes.ts');
        const { profileStore } = await import('/src/core/profile/store.ts');
        return loadRoutes(profileStore.getSnapshot().id).find((item) => item.id === id);
      }, route);
      assert.equal(saved.step, 0);
      assert.equal(saved.attempts, 2);
      await home();
    });

  await check(
    'Phone touch, relative drag, simultaneous Versus controls and orientation pause',
    async () => {
      await page.close();
      page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/v1/auth/oauth/providers', (route) =>
        route.fulfill({ json: { providers: [] } })
      );
      await page.goto(server.resolvedUrls.local[0]);
      await page.getByRole('button', { name: 'Skip', exact: true }).click();
      await page.evaluate(async () => {
        const { settingsStore } = await import('/src/core/settings/store.ts');
        settingsStore.update({ autoServe: false, resumeCountdown: false });
      });
      await command('startPractice', 'rookie');
      assert.equal((await info()).field.rotated, true);
      const aim = await page.evaluate(async () => {
        const { toScreenX, toScreenY } = await import('/src/game/view.ts');
        const w = window.__browserEngine.world;
        return {
          x: toScreenX(w.view, w.player.x + 70, 100),
          y: toScreenY(w.view, w.player.x + 70, 100)
        };
      });
      await page.touchscreen.tap(aim.x, aim.y);
      assert.ok(Math.abs((await info()).player.target - 100) < 2);
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(200);
      assert.equal((await info()).snapshot.status, 'paused');
      assert.equal((await info()).snapshot.pauseReason, 'resize');
      assert.equal((await info()).field.rotated, false);
      await page.getByRole('button', { name: 'Resume', exact: true }).click();
      await page.waitForFunction(() => window.__browserEngine.getSnapshot().status !== 'paused');
      await page.evaluate(async () => {
        const { settingsStore } = await import('/src/core/settings/store.ts');
        settingsStore.update({ touchMode: 'relative', touchSensitivity: 1.5 });
      });
      await page.waitForFunction(() => window.__browserEngine.preferences.touchMode === 'relative');
      await page.evaluate(async () => {
        const { toScreenX, toScreenY } = await import('/src/game/view.ts');
        const e = window.__browserEngine;
        const w = e.world;
        const startY = w.player.target;
        const dispatch = (type, y) =>
          e.canvas.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              pointerId: 71,
              pointerType: 'touch',
              button: 0,
              clientX: toScreenX(w.view, w.player.x + 70, y),
              clientY: toScreenY(w.view, w.player.x + 70, y)
            })
          );
        dispatch('pointerdown', 200);
        dispatch('pointermove', 240);
        if (Math.abs(w.player.target - (startY + 60)) > 2)
          throw new Error('Relative touch drag ignored sensitivity');
        dispatch('pointercancel', 240);
      });
      await home();
      await page.evaluate(async () =>
        (await import('/src/core/settings/store.ts')).settingsStore.update({ touchMode: 'direct' })
      );
      await command('pickMode', 'versus');
      await page.evaluate(async () => {
        const { toScreenX, toScreenY } = await import('/src/game/view.ts');
        const e = window.__browserEngine;
        const w = e.world;
        const send = (type, id, x, y) =>
          e.canvas.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              pointerId: id,
              pointerType: 'touch',
              button: 0,
              clientX: toScreenX(w.view, x, y),
              clientY: toScreenY(w.view, x, y)
            })
          );
        send('pointerdown', 81, w.player.x + 70, 100);
        send('pointerdown', 82, w.bot.x - 70, 450);
        send('pointermove', 81, w.player.x + 70, 160);
        send('pointermove', 82, w.bot.x - 70, 390);
        if (Math.abs(w.player.target - 160) > 2 || Math.abs(w.bot.target - 390) > 2)
          throw new Error('Simultaneous touch paddles did not remain independent');
        send('pointercancel', 81, w.player.x + 70, 160);
        send('pointercancel', 82, w.bot.x - 70, 390);
      });
      await page.screenshot({ path: '.temp/browser-gameplay/phone-versus.png' });
      await home();
    }
  );

  // Motion follows in-game settings even when Chromium emulates the OS preference.
  await check('System reduced-motion setting has no effect on game motion', async () => {
    const before = await page.evaluate(() => ({
      motion: window.__browserEngine.world.motion,
      camera: window.__browserEngine.world.camera
    }));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(100);
    assert.deepEqual(
      await page.evaluate(() => ({
        motion: window.__browserEngine.world.motion,
        camera: window.__browserEngine.world.camera
      })),
      before
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });
  assert.deepEqual(errors, []);
  console.log(`${checks.length} real-app gameplay flows passed`);
} catch (error) {
  checks.push({ name: 'failure', passed: false, error: error.stack });
  if (page) await page.screenshot({ path: '.temp/browser-gameplay/failure.png' });
  throw error;
} finally {
  await writeFile(
    '.temp/browser-gameplay/results.json',
    JSON.stringify(
      {
        checks,
        errors,
        methodology:
          'Actual Chromium app. UI input smoke tests use browser pointer/keyboard/touch; catalogue variants launch through internal flow commands. Catalogue runs intentionally lose, checking finite physics, canonical rules and result publishing, not every successful objective. Longer completions use automated paddle input and accelerated production engine frames with canvas drawing suspended. No scores/results are injected. Successful progression and genuine aimed shots have separate suites.'
      },
      null,
      2
    )
  );
  await browser?.close();
  await server.close();
}
