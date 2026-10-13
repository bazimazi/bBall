import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fixture } from './layout-fixture.mjs';

/* global window, document, innerWidth */
const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, open: false, hmr: false },
  plugins: [
    {
      name: 'roadmap-fixture',
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url !== '/__roadmap') return next();
          res.setHeader('Content-Type', 'text/html');
          res.end(await vite.transformIndexHtml('/__roadmap', fixture));
        });
      }
    }
  ]
});
let browser;
const checks = [];
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(new URL('/__roadmap', server.resolvedUrls.local[0]).href);
  await page.waitForFunction(() => window.layoutReview);
  await mkdir('.temp/roadmap-layout', { recursive: true });
  for (const language of ['en', 'fa']) {
    await page.evaluate(async (language) => {
      const { settingsStore } = await import('/src/core/settings/store.ts');
      const { installLanguage } = await import('/src/core/i18n/index.ts');
      settingsStore.update({ language });
      installLanguage();
    }, language);
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
      [320, 568],
      [844, 390],
      [768, 1024]
    ]) {
      await page.setViewportSize({ width, height });
      for (const [name, state] of [
        ['routes', 'fresh'],
        ['shared', 'fresh'],
        ['practice', 'fresh'],
        ['run', 'active'],
        ['run', 'last-act'],
        ['result', 'run-loss'],
        ['result', 'shared'],
        ['match', 'boss'],
        ['match', 'shared']
      ]) {
        await page.evaluate(
          ([name, state]) => window.layoutReview.render(name, state),
          [name, state]
        );
        if (name === 'practice' || (name === 'result' && state !== 'shared')) {
          const label = language === 'en' ? 'Technique drills' : 'تمرین‌های مهارتی';
          await page.getByRole('button', { name: new RegExp('^' + label) }).click();
        }
        await page.waitForTimeout(name === 'result' ? 1500 : 350);
        const problems = await page.evaluate(() => {
          const errors = [];
          for (const el of document.querySelectorAll('button,input,textarea')) {
            if (!el.getClientRects().length || el.closest('[inert],[aria-hidden="true"]')) continue;
            const r = el.getBoundingClientRect();
            if (r.left < -1 || r.right > innerWidth + 1)
              errors.push('clipped: ' + el.textContent.slice(0, 60));
            if (r.height < 41) errors.push('small: ' + el.textContent.slice(0, 60));
          }
          return errors;
        });
        assert.deepEqual(problems, [], `${language}/${width}/${name}/${state}`);
        if (name === 'shared') {
          const input = page.locator('input');
          await input.fill('BAD');
          const start = page.getByRole('button', {
            name: language === 'en' ? 'Start shared challenge' : 'شروع چالش مشترک',
            exact: true
          });
          assert.equal(await start.isDisabled(), true);
          await input.fill('BB1-ROADMAP');
          assert.equal(await start.isEnabled(), true);
          await start.click();
          assert.deepEqual(await page.evaluate(() => window.layoutReview.actions.at(-1)), [
            'BB1-ROADMAP'
          ]);
        }
        if (
          width === 390 &&
          ['routes', 'shared', 'practice', 'run'].includes(name) &&
          state !== 'last-act'
        )
          await page.screenshot({ path: `.temp/roadmap-layout/${language}-${name}.png` });
        checks.push({ language, width, height, name, state });
      }
    }
    console.log(`${language}: 45 roadmap layouts and shared-code controls passed`);
  }
  await page.evaluate(async () => {
    const { settingsStore } = await import('/src/core/settings/store.ts');
    settingsStore.update({ language: 'en' });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.getByRole('button', { name: 'More modes', exact: true }).click();
  await page.getByRole('button', { name: /^Shared rally challenge/ }).click();
  await page.getByRole('textbox', { name: 'Challenge code', exact: true }).fill('BB1-LIVE');
  await page.getByRole('button', { name: 'Start shared challenge', exact: true }).click();
  await page
    .getByText(/0\/30 returns/)
    .first()
    .waitFor();
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.getByRole('button', { name: 'Quit to menu', exact: true }).click();
  await page.getByRole('button', { name: 'More modes', exact: true }).click();
  await page.getByRole('button', { name: /^Short sessions/ }).click();
  await page.getByRole('button', { name: 'Start route', exact: true }).first().click();
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.getByRole('button', { name: 'Quit to menu', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'More modes', exact: true }).click();
  await page.getByRole('button', { name: /^Short sessions/ }).click();
  const cursor = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((key) => key.startsWith('bball.routes.'));
    return key ? JSON.parse(localStorage.getItem(key)).data : null;
  });
  assert.equal(cursor[0].id, 'placement');
  assert.equal(cursor[0].step, 0, 'quitting an unfinished route cannot skip the step');
  console.log(
    'Real app: shared challenge launch, live target HUD, pause/quit and route reload passed'
  );
  // These are the actual Short sessions, including the portrait input lane.
  // A button can fit the viewport while covering the paddle the player is aiming.
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [320, 568],
    [844, 390],
    [768, 1024]
  ]) {
    for (const language of ['en', 'fa']) {
      for (let route = 0; route < 3; route++) {
        const drillPage = await browser.newPage({ viewport: { width, height } });
        drillPage.on('pageerror', (error) => errors.push(error.message));
        await drillPage.goto(new URL('/?experience=1', server.resolvedUrls.local[0]).href);
        await drillPage.getByRole('button', { name: 'Skip', exact: true }).click();
        await drillPage.evaluate(async () => {
          const { settingsStore } = await import('/src/core/settings/store.ts');
          settingsStore.update({ autoServe: false, resumeCountdown: false, replays: false });
          const { watchExperienceEngine } = await import('/src/dev/experienceBridge.ts');
          watchExperienceEngine((engine) => {
            window.drillEngine = engine;
          });
        });
        await drillPage.getByRole('button', { name: 'More modes', exact: true }).click();
        await drillPage.getByRole('button', { name: /^Short sessions/ }).click();
        await drillPage
          .getByRole('button', { name: 'Start route', exact: true })
          .nth(route)
          .click();
        await drillPage.waitForFunction(() => window.drillEngine?.world.rules.technique);
        const labels = await drillPage.evaluate(async (language) => {
          const { settingsStore } = await import('/src/core/settings/store.ts');
          const { installLanguage, t } = await import('/src/core/i18n/index.ts');
          settingsStore.update({ language });
          installLanguage();
          return { misses: t('Misses'), goal: t('Solo drill · 3 targets before 3 misses') };
        }, language);
        const feed = drillPage.locator('button[data-technique="true"]');
        await feed.waitFor();
        assert.equal(await drillPage.getByText(labels.goal, { exact: true }).isVisible(), true);
        assert.equal(
          await drillPage
            .getByText(labels.misses, { exact: true })
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
          true,
          'Misses label must remain fully visible'
        );
        const layout = await drillPage.evaluate(async () => {
          const { toScreenX, toScreenY } = await import('/src/game/view.ts');
          const { BALL_R, FIELD_H, PADDLE_W } = await import('/src/game/constants.ts');
          const { techniqueGoalX } = await import('/src/game/technique.ts');
          const { techniqueTarget } = await import('/src/core/modes/drills.ts');
          const { view, player, ball, rules, match } = window.drillEngine.world;
          const box = (x0, y0, x1, y1) => {
            const xs = [toScreenX(view, x0, y0), toScreenX(view, x1, y1)];
            const ys = [toScreenY(view, x0, y0), toScreenY(view, x1, y1)];
            return {
              left: Math.min(...xs) - 4,
              right: Math.max(...xs) + 4,
              top: Math.min(...ys) - 4,
              bottom: Math.max(...ys) + 4
            };
          };
          const [low, high] = techniqueTarget(rules.technique, match.points);
          const goal = techniqueGoalX(view.w);
          const button = document
            .querySelector('button[data-technique="true"]')
            .getBoundingClientRect();
          const hud = document.querySelector('div[data-technique="true"]').getBoundingClientRect();
          const icons = document
            .querySelector('button[aria-label]')
            ?.parentElement.getBoundingClientRect();
          const regions = {
            playerLane: box(player.x - PADDLE_W / 2 - 16, 0, player.x + PADDLE_W / 2 + 16, FIELD_H),
            centreBall: box(
              ball.x - BALL_R - 10,
              ball.y - BALL_R - 10,
              ball.x + BALL_R + 10,
              ball.y + BALL_R + 10
            ),
            target: box(goal - 24, low * FIELD_H, goal + 3, high * FIELD_H),
            scores: { left: hud.left, right: hud.right, top: hud.top, bottom: hud.bottom },
            icons: { left: icons.left, right: icons.right, top: icons.top, bottom: icons.bottom }
          };
          if (rules.technique === 'placement') {
            const [nextLow, nextHigh] = techniqueTarget(rules.technique, match.points + 1);
            regions.nextTarget = box(goal - 24, nextLow * FIELD_H, goal + 3, nextHigh * FIELD_H);
          }
          const overlaps = Object.entries(regions)
            .filter(
              ([, r]) =>
                button.left < r.right &&
                button.right > r.left &&
                button.top < r.bottom &&
                button.bottom > r.top
            )
            .map(([name]) => name);
          const lane = regions.playerLane;
          const hudOverlapsPlayer =
            hud.left < lane.right &&
            hud.right > lane.left &&
            hud.top < lane.bottom &&
            hud.bottom > lane.top;
          return {
            overlaps,
            hudOverlapsPlayer,
            button: { x: button.x, y: button.y, width: button.width, height: button.height },
            centred: ball.x === view.w / 2 && ball.y === FIELD_H / 2
          };
        });
        assert.deepEqual(
          layout.overlaps,
          [],
          `${language}/${width}/route${route}: feed must leave the court controls clear`
        );
        assert.ok(layout.centred);
        assert.equal(
          layout.hudOverlapsPlayer,
          false,
          'solo HUD must leave the entire paddle lane clear'
        );
        assert.ok(layout.button.height >= 44 && layout.button.width >= 44);
        assert.ok(layout.button.x >= 0 && layout.button.x + layout.button.width <= width);
        assert.ok(layout.button.y >= 0 && layout.button.y + layout.button.height <= height);
        if (width === 390) {
          await drillPage.screenshot({
            path: `.temp/roadmap-layout/${language}-drill-${route}.png`
          });
        }
        checks.push({ language, width, height, name: 'live-short-session', route, layout });
        await drillPage.close();
      }
    }
  }
  console.log(
    '30 real Short sessions layouts keep feed controls clear of paddles, balls, targets and HUD'
  );
  assert.deepEqual(errors, []);
  await writeFile('.temp/roadmap-layout/results.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(`${checks.length} roadmap browser checks passed.`);
} finally {
  await browser?.close();
  await server.close();
}
