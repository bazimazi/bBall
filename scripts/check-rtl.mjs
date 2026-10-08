import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fixture } from './layout-fixture.mjs';

/* global window, document, getComputedStyle, innerWidth, innerHeight */
const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, open: false, hmr: false },
  plugins: [
    {
      name: 'rtl-review',
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          if (request.url !== '/__rtl-review') return next();
          response.setHeader('Content-Type', 'text/html');
          response.end(await vite.transformIndexHtml('/__rtl-review', fixture));
        });
      }
    }
  ]
});
const catalog = JSON.parse(await readFile('src/core/i18n/fa.json', 'utf8'));
const translated = (source) => catalog[source] ?? source;
const captures = process.env.RTL_SCREENSHOTS && resolve(process.env.RTL_SCREENSHOTS);
const issues = [],
  runtimeErrors = [],
  screenshots = [];
let browser,
  checks = 0,
  controlChecks = 0;
try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  await page.route('**/v1/auth/oauth/providers', (route) =>
    route.fulfill({ json: { providers: [] } })
  );
  await page.goto(new URL('/__rtl-review', server.resolvedUrls.local[0]).href);
  await page.waitForFunction(() => window.layoutReview);
  await page.evaluate(async () => {
    const { installLanguage } = await import('/src/core/i18n/index.ts');
    const { settingsStore } = await import('/src/core/settings/store.ts');
    installLanguage();
    settingsStore.update({ language: 'fa', musicVolume: 0.7, sfxVolume: 0.3 });
    await document.fonts.load('700 16px Vazirmatn', 'فارسی');
  });
  if (captures) await mkdir(captures, { recursive: true });
  async function render(name, state = 'fresh') {
    await page.evaluate(([name, state]) => window.layoutReview.render(name, state), [name, state]);
    await page.waitForTimeout(name === 'result' ? 1500 : 650);
  }
  async function review(label) {
    const problems = await page.evaluate(() => {
      const problems = [];
      const visible = (element) =>
        element.getClientRects().length &&
        !element.closest('[inert], [aria-hidden="true"]') &&
        !(element.closest('details:not([open])') && !element.closest('summary'));
      const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]');
      const root = dialog ?? document;
      for (const control of root.querySelectorAll('button, input, summary')) {
        if (!visible(control)) continue;
        if (control.matches('[class*="_scrim_"]')) continue;
        const bounds = control.getBoundingClientRect();
        let scroller = control.parentElement;
        while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowX))
          scroller = scroller.parentElement;
        if (!scroller && (bounds.left < -1 || bounds.right > innerWidth + 1))
          problems.push(
            'Control outside viewport: ' +
              (control.getAttribute('aria-label') ?? control.textContent)
          );
        const x = bounds.left + bounds.width / 2,
          y = bounds.top + bounds.height / 2;
        let clipped = false;
        for (let ancestor = control.parentElement; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor),
            box = ancestor.getBoundingClientRect();
          if (
            ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowX) &&
            (x < box.left || x > box.right)
          )
            clipped = true;
          if (
            ['auto', 'scroll', 'hidden', 'clip'].includes(style.overflowY) &&
            (y < box.top || y > box.bottom)
          )
            clipped = true;
        }
        if (
          !clipped &&
          bounds.top >= 0 &&
          bounds.bottom <= innerHeight &&
          bounds.left >= 0 &&
          bounds.right <= innerWidth &&
          !control.disabled
        ) {
          const hit = document.elementFromPoint(x, y);
          if (hit && hit !== control && !control.contains(hit))
            problems.push(
              'Control covered: ' + (control.getAttribute('aria-label') ?? control.textContent)
            );
        }
      }
      for (const trigger of root.querySelectorAll('[data-disclosure] > button')) {
        const marker = getComputedStyle(trigger, '::after');
        const width = trigger.getBoundingClientRect().width;
        if (parseFloat(marker.left) > width / 2)
          problems.push('RTL disclosure chevron is on text side: ' + trigger.textContent);
        if (parseFloat(marker.borderRightWidth) === 0)
          problems.push('Disclosure chevron does not point down/up');
      }
      for (const range of root.querySelectorAll('input[type="range"]')) {
        if (!/270deg|to left/.test(getComputedStyle(range).backgroundImage))
          problems.push(
            'RTL slider fill runs opposite to thumb: ' + range.closest('label').textContent
          );
      }
      for (const track of root.querySelectorAll('[class*="_xpTrack_"]')) {
        const fill = track.firstElementChild;
        if (Math.abs(fill.getBoundingClientRect().right - track.getBoundingClientRect().right) > 1)
          problems.push('XP progress starts on wrong side');
      }
      for (const stage of root.querySelectorAll('[class*="_stageNext_"]')) {
        const marker = getComputedStyle(stage, '::after');
        if (parseFloat(marker.left) > stage.getBoundingClientRect().width / 2)
          problems.push('Journey status dot overlaps the stage number');
      }
      return problems;
    });
    issues.push(...problems.map((problem) => `${label}: ${problem}`));
    checks++;
    if (captures) {
      const file = `${checks}-${label.replace(/[^a-zA-Z0-9-]/g, '-')}.png`;
      await page.screenshot({ path: resolve(captures, file) });
      screenshots.push({ label, file });
    }
  }
  const cases = [
    ['match', 'skills'],
    ...[
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
      'match',
      'onboarding',
      'pause',
      'exit',
      'tutorial'
    ].map((name) => [name, 'fresh']),
    ['journey', 'complete'],
    ['run', 'deep'],
    ['draft', 'advanced'],
    ['tournament', 'active'],
    ['workshop', 'advanced'],
    ['match', 'goals'],
    ['tutorial', 'complete'],
    ...['journey', 'daily', 'waves', 'run', 'endless-run', 'run-loss'].map((state) => [
      'result',
      state
    ])
  ];
  for (const [width, height] of process.env.RTL_INTERACTIONS_ONLY
    ? []
    : [
        [390, 844],
        [1280, 800],
        [320, 568],
        [844, 390]
      ]) {
    await page.setViewportSize({ width, height });
    for (const [name, state] of cases) {
      await render(name, state);
      await review(`${width}-${name}-${state}`);
      if (name === 'match') {
        const toggle = page.locator('[class*="_info_"] button[aria-expanded]');
        assert.equal(await toggle.getAttribute('aria-label'), 'نمایش اطلاعات مسابقه');
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        await review(`${width}-${name}-${state}-expanded`);
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      }
      if ([390, 1280].includes(width) && state === 'fresh') {
        for (const control of await page.locator('button, input, summary').all()) {
          if (!(await control.isVisible()) || !(await control.isEnabled())) continue;
          if (
            await control.evaluate(
              (element) =>
                element.closest('[inert], [aria-hidden="true"]') ||
                element.matches('[class*="_scrim_"]')
            )
          )
            continue;
          try {
            await control.click({ trial: true, timeout: 2000 });
            controlChecks++;
          } catch {
            issues.push(
              `${width}-${name}: control cannot be reached: ${(await control.getAttribute('aria-label')) ?? (await control.textContent())}`
            );
          }
        }
      }
    }
    console.log(`Reviewed ${cases.length} Persian screens/states at ${width}x${height}`);
  }
  // Expanded controls and each reusable choice dialog on every menu that has them.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of [
    'modes',
    'quick',
    'practice',
    'journey',
    'daily',
    'gauntlet',
    'challenge',
    'tournament',
    'profile',
    'talents',
    'settings',
    'customize',
    'help',
    'demo'
  ]) {
    await render(name, 'advanced');
    for (const disclosure of await page.locator('[data-disclosure] > button').all()) {
      await disclosure.click();
      await page.waitForTimeout(300);
      await review(`expanded-${name}`);
    }
    for (const summary of await page.locator('details > summary').all()) {
      if (!(await summary.isVisible())) continue;
      await summary.click();
      await review(`details-${name}`);
    }
    for (const trigger of await page.locator('button[aria-haspopup="dialog"]').all()) {
      if (!(await trigger.isVisible()) || !(await trigger.isEnabled())) continue;
      const label = await trigger.getAttribute('aria-label');
      await trigger.click();
      await page.getByRole('dialog').waitFor();
      await page.waitForTimeout(300);
      await review(`picker-${name}-${label}`);
      const enabled = page.locator('[role="option"]:not([aria-disabled="true"])');
      if (await enabled.count()) {
        const id = await enabled.first().getAttribute('data-value');
        await enabled.first().click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        assert.equal(
          await trigger.getAttribute('data-value'),
          id,
          `Picker selection: ${name}/${label}`
        );
        assert.equal(
          await trigger.evaluate((element) => element === document.activeElement),
          true,
          'Picker restores focus'
        );
      } else {
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
      }
    }
  }
  // RTL navigation reverses horizontal panel motion independently of system preferences.
  for (const effects of ['full', 'calm']) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      await page.emulateMedia({ reducedMotion });
      await page.evaluate(async (effects) => {
        const { settingsStore } = await import('/src/core/settings/store.ts');
        settingsStore.update({ effects });
      }, effects);
      await render('workshop', 'advanced');
      for (const [source, direction] of [
        ['Practice', -1],
        ['Build', 1]
      ]) {
        const animation = await page.evaluate(
          async ({ name, label }) => {
            const nav = [...document.querySelectorAll('nav[aria-label]')].find(
              (nav) => nav.getAttribute('aria-label') === label
            );
            const button = [...nav.querySelectorAll('button')].find(
              (button) => button.textContent === name
            );
            button.click();
            await new Promise((resolve) =>
              window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
            );
            const motion = document
              .querySelector('[data-workshop-motion="view"]')
              .getAnimations()[0];
            return (
              motion && {
                transform: motion.effect.getKeyframes()[0].transform,
                duration: motion.effect.getTiming().duration
              }
            );
          },
          { name: translated(source), label: translated('Workshop views') }
        );
        assert.deepEqual(
          animation,
          { transform: `translateX(${direction * 10}px)`, duration: 260 },
          `RTL Workshop motion: ${effects}/${reducedMotion}/${source}`
        );
        await page.waitForTimeout(300);
      }
      await review(`workshop-motion-${effects}-${reducedMotion}`);
    }
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Native range interaction must agree with the rendered RTL track and saved value.
  if (captures)
    await writeFile(
      resolve(captures, 'review.json'),
      JSON.stringify({ checks, controlChecks, issues, runtimeErrors, screenshots }, null, 2)
    );
  assert.deepEqual(issues, [], 'Persian pages and expanded controls');
  await render('settings');
  for (const [source, key] of [
    ['Music', 'musicVolume'],
    ['Effects', 'sfxVolume']
  ]) {
    const slider = page.getByRole('slider', { name: new RegExp(translated(source)) });
    await slider.scrollIntoViewIfNeeded();
    await slider.press('Home');
    const bounds = await slider.boundingBox();
    await page.mouse.click(
      bounds.x + bounds.width - 11 - (bounds.width - 22) * 0.25,
      bounds.y + bounds.height / 2
    );
    assert.equal(
      Number(await slider.inputValue()),
      25,
      `${source}: pointer position agrees with RTL value`
    );
    await slider.press('Home');
    assert.equal(await slider.inputValue(), '0');
    await slider.press('ArrowLeft');
    assert.equal(await slider.inputValue(), '5', `${source}: ArrowLeft increases the RTL value`);
    await slider.press('ArrowRight');
    assert.equal(await slider.inputValue(), '0');
    await slider.press('End');
    assert.equal(await slider.inputValue(), '100');
    await slider.press('Home');
    const stored = await page.evaluate(async (key) => {
      const { settingsStore } = await import('/src/core/settings/store.ts');
      return settingsStore.getSnapshot()[key];
    }, key);
    assert.equal(stored, 0);
    checks++;
  }
  await page
    .getByRole('group', { name: translated('Touch movement'), exact: true })
    .getByRole('button', { name: translated('Relative drag'), exact: true })
    .click();
  const sensitivity = page.getByRole('slider', {
    name: new RegExp(translated('Drag sensitivity'))
  });
  await sensitivity.press('Home');
  assert.equal(await sensitivity.inputValue(), '50');
  await sensitivity.press('ArrowLeft');
  assert.equal(await sensitivity.inputValue(), '75');
  await sensitivity.press('End');
  assert.equal(await sensitivity.inputValue(), '200');
  await review('settings-relative-slider');
  await render('account');
  await page.getByRole('tab', { name: translated('Create account'), exact: true }).click();
  await page.locator('input[type="email"]').fill('player+fa@example.com');
  await page.locator('input[type="password"]').fill('Mixed123!');
  await page.locator('input[autocomplete="nickname"]').fill('بازیکن Alpha ۱۲');
  for (const field of await page.locator('input[type="email"],input[type="password"]').all())
    assert.equal(await field.evaluate((element) => getComputedStyle(element).direction), 'ltr');
  await review('account-registration');
  await page.getByRole('tab', { name: translated('Sign in'), exact: true }).click();
  await page
    .getByRole('button', { name: translated('Forgotten your password?'), exact: true })
    .click();
  await review('account-password-recovery');
  await render('journey', 'advanced');
  const tabs = page.getByRole('tablist', { name: translated('Journey worlds') }).getByRole('tab');
  await tabs.first().focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await tabs.nth(1).getAttribute('aria-selected'), 'true');
  assert.equal(await tabs.nth(1).evaluate((element) => element === document.activeElement), true);
  await page.keyboard.press('ArrowRight');
  assert.equal(await tabs.first().getAttribute('aria-selected'), 'true');
  await page.keyboard.press('End');
  assert.equal(await tabs.last().getAttribute('aria-selected'), 'true');
  await review('journey-keyboard-last-chapter');
  await render('talents', 'advanced');
  const talent = page.locator('button[title][aria-pressed]').first();
  await talent.click();
  await page.getByRole('dialog').waitFor();
  await page.waitForTimeout(300);
  await review('talent-details');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await talent.evaluate((element) => element === document.activeElement), true);
  // Capture sheets make the full review inspectable without changing product UI.
  if (captures) {
    await writeFile(
      resolve(captures, 'review.json'),
      JSON.stringify({ checks, controlChecks, issues, runtimeErrors, screenshots }, null, 2)
    );
    const sheet = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    for (const width of [390, 1280]) {
      const shots = screenshots.filter(
        (shot) => shot.label.startsWith(`${width}-`) && shot.label.endsWith('-fresh')
      );
      const items = await Promise.all(
        shots.map(
          async ({ label, file }) =>
            `<figure><figcaption>${label}</figcaption><img src="data:image/png;base64,${(await readFile(resolve(captures, file))).toString('base64')}"></figure>`
        )
      );
      await sheet.setContent(
        `<style>body{margin:0;background:#222;color:white;font:12px sans-serif;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}figure{margin:0}img{width:100%}figcaption{padding:8px}</style>${items.join('')}`
      );
      await sheet.screenshot({ path: resolve(captures, `sheet-${width}.png`), fullPage: true });
    }
    await sheet.close();
  }
  assert.deepEqual(runtimeErrors, [], 'No Persian browser errors');
  assert.deepEqual(issues, [], 'Persian UI issues');
  console.log(
    `${checks} Persian screen/dialog reviews and ${controlChecks} pointer-reachability checks passed; RTL sliders, keyboard navigation, choice commits and focus verified.`
  );
} finally {
  await browser?.close();
  await server.close();
}
