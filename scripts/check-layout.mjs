import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

/* global window, document, getComputedStyle, innerWidth, innerHeight, DOMMatrixReadOnly */

// Real browser geometry, complementing check:ui's DOM interaction tests.
// The fixture is served only by this checker; it never enters a game build.
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body><div id="root"></div><script type="module">
import { createElement as h, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import '/src/styles/global.css';
import { createProfile } from '/src/core/profile/defaults.ts';
import { createDemoProfile } from '/src/core/profile/demo.ts';
import { JOURNEY, LEGACY_STAGES } from '/src/core/campaign/journey.ts';
import { createRun } from '/src/core/run/run.ts';
import { BOONS } from '/src/core/run/boons.ts';
import { createTournament } from '/src/core/tournament/bracket.ts';
import { ABILITY_DEFS } from '/src/core/talents/abilities.ts';
import { EMPTY_MATCH_STATS } from '/src/core/talents/types.ts';
import { applyMatchResult } from '/src/core/progression/apply.ts';
import { dayKey } from '/src/core/progression/xp.ts';
import { idleSnapshot } from '/src/game/engine.ts';
import { HomeScreen } from '/src/ui/screens/HomeScreen.tsx';
import { ModesScreen } from '/src/ui/screens/ModesScreen.tsx';
import { DifficultyScreen } from '/src/ui/screens/DifficultyScreen.tsx';
import { JourneyScreen } from '/src/ui/screens/JourneyScreen.tsx';
import { GauntletScreen } from '/src/ui/screens/GauntletScreen.tsx';
import { DailyScreen } from '/src/ui/screens/DailyScreen.tsx';
import { ChallengeScreen } from '/src/ui/screens/ChallengeScreen.tsx';
import { TournamentScreen } from '/src/ui/screens/TournamentScreen.tsx';
import { ProfileScreen } from '/src/ui/screens/ProfileScreen.tsx';
import { TalentScreen } from '/src/ui/screens/TalentScreen.tsx';
import { SettingsScreen } from '/src/ui/screens/SettingsScreen.tsx';
import { CustomizeScreen } from '/src/ui/screens/CustomizeScreen.tsx';
import { AchievementsScreen } from '/src/ui/screens/AchievementsScreen.tsx';
import { HowToPlayScreen } from '/src/ui/screens/HowToPlayScreen.tsx';
import { DemoScreen } from '/src/ui/screens/DemoScreen.tsx';
import { AccountScreen } from '/src/ui/screens/AccountScreen.tsx';
import { ResultScreen } from '/src/ui/screens/ResultScreen.tsx';
import { MatchHud } from '/src/ui/MatchHud.tsx';
import { Hud } from '/src/ui/Hud.tsx';
const root = createRoot(document.getElementById('root'));
let revision = 0;
const noop = () => {};
const components = { home: HomeScreen, modes: ModesScreen, quick: DifficultyScreen,
  practice: DifficultyScreen, journey: JourneyScreen, gauntlet: GauntletScreen,
  run: GauntletScreen, draft: GauntletScreen, daily: DailyScreen,
  challenge: ChallengeScreen, tournament: TournamentScreen, profile: ProfileScreen, talents: TalentScreen,
  settings: SettingsScreen, customize: CustomizeScreen, achievements: AchievementsScreen,
  help: HowToPlayScreen, demo: DemoScreen, account: AccountScreen, result: ResultScreen };
window.layoutReview = {
  actions: [],
  async render(name, state = 'fresh') {
    const profile = state === 'fresh' ? createProfile() : createDemoProfile(100, createProfile());
    profile.onboarded = true;
    if (state !== 'fresh') {
      profile.stats.matches = 50;
      profile.progress.journey = Object.fromEntries(LEGACY_STAGES.map(s => [s.id, 7]));
      profile.progress.runRecords.bestPressure = 49;
    }
    if (state === 'complete')
      profile.progress.journey = Object.fromEntries(JOURNEY.flatMap(w => w.stages).map(s => [s.id, 7]));
    if (name === 'run' || name === 'draft') {
      const run = createRun('layout-review', 20, Date.now(), state === 'deep' ? 'endless' : 'expedition');
      run.stage = state === 'deep' ? 1002 : state === 'last-act' ? 30 : 6;
      if (state === 'deep') run.actOffset = 3;
      if (state === 'committed') run.attempt = { stage: run.stage };
      run.credits = 6;
      run.boons = Object.fromEntries(BOONS.filter(b => b.family !== 'relic' && !b.instant).slice(0, 25).map(b => [b.id, 1]));
      run.results = Array.from({length:6}, (_,i) => ({stage:run.stage - 6 + i, won:true, you:5, bot:2}));
      if (name === 'draft') run.offer = BOONS.slice(0, 3).map(b => b.id);
      profile.progress.run = run;
    }
    if (name === 'tournament' && state === 'active') profile.tournament = createTournament(6, Date.now(), 'marathon');
    const result = {mode:'quick', ranked:true, botId:'pro', botRank:3, won:true,
      scoreYou:5, scoreBot:2, bestRally:24, hits:30, seconds:120, livesLeft:0,
      objectiveMet:true, objective:null, talent:EMPTY_MATCH_STATS, flicks:3,
      shutout:false, comeback:false, abandoned:false, day:dayKey(new Date())};
    if (name === 'result') {
      if (state === 'journey') Object.assign(result, {mode:'campaign', stageId:JOURNEY[5].stages[0].id});
      if (state === 'daily') Object.assign(result, {mode:'daily', dailyKey:'m2-' + result.day});
      if (state === 'waves') Object.assign(result, {mode:'endless', waves:12, scoreYou:0, scoreBot:0});
      if (['run', 'endless-run', 'far-endless-run', 'run-loss'].includes(state)) {
        const run = createRun('layout-result', 20, Date.now(), state.includes('endless-run') ? 'endless' : 'expedition');
        run.stage = state === 'far-endless-run' ? 1000000000002 : state === 'endless-run' ? 1002 : 6;
        profile.progress.run = run;
        Object.assign(result, {mode:'run', runStage:run.stage});
        if (state === 'run-loss') Object.assign(result, {won:false, scoreYou:2, scoreBot:5});
      }
    }
    const skill = (def, i) => ({slot:i, id:def.id, name:def.name, talent:def.talent,
      ready:i === 0, active:i === 1, cooldownLeft:i > 1 ? 12 : 0, hue:def.hue,
      progress:i === 0 ? 1 : .4, castId:0, refreshId:0, ultimate:!!def.ultimate,
      remain:0, duration:0, charges:0, maxCharges:0});
    const snapshot = {...idleSnapshot(), mode:state === 'goals' ? 'campaign' : 'quick',
      scoreYou:3, scoreBot:2, winScore:5, canPause:true, opponentName:'Legend · opportunist',
      rallyPressure:40, enemyAbilities:ABILITY_DEFS.slice(0,4).map(skill),
      goals:state === 'goals' ? [{id:'win', label:'Win the match',progress:'3 / 5 points',state:'active'},
        {id:'rails',label:'Land 6 rail banks',progress:'4 / 6 rail banks',state:'reached'},
        {id:'margin',label:'Win by two points',progress:'1 / 2 points',state:'active'}] : []};
    window.layoutReview.actions = [];
    const props = {profile, account:{status:'guest',pending:0}, demoLevel:null,
      practice:name === 'practice', onStart:(...args)=>window.layoutReview.actions.push(args),
      onPick:(...args)=>window.layoutReview.actions.push(args), onPlay:noop, onBack:noop,
      onAbandon:noop, onModes:noop, onExitDemo:noop, onProfile:noop, onTalents:noop,
      onSettings:noop, onHelp:noop, onAccount:noop, onAchievements:noop, onCustomize:noop, onDemo:noop,
      onPreview:noop, onMusicPreview:noop, onStopPreview:noop, onTutorial:noop, onPractice:noop, onExit:noop};
    if (name === 'result') Object.assign(props, {result, summary:applyMatchResult(profile,result),
      label:'Layout review', primaryLabel:'Continue', secondaryLabel:'Menu', onPrimary:noop, onSecondary:noop});
    root.render(name === 'match' ? h(Fragment,{key:++revision},
      h(MatchHud,{snapshot,objective:'Rally pressure: after 24 returns both paddles narrow, up to 40%',onGoals:noop}),
      h(Hud,{muted:false,canPause:true,onToggleMute:noop,onPause:noop})) : h(Fragment,{key:++revision},
      h(components[name],props),h(Hud,{muted:false,canPause:false,onToggleMute:noop,onPause:noop})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
};
</script></body></html>`;

const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, open: false, hmr: false },
  plugins: [
    {
      name: 'layout-fixture',
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (req.url !== '/__layout-review') return next();
          res.setHeader('Content-Type', 'text/html');
          res.end(await vite.transformIndexHtml('/__layout-review', fixture));
        });
      }
    }
  ]
});
let browser;
let checks = 0;
const screenshots = process.env.LAYOUT_SCREENSHOTS && resolve(process.env.LAYOUT_SCREENSHOTS);
try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  });
  if (screenshots) await mkdir(screenshots, { recursive: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10_000);
  // Account layout has no configured providers; no backend or credentials are needed.
  await page.route('**/v1/auth/oauth/providers', (route) =>
    route.fulfill({ json: { providers: [] } })
  );
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(new URL('/__layout-review', url).href);
  await page.waitForFunction(() => window.layoutReview);

  async function render(name, state = 'fresh') {
    await page.evaluate(([name, state]) => window.layoutReview.render(name, state), [name, state]);
    if (name === 'result') await page.waitForTimeout(1500);
  }
  async function choose(label, value) {
    await page.getByRole('button', { name: label, exact: typeof label === 'string' }).click();
    await page.getByRole('listbox').locator(`[data-value="${value}"]`).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
  }
  async function layout(label) {
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-picker-sheet]')].every((sheet) =>
        sheet.getAnimations().every((animation) => animation.playState === 'finished')
      )
    );
    const problems = await page.evaluate(() => {
      const problems = [];
      const screen = document.querySelector('section[class*="_screen_"]');
      if (!screen) return problems;
      if (screen.querySelector('select, input[type="date"]'))
        problems.push('Browser-owned picker remains');
      for (const el of screen.querySelectorAll('button, select, input, summary, progress')) {
        if (!el.getClientRects().length) continue;
        let scrolls = false;
        for (
          let parent = el.parentElement;
          parent && parent !== screen;
          parent = parent.parentElement
        ) {
          if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX)) scrolls = true;
        }
        const r = el.getBoundingClientRect();
        if (!scrolls && (r.left < -1 || r.right > innerWidth + 1))
          problems.push(
            'Horizontal clipping: ' +
              (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 70)
          );
        if ((el.tagName === 'SUMMARY' || el.hasAttribute('aria-haspopup')) && r.height < 43)
          problems.push('Small target: ' + el.textContent.trim().slice(0, 35));
      }
      for (const dialog of document.querySelectorAll('[role="dialog"]')) {
        const sheet = dialog.querySelector('[class*="_sheet_"]');
        if (!sheet) continue;
        const r = sheet.getBoundingClientRect();
        if (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight)
          problems.push('Choice panel outside viewport');
        const list = dialog.querySelector('[role="listbox"]');
        if (list.clientHeight < 75) problems.push('Choice list crushed');
        for (const option of list.querySelectorAll('[role="option"]')) {
          if (option.scrollWidth > option.clientWidth + 1) problems.push('Choice text clips');
          if (option.getBoundingClientRect().height < 44) problems.push('Small choice target');
        }
      }
      for (const el of screen.querySelectorAll(':scope > header, :scope > footer')) {
        const r = el.getBoundingClientRect();
        if (r.top < -1 || r.bottom > innerHeight + 1)
          problems.push('Header/footer outside viewport');
      }
      for (const el of screen.querySelectorAll('[class*="_resultRow_"]')) {
        if (el.scrollWidth > el.clientWidth + 1)
          problems.push('Result row overflows: ' + el.textContent);
      }
      const body = [...screen.children].find((el) => getComputedStyle(el).overflowY === 'auto');
      if (body && body.clientHeight < 80) problems.push('Menu body crushed');
      const heading = screen.querySelector('header > span');
      const sound = document.querySelector('[aria-label="Mute sound"]');
      if (
        heading &&
        sound &&
        innerWidth <= 707 &&
        heading.getBoundingClientRect().right > sound.getBoundingClientRect().left
      )
        problems.push('Heading overlaps global sound control');
      return problems;
    });
    assert.deepEqual(problems, [], label);
    checks++;
    if (screenshots)
      await page.screenshot({ path: join(screenshots, `${label}.png`), animations: 'disabled' });
  }

  const viewports = {
    desktop: { width: 1280, height: 800 },
    phone: { width: 390, height: 844 },
    small: { width: 320, height: 568 },
    landscape: { width: 844, height: 390 },
    tablet: { width: 768, height: 1024 }
  };
  async function pickerMotion(size, interrupted = false) {
    const trigger = page.getByRole('button', { name: 'Journey rules', exact: true });
    await trigger.click();
    const sheet = page.locator('[data-picker-sheet]');
    // Sample real CSS animations deterministically, including their intermediate frames.
    const entry = await sheet.evaluate((el, interrupted) => {
      const animation = el.getAnimations()[0];
      if (!animation) return null;
      animation.pause();
      const duration = animation.effect.getTiming().duration;
      const offsets = [0, duration / 2, duration].map((time) => {
        animation.currentTime = time;
        return new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
      });
      const scrim = el.parentElement.querySelector('button[tabindex="-1"]');
      const fade = scrim.getAnimations()[0];
      fade.pause();
      const opacities = [
        0,
        fade.effect.getTiming().duration / 2,
        fade.effect.getTiming().duration
      ].map((time) => {
        fade.currentTime = time;
        return Number(getComputedStyle(scrim).opacity);
      });
      const style = getComputedStyle(scrim);
      const backdrop = { color: style.backgroundColor, blur: style.backdropFilter };
      if (interrupted) {
        animation.currentTime = duration / 2;
        fade.currentTime = fade.effect.getTiming().duration / 2;
      } else {
        animation.finish();
        fade.finish();
      }
      return { duration, offsets, opacities, backdrop };
    }, interrupted);
    assert.ok(entry, `${size}: opening must animate`);
    assert.ok(entry.duration >= 300 && entry.duration <= 350);
    assert.ok(entry.offsets[0] > entry.offsets[1] && entry.offsets[1] > entry.offsets[2]);
    assert.ok(Math.abs(entry.offsets[2]) < 0.1);
    assert.equal(entry.opacities[0], 0);
    assert.ok(entry.opacities[1] > 0 && entry.opacities[1] < 1);
    assert.equal(entry.opacities[2], 1);
    assert.match(entry.backdrop.color, /0\.28\)$/);
    assert.equal(entry.backdrop.blur, 'none', 'the underlying page stays readable');
    if (size.startsWith('phone') || size === 'small')
      assert.ok(entry.offsets[0] > 150, 'phone sheets enter from below the viewport');
    if (screenshots && size === 'phone-interrupted')
      await page.screenshot({ path: join(screenshots, 'phone-choice-opening.png') });
    await page.keyboard.press('Escape');
    const exit = await sheet.evaluate((el) => {
      const animation = el.getAnimations()[0];
      if (!animation) return null;
      animation.pause();
      const duration = animation.effect.getTiming().duration;
      const offsets = [0, duration / 2, duration].map((time) => {
        animation.currentTime = time;
        return new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
      });
      const blocked = document.getElementById('root').hasAttribute('inert');
      const closing = el.dataset.closing;
      animation.finish();
      return { duration, offsets, blocked, closing };
    });
    assert.ok(exit, `${size}: closing must animate before unmount`);
    assert.equal(exit.duration, 220);
    if (interrupted)
      assert.ok(
        Math.abs(exit.offsets[0] - entry.offsets[1]) < 0.1,
        'early dismissal must not jump'
      );
    assert.ok(exit.offsets[0] < exit.offsets[1] && exit.offsets[1] < exit.offsets[2]);
    assert.equal(exit.blocked, true, 'background remains blocked through the last exit frame');
    assert.equal(exit.closing, 'true');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
    assert.equal(await page.locator('#root').getAttribute('inert'), null);
    checks++;
  }
  for (const [size, viewport] of Object.entries(viewports)) {
    await page.setViewportSize(viewport);
    for (const name of [
      'home',
      'modes',
      'quick',
      'practice',
      'journey',
      'gauntlet',
      'daily',
      'challenge',
      'tournament',
      'profile',
      'talents',
      'settings',
      'customize',
      'achievements',
      'help',
      'demo',
      'account',
      'result'
    ]) {
      await render(name);
      await layout(`${size}-${name}`);
      if (['modes', 'quick'].includes(name)) {
        const primary = page.getByRole('button', {
          name: name === 'modes' ? /Quick Match/ : /Rookie/
        });
        const box = await primary.boundingBox();
        assert.ok(
          box.y + box.height < viewport.height,
          `${size}: play choices must be visible before scrolling`
        );
      }
      if (['modes', 'quick', 'practice', 'profile', 'talents'].includes(name)) {
        await page.locator('details > summary').first().click();
        await layout(`${size}-${name}-expanded`);
      }
    }
    await render('journey');
    await pickerMotion(size);
    if (size === 'phone') {
      await pickerMotion('phone-interrupted', true);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await pickerMotion('phone-reduced-motion');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
    for (const label of ['Journey rules', 'Chapter']) {
      const trigger = page.getByRole('button', { name: label, exact: true });
      await trigger.click();
      assert.equal(
        await page.getByRole('listbox').evaluate((el) => el === document.activeElement),
        true
      );
      await layout(`${size}-journey-${label === 'Chapter' ? 'chapter' : 'rules'}-choices`);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'detached' });
      assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
    }
    await page.getByRole('button', { name: 'Journey rules', exact: true }).click();
    await page.keyboard.press('ArrowDown');
    assert.equal(
      await page.getByRole('option', { selected: true }).getAttribute('data-value'),
      'story'
    );
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(
      await page
        .getByRole('button', { name: 'Journey rules', exact: true })
        .getAttribute('data-value'),
      'veteran'
    );
    await render('quick');
    await page.getByText('Match setup', { exact: true }).click();
    await page.getByRole('button', { name: 'Court', exact: true }).click();
    await layout(`${size}-court-choices`);
    const search = page.getByRole('searchbox', { name: 'Search court', exact: true });
    await search.fill('xyz-unavailable');
    assert.equal(await page.getByRole('option').count(), 0);
    await search.fill('gatehouse');
    await layout(`${size}-court-search`);
    await page.getByRole('listbox').locator('[data-value="gatehouse-1"]').click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.equal(
      await page.getByRole('button', { name: 'Court', exact: true }).getAttribute('data-value'),
      'gatehouse-1'
    );
    await render('gauntlet');
    await page.getByRole('button', { name: /^Pressure/ }).click();
    assert.equal(await page.getByRole('option').last().getAttribute('aria-disabled'), 'true');
    await layout(`${size}-pressure-locked-choices`);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    for (const [name, state] of [
      ['journey', 'advanced'],
      ['gauntlet', 'advanced'],
      ['run', 'advanced'],
      ['run', 'last-act'],
      ['run', 'deep'],
      ['run', 'committed'],
      ['draft', 'advanced'],
      ['tournament', 'active'],
      ['talents', 'advanced']
    ]) {
      await render(name, state);
      await layout(`${size}-${name}-${state}`);
      if (name === 'journey') {
        assert.equal(await page.locator('[aria-label="Stage pages"]').count(), 1);
        assert.equal(await page.locator('[role="tabpanel"] button').count(), 6);
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        assert.match(await page.locator('[role="tabpanel"]').innerText(), /6-7/);
        await layout(`${size}-journey-page-2`);
        await page.getByRole('tab', { selected: true }).focus();
        await page.keyboard.press('ArrowRight');
        assert.match(await page.getByRole('tab', { selected: true }).innerText(), /Shifting Rails/);
        assert.equal(
          await page
            .getByRole('tab', { selected: true })
            .evaluate((el) => el === document.activeElement),
          true
        );
      }
      if (name === 'run') {
        const rows = await page.locator('[aria-label="Upcoming acts"] > div').evaluateAll((acts) =>
          acts.map((act) => {
            const nodes = [...act.children].slice(1).map((el) => el.getBoundingClientRect());
            return nodes.every((r) => Math.abs(r.top - nodes[0].top) < 1) && nodes.length === 6;
          })
        );
        assert.ok(rows.every(Boolean), `${size}: six encounters must fit on each act row`);
        if (state === 'last-act')
          assert.equal(rows.length, 1, 'Finite runs show only remaining acts');
        if (state === 'advanced') {
          for (const title of ['Your build', 'Act services', 'Road ahead']) {
            await page.getByText(title, { exact: true }).click();
            await layout(`${size}-run-${title.replaceAll(' ', '-').toLowerCase()}`);
          }
        }
      }
    }
    await render('journey', 'complete');
    assert.match(await page.locator('[data-screen-heading] + p').innerText(), /Journey Beyond/);
    await layout(`${size}-journey-beyond`);
    await render('gauntlet', 'advanced');
    await choose(/^Pressure/, '50');
    await page.getByRole('button', { name: /^Pressure/ }).click();
    await layout(`${size}-pressure-50-choices`);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.getByText('Run rules', { exact: true }).click();
    await layout(`${size}-gauntlet-pressure-50`);
    await render('practice');
    await page.getByText('Practice setup', { exact: true }).click();
    await choose('Boss drill', 'gatekeeper');
    await choose('Isolated phase', '2');
    await layout(`${size}-practice-boss-drill`);
    assert.equal(await page.getByLabel('Court', { exact: true }).count(), 0);
    const startDrill = page.getByRole('button', { name: 'Start boss drill', exact: true });
    const drillBox = await startDrill.boundingBox();
    assert.ok(drillBox.y + drillBox.height <= viewport.height);
    await startDrill.click();
    assert.equal((await page.evaluate(() => window.layoutReview.actions.at(-1)))[1].bossPhase, 2);
    for (const state of [
      'journey',
      'daily',
      'run',
      'endless-run',
      'far-endless-run',
      'run-loss',
      'waves'
    ]) {
      await render('result', state);
      await layout(`${size}-result-${state}`);
      if (state === 'run')
        assert.match(await page.locator('section[class*="_screen_"]').innerText(), /7 \/ 36/);
      if (state === 'endless-run')
        assert.match(await page.locator('section[class*="_screen_"]').innerText(), /Depth 1004/);
      if (state === 'run-loss')
        assert.match(await page.locator('section[class*="_screen_"]').innerText(), /6 \/ 36/);
    }
    await render('challenge');
    await page.getByText('Five-trial contract playlist', { exact: true }).click();
    await layout(`${size}-challenge-playlist`);
    await render('daily');
    await page.getByRole('button', { name: 'Master · Legend', exact: true }).click();
    assert.equal(
      await page
        .getByRole('button', { name: 'Master · Legend', exact: true })
        .getAttribute('aria-pressed'),
      'true'
    );
    await layout(`${size}-daily-master`);
    await page.getByText('Daily archive', { exact: true }).click();
    await layout(`${size}-daily-archive`);
    await page.getByRole('button', { name: 'Archive date', exact: true }).click();
    await layout(`${size}-archive-date-choices`);
    await page.getByRole('option').nth(1).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert.match(
      await page
        .getByRole('button', { name: 'Archive date', exact: true })
        .getAttribute('data-value'),
      /^\d{4}-\d{2}-\d{2}$/
    );
    for (const state of ['rules', 'goals']) {
      await render('match', state);
      const info = page.locator('[class*="_info_"]');
      const box = await info.boundingBox();
      assert.ok(box.height <= 170, `${size}: match HUD must stay compact (${box.height}px)`);
      const pause = await page
        .getByRole('button', { name: 'Pause game', exact: true })
        .boundingBox();
      assert.ok(box.x + box.width < pause.x, `${size}: match HUD overlaps pause`);
      if (viewport.height > viewport.width)
        assert.ok(
          box.x + box.width < viewport.width / 2 - 32,
          `${size}: match HUD covers the opponent's starting paddle`
        );
      assert.equal(
        await page.getByRole('img').count(),
        4,
        'Every enemy skill retains a readable accessible label'
      );
      await layout(`${size}-match-${state}`);
    }
    console.log(
      `✓ ${size}: menu geometry, expanded controls, stage browsing, run maps and match HUD`
    );
  }

  // Exercise browser fullscreen with touch input and an isolated device preference.
  const mobilePage = await browser.newPage({
    viewport: viewports.phone,
    hasTouch: true,
    isMobile: true
  });
  mobilePage.on('pageerror', (error) => errors.push(error.message));
  try {
    await mobilePage.goto(url);
    await mobilePage.getByRole('button', { name: 'Skip', exact: true }).click();
    await mobilePage.getByRole('button', { name: 'Settings', exact: true }).click();
    const fullscreen = mobilePage.getByRole('group', { name: 'Fullscreen', exact: true });
    await fullscreen.getByRole('button', { name: 'On', exact: true }).click();
    await mobilePage.waitForFunction(() => document.fullscreenElement === document.documentElement);
    assert.equal(
      await mobilePage.evaluate(
        () => JSON.parse(window.localStorage.getItem('bball.settings')).data.fullscreen
      ),
      true
    );
    if (screenshots)
      await mobilePage.screenshot({
        path: join(screenshots, 'app-phone-fullscreen-settings.png'),
        animations: 'disabled'
      });
    await fullscreen.getByRole('button', { name: 'Off', exact: true }).click();
    await mobilePage.waitForFunction(() => !document.fullscreenElement);
    assert.equal(
      await mobilePage.evaluate(
        () => JSON.parse(window.localStorage.getItem('bball.settings')).data.fullscreen
      ),
      false
    );
    await fullscreen.getByRole('button', { name: 'On', exact: true }).click();
    await mobilePage.waitForFunction(() => !!document.fullscreenElement);
    await mobilePage.evaluate(() => document.exitFullscreen());
    await mobilePage
      .getByText('Tap On or start a match to enter fullscreen again.', { exact: true })
      .waitFor();
    await mobilePage.reload();
    assert.equal(
      await mobilePage.evaluate(() => document.fullscreenElement === null),
      true,
      'reload waits for a gesture'
    );
    await mobilePage.getByRole('button', { name: 'More modes', exact: true }).click();
    await mobilePage.getByRole('button', { name: /Quick Match/ }).click();
    await mobilePage.getByRole('button', { name: /Rookie/ }).click();
    await mobilePage.waitForFunction(() => document.fullscreenElement === document.documentElement);
    await mobilePage.getByRole('button', { name: 'Pause game', exact: true }).waitFor();
    checks += 3;
    console.log(
      '✓ mobile browser: fullscreen On/Off, external exit, persisted preference and play-gesture re-entry'
    );
  } finally {
    await mobilePage.close();
  }

  const unsupportedPage = await browser.newPage({
    viewport: viewports.phone,
    hasTouch: true,
    isMobile: true
  });
  unsupportedPage.on('pageerror', (error) => errors.push(error.message));
  try {
    await unsupportedPage.addInitScript(() => {
      Object.defineProperty(document, 'fullscreenEnabled', { value: false });
    });
    await unsupportedPage.goto(new URL('/__layout-review', url).href);
    await unsupportedPage.waitForFunction(() => window.layoutReview);
    await unsupportedPage.evaluate(() => window.layoutReview.render('settings'));
    const fullscreen = unsupportedPage.getByRole('group', { name: 'Fullscreen', exact: true });
    assert.equal(
      await fullscreen.getByRole('button', { name: 'On', exact: true }).isDisabled(),
      true
    );
    await unsupportedPage
      .getByText('Fullscreen is unavailable in this browser or app.', { exact: true })
      .waitFor();
    checks++;
  } finally {
    await unsupportedPage.close();
  }

  // Exercise the actual app and canvas, using an isolated browser save.
  await page.setViewportSize(viewports.phone);
  await page.goto(url);
  await page.getByRole('button', { name: 'Skip', exact: true }).click();
  await page.getByRole('button', { name: 'More modes', exact: true }).click();
  await page.getByRole('button', { name: /Quick Match/ }).click();
  await page.getByRole('button', { name: /Legend/ }).click();
  await page.getByRole('button', { name: 'Pause game', exact: true }).waitFor();
  // Allow the versus introduction to finish before serving and inspecting a rally.
  await page.waitForTimeout(1800);
  await page.keyboard.press('Space');
  await page.mouse.move(195, 650);
  await page.waitForTimeout(1500);
  if (screenshots) await page.screenshot({ path: join(screenshots, 'app-phone-live-match.png') });
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.getByText('Opponent skills · 4', { exact: true }).click();
  assert.match(await page.locator('dl[class*="opponentSkills"]').innerText(), /Power Strike/);
  if (screenshots)
    await page.screenshot({
      path: join(screenshots, 'app-phone-pause-skills.png'),
      animations: 'disabled'
    });
  await page.getByRole('button', { name: 'Quit to menu', exact: true }).click();
  await page.getByRole('button', { name: 'More modes', exact: true }).click();
  await page.getByRole('button', { name: /Quick Match/ }).click();
  await page.getByText('Match setup', { exact: true }).click();
  await choose('Court', 'gatehouse-1');
  await choose('Opponent school', 'banker');
  await page.getByRole('button', { name: /Pro/ }).click();
  await page.getByRole('button', { name: 'Pause game', exact: true }).waitFor();
  await page.waitForTimeout(1800);
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  if (screenshots) await page.screenshot({ path: join(screenshots, 'app-phone-live-gate.png') });
  checks += 2;
  console.log(
    '✓ actual app: Legend rally, opponent skill details, menu return and configured gate court'
  );
  assert.deepEqual(errors, [], 'No browser runtime errors');
  console.log(
    `${checks} real-browser layout checks passed${screenshots ? `; screenshots: ${screenshots}` : ''}.`
  );
} finally {
  await browser?.close();
  await server.close();
}
