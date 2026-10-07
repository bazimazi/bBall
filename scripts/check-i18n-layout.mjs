import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fixture } from './layout-fixture.mjs';

/* global document, window, innerWidth, getComputedStyle, CanvasRenderingContext2D, DOMMatrixReadOnly, requestAnimationFrame */
const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, open: false, hmr: false },
  plugins: [
    {
      name: 'i18n-layout',
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          if (request.url !== '/__i18n-layout') return next();
          response.setHeader('Content-Type', 'text/html');
          response.end(await vite.transformIndexHtml('/__i18n-layout', fixture));
        });
      }
    }
  ]
});
let browser;
const errors = [];
let checks = 0;
try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  });
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/v1/auth/oauth/providers', (route) =>
    route.fulfill({ json: { providers: [] } })
  );
  await page.goto(new URL('/__i18n-layout', server.resolvedUrls.local[0]).href);
  await page.waitForFunction(() => window.layoutReview);
  await page.evaluate(async () => {
    const { installLanguage } = await import('/src/core/i18n/index.ts');
    const { settingsStore } = await import('/src/core/settings/store.ts');
    installLanguage();
    settingsStore.update({ language: 'fa' });
  });
  await page.evaluate(async () => {
    for (const weight of [400, 700, 900]) {
      const fonts = await document.fonts.load(`${weight} 16px Vazirmatn`, 'فارسی');
      if (!fonts.length || !fonts.every((font) => font.status === 'loaded'))
        throw new Error(`Vazirmatn weight ${weight} failed to load`);
    }
  });
  const pages = [
    'home',
    'modes',
    'quick',
    'practice',
    'journey',
    'daily',
    'gauntlet',
    'challenge',
    'tournament',
    'profile',
    'account',
    'talents',
    'settings',
    'customize',
    'achievements',
    'help',
    'demo',
    'workshop',
    'result',
    'match'
  ];
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1280, 800]
  ]) {
    await page.setViewportSize({ width, height });
    for (const name of pages) {
      await page.evaluate((name) => window.layoutReview.render(name, 'fresh'), name);
      const problems = await page.evaluate(() => {
        const issues = [];
        if (document.documentElement.lang !== 'fa' || document.documentElement.dir !== 'rtl')
          issues.push('Missing Persian document direction');
        const sound = document.querySelector('button[aria-label="قطع صدا"]');
        if (sound && sound.getBoundingClientRect().left >= innerWidth / 2)
          issues.push('RTL sound control is not on the left');
        const matchInfo = document.querySelector('[class*="_info_"]');
        if (sound && matchInfo) {
          const a = sound.parentElement.getBoundingClientRect();
          const b = matchInfo.getBoundingClientRect();
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)
            issues.push('Match information overlaps sound/pause controls');
        }
        if (!getComputedStyle(document.body).fontFamily.includes('Vazirmatn'))
          issues.push('Persian menu font is not Vazirmatn');
        const back = document.querySelector('header button');
        if (sound && back) {
          const a = sound.getBoundingClientRect();
          const b = back.getBoundingClientRect();
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)
            issues.push('Back button overlaps sound control');
        }
        const heading = document.querySelector('header [data-screen-heading]');
        if (sound && heading) {
          const a = sound.getBoundingClientRect();
          const b = heading.getBoundingClientRect();
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)
            issues.push('Heading overlaps sound control');
        }
        for (const element of document.querySelectorAll('header, footer, [data-screen-heading]')) {
          let scroller = element.parentElement;
          while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowX))
            scroller = scroller.parentElement;
          if (scroller) continue;
          const bounds = element.getBoundingClientRect();
          if (bounds.left < -1 || bounds.right > innerWidth + 1)
            issues.push('Outside viewport: ' + element.textContent);
        }
        for (const element of document.querySelectorAll('input, button')) {
          let scroller = element.parentElement;
          while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowX))
            scroller = scroller.parentElement;
          if (scroller) continue;
          const bounds = element.getBoundingClientRect();
          if (
            !bounds.width ||
            !bounds.height ||
            (element.closest('details:not([open])') && !element.closest('summary'))
          )
            continue;
          if (bounds.left < -1 || bounds.right > innerWidth + 1)
            issues.push('Control outside viewport: ' + element.textContent);
        }
        return issues;
      });
      assert.deepEqual(problems, [], `${name} at ${width}x${height}`);
      checks++;
    }
  }
  let tabChecks = 0;
  const translated = (source) =>
    page.evaluate(async (source) => {
      const { t } = await import('/src/core/i18n/index.ts');
      return t(source);
    }, source);
  const tabGroup = async (source) =>
    page.getByRole(source === 'Workshop views' ? 'navigation' : 'group', {
      name: await translated(source),
      exact: true
    });
  async function checkTab(group, index, label) {
    const button = group.locator(':scope > button').nth(index);
    await button.click();
    const geometry = await group.evaluate(async (element) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {}))
      );
      const selected = element.querySelector(':scope > button[aria-pressed="true"]');
      const marker = getComputedStyle(element, '::before');
      const bounds = element.getBoundingClientRect();
      const transform = new DOMMatrixReadOnly(marker.transform);
      const selectedBounds = selected.getBoundingClientRect();
      return {
        index: [...element.children].indexOf(selected),
        left: bounds.left + parseFloat(marker.left) + transform.m41,
        width:
          parseFloat(marker.width) +
          (marker.boxSizing === 'border-box'
            ? 0
            : parseFloat(marker.borderLeftWidth) + parseFloat(marker.borderRightWidth)),
        selectedLeft: selectedBounds.left,
        selectedWidth: selectedBounds.width,
        view: document.querySelector('[data-workshop-view]').dataset.workshopView
      };
    });
    assert.equal(geometry.index, index, `${label}: selected state`);
    assert.ok(
      Math.abs(geometry.left - geometry.selectedLeft) < 1,
      `${label}: highlight must cover selected button (${JSON.stringify(geometry)})`
    );
    assert.ok(Math.abs(geometry.width - geometry.selectedWidth) < 1, `${label}: highlight width`);
    tabChecks++;
    return geometry;
  }
  for (const [width, height, effects, reducedMotion] of [
    [390, 844, 'calm', 'reduce'],
    [1280, 800, 'full', 'no-preference']
  ]) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion });
    for (const language of ['fa', 'en']) {
      await page.evaluate(
        async ({ language, effects }) => {
          const { settingsStore } = await import('/src/core/settings/store.ts');
          settingsStore.update({ language, effects });
          await window.layoutReview.render('workshop', 'advanced');
        },
        { language, effects }
      );
      const views = await tabGroup('Workshop views');
      for (const index of [0, 1, 2, 3, 0]) {
        const result = await checkTab(views, index, `${language}/${width}: views ${index}`);
        assert.equal(result.view, ['Build', 'Practice', 'Progress', 'Saved'][index]);
      }
      const parts = await tabGroup('Paddle parts');
      for (const index of [0, 1, 2, 3, 4])
        await checkTab(parts, index, `${language}/${width}: parts ${index}`);
      const tuning = await tabGroup('Tuning settings');
      for (const index of [0, 1, 2])
        await checkTab(tuning, index, `${language}/${width}: tuning ${index}`);
      await checkTab(views, 3, `${language}/${width}: Saved`);
      const presets = await tabGroup('Paddle presets');
      for (const index of [0, 1, 2])
        await checkTab(presets, index, `${language}/${width}: presets ${index}`);
      await checkTab(views, 1, `${language}/${width}: Practice`);
      await page
        .getByRole('button', { name: await translated('Compare return paths'), exact: true })
        .click();
      const contact = await tabGroup('Contact motion');
      for (const index of [0, 1])
        await checkTab(contact, index, `${language}/${width}: contact ${index}`);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'detached' });
    }
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(async () => {
    const { settingsStore } = await import('/src/core/settings/store.ts');
    settingsStore.update({ language: 'fa', effects: 'full' });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.layoutReview.render('settings'));
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
  const englishSound = await page
    .getByRole('button', { name: 'Mute sound', exact: true })
    .boundingBox();
  assert.ok(englishSound.x > 390 / 2, 'LTR sound control is on the right');
  await page.getByRole('button', { name: 'فارسی', exact: true }).click();
  await page.getByRole('heading', { name: 'تنظیمات', exact: true }).waitFor();
  await page.reload();
  await page.waitForFunction(() => window.layoutReview);
  await page.evaluate(async () => {
    const { installLanguage } = await import('/src/core/i18n/index.ts');
    installLanguage();
    await window.layoutReview.render('settings');
  });
  await page.getByRole('heading', { name: 'تنظیمات', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
  if (process.env.I18N_SCREENSHOTS) {
    const directory = resolve(process.env.I18N_SCREENSHOTS);
    await mkdir(directory, { recursive: true });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${directory}/persian-settings.png` });
    await page.evaluate(() => window.layoutReview.render('home'));
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${directory}/persian-home.png` });
  }
  // Exercise the real app, canvas, and a paused match across language changes.
  await page.addInitScript(() => {
    window.canvasFonts = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      window.canvasFonts.push(this.font);
      if (window.canvasFonts.length > 100) window.canvasFonts.shift();
      return fillText.apply(this, args);
    };
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.getByRole('button', { name: 'ردکردن', exact: true }).click();
  await page.getByRole('button', { name: 'حالت‌های بیشتر', exact: true }).click();
  await page.getByRole('button', { name: /مسابقهٔ سریع/ }).click();
  await page.getByRole('button', { name: /تازه‌کار/ }).click();
  await page.waitForFunction(() => window.canvasFonts.some((font) => font.includes('Vazirmatn')));
  const persianSound = await page
    .getByRole('button', { name: 'قطع صدا', exact: true })
    .boundingBox();
  assert.ok(persianSound.x < 390 / 2, 'RTL sound control is on the left during play');
  await page.getByRole('button', { name: 'توقف بازی', exact: true }).click();
  await page.getByRole('button', { name: 'تنظیمات', exact: true }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.getByRole('button', { name: 'Pause game', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('dir'), 'ltr');
  assert.deepEqual(errors, []);
  console.log(
    `${checks} Persian menu viewport checks and ${tabChecks} Workshop highlight checks passed; switching, reload persistence and a real match verified.`
  );
} finally {
  await browser?.close();
  await server.close();
}
