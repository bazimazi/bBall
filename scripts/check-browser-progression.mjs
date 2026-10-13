import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

/* global window, requestAnimationFrame, cancelAnimationFrame */

// Real app, rules, physics, result publication and persistence. This server-only
// observer exposes navigation for coverage; production has no automation API.
// A seeded level-100 guest with legal Control/Defense purchases avoids unlock grinding. Drills use actual pointer
// aim/Enter; longer encounters accelerate engine frames with an input pilot.
// No score, winner, result, lives or progression values are injected after boot.
const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, open: false, hmr: false },
  plugins: [
    {
      name: 'progression-flow-observer',
      enforce: 'pre',
      transform(source, id) {
        if (id.replaceAll('\\', '/').endsWith('/src/ui/App.tsx'))
          return source.replace(
            'const flow = useGameFlow(engine, snapshot);',
            'const flow = useGameFlow(engine, snapshot); globalThis.__progressionFlow = flow;'
          );
      }
    }
  ]
});
let browser, page;
const checks = [],
  errors = [];
const report = '.temp/browser-progression/results.json';

async function check(name, run) {
  await run();
  checks.push({ name, passed: true });
  console.log(`PASS ${name}`);
}
async function observe() {
  await page.evaluate(async () => {
    const { watchExperienceEngine } = await import('/src/dev/experienceBridge.ts');
    watchExperienceEngine((engine) => {
      window.__progressionEngine = engine;
    });
    const { settingsStore } = await import('/src/core/settings/store.ts');
    settingsStore.update({ resumeCountdown: false, replays: false });
  });
  await page.waitForFunction(() => window.__progressionEngine && window.__progressionFlow);
}
async function info() {
  return page.evaluate(() => {
    const engine = window.__progressionEngine,
      flow = window.__progressionFlow;
    return {
      snapshot: engine.getSnapshot(),
      rules: engine.world.rules,
      loadout: engine.world.loadout,
      field: engine.world.view,
      screen: flow.screen,
      route: flow.routeResult,
      practising: flow.practisingEncounter,
      result: flow.result
    };
  });
}
async function profile() {
  return page.evaluate(async () =>
    (await import('/src/core/profile/store.ts')).profileStore.getSnapshot()
  );
}
async function command(method, ...args) {
  await page.evaluate(
    ([method, args]) => window.__progressionFlow[method](...args),
    [method, args]
  );
  await page.waitForFunction(() =>
    ['serve', 'play'].includes(window.__progressionEngine.getSnapshot().status)
  );
}
async function home() {
  await page.evaluate(() => window.__progressionFlow.leaveResult('home'));
  await page.getByRole('button', { name: 'More modes', exact: true }).waitFor();
}
async function pump(pilot = 'expert', stop = 'result', limit = 1200) {
  const output = await page.evaluate(
    async ([pilot, stop, limit]) => {
      const engine = window.__progressionEngine;
      const { driveAi, predictY } = await import('/src/game/ai.ts');
      const { createBrain } = await import('/src/game/world.ts');
      const { botProfile } = await import('/src/core/bots/levels.ts');
      // A precise automation input pilot removes random human-like aiming
      // errors. The real player paddle still obeys its normal travel speed.
      const brain = createBrain({
        ...botProfile('legend'),
        reaction: 0.001,
        prediction: 1,
        aimError: 0,
        consistency: 1,
        deadzone: 0
      });
      const render = engine.renderer.render;
      engine.renderer.render = () => {};
      cancelAnimationFrame(engine.frameHandle);
      let frames = 0;
      try {
        while (frames < limit * 60) {
          const world = engine.world;
          if (stop === 'result' && engine.getSnapshot().result) break;
          if (stop === 'point' && world.match.status !== 'play') break;
          if (stop === 'wave' && world.match.waveDepth >= 1) break;
          if (['play', 'serve'].includes(world.match.status) && pilot) {
            if (pilot === 'rally') world.player.target = predictY(world, world.player.x);
            else {
              const y = world.player.y;
              driveAi(world, world.player, brain, 1 / 60);
              world.player.y = y;
            }
          }
          engine.frame(engine.lastTime + 1000 / 60);
          cancelAnimationFrame(engine.frameHandle);
          frames++;
          if (
            ![world.ball.x, world.ball.y, world.ball.vx, world.ball.vy, world.player.y].every(
              Number.isFinite
            )
          )
            throw new Error('Non-finite progression gameplay');
          if (frames % 600 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
        return { frames, snapshot: engine.getSnapshot(), waveDepth: engine.world.match.waveDepth };
      } finally {
        engine.renderer.render = render;
        engine.lastTime = performance.now();
        engine.frameHandle = requestAnimationFrame(engine.frame);
      }
    },
    [pilot, stop, limit]
  );
  if (stop === 'result') {
    assert.ok(
      output.snapshot.result,
      `No result after ${limit}s: ${JSON.stringify(output.snapshot)}`
    );
    await page.waitForFunction(() => window.__progressionFlow.screen === 'result');
  }
  return output;
}
async function win() {
  const output = await pump();
  assert.equal(output.snapshot.result.won, true, JSON.stringify(output.snapshot.result));
  return output.snapshot.result;
}
async function routeWin(step) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const output = await pump(attempt % 2 ? 'rally' : 'expert');
    if (output.snapshot.result.won) return output.snapshot.result;
    const failed = (await info()).route;
    assert.equal(failed.step, step, 'a real loss keeps the same route step');
    assert.equal(failed.attempts > 0, true);
    await page.getByRole('button', { name: 'Continue route', exact: true }).click();
  }
  throw new Error('Automation pilot could not clear route step ' + step + ' in five real attempts');
}
async function drill() {
  await page.evaluate(async () => {
    (await import('/src/core/settings/store.ts')).settingsStore.update({ autoServe: false });
  });
  for (let point = 0; point < 3; point++) {
    await page.waitForFunction(() => window.__progressionEngine.world.match.status === 'serve');
    const aim = await page.evaluate(async () => {
      const { createWorld, placePaddles } = await import('/src/game/world.ts');
      const { techniqueRules } = await import('/src/core/modes/drills.ts');
      const { startMatch, launchBall } = await import('/src/game/match.ts');
      const { step } = await import('/src/game/simulation.ts');
      const { FIXED_DT, FIELD_H } = await import('/src/game/constants.ts');
      const { toScreenX, toScreenY } = await import('/src/game/view.ts');
      const actual = window.__progressionEngine.world;
      for (let offset = -0.9; offset < 0.91; offset += 0.025) {
        const probe = createWorld(new Proxy({}, { get: () => () => 0 }), 1);
        probe.view.w = actual.view.w;
        placePaddles(probe);
        startMatch(probe, techniqueRules(actual.rules.technique));
        probe.match.points = actual.match.points;
        probe.replays = false;
        probe.player.y = probe.player.target = FIELD_H / 2 + offset * probe.player.half;
        launchBall(probe);
        for (let i = 0; i < 6000 && probe.match.status === 'play'; i++) step(probe, FIXED_DT);
        if (probe.match.score.you > 0) {
          const fieldY = FIELD_H / 2 + offset * actual.player.half;
          return {
            x: toScreenX(actual.view, actual.player.x + 70, fieldY),
            y: toScreenY(actual.view, actual.player.x + 70, fieldY),
            fieldY
          };
        }
      }
      throw new Error('No attainable ' + actual.rules.technique + ' shot');
    });
    await page.mouse.move(aim.x, aim.y);
    await page.waitForFunction(
      (y) => Math.abs(window.__progressionEngine.world.player.y - y) < 0.3,
      aim.fieldY
    );
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__progressionEngine.world.match.status === 'play');
    await pump(null, 'point', 60);
    const state = await info();
    assert.equal(state.snapshot.scoreYou, point + 1);
    assert.equal(state.snapshot.scoreBot, 0);
  }
  await pump(null);
  await page.getByRole('heading', { name: 'Drill complete', exact: true }).waitFor();
  await page.evaluate(async () => {
    (await import('/src/core/settings/store.ts')).settingsStore.update({ autoServe: true });
  });
}

