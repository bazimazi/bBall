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
  assert.deepEqual(errors, []);
  await writeFile('.temp/roadmap-layout/results.json', JSON.stringify({ checks, errors }, null, 2));
  console.log(`${checks.length} roadmap browser checks passed.`);
} finally {
  await browser?.close();
  await server.close();
}
