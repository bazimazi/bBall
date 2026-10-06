import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const output = resolve(
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'dist'
);
const reportOnly = process.argv.includes('--report-only');
const manifest = JSON.parse(await readFile(resolve(output, '.vite/manifest.json'), 'utf8'));
const initial = new Set();
function visit(key) {
  if (initial.has(key)) return;
  const chunk = manifest[key];
  assert.ok(chunk, `Missing manifest dependency: ${key}`);
  initial.add(key);
  for (const dependency of chunk.imports ?? []) visit(dependency);
}
for (const [key, chunk] of Object.entries(manifest)) if (chunk.isEntry) visit(key);
assert.ok(initial.size, 'Build has no entry chunk. Run npm run build first.');

async function sizes(files) {
  const buffers = await Promise.all([...files].map((file) => readFile(resolve(output, file))));
  return {
    bytes: buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0),
    gzip: buffers.reduce((sum, buffer) => sum + gzipSync(buffer).byteLength, 0)
  };
}
const jsFiles = new Set([...initial].map((key) => manifest[key].file));
const cssFiles = new Set([...initial].flatMap((key) => manifest[key].css ?? []));
const js = await sizes(jsFiles);
const css = await sizes(cssFiles);
const kb = (bytes) => (bytes / 1000).toFixed(2);
console.log(`Initial JS: ${kb(js.bytes)} kB (${kb(js.gzip)} kB gzip), ${jsFiles.size} files`);
console.log(`Initial CSS: ${kb(css.bytes)} kB (${kb(css.gzip)} kB gzip), ${cssFiles.size} files`);

const pages = Object.entries(manifest).filter(([key]) => key.startsWith('src/ui/screens/'));
console.log(`Deferred menu pages: ${pages.length}`);
if (!reportOnly) {
  const files = new Set();
  for (const [key, chunk] of Object.entries(manifest)) {
    files.add(chunk.file);
    for (const css of chunk.css ?? []) files.add(css);
    for (const dependency of [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])])
      assert.ok(manifest[dependency], `${key} has a missing dependency: ${dependency}`);
  }
  await Promise.all([...files].map((file) => readFile(resolve(output, file))));
  // Check real boundaries, not only a smaller entry filename. Shared static
  // chunks count against startup even if the bundler gives them other names.
  const expected = [
    'AccountScreen',
    'AchievementsScreen',
    'ChallengeScreen',
    'CustomizeScreen',
    'DailyScreen',
    'DemoScreen',
    'DifficultyScreen',
    'GauntletScreen',
    'HowToPlayScreen',
    'JourneyScreen',
    'ModesScreen',
    'ProfileScreen',
    'ResultScreen',
    'SettingsScreen',
    'TalentScreen',
    'TournamentScreen'
  ];
  for (const name of expected) {
    const key = `src/ui/screens/${name}.tsx`;
    assert.ok(manifest[key]?.isDynamicEntry, `${name} is no longer a deferred page.`);
    assert.ok(!jsFiles.has(manifest[key].file), `${name} is part of the initial load.`);
  }
  const diagnostics = manifest['src/dev/experience.ts'];
  assert.ok(diagnostics?.isDynamicEntry, 'Experience capture must remain opt-in and deferred.');
  assert.ok(!jsFiles.has(diagnostics.file), 'Experience recorder is part of ordinary startup.');
  console.log('All menu chunks and CSS exist; optional pages are outside the initial JS graph.');
}
