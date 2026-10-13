import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

/* global document, innerWidth, getComputedStyle */

// Real App entry point and player-visible controls only. Module reads verify
// persisted state, but never manufacture a profile or bypass navigation.
const output = process.env.BROWSER_PAGES_OUTPUT ?? '.temp/browser-pages';
const report = {
  checks: [],
  pages: [],
  failures: [],
  pageErrors: [],
  consoleErrors: [],
  requests: []
};
const server = await createServer({
  logLevel: 'error',
  cacheDir: `.temp/browser-pages-vite-${process.pid}`,
  server: { host: '127.0.0.1', port: 0, open: false, hmr: false }
});
let browser;
let current = '';
try {
  await mkdir(output, { recursive: true });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  for (const language of ['en', 'fa']) {
    for (const mobile of [false, true]) {
      const configuration = `${language}-${mobile ? 'mobile' : 'desktop'}`;
      if (process.env.BROWSER_PAGES_CONFIG && process.env.BROWSER_PAGES_CONFIG !== configuration)
        continue;
      const context = await browser.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
        isMobile: mobile,
        hasTouch: mobile
      });
      const page = await context.newPage();
      page.setDefaultTimeout(12_000);
      page.on('pageerror', (error) =>
        report.pageErrors.push({ configuration, current, error: error.message })
      );
      page.on('console', (event) => {
        if (event.type() === 'error')
          report.consoleErrors.push({ configuration, current, error: event.text() });
      });
      // No account credentials or backend are needed for guest forms. The
      // provider-list endpoint is explicitly covered as an empty-provider UI.
      await page.route('**/v1/auth/oauth/providers', (route) =>
        route.fulfill({ json: { providers: [] } })
      );
      page.on('requestfailed', (request) =>
        report.requests.push({
          configuration,
          current,
          url: request.url(),
          error: request.failure()?.errorText
        })
      );
      const translations = new Map();
      async function label(source) {
        if (!translations.has(source))
          translations.set(
            source,
            await page.evaluate(async (source) => {
              const { t } = await import('/src/core/i18n/index.ts');
              return t(source);
            }, source)
          );
        return translations.get(source);
      }
      async function button(source, options = {}) {
        return page.getByRole('button', { name: await label(source), exact: true, ...options });
      }
      async function click(source, options) {
        await (await button(source, options)).click();
      }
      async function heading(source) {
        await page.getByRole('heading', { name: await label(source), exact: true }).waitFor();
        await page
          .locator('section p[role="status"]')
          .filter({ hasText: await label('Opening ') })
          .waitFor({ state: 'detached' });
      }
      async function back() {
        await click('Back');
      }
      async function home() {
        await page.goto(server.resolvedUrls.local[0]);
        await (await button('More modes')).waitFor();
      }
      async function check(name, work) {
        if (
          process.env.BROWSER_PAGES_CASE &&
          name !== 'onboarding' &&
          name !== process.env.BROWSER_PAGES_CASE
        )
          return;
        current = `${configuration}/${name}`;
        try {
          await work();
          report.checks.push({ configuration, name });
          console.log(`PASS ${current}`);
        } catch (error) {
          report.failures.push({ configuration, name, error: error.message });
          await page
            .screenshot({
              path: `${output}/${configuration}-${name.replace(/[^a-z0-9]+/gi, '-')}-FAILED.png`,
              fullPage: true
            })
            .catch(() => {});
          console.log(`FAIL ${current}: ${error.message}`);
        }
      }
      async function geometry(name) {
        await page.waitForTimeout(180);
        const issues = await page.evaluate(() => {
          const errors = [];
          for (const element of document.querySelectorAll('button,input,textarea,summary')) {
            if (!element.getClientRects().length || element.closest('[inert],[aria-hidden="true"]'))
              continue;
            const box = element.getBoundingClientRect();
            // Horizontal carousels intentionally place offscreen controls.
            let scrolls = false;
            for (let parent = element.parentElement; parent; parent = parent.parentElement) {
              if (
                parent.scrollWidth > parent.clientWidth + 1 &&
                ['auto', 'scroll'].includes(getComputedStyle(parent).overflowX)
              )
                scrolls = true;
            }
            if (!scrolls && (box.left < -1 || box.right > innerWidth + 1))
              errors.push((element.getAttribute('aria-label') || element.textContent).slice(0, 90));
          }
          return errors;
        });
        assert.deepEqual(issues, [], `${name}: horizontally clipped controls`);
        report.pages.push({ configuration, name });
      }
      async function openHome(source, title = source) {
        await click(source);
        await heading(title);
      }
      async function openMode(source, title = source) {
        await click('More modes');
        const translated = await label(source);
        await page
          .locator('button')
          .filter({ has: page.getByText(translated, { exact: true }) })
          .click();
        await heading(title);
      }
      async function openDisclosure(source) {
        const translated = await label(source);
        await page
          .getByRole('button', {
            name: new RegExp(`^${translated.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
          })
          .click();
      }
      async function picker(source, value) {
        const translated = await label(source);
        await page
          .getByRole('button', {
            name: new RegExp(`^${translated.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
          })
          .click();
        await page.getByRole('dialog').waitFor();
        await geometry(`picker ${source}`);
        await page.getByRole('listbox').locator(`[data-value="${value}"]`).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
      }
      async function profile() {
        const name = await page.evaluate(
          async () => (await import('/src/core/profile/store.ts')).profileStore.getSnapshot().name
        );
        await page
          .getByRole('button', {
            name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
          })
          .click();
        await heading('Profile');
      }

      await check('onboarding', async () => {
        await page.goto(server.resolvedUrls.local[0]);
        if (language === 'fa')
          await page.getByRole('button', { name: 'فارسی', exact: true }).click();
        await page
          .getByRole('textbox', { name: await label('Name'), exact: true })
          .fill(`Tester ${language}`);
        const avatars = page.locator('button[aria-label]').filter({ has: page.locator('svg') });
        await avatars.first().click();
        await geometry('onboarding');
        await click('Start playing');
        await (await button('More modes')).waitFor();
        await geometry('home');
        assert.equal(
          await page.evaluate(
            async () => (await import('/src/core/profile/store.ts')).profileStore.getSnapshot().name
          ),
          `Tester ${language}`
        );
      });
      await check('settings-and-persistence', async () => {
        await home();
        await openHome('Settings');
        for (const [group, choice] of [
          ['Graphics intensity', 'High'],
          ['Visual effects', 'Calm'],
          ['Screen shake', 'Off'],
          ['Court image quality', 'Low'],
          ['Touch movement', 'Relative drag'],
          ['Serve pacing', 'When ready'],
          ['Countdown after pause', 'Off'],
          ['Vibration', 'Off'],
          ['Replay the deciding point', 'Off'],
          ['Skill button side', 'Right']
        ]) {
          await page
            .getByRole('group', { name: await label(group), exact: true })
            .getByRole('button', { name: await label(choice), exact: true })
            .click();
        }
        const sliders = page.getByRole('slider');
        await sliders.nth(0).fill('25');
        await sliders.nth(1).fill('35');
        await sliders.nth(2).fill('150');
        await page.getByText(await label('Keyboard controls'), { exact: true }).click();
        const key = page.locator('details button[aria-label]').first();
        await key.click();
        await key.press('z');
        const settings = await page.evaluate(async () =>
          (await import('/src/core/settings/store.ts')).settingsStore.getSnapshot()
        );
        assert.equal(settings.keyBindings.up[0], 'z');
        await click('Restore default keys');
        await click('Preview music · 5 seconds');
        await geometry('settings expanded');
        await page.screenshot({ path: `${output}/${configuration}-settings.png` });
        await back();
        await page.reload();
        await openHome('Settings');
        const saved = await page.evaluate(async () =>
          (await import('/src/core/settings/store.ts')).settingsStore.getSnapshot()
        );
        assert.equal(saved.language, language);
        assert.equal(saved.musicVolume, 0.25);
        assert.equal(saved.sfxVolume, 0.35);
        assert.equal(saved.effects, 'calm');
        assert.equal(saved.touchSensitivity, 1.5);
        assert.equal(saved.autoServe, false);
        assert.equal(saved.skillSide, 'right');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.deepEqual(
          await page.evaluate(async () =>
            (await import('/src/core/settings/store.ts')).settingsStore.getSnapshot()
          ),
          saved
        );
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        assert.deepEqual(
          await page.evaluate(async () =>
            (await import('/src/core/settings/store.ts')).settingsStore.getSnapshot()
          ),
          saved
        );
        // Keep subsequent launch tests automatic and concise through explicit UI.
        await page
          .getByRole('group', { name: await label('Serve pacing'), exact: true })
          .getByRole('button', { name: await label('Automatic'), exact: true })
          .click();
        await back();
      });
      await check('profile-and-guest-account', async () => {
        await home();
        await profile();
        const name = page.getByRole('textbox', { name: await label('Player name'), exact: true });
        await name.fill('Browser player');
        await name.press('Enter');
        assert.equal(
          await page.evaluate(
            async () => (await import('/src/core/profile/store.ts')).profileStore.getSnapshot().name
          ),
          'Browser player'
        );
        await openDisclosure('Mastery');
        await geometry('profile mastery');
        await click('Reset progress');
        await page.getByRole('alertdialog').waitFor();
        await click('Keep progress');
        await click('Sign in');
        await heading('Account');
        await page.getByRole('tab', { name: await label('Create account'), exact: true }).click();
        assert.equal(
          await page
            .getByRole('textbox', { name: await label('Display name (optional)'), exact: true })
            .count(),
          1
        );
        await geometry('account register');
        await page.getByRole('tab', { name: await label('Sign in'), exact: true }).click();
        await click('Forgotten your password?');
        await heading('Reset password');
        await geometry('account forgot');
        await click('Back to sign in');
        await click('Keep playing as a guest');
        await heading('Profile');
      });
      await check('achievements-and-customise', async () => {
        await home();
        await profile();
        await page
          .getByRole('button', { name: new RegExp(`^${await label('Achievements ')}`) })
          .click();
        await heading('Achievements');
        await geometry('achievements');
        await back();
        await click('Customise');
        await heading('Customise');
        const choice = page.locator('button[aria-pressed="false"]:enabled').first();
        const choiceName = await choice.innerText();
        await choice.click();
        assert.equal(
          await page
            .getByRole('button', { name: choiceName, exact: true })
            .getAttribute('aria-pressed'),
          'true'
        );
        await geometry('customise');
      });
      await check('workshop-build-details-and-saved', async () => {
        await home();
        await openHome('Workshop', 'Paddle Workshop');
        await click('Material details');
        await page.getByRole('dialog').waitFor();
        await geometry('workshop details');
        await click('Close details');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page
          .getByRole('group', { name: await label('Paddle parts'), exact: true })
          .getByRole('button', { name: await label('Core'), exact: true })
          .click();
        await click('Next materials');
        await click('Previous materials');
        await page
          .getByRole('navigation', { name: await label('Workshop views'), exact: true })
          .getByRole('button', { name: await label('Practice'), exact: true })
          .click();
        await click('Compare return paths');
        await page.getByRole('dialog').waitFor();
        await click('Moving');
        await geometry('workshop return paths');
        await click('Close details');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page
          .getByRole('navigation', { name: await label('Workshop views'), exact: true })
          .getByRole('button', { name: await label('Progress'), exact: true })
          .click();
        await click('Next contract');
        await click('Previous contract');
        await click('Marks & signatures');
        await page.getByRole('dialog').waitFor();
        await click('Close details');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page
          .getByRole('navigation', { name: await label('Workshop views'), exact: true })
          .getByRole('button', { name: await label('Saved'), exact: true })
          .click();
        await page
          .getByRole('textbox', { name: await label('Preset name'), exact: true })
          .fill('Browser paddle');
        await click('Save equipped paddle to slot 1');
        await click('Load paddle slot 1');
        const saved = await page.evaluate(
          async () =>
            (await import('/src/core/profile/store.ts')).profileStore.getSnapshot().progress
              .workshop.presets[0]
        );
        assert.equal(saved.name, 'Browser paddle');
        await geometry('workshop saved');
        await page.screenshot({ path: `${output}/${configuration}-workshop.png` });
      });
      await check('talents-lab-and-research', async () => {
        await home();
        await openHome('Talents');
        await openDisclosure('Saved builds');
        await geometry('talent saved builds');
        await click('Resonance Lab · loot and upgrades');
        await heading('Resonance Lab');
        await openDisclosure('Where loot comes from');
        await page.locator('button[aria-haspopup="dialog"]').first().click();
        await page.getByRole('dialog').waitFor();
        await geometry('research detail');
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page
          .getByRole('group', { name: await label('Lab sections'), exact: true })
          .getByRole('button', { name: await label('Builds'), exact: true })
          .click();
        await geometry('lab builds');
        await page
          .getByRole('group', { name: await label('Lab sections'), exact: true })
          .getByRole('button', { name: await label('Expert trials'), exact: true })
          .click();
        await geometry('lab trials');
      });
      await check('workshop-starter-craft-and-equip', async () => {
        await home();
        await openHome('Workshop', 'Paddle Workshop');
        await page
          .getByRole('group', { name: await label('Paddle parts'), exact: true })
          .getByRole('button', { name: await label('Core'), exact: true })
          .click();
        await click('Select Springsteel');
        await click('Claim starter Marks');
        await click('Craft · 12 Marks');
        await click('Equip paddle');
        const workshop = await page.evaluate(
          async () =>
            (await import('/src/core/profile/store.ts')).profileStore.getSnapshot().progress
              .workshop
        );
        assert.equal(workshop.introduced, true);
        assert.equal(workshop.marks, 0);
        assert.equal(workshop.owned.includes('springsteel'), true);
        assert.equal(workshop.equipped.core, 'springsteel');
        await geometry('workshop crafted paddle');
      });
      await check('help-and-first-rally-lesson', async () => {
        await home();
        await openHome('New here? Learn the controls', 'How to play');
        await geometry('help');
        await click('Try the first-rally lesson');
        await page
          .getByRole('region', { name: await label('First-rally lesson'), exact: true })
          .waitFor();
        await geometry('lesson');
        await click('Skip lesson');
        await heading('How to play');
      });
      await check('journey-daily-and-archive', async () => {
        await home();
        await openHome('Open Journey map', 'Journey');
        await picker('Journey rules', 'veteran');
        await picker('Journey rules', 'story');
        const worlds = page.getByRole('tablist', {
          name: await label('Journey worlds'),
          exact: true
        });
        await worlds.getByRole('tab').nth(1).click();
        await geometry('journey locked world');
        await worlds.getByRole('tab').first().click();
        await back();
        await page
          .getByRole('button', { name: new RegExp(await label('Daily challenge')) })
          .click();
        await heading('Daily');
        await page
          .getByRole('group', { name: await label('Challenge tier'), exact: true })
          .getByRole('button', { name: await label('Master · Legend'), exact: true })
          .click();
        await page
          .getByRole('group', { name: await label('Challenge tier'), exact: true })
          .getByRole('button', { name: await label('Standard'), exact: true })
          .click();
        await openDisclosure('Daily archive');
        const archive = await label('Archive date');
        await page.getByRole('button', { name: new RegExp(`^${archive}`) }).click();
        await page.getByRole('dialog').waitFor();
        await geometry('daily date picker');
        await page.getByRole('listbox').getByRole('option').first().click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        assert.equal(await (await button('Play archive')).isEnabled(), true);
        await geometry('daily archive');
      });
      await check('gauntlet-selectors', async () => {
        await home();
        await page.getByRole('button', { name: new RegExp(`^${await label('Gauntlet')}`) }).click();
        await heading('Gauntlet');
        for (const format of ['Expedition', 'Endless', 'Sprint'])
          await page
            .getByRole('group', { name: await label('Run length'), exact: true })
            .getByRole('button', { name: new RegExp(`^${await label(format)}`) })
            .click();
        await geometry('gauntlet formats');
        await page.screenshot({ path: `${output}/${configuration}-gauntlet.png` });
      });
      await check('quick-practice-and-technique-selectors', async () => {
        await home();
        await openMode('Quick Match');
        await openDisclosure('Match setup');
        await picker('Court', 'post');
        await picker('Opponent school', 'anchor');
        await picker('Contract', 'master');
        await picker('Series', 3);
        await geometry('quick setup');
        await back();
        await page.getByRole('button', { name: new RegExp(`^${await label('Practice')}`) }).click();
        await heading('Practice');
        await openDisclosure('Technique drills');
        await geometry('technique cards');
        assert.equal((await page.locator('svg[role="img"]').count()) >= 3, true);
        await openDisclosure('Practice setup');
        await picker('Boss drill', 'gatekeeper');
        await picker('Isolated phase', 2);
        await geometry('boss phase picker');
        await page.screenshot({ path: `${output}/${configuration}-practice.png` });
      });
      await check('challenge-and-tournament-pages', async () => {
        await home();
        await openMode('Challenge');
        await click('Next');
        await click('Previous');
        await picker('Trial group', 9);
        await openDisclosure('Five-trial contract playlist');
        await geometry('challenge contracts');
        await back();
        await page
          .getByRole('button', { name: new RegExp(`^${await label('Tournament')}`) })
          .click();
        await heading('Tournament');
        for (const format of ['Marathon', 'Ladder', 'Classic'])
          await page
            .getByRole('group', { name: await label('Format'), exact: true })
            .getByRole('button', { name: new RegExp(`^${await label(format)}`) })
            .click();
        await geometry('tournament selectors');
      });
      await check('court-couch-presets', async () => {
        await home();
        await openHome('More modes');
        await openDisclosure('Court & couch rules');
        await picker('Court for Endless and Versus', 'slalom');
        await picker('Endless format', 'waves');
        await picker('Versus series', 5);
        await picker('Versus rule', 'precision');
        await picker('Versus court', 'mirror');
        await page
          .getByText(await label('Four saved couch presets · this device'), { exact: true })
          .click();
        const save = page.getByRole('button', {
          name: `${await label('Save couch ')}${await label(1)}`,
          exact: true
        });
        await save.click();
        await picker('Versus rule', 'speed');
        const load = page.getByRole('button', {
          name: `${await label('Load couch ')}${await label(1)}`,
          exact: true
        });
        await load.click();
        const saved = await page.evaluate(
          () => JSON.parse(localStorage.getItem('bball.couch-presets')).data
        );
        assert.equal(saved[0].duel, 'precision');
        assert.equal(saved[0].mirror, true);
        assert.equal(saved[0].series, 5);
        await geometry('couch presets');
      });
      await check('short-routes-and-shared-code-validation', async () => {
        await home();
        await openMode('Short sessions');
        assert.equal(await (await button('Start route')).count(), 3);
        await geometry('short sessions');
        await page.screenshot({ path: `${output}/${configuration}-routes.png` });
        await back();
        await page
          .getByRole('button', { name: new RegExp(`^${await label('Shared rally challenge')}`) })
          .click();
        await heading('Shared rally challenge');
        const input = page.getByRole('textbox', {
          name: await label('Challenge code'),
          exact: true
        });
        for (const code of ['', 'BAD', 'BB1-', 'BB1-!']) {
          await input.fill(code);
          assert.equal(await (await button('Start shared challenge')).isDisabled(), true, code);
          assert.equal(await page.getByRole('alert').count(), 1);
        }
        for (const code of ['BB1-A', ' bb1-friends ', 'BB1-1234567890ABCDEF']) {
          await input.fill(code);
          assert.equal(await (await button('Start shared challenge')).isEnabled(), true, code);
        }
        await geometry('shared challenge');
        await page.screenshot({ path: `${output}/${configuration}-shared.png` });
      });
      await check('demo-enter-and-exit-keeps-guest', async () => {
        await home();
        await profile();
        const before = await page.evaluate(async () =>
          (await import('/src/core/profile/store.ts')).profileStore.getSnapshot()
        );
        await click('Demo a level');
        await heading('Demo');
        for (const invalid of ['', '0', '1000', '1.5']) {
          await page.getByRole('spinbutton').fill(invalid);
          assert.equal(await page.locator('footer button').first().isDisabled(), true, invalid);
        }
        await page.getByRole('spinbutton').fill('1e2');
        await page
          .getByRole('button', { name: await label('Demo level 100'), exact: true })
          .waitFor();
        await page.getByRole('spinbutton').press('Enter');
        await (await button('Exit')).waitFor();
        assert.equal(
          await page.evaluate(async () =>
            (await import('/src/core/profile/store.ts')).profileStore.getDemoLevel()
          ),
          100
        );
        await click('Exit');
        assert.deepEqual(
          await page.evaluate(async () =>
            (await import('/src/core/profile/store.ts')).profileStore.getSnapshot()
          ),
          before
        );
        await profile();
        await click('Demo a level');
        await heading('Demo');
        await page.getByRole('spinbutton').fill('50');
        await page.getByRole('spinbutton').press('Enter');
        await (await button('Exit')).waitFor();
        await page.getByRole('button', { name: new RegExp(`^${await label('Talents')}`) }).click();
        await heading('Talents');
        await geometry('level 50 talents');
        await click('Power Strike, rank 0 of 1');
        await page.getByRole('dialog').waitFor();
        await page
          .getByRole('dialog')
          .getByRole('button', { name: new RegExp(`^${(await label('Spend ')).trim()}`) })
          .click();
        await click('Close details');
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page.getByRole('button', { name: /^\+\s/ }).first().click();
        await page.locator('div[class*="_picker_"] button').first().click();
        await openDisclosure('Saved builds');
        await page
          .getByRole('textbox', { name: await label('Build 1 name'), exact: true })
          .fill('Browser build');
        await click('Save current talents to build 1');
        await click('Reset all talents · free');
        await click('Tap again to refund every branch');
        await click('Load build 1');
        const demo = await page.evaluate(async () =>
          (await import('/src/core/profile/store.ts')).profileStore.getSnapshot()
        );
        assert.equal(demo.talents.ranks['power-strike'], 1);
        assert.equal(demo.talents.equipped[1], 'power-strike');
        assert.equal(demo.talents.presets[0].name, 'Browser build');
        await back();
        await click('Exit');
        const after = await page.evaluate(async () =>
          (await import('/src/core/profile/store.ts')).profileStore.getSnapshot()
        );
        assert.deepEqual(after, before, 'leaving demo must restore the full guest save');
      });
      console.log(`${configuration}: finished all real-app page scenarios`);
      await context.close();
    }
  }
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
  await browser?.close();
  await server.close();
}
assert.deepEqual(report.pageErrors, [], 'uncaught browser errors');
assert.deepEqual(report.failures, [], 'real-app UI failures');
console.log(
  `${report.checks.length} real-app browser page scenarios passed. Report: ${output}/results.json`
);
