import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import ts from 'typescript';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

const dictionary = JSON.parse(await readFile('src/core/i18n/fa.json', 'utf8'));
for (const [source, target] of Object.entries(dictionary)) {
  assert.ok(target.trim(), `Empty translation: ${source}`);
  const slots = new Set(source.match(/\{\d+\}/g) ?? []);
  for (const slot of target.match(/\{\d+\}/g) ?? [])
    assert.ok(slots.has(slot), `Unknown placeholder ${slot}: ${source}`);
}
let literalChecks = 0;
for (const file of (await readdir('src/ui', { recursive: true })).filter((file) =>
  file.endsWith('.tsx')
)) {
  const source = ts.createSourceFile(
    file,
    await readFile(`src/ui/${file}`, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const walk = (node) => {
    if (ts.isCallExpression(node) && ['t', 'msg'].includes(node.expression.getText(source))) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument) && /[a-z]{2}/i.test(argument.text)) {
        assert.ok(
          Object.hasOwn(dictionary, argument.text),
          `Missing translation in ${file}: ${argument.text}`
        );
        literalChecks++;
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
}
const win = new Window({ url: 'https://bball.test' });
const originals = new Map(
  ['window', 'document', 'localStorage'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key)
  ])
);
for (const [key, value] of Object.entries({
  window: win,
  document: win.document,
  localStorage: win.localStorage
}))
  Object.defineProperty(globalThis, key, { value, configurable: true });
// An older save keeps all its other settings and gains the English default.
win.localStorage.setItem(
  'bball.settings',
  JSON.stringify({ v: 1, data: { musicVolume: 0.3, shake: 'off' } })
);
const vite = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error'
});
try {
  const { settingsStore } = await vite.ssrLoadModule('/src/core/settings/store.ts');
  const { t, msg, installLanguage, locale } = await vite.ssrLoadModule('/src/core/i18n/index.ts');
  const { apiErrorText } = await vite.ssrLoadModule('/src/core/i18n/errors.ts');
  assert.equal(settingsStore.getSnapshot().language, 'en');
  assert.equal(settingsStore.getSnapshot().musicVolume, 0.3);
  assert.equal(settingsStore.getSnapshot().shake, 'off');
  const stop = installLanguage();
  assert.equal(win.document.documentElement.dir, 'ltr');
  settingsStore.update({ language: 'fa' });
  assert.equal(win.document.documentElement.lang, 'fa');
  assert.equal(win.document.documentElement.dir, 'rtl');
  assert.equal(locale(), 'fa-IR');
  assert.equal(JSON.parse(win.localStorage.getItem('bball.settings')).data.language, 'fa');
  assert.equal(t('Settings'), 'تنظیمات');
  assert.equal(t(123), '۱۲۳');
  assert.equal(msg('Win by {0} or more', [t(3)]), 'با اختلاف ۳ یا بیشتر ببرید');
  assert.equal(t('Reach an 8-hit rally'), 'به رالی ۸ ضربه‌ای برسید');
  assert.equal(t('Clear Twin Routes'), 'عبور از مسیرهای دوقلو');
  assert.equal(t('Branch 14 · Rail Slalom'), 'شاخه ۱۴ · مارپیچ ریل');
  assert.equal(t('Afterreach + Clutch Calm'), 'دسترسی پسین + آرامش لحظهٔ حساس');
  assert.equal(t('1m 59s'), '۱ دقیقه ۵۹ ثانیه');
  assert.equal(t('5h 12m'), '۵ ساعت ۱۲ دقیقه');
  assert.equal(t('1 flick'), '۱ ضربهٔ چرخشی');
  assert.equal(t('12 flicks'), '۱۲ ضربهٔ چرخشی');
  assert.equal(t('Power Strike 0/1'), 'ضربهٔ قدرتی ۰/۱');
  assert.equal(t('Rookie → Amateur → Pro'), 'تازه‌کار → آماتور → حرفه‌ای');
  assert.equal(t('MATCH POINT'), 'امتیاز پایانی');
  assert.equal(t('Unknown future content'), 'Unknown future content');
  assert.equal(
    apiErrorText({
      code: 'INVALID_CREDENTIALS',
      message: 'New server wording',
      details: undefined
    }),
    'ایمیل و گذرواژه مطابقت ندارند.'
  );
  assert.equal(
    apiErrorText({
      code: 'VALIDATION_FAILED',
      message: 'Some of those values are not valid.',
      details: [{ message: 'Expected string' }]
    }),
    'برخی مقدارها معتبر نیستند.'
  );

  let catalogChecks = 0;
  const visited = new Set();
  const fields = new Set([
    'name',
    'title',
    'blurb',
    'theme',
    'benefit',
    'costText',
    'technique',
    'label'
  ]);
  const translated = (value, context) => {
    assert.doesNotMatch(
      t(value).replaceAll('bBall', ''),
      /[a-z]|\{\d+\}/i,
      `Untranslated ${context}: ${value}`
    );
    catalogChecks++;
  };
  const walk = (node, key = '') => {
    if (typeof node === 'string' && fields.has(key)) return translated(node, key);
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    for (const [name, value] of Object.entries(node)) walk(value, Array.isArray(node) ? key : name);
  };
  for (const name of [
    'campaign/journey',
    'campaign/expansion',
    'modes/challenges',
    'modes/bosses',
    'modes/arenas',
    'modes/expansionCourts',
    'modes/catalog',
    'talents/catalog',
    'talents/abilities',
    'talents/synergy',
    'talents/expansion',
    'run/boons',
    'run/expansionBoons',
    'run/formats',
    'equipment/catalog',
    'equipment/workshop',
    'achievements/catalog',
    'cosmetics/catalog',
    'bots/levels',
    'quests/quests',
    'tournament/bracket'
  ])
    walk(await vite.ssrLoadModule(`/src/core/${name}.ts`));
  const { TALENTS } = await vite.ssrLoadModule('/src/core/talents/catalog.ts');
  for (const talent of TALENTS)
    for (let rank = 1; rank <= talent.maxRank; rank++)
      translated(talent.rankText(rank), talent.name);
  const { ABILITY_DEFS } = await vite.ssrLoadModule('/src/core/talents/abilities.ts');
  const { resolveLoadout } = await vite.ssrLoadModule('/src/core/talents/effects.ts');
  const { createProfile } = await vite.ssrLoadModule('/src/core/profile/defaults.ts');
  const loadout = resolveLoadout(createProfile().talents, 100);
  for (const ability of ABILITY_DEFS) translated(ability.summary(loadout.effects), ability.name);
  settingsStore.update({ language: 'en' });
  assert.equal(t('Settings'), 'Settings');
  assert.equal(t(123), 123);
  assert.equal(win.document.documentElement.lang, 'en');
  assert.equal(win.document.documentElement.dir, 'ltr');
  assert.equal(settingsStore.getSnapshot().musicVolume, 0.3);
  assert.equal(settingsStore.getSnapshot().shake, 'off');
  settingsStore.update({ language: 'unsupported' });
  assert.equal(settingsStore.getSnapshot().language, 'en');
  stop();
  console.log(
    `${literalChecks} UI messages and ${catalogChecks} generated catalog/skill descriptions translated; saved locale, migration, numbers, errors and direction verified.`
  );
} finally {
  await vite.close();
  win.close();
  for (const [key, original] of originals) {
    if (original) Object.defineProperty(globalThis, key, original);
    else Reflect.deleteProperty(globalThis, key);
  }
}
