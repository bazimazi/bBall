import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createElement } from 'react';
import { renderToPipeableStream, renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

// Exercise the real lazy declarations and React's async rendering without a
// browser or a second UI-testing dependency. This does not test DOM events,
// failed-download recovery, stylesheet loading or native webview behaviour.
const vite = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error'
});

async function render(element) {
  return new Promise((resolve, reject) => {
    let html = '';
    const errors = [];
    const output = new PassThrough();
    const timeout = setTimeout(() => {
      stream.abort();
      reject(new Error('Menu rendering timed out.'));
    }, 10_000);
    output.on('data', (chunk) => {
      html += chunk.toString();
    });
    output.on('error', reject);
    output.on('end', () => {
      clearTimeout(timeout);
      if (errors.length) reject(errors[0]);
      else resolve(html);
    });
    const stream = renderToPipeableStream(element, {
      onAllReady() {
        stream.pipe(output);
      },
      onShellError(error) {
        clearTimeout(timeout);
        reject(error);
      },
      onError(error) {
        errors.push(error);
      }
    });
  });
}

try {
  const [
    pages,
    { MenuBoundary },
    { createProfile },
    { accountStore },
    { settingsStore, DEFAULT_SETTINGS },
    { createWorld },
    { startMatch, publishResult },
    { quickMatchRules }
  ] = await Promise.all([
    vite.ssrLoadModule('/src/ui/screens/deferred.ts'),
    vite.ssrLoadModule('/src/ui/components/MenuBoundary.tsx'),
    vite.ssrLoadModule('/src/core/profile/defaults.ts'),
    vite.ssrLoadModule('/src/core/account/store.ts'),
    vite.ssrLoadModule('/src/core/settings/store.ts'),
    vite.ssrLoadModule('/src/game/world.ts'),
    vite.ssrLoadModule('/src/game/match.ts'),
    vite.ssrLoadModule('/src/core/modes/rules.ts')
  ]);
  const profile = createProfile();
  const silent = new Proxy({}, { get: () => () => 0 });
  const world = createWorld(silent, 1);
  startMatch(world, quickMatchRules('rookie'));
  world.match.winner = 'bot';
  world.match.score.bot = 5;
  publishResult(world);
  const noop = () => {};
  const props = {
    profile,
    account: accountStore.getSnapshot(),
    result: world.match.result,
    summary: null,
    label: 'Quick Match',
    primaryLabel: 'Play again',
    secondaryLabel: 'Menu',
    practice: false,
    demoLevel: null,
    token: null,
    onBack: noop,
    onPick: noop,
    onPlay: noop,
    onStart: noop,
    onExit: noop,
    onAbandon: noop,
    onPickBoon: noop,
    onAccount: noop,
    onAchievements: noop,
    onCustomize: noop,
    onSettings: noop,
    onDemo: noop,
    onTokenUsed: noop,
    onPrimary: noop,
    onSecondary: noop,
    onTalents: noop,
    onHelp: noop,
    onTutorial: noop,
    onPractice: noop,
    onPreview: noop,
    onMusicPreview: noop,
    onStopPreview: noop
  };
  const cases = [
    ['AccountScreen', 'account'],
    ['AchievementsScreen', 'achievements'],
    ['ChallengeScreen', 'challenges'],
    ['CustomizeScreen', 'customize'],
    ['DailyScreen', 'daily'],
    ['DemoScreen', 'demo'],
    ['DifficultyScreen', 'quick'],
    ['GauntletScreen', 'gauntlet'],
    ['HowToPlayScreen', 'help'],
    ['JourneyScreen', 'journey'],
    ['ModesScreen', 'modes'],
    ['ProfileScreen', 'profile'],
    ['ResultScreen', 'result'],
    ['SettingsScreen', 'settings'],
    ['TalentScreen', 'talents'],
    ['TournamentScreen', 'tournament']
  ];
  for (const [name, screen] of cases) {
    const component = createElement(pages[name], props);
    const html = await render(createElement(MenuBoundary, { screen, onBack: noop }, component));
    assert.match(html, /<h2\b/, `${name} did not render its heading.`);
    assert.doesNotMatch(
      html,
      /Opening .*…|This page couldn’t be opened/,
      `${name} stayed in its fallback.`
    );
  }
  const practice = await render(
    createElement(
      MenuBoundary,
      { screen: 'practice', onBack: noop },
      createElement(pages.DifficultyScreen, { ...props, practice: true })
    )
  );
  assert.match(practice, /Relaxed/, 'Practice lost its ball pace choice.');
  for (const [canvasQuality, label] of [
    ['high', 'High'],
    ['balanced', 'Balanced'],
    ['low', 'Low']
  ]) {
    settingsStore.update({ canvasQuality });
    const html = await render(createElement(pages.SettingsScreen, props));
    const group = html.match(/<div[^>]*aria-label="Court image quality"[^>]*>(.*?)<\/div>/s)?.[1];
    assert.ok(group, 'Settings lost the court image quality choice.');
    assert.match(group, new RegExp(`aria-pressed="true"[^>]*>${label}</button>`));
    assert.equal((group.match(/aria-pressed="true"/g) ?? []).length, 1);
  }
  settingsStore.update(DEFAULT_SETTINGS);
  const pending = renderToStaticMarkup(
    createElement(
      MenuBoundary,
      { screen: 'settings', onBack: noop },
      createElement(() => {
        throw new Promise(() => {});
      })
    )
  );
  assert.match(pending, /role="status"/);
  assert.match(pending, /aria-label="Back"/);
  assert.match(pending, /Opening Settings/);
  console.log(
    'All 16 lazy menu pages, Practice and court quality choices render; pending menus offer Back.'
  );
} finally {
  await vite.close();
}