try {
  await mkdir('.temp/browser-progression', { recursive: true });
  await server.listen();
  const [
    { createProfile },
    { xpToReach },
    { reconcile, buyTalent },
    { PROFILE_VERSION },
    { TALENTS }
  ] = await Promise.all(
    [
      '/src/core/profile/defaults.ts',
      '/src/core/progression/levels.ts',
      '/src/core/talents/save.ts',
      '/src/core/profile/schema.ts',
      '/src/core/talents/catalog.ts'
    ].map((path) => server.ssrLoadModule(path))
  );
  const guest = createProfile();
  guest.onboarded = true;
  guest.xp = xpToReach(100);
  guest.talents = reconcile(guest.talents, 100);
  for (let pass = 0; pass < 10; pass++)
    for (const talent of TALENTS.filter((talent) => ['control', 'defense'].includes(talent.branch)))
      guest.talents = buyTalent(guest.talents, 100, talent.id) ?? guest.talents;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/v1/**', (route) =>
    route.fulfill({ status: 503, json: { error: 'Local browser test' } })
  );
  await page.addInitScript(
    ({ version, guest }) => {
      if (!window.localStorage.getItem('bball.profile'))
        window.localStorage.setItem('bball.profile', JSON.stringify({ v: version, data: guest }));
    },
    { version: PROFILE_VERSION, guest }
  );
  await page.goto(new URL('/?experience=1', server.resolvedUrls.local[0]).href);
  await observe();

  for (const [id, title] of [
    ['placement', 'Find the corners'],
    ['banks', 'Learn the bank'],
    ['timing', 'Read the opening']
  ])
    await check(
      `Short session ${id}: real drill, wins, persisted resume, completion and replay`,
      async () => {
        await page.getByRole('button', { name: 'More modes', exact: true }).click();
        await page.getByRole('button', { name: /^Short sessions/ }).click();
        await page
          .getByRole('heading', { name: title, exact: true })
          .locator('..')
          .getByRole('button', { name: 'Start route', exact: true })
          .click();
        assert.equal(
          (await info()).rules.technique,
          id === 'banks' ? 'bank' : id === 'timing' ? 'gate' : 'placement'
        );
        await drill();
        assert.equal((await info()).route.step, 1);
        await page.getByRole('button', { name: 'Continue route', exact: true }).click();
        if (id === 'placement') {
          await page.getByRole('button', { name: 'Pause game', exact: true }).click();
          await page.reload();
          await observe();
          await page.getByRole('button', { name: 'More modes', exact: true }).click();
          await page.getByRole('button', { name: /^Short sessions/ }).click();
          await page.getByRole('button', { name: 'Resume route', exact: true }).click();
          assert.equal((await info()).rules.bot.id, 'amateur');
        }
        await routeWin(1);
        assert.equal((await info()).route.step, 2);
        const original = (await info()).result;
        if (id === 'placement') {
          const before = await profile();
          await page
            .getByRole('button', { name: 'Start three-point practice', exact: true })
            .click();
          await win();
          await page.getByRole('button', { name: 'Back to result', exact: true }).click();
          assert.deepEqual((await info()).result, original);
          assert.equal((await info()).route.step, 2);
          assert.deepEqual(await profile(), before);
        }
        await page.getByRole('button', { name: 'Continue route', exact: true }).click();
        await routeWin(2);
        assert.equal((await info()).route.step, 3);
        assert.equal((await info()).route.completions, 1);
        await page.getByRole('button', { name: 'Route complete', exact: true }).click();
        await page
          .getByRole('heading', { name: title, exact: true })
          .locator('..')
          .getByRole('button', { name: 'Replay route', exact: true })
          .click();
        await drill();
        assert.equal((await info()).route.replays, 1);
        assert.equal((await info()).route.completions, 1);
        await home();
      }
    );

  await check(
    'Gauntlet Sprint: real wins, draft pick, next act route preview and committed encounter',
    async () => {
      await command('startRun', 0, 'sprint');
      for (let stage = 0; stage < 3; stage++) {
        await win();
        assert.equal((await profile()).progress.run.stage, stage + 1);
        await page.getByRole('button', { name: 'Choose a boon', exact: true }).click();
        const offer = (await profile()).progress.run.offer;
        const boon = await page.evaluate(
          async (id) => (await import('/src/core/run/boons.ts')).boonById(id).name,
          offer[0]
        );
        await page
          .getByRole('button', {
            name: new RegExp('^' + boon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          })
          .click();
        assert.equal((await profile()).progress.run.offer, null);
        if (stage < 2) await page.getByRole('button', { name: /^(Play next match|Face )/ }).click();
      }
      const risk = page.getByRole('button', { name: /^Risk route/ });
      await risk.click();
      assert.equal(await risk.getAttribute('aria-pressed'), 'true');
      assert.equal((await profile()).progress.run.route, 'risk');
      const preview = await page.evaluate(async () => {
        const { profileStore } = await import('/src/core/profile/store.ts');
        const { routePreview } = await import('/src/core/run/routePreview.ts');
        return routePreview(profileStore.getSnapshot().progress.run, 'risk').encounters[0];
      });
      await page.getByRole('button', { name: /^(Play next match|Face )/ }).click();
      assert.equal((await info()).rules.bot.id, preview.bot);
      assert.equal((await info()).rules.boss?.id ?? null, preview.boss ?? null);
      assert.ok((await profile()).progress.run.attempt);
      await home();
      await page.evaluate(() => window.__progressionFlow.abandonRun());
    }
  );

  await check(
    'Classic Bronze tournament: three actual wins, next rounds, trophy and new cup',
    async () => {
      const before = await profile();
      await command('startCup', 0, 'classic');
      for (let round = 0; round < 3; round++) {
        const result = await win();
        assert.equal(result.tournamentRound, round);
        if (round < 2) {
          assert.equal((await profile()).tournament.round, round + 1);
          await page.getByRole('button', { name: 'Next round', exact: true }).click();
        }
      }
      await page.getByRole('heading', { name: 'Cup won', exact: true }).waitFor();
      const after = await profile();
      assert.equal(after.tournament, null);
      assert.equal(after.stats.cupsWon, before.stats.cupsWon + 1);
      assert.equal(after.lastTournament.champion, true);
      await page.getByRole('button', { name: 'Tournament', exact: true }).click();
      await page.getByRole('heading', { name: 'Tournament', exact: true }).waitFor();
      await home();
    }
  );

  await check(
    'Shared challenge: 30 genuine returns, target result and no progression',
    async () => {
      await command('startShared', 'BB1-FRIENDS');
      const before = await profile();
      const output = await pump('rally');
      assert.equal(output.snapshot.result.won, true);
      assert.equal(output.snapshot.result.hits, 30);
      await page.getByRole('heading', { name: 'Target reached', exact: true }).waitFor();
      assert.deepEqual(await profile(), before);
      assert.match(await page.locator('textarea').inputValue(), /30\/30 returns/);
      await home();
    }
  );

  await check(
    'Endless Waves: 12 real returns advance the first wave without losing a life',
    async () => {
      await command('pickMode', 'endless', { waves: true });
      const output = await pump('rally', 'wave');
      assert.equal(output.waveDepth, 1);
      assert.equal(output.snapshot.lives, 3);
      assert.match(output.snapshot.label, /Wave 2/);
      await page.getByRole('button', { name: 'Pause game', exact: true }).click();
      await page.getByRole('button', { name: 'Quit to menu', exact: true }).click();
    }
  );

  await check(
    'Encounter rehearsal: actual winning build survives level-up and same-account sync',
    async () => {
      await page.evaluate(async () => {
        const [{ profileStore }, { createProfile }, { xpToReach }, { reconcile }] =
          await Promise.all(
            [
              '/src/core/profile/store.ts',
              '/src/core/profile/defaults.ts',
              '/src/core/progression/levels.ts',
              '/src/core/talents/save.ts'
            ].map((path) => import(path))
          );
        const data = createProfile();
        data.xp = xpToReach(20) - 1;
        data.talents = reconcile(data.talents, 19);
        profileStore.signIn({
          ...data,
          userId: 'browser-flow-account',
          saveId: 'browser-flow-save',
          displayName: 'Browser player',
          version: 1
        });
      });
      await command('startQuick', 'rookie');
      const played = (await info()).loadout;
      await win();
      assert.equal(played.level, 19);
      const level = await page.evaluate(async () => {
        const { profileStore } = await import('/src/core/profile/store.ts');
        return (await import('/src/core/progression/levels.ts')).levelOf(
          profileStore.getSnapshot().xp
        );
      });
      assert.equal(level, 20);
      const original = (await info()).result;
      await page.getByRole('button', { name: 'Start three-point practice', exact: true }).click();
      assert.deepEqual((await info()).loadout, played);
      await page.evaluate(async () => {
        const [{ profileStore }, { xpToReach }] = await Promise.all([
          import('/src/core/profile/store.ts'),
          import('/src/core/progression/levels.ts')
        ]);
        const profile = profileStore.getSnapshot();
        profileStore.applyCloud({
          ...profile,
          xp: xpToReach(30),
          userId: 'browser-flow-account',
          saveId: 'browser-flow-save',
          displayName: profile.name,
          version: 2
        });
      });
      assert.equal((await info()).practising, true);
      assert.deepEqual((await info()).loadout, played);
      await page.getByRole('button', { name: 'Pause game', exact: true }).click();
      await page.getByRole('button', { name: 'Back to result', exact: true }).click();
      assert.deepEqual((await info()).result, original);
      await page.getByRole('button', { name: 'Start three-point practice', exact: true }).click();
      assert.deepEqual((await info()).loadout, played);
      await home();
    }
  );

  await check(
    'Profile switch cancels the old ranked court and rehearsal without transferring rewards',
    async () => {
      await command('startQuick', 'rookie');
      await page.evaluate(async () => {
        const [{ profileStore }, { createProfile }] = await Promise.all([
          import('/src/core/profile/store.ts'),
          import('/src/core/profile/defaults.ts')
        ]);
        const profile = createProfile();
        profileStore.signIn({
          ...profile,
          userId: 'browser-other-account',
          saveId: 'browser-other-save',
          displayName: 'Other player',
          version: 1
        });
      });
      await page.getByRole('button', { name: 'More modes', exact: true }).waitFor();
      assert.equal((await info()).snapshot.status, 'menu');
      assert.equal((await info()).result, null);
      assert.equal((await profile()).stats.matches, 0);
      assert.equal((await profile()).xp, 0);
      await command('startQuick', 'rookie');
      await win();
      await page.getByRole('button', { name: 'Start three-point practice', exact: true }).click();
      await page.evaluate(async () =>
        (await import('/src/core/profile/store.ts')).profileStore.signOut()
      );
      await page.getByRole('button', { name: 'More modes', exact: true }).waitFor();
      assert.equal((await info()).practising, false);
      assert.equal((await info()).result, null);
      assert.equal((await profile()).id, guest.id);
    }
  );
  assert.deepEqual(errors, []);
  await writeFile(report, JSON.stringify({ checks, errors }, null, 2));
  console.log(`${checks.length} real browser progression checks passed.`);
} catch (error) {
  await page?.screenshot({ path: '.temp/browser-progression/failure.png' });
  await writeFile(report, JSON.stringify({ checks, errors, failure: error.message }, null, 2));
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
