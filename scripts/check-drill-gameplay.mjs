import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

/* global window */
// Actual app navigation, pointer aiming and keyboard serving. The explicit
// diagnostics bridge only observes engine state; it never awards a point.
const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, open: false, hmr: false }
});
let browser;
const checks = [];
const errors = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({ viewport });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(new URL('/?experience=1', server.resolvedUrls.local[0]).href);
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.evaluate(async () => {
      const { watchExperienceEngine } = await import('/src/dev/experienceBridge.ts');
      watchExperienceEngine((engine) => {
        window.drillEngine = engine;
      });
      const { settingsStore } = await import('/src/core/settings/store.ts');
      settingsStore.update({ autoServe: false, resumeCountdown: false, replays: false });
    });
    const progression = await page.evaluate(async () => {
      const { profileStore } = await import('/src/core/profile/store.ts');
      const profile = profileStore.getSnapshot();
      return { xp: profile.xp, stats: profile.stats, talents: profile.talents, loot: profile.loot };
    });
    for (const [id, name] of [
      ['bank', 'Bank-shot drill'],
      ['gate', 'Gate-timing drill'],
      ['placement', 'Placement drill']
    ]) {
      await page.getByRole('button', { name: 'More modes', exact: true }).click();
      await page.getByRole('button', { name: /^Practice/ }).click();
      await page.getByRole('button', { name: /^Technique drills/ }).click();
      await page.getByRole('button', { name, exact: true }).click();
      await page.waitForFunction(() => window.drillEngine?.world.rules.technique);
      for (let point = 0; point < 3; point++) {
        await page.waitForFunction(() => window.drillEngine.world.match.status === 'serve');
        if (id === 'gate') {
          const opening = await page.evaluate(async () => {
            const world = window.drillEngine.world;
            const { gateOpening } = await import('/src/game/course.ts');
            return {
              time: world.arena.time,
              opening: gateOpening(world.arena.spec.gates[0], world.arena.time)
            };
          });
          await page.waitForTimeout(250);
          const held = await page.evaluate(async () => {
            const world = window.drillEngine.world;
            const { gateOpening } = await import('/src/game/course.ts');
            return {
              time: world.arena.time,
              opening: gateOpening(world.arena.spec.gates[0], world.arena.time)
            };
          });
          assert.equal(opening.time, 0, 'each gate feed must preview its launch phase immediately');
          assert.deepEqual(
            held,
            opening,
            'the visible gate opening must stay fixed while preparing the feed'
          );
        }
        const aim = await page.evaluate(
          async ({ id, point }) => {
            const { createWorld, placePaddles } = await import('/src/game/world.ts');
            const { techniqueRules } = await import('/src/core/modes/drills.ts');
            const { startMatch, launchBall } = await import('/src/game/match.ts');
            const { step } = await import('/src/game/simulation.ts');
            const { FIXED_DT, FIELD_H } = await import('/src/game/constants.ts');
            const { toScreenX, toScreenY } = await import('/src/game/view.ts');
            const actual = window.drillEngine.world;
            const audio = new Proxy({}, { get: () => () => 0 });
            for (let offset = -0.9; offset < 0.91; offset += 0.025) {
              const probe = createWorld(audio, 1);
              probe.view.w = actual.view.w;
              placePaddles(probe);
              startMatch(probe, techniqueRules(id));
              probe.match.points = point;
              probe.replays = false;
              probe.player.y = probe.player.target = FIELD_H / 2 + offset * probe.player.half;
              launchBall(probe);
              for (let i = 0; i < 6000 && probe.match.status === 'play'; i++) step(probe, FIXED_DT);
              if (probe.match.score.you > 0) {
                const y = FIELD_H / 2 + offset * actual.player.half;
                return {
                  x: toScreenX(actual.view, actual.player.x + 70, y),
                  y: toScreenY(actual.view, actual.player.x + 70, y),
                  fieldY: y
                };
              }
            }
            throw new Error('No achievable ' + id + ' shot at attempt ' + point);
          },
          { id, point }
        );
        await page.mouse.move(aim.x, aim.y);
        await page.waitForFunction(
          (y) => Math.abs(window.drillEngine.world.player.y - y) < 0.3,
          aim.fieldY
        );
        await page.keyboard.press('Enter');
        if (id === 'gate' && point === 0) {
          await page.waitForFunction(
            () =>
              window.drillEngine.world.match.status === 'play' &&
              window.drillEngine.world.arena.time > 0
          );
          assert.ok(
            await page.evaluate(() => window.drillEngine.world.arena.time > 0),
            'the gate must start moving with the live feed'
          );
        }
        await page.waitForFunction(
          (point) => window.drillEngine.world.match.score.you === point + 1,
          point,
          { timeout: 15000 }
        );
        const score = await page.evaluate(() => ({ ...window.drillEngine.world.match.score }));
        assert.equal(score.bot, 0, `${id} must award the aimed target, without an extra miss`);
      }
      await page.getByRole('heading', { name: 'Drill complete', exact: true }).waitFor();
      checks.push({ viewport, id, outcome: '3 real aimed targets' });
      await page.getByRole('button', { name: 'Practise again', exact: true }).click();
      for (let miss = 0; miss < 3; miss++) {
        await page.waitForFunction(() => window.drillEngine.world.match.status === 'serve');
        const aim = await page.evaluate(async () => {
          const { toScreenX, toScreenY } = await import('/src/game/view.ts');
          const { view, player } = window.drillEngine.world;
          return { x: toScreenX(view, player.x + 70, 80), y: toScreenY(view, player.x + 70, 80) };
        });
        await page.mouse.move(aim.x, aim.y);
        await page.waitForFunction(() => window.drillEngine.world.player.y < 90);
        await page.keyboard.press('Enter');
        await page.waitForFunction(
          (miss) => window.drillEngine.world.match.score.bot === miss + 1,
          miss
        );
      }
      await page.getByRole('heading', { name: 'Keep practising', exact: true }).waitFor();
      checks.push({ viewport, id, outcome: '3 real missed feeds, clean replay' });
      await page.getByRole('button', { name: 'Practice', exact: true }).click();
      await page.getByRole('button', { name: 'Back', exact: true }).click();
    }
    assert.deepEqual(
      await page.evaluate(async () => {
        const { profileStore } = await import('/src/core/profile/store.ts');
        const profile = profileStore.getSnapshot();
        return {
          xp: profile.xp,
          stats: profile.stats,
          talents: profile.talents,
          loot: profile.loot
        };
      }),
      progression,
      'Technique matches must not change progression'
    );
    await page.close();
    console.log(
      `${viewport.width}×${viewport.height}: all three drills completed and replayed with real input`
    );
  }
  assert.deepEqual(errors, []);
  await mkdir('.temp/drill-gameplay', { recursive: true });
  await writeFile('.temp/drill-gameplay/results.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(`${checks.length} real drill gameplay checks passed.`);
} finally {
  await browser?.close();
  await server.close();
}
