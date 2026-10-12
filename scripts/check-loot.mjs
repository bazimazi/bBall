import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

/* global window, document, getComputedStyle, innerWidth */

// Test-only seeded guest, real stores, UI and game engine. No backend or credentials.
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import { createElement as h, useSyncExternalStore, useEffect, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import '/src/styles/global.css';
import { createProfile } from '/src/core/profile/defaults.ts';
import { xpToReach, levelOf } from '/src/core/progression/levels.ts';
import { buyTalent, reconcile, createTalentSave } from '/src/core/talents/save.ts';
import { talentBuildOn } from '/src/core/talents/builds.ts';
import { resolveLoadout } from '/src/core/talents/effects.ts';
import { specializationBuilds } from '/src/core/loot/ops.ts';
import { lootBalance } from '/src/core/loot/state.ts';
import { quickMatchRules } from '/src/core/modes/rules.ts';
import { DEFAULT_THEME } from '/src/core/cosmetics/theme.ts';
let seed = createProfile(); seed.onboarded = true; seed.xp = xpToReach(50);
seed.progress.loot.earned = {shards:500,threads:100,cores:50};
seed.talents = reconcile(seed.talents, 50);
seed.talents = buyTalent(seed.talents, 50, 'heavy-impact');
seed = talentBuildOn(seed, 0, 'save', 'Attack');
seed.talents = reconcile(createTalentSave(), 50);
seed = talentBuildOn({...seed,talents:{...seed.talents,presets:seed.talents.presets ?? [null]}}, 1, 'save', 'Control') ?? seed;
// Store both legal presets without pre-unlocking any research.
seed.talents.presets[0] = {name:'Attack',ranks:{'heavy-impact':1},equipped:[null,null,null,null,null]};
if (!localStorage.getItem('bball.profile')) localStorage.setItem('bball.profile', JSON.stringify({v:5,data:seed}));
const [ { profileStore }, { settingsStore }, { installLanguage, t }, { LootScreen }, { TalentScreen }, { PausePanel }, { Overlay }, { useGameEngine }, { GameCanvas }, progression ] = await Promise.all([
  import('/src/core/profile/store.ts'), import('/src/core/settings/store.ts'), import('/src/core/i18n/index.ts'),
  import('/src/ui/screens/LootScreen.tsx'), import('/src/ui/screens/TalentScreen.tsx'), import('/src/ui/panels/PausePanel.tsx'),
  import('/src/ui/Overlay.tsx'), import('/src/ui/hooks/useGameEngine.ts'), import('/src/ui/GameCanvas.tsx'), import('/src/core/account/progression.ts')
]);
installLanguage(); settingsStore.update({autoServe:false,resumeCountdown:false,musicVolume:0,sfxVolume:0});
const root = createRoot(document.getElementById('root')); let revision = 0;
function Court() {
  const {canvasRef,snapshot,engine} = useGameEngine(DEFAULT_THEME);
  useEffect(() => {
    if (!engine) return;
    const p = profileStore.getSnapshot();
    engine.setPreferences(settingsStore.getSnapshot()); engine.setLoadout(resolveLoadout(p.talents, levelOf(p.xp)));
    engine.play(progression.prepareMatch(quickMatchRules('rookie')), specializationBuilds(p).map(b=>({name:b.name,loadout:resolveLoadout(b.talents,levelOf(p.xp))})));
    window.lootReview.engine = engine;
  },[engine]);
  return h(Fragment,null,h(GameCanvas,{ref:canvasRef}),
    snapshot.status === 'serve' && h('button',{className:'courtside-switch',onClick:()=>engine.pause()},t('Change specialization')),
    h(Overlay,{show:snapshot.status === 'paused',label:t('Paused'),onDismiss:()=>engine.resume()},
      h(PausePanel,{label:snapshot.label,specializations:snapshot.specializations,canSwitchSpecialization:snapshot.canSwitchSpecialization,activeSpecialization:snapshot.activeSpecialization,
        onSwitchSpecialization:engine?.switchSpecialization,onResume:()=>engine.resume(),onSettings:()=>{},onRestart:()=>engine.replay(),onQuit:()=>engine.quitToMenu()})));
}
function View({name}) {
  const profile = useSyncExternalStore(profileStore.subscribe,profileStore.getSnapshot);
  useSyncExternalStore(settingsStore.subscribe,settingsStore.getSnapshot);
  if (name === 'court') return h(Court);
  if (name === 'talents') return h(TalentScreen,{profile,onBack:()=>{},onLab:()=>window.lootReview.render('lab')});
  return h(LootScreen,{profile,onBack:()=>{},onTalents:()=>window.lootReview.render('talents'),onPlay:id=>window.lootReview.trials.push(id)});
}
window.lootReview = {
  trials:[], engine:null,
  render(name='lab') {root.render(h(View,{name,key:++revision}));},
  language(language) {settingsStore.update({language}); this.render();},
  profile:()=>profileStore.getSnapshot(), balance:()=>lootBalance(profileStore.getSnapshot().progress.loot),
  saveBuild:(slot)=>profileStore.talentBuild(slot,'save',profileStore.getSnapshot().talents.presets[slot].name)
};
window.lootReview.render();
</script></body></html>`;

const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, open: false, hmr: false },
  plugins: [
    {
      name: 'loot-review',
      configureServer(vite) {
        vite.middlewares.use(async (request, response, next) => {
          if (request.url !== '/__loot-review') return next();
          response.setHeader('Content-Type', 'text/html');
          response.end(await vite.transformIndexHtml('/__loot-review', fixture));
        });
      }
    }
  ]
});
const fa = JSON.parse(await readFile('src/core/i18n/fa.json', 'utf8'));
const captures = process.env.LOOT_SCREENSHOTS && resolve(process.env.LOOT_SCREENSHOTS);
let browser,
  checks = 0;
let appSave;
const errors = [];
try {
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  });
  if (captures) await mkdir(captures, { recursive: true });
  for (const [size, viewport] of Object.entries({
    phone: { width: 390, height: 844 },
    narrow: { width: 320, height: 568 },
    landscape: { width: 844, height: 390 },
    desktop: { width: 1440, height: 900 }
  })) {
    for (const language of ['en', 'fa']) {
      for (const reducedMotion of ['no-preference', 'reduce']) {
        const page = await browser.newPage({ viewport, reducedMotion });
        page.setDefaultTimeout(10_000);
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(new URL('/__loot-review', server.resolvedUrls.local[0]).href);
        await page.waitForFunction(() => window.lootReview);
        await page.evaluate((language) => window.lootReview.language(language), language);
        const t = (text) => (language === 'fa' ? (fa[text] ?? text) : text);
        const label = `${size}-${language}-${reducedMotion}`;
        async function render(name) {
          await page.evaluate((name) => window.lootReview.render(name), name);
          await page.waitForTimeout(100);
        }
        async function geometry(part) {
          await page.waitForFunction(() =>
            [...document.querySelectorAll('section')].every((section) =>
              section
                .getAnimations({ subtree: true })
                .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
                .every((animation) => animation.playState === 'finished')
            )
          );
          const issues = await page.evaluate(() => {
            const issues = [];
            for (const element of document.querySelectorAll('button,input,summary,h3,p')) {
              if (
                !element.getClientRects().length ||
                element.closest('[aria-hidden="true"], [inert]') ||
                (element.closest('details:not([open])') && !element.closest('summary'))
              )
                continue;
              const r = element.getBoundingClientRect();
              let scroll = element.parentElement;
              while (scroll && !['auto', 'scroll'].includes(getComputedStyle(scroll).overflowX))
                scroll = scroll.parentElement;
              if (!scroll && (r.left < -1 || r.right > innerWidth + 1))
                issues.push('horizontal clipping: ' + element.textContent.slice(0, 60));
              // Tree reset geometry predates this change; measure the new controls.
              if (
                element.matches('button,input,summary') &&
                !element.matches('[class*="_treeReset_"]') &&
                !element.closest('footer') &&
                r.height < 43
              )
                issues.push('small target: ' + element.textContent.slice(0, 50));
            }
            return issues;
          });
          assert.deepEqual(issues, [], `${label}/${part}`);
          if (captures && reducedMotion === 'no-preference')
            await page.screenshot({ path: join(captures, `${size}-${language}-${part}.png`) });
          checks++;
        }
        const card = (name) =>
          page
            .getByRole('article')
            .filter({ has: page.getByRole('heading', { name: t(name), exact: true }) });
        async function buy(name) {
          const purchase = card(name).getByRole('button');
          await purchase.click();
          assert.equal(await purchase.innerText(), t('Confirm unlock'));
          await purchase.click();
          await card(name).getByText(t('Unlocked'), { exact: true }).waitFor();
        }
        assert.equal(await card('Triple Specialization').getByRole('button').isDisabled(), true);
        await geometry('research');
        await buy('Precision Refund');
        await buy('Dual Specialization');
        await buy('Triple Specialization');
        await buy('Courtside Switch');
        await buy('Pulse Brake');
        await buy('Phase Lens');
        await buy('Resonance Trials');
        assert.deepEqual(await page.evaluate(() => window.lootReview.balance()), {
          shards: 269,
          threads: 64,
          cores: 41
        });
        checks++;
        await page.getByRole('button', { name: t('Expert trials'), exact: true }).click();
        await geometry('trials');
        await page
          .getByRole('button', { name: t('Enter trial'), exact: true })
          .first()
          .click();
        assert.deepEqual(await page.evaluate(() => window.lootReview.trials), [
          'resonance-velocity'
        ]);
        await render('talents');
        await page.getByText(t('Saved builds'), { exact: true }).click();
        await page
          .getByRole('button', {
            name: language === 'fa' ? fa['Load build {0}'].replace('{0}', '۱') : 'Load build 1',
            exact: true
          })
          .click();
        const pointsBefore = (await page.evaluate(() => window.lootReview.profile())).talents
          .points;
        await page.getByRole('button', { name: new RegExp('^' + t('Heavy Impact')) }).click();
        await page.getByRole('button', { name: t('Refund one rank · free'), exact: true }).click();
        assert.equal(
          (await page.evaluate(() => window.lootReview.profile())).talents.ranks['heavy-impact'] ??
            0,
          0
        );
        assert.equal(
          (await page.evaluate(() => window.lootReview.profile())).talents.points,
          pointsBefore + 1
        );
        await page.getByRole('button', { name: t('Close details'), exact: true }).click();
        // Loading an older preset should retain ownership, but it does not auto-equip new skills.
        await page.evaluate(async () => {
          const progression = await import('/src/core/account/progression.ts');
          progression.equipAbility(0, 'pulse-brake');
          progression.equipAbility(1, 'phase-lens');
        });
        const name = language === 'fa' ? 'بازیابی' : 'Recovery';
        await page
          .getByRole('textbox', {
            name: language === 'fa' ? fa['Build {0} name'].replace('{0}', '۲') : 'Build 2 name'
          })
          .fill(name);
        const save = page.getByRole('button', {
          name:
            language === 'fa'
              ? fa['Save current talents to build {0}'].replace('{0}', '۲')
              : 'Save current talents to build 2'
        });
        await save.click();
        assert.equal(
          (await page.evaluate(() => window.lootReview.profile())).talents.presets[1].name,
          'Control'
        );
        await save.click();
        assert.equal(
          (await page.evaluate(() => window.lootReview.profile())).talents.presets[1].name,
          name
        );
        await geometry('builds');
        // Both new research skills belong to the build just saved.
        assert.ok(
          (
            await page.evaluate(() => window.lootReview.profile())
          ).talents.presets[1].equipped.includes('pulse-brake')
        );
        await render('lab');
        await page.getByRole('button', { name: t('Specializations'), exact: true }).click();
        for (const [slot, preset] of [
          [1, 0],
          [2, 1]
        ]) {
          const slotName =
            language === 'fa'
              ? fa['Specialization {0}'].replace('{0}', slot === 1 ? '۱' : '۲')
              : `Specialization ${slot}`;
          await page.getByRole('button', { name: slotName, exact: true }).click();
          await page.getByRole('listbox').locator(`[data-value="${preset}"]`).click();
          await page.getByRole('dialog').waitFor({ state: 'detached' });
        }
        assert.deepEqual(
          (await page.evaluate(() => window.lootReview.profile())).progress.loot.specializations,
          [0, 1, null]
        );
        await geometry('specializations');
        await page.reload();
        await page.waitForFunction(() => window.lootReview);
        assert.deepEqual(await page.evaluate(() => window.lootReview.balance()), {
          shards: 269,
          threads: 64,
          cores: 41
        });
        assert.deepEqual(
          (await page.evaluate(() => window.lootReview.profile())).progress.loot.specializations,
          [0, 1, null]
        );
        await page.evaluate((language) => window.lootReview.language(language), language);
        await render('court');
        await page.getByRole('button', { name: t('Change specialization'), exact: true }).click();
        await page.getByRole('dialog').waitFor();
        assert.equal(
          await page
            .getByRole('button', { name: t('Resume'), exact: true })
            .evaluate((element) => element === document.activeElement),
          true
        );
        await page.getByRole('button', { name, exact: true }).click();
        assert.equal(
          await page.evaluate(() => window.lootReview.engine.getSnapshot().activeSpecialization),
          1
        );
        assert.equal(
          await page.evaluate(() => window.lootReview.engine.switchSpecialization(0)),
          false
        );
        assert.ok(
          (await page.evaluate(() => window.lootReview.engine.getSnapshot().abilities)).some(
            (skill) => skill.id === 'pulse-brake'
          )
        );
        await geometry('courtside');
        await page.getByRole('button', { name: t('Resume'), exact: true }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await page.evaluate(() => window.lootReview.engine.serve());
        await page.waitForFunction(() => window.lootReview.engine.getSnapshot().status === 'play');
        assert.equal(
          await page.evaluate(() => window.lootReview.engine.switchSpecialization(0)),
          false
        );
        checks++;
        console.log(
          `✓ ${label}: research, builds, pins, trials, persistence and real court switch`
        );
        appSave = await page.evaluate(() =>
          Object.fromEntries(
            Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])
          )
        );
        await page.close();
      }
    }
  }
  // Verify the application routes and board button with the actual HUD/ability bar.
  const app = await browser.newPage({ viewport: { width: 390, height: 844 } });
  app.on('pageerror', (error) => errors.push(error.message));
  await app.addInitScript((save) => {
    for (const [key, value] of Object.entries(save)) localStorage.setItem(key, value);
  }, appSave);
  await app.goto(server.resolvedUrls.local[0]);
  await app.evaluate(async () => {
    const { settingsStore } = await import('/src/core/settings/store.ts');
    settingsStore.update({ language: 'en', autoServe: false });
  });
  await app.getByRole('button', { name: 'Resonance Lab · loot and upgrades', exact: true }).click();
  await app.getByRole('heading', { name: 'Resonance Lab', exact: true }).waitFor();
  await app.getByRole('button', { name: 'Specializations', exact: true }).click();
  await app.getByRole('button', { name: 'Manage saved builds', exact: true }).click();
  await app.getByRole('heading', { name: 'Talents', exact: true }).waitFor();
  await app.getByRole('button', { name: 'Back', exact: true }).click();
  await app.getByRole('heading', { name: 'Resonance Lab', exact: true }).waitFor();
  await app.getByRole('button', { name: 'Back', exact: true }).click();
  await app.getByRole('button', { name: 'More modes', exact: true }).click();
  await app.getByRole('button', { name: /Quick Match/ }).click();
  await app.getByRole('button', { name: /Rookie/ }).click();
  const switchButton = app.getByRole('button', { name: 'Change specialization', exact: true });
  await switchButton.waitFor();
  const reach = await switchButton.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === element;
  });
  assert.equal(reach, true, 'courtside button remains reachable above the real HUD');
  if (captures) await app.screenshot({ path: join(captures, 'app-phone-serve.png') });
  await switchButton.click();
  await app.getByRole('dialog').waitFor();
  assert.equal(
    await app
      .getByRole('button', { name: 'Resume', exact: true })
      .evaluate((element) => element === document.activeElement),
    true
  );
  await app.getByRole('button', { name: 'بازیابی', exact: true }).click();
  await app.getByRole('button', { name: 'Resume', exact: true }).click();
  await app.getByRole('dialog').waitFor({ state: 'detached' });
  assert.ok((await app.getByRole('button', { name: /Pulse Brake/ }).count()) > 0);
  checks++;
  console.log('✓ actual app: Home/Lab/Talents routes and courtside switch above the real HUD');
  await app.close();
  assert.deepEqual(errors, [], 'browser runtime errors');
  console.log(`${checks} loot browser checks passed`);
} finally {
  await browser?.close();
  await server.close();
}
