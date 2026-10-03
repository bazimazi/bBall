import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const chrome =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].find(existsSync);
if (!chrome) throw new Error('Set CHROME_PATH to a Chromium browser executable.');
const profile = await mkdtemp(join(tmpdir(), 'bball-audio-'));
const browser = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    '--remote-debugging-pipe',
    'about:blank'
  ],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] }
);
let sequence = 0;
let buffer = '';
const pending = new Map();
browser.stdio[4].on('data', (data) => {
  buffer += data.toString();
  let end;
  while ((end = buffer.indexOf('\0')) !== -1) {
    const result = JSON.parse(buffer.slice(0, end));
    buffer = buffer.slice(end + 1);
    const request = pending.get(result.id);
    if (!request) continue;
    pending.delete(result.id);
    if (result.error) request.reject(new Error(result.error.message));
    else request.resolve(result.result);
  }
});
browser.on('error', (error) => {
  for (const request of pending.values()) request.reject(error);
});
browser.on('exit', () => {
  for (const request of pending.values()) request.reject(new Error('Chromium exited'));
});
function call(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    browser.stdio[3].write(
      `${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`
    );
  });
}
const timeout = setTimeout(() => browser.kill(), 60000);
try {
  const bundle = await build({
    entryPoints: ['scripts/audio-check.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser'
  });
  const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  const result = await call(
    'Runtime.evaluate',
    {
      expression: `${bundle.outputFiles[0].text}\nrunAudioCheck()`,
      awaitPromise: true,
      returnByValue: true
    },
    sessionId
  );
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  console.table(
    Object.fromEntries(
      Object.entries(result.result.value).map(([name, { peak, rms }]) => [
        name,
        { peak: peak.toFixed(3), rms: rms.toFixed(4) }
      ])
    )
  );
  console.log('All effects, all four songs, stacked mix, volume-off and mute checks passed.');
} finally {
  clearTimeout(timeout);
  const exited = new Promise((resolve) => browser.once('exit', resolve));
  browser.kill();
  if (browser.exitCode === null) await exited;
  // The only deleted directory is the exact fresh profile created above.
  if (dirname(profile) === tmpdir())
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
