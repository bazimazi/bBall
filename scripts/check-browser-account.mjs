import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { makeServer, GOOD_PASSWORD } from '../server/test/helpers.ts';

// Run with node --import tsx. This is the real browser, HTTP API, cookie jar,
// SQLite, synchronization queue and mail links, isolated in memory. No remote
// services, real addresses, OAuth providers or outgoing emails are involved.
const output = '.temp/browser-account';
const report = { checks: [], responses: [], errors: [], failure: null };
const backend = await makeServer();
let vite;
let browser;
let page;
let current = '';
try {
  await mkdir(output, { recursive: true });
  const apiUrl = await backend.app.listen({ host: '127.0.0.1', port: 0 });
  vite = await createServer({
    logLevel: 'error',
    cacheDir: `.temp/browser-account-vite-${process.pid}`,
    server: {
      host: '127.0.0.1',
      port: 0,
      open: false,
      hmr: false,
      proxy: { '/v1': { target: apiUrl, changeOrigin: false } }
    }
  });
  await vite.listen();
  const baseUrl = vite.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on('pageerror', (error) => report.errors.push({ current, error: error.message }));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/v1/'))
      report.responses.push({ current, path: url.pathname, status: response.status() });
  });
  async function check(name, work) {
    current = name;
    await work();
    report.checks.push(name);
    console.log(`PASS account/${name}`);
  }
  async function state() {
    return page.evaluate(async () => ({
      account: (await import('/src/core/account/store.ts')).accountStore.getSnapshot(),
      profile: (await import('/src/core/profile/store.ts')).profileStore.getSnapshot()
    }));
  }
  async function settled(status = 'authenticated') {
    await page.waitForFunction(async (status) => {
      const { accountStore } = await import('/src/core/account/store.ts');
      const state = accountStore.getSnapshot();
      return state.status === status && state.pending === 0 && state.sync === 'idle' && !state.busy;
    }, status);
  }
  async function click(name) {
    await page.getByRole('button', { name, exact: true }).click();
  }
  async function heading(name) {
    await page.getByRole('heading', { name, exact: true }).waitFor();
    await page.getByText(`Opening ${name}…`, { exact: true }).waitFor({ state: 'detached' });
  }
  async function home() {
    await page.goto(baseUrl);
    await page.getByRole('button', { name: 'More modes', exact: true }).waitFor();
  }
  async function profile() {
    const saved = await state();
    await page
      .getByRole('button', {
        name: new RegExp(`^${saved.profile.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
      })
      .click();
    await heading('Profile');
  }
  async function account() {
    await profile();
    const saved = await state();
    await click(saved.account.status === 'authenticated' ? saved.account.email : 'Sign in');
    await heading('Account');
  }
  async function signIn(email, password) {
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await click('Sign in');
    await settled();
    await heading('Profile');
  }
  async function signOut() {
    await click('Sign out');
    await settled('guest');
  }
  function sameGuest(profile, expected) {
    // Loading reconciles timestamps and materializes zero-valued contract
    // counters. Compare all meaningful identity/progression fields.
    const normalized = (profile) => ({
      ...profile,
      updatedAt: 0,
      progress: {
        ...profile.progress,
        workshop: {
          ...profile.progress.workshop,
          contracts: Object.fromEntries(
            Object.entries(profile.progress.workshop.contracts).filter(([, count]) => count > 0)
          )
        }
      }
    });
    assert.deepEqual(normalized(profile), normalized(expected));
  }
  function mailHash(to, subject) {
    const message = backend.mailer.outbox.findLast(
      (message) => message.to === to && message.subject === subject
    );
    assert.ok(message, `expected ${subject} in isolated memory mailbox`);
    const link = message.text.match(/https?:\/\/\S+/)?.[0];
    assert.ok(link);
    return new URL(link).hash;
  }
  const emailA = 'browser-account-a@example.test';
  const emailB = 'browser-account-b@example.test';
  const resetPassword = 'different-safe-browser-password';
  let guest;
  let accountA;
  let accountB;
  await check('guest-onboarding', async () => {
    await page.goto(baseUrl);
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Guest browser');
    await click('Start playing');
    await page.getByRole('button', { name: 'More modes', exact: true }).waitFor();
    guest = (await state()).profile;
  });
  await check('registration-real-api-and-cookie-session', async () => {
    await account();
    await page.getByRole('tab', { name: 'Create account', exact: true }).click();
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(emailA);
    await page.getByLabel('New password', { exact: true }).fill(GOOD_PASSWORD);
    await page
      .getByRole('textbox', { name: 'Display name (optional)', exact: true })
      .fill('Account A');
    await click('Create account');
    await settled();
    await heading('Profile');
    const saved = await state();
    accountA = saved.account.user.id;
    assert.equal(saved.account.email, emailA);
    assert.equal(saved.profile.name, 'Account A');
    assert.notEqual(saved.profile.id, guest.id);
    const session = await page.evaluate(() => JSON.parse(localStorage.getItem('bball.session')));
    assert.equal(session.userId, accountA);
    assert.equal(
      session.refreshToken,
      undefined,
      'same-origin session stores no refresh credential in localStorage'
    );
    const cookies = await context.cookies();
    assert.ok(cookies.some((cookie) => cookie.httpOnly && cookie.path === '/v1/auth'));
  });
  await check('profile-change-real-sync-and-reload', async () => {
    const field = page.getByRole('textbox', { name: 'Player name', exact: true });
    await field.fill('Cloud browser');
    await field.press('Enter');
    await settled();
    await home();
    await settled();
    assert.equal((await state()).profile.name, 'Cloud browser');
    assert.equal((await state()).account.user.id, accountA);
    assert.ok(
      report.responses.some(
        (response) => response.path === '/v1/sync/push' && response.status === 200
      )
    );
    assert.ok(
      report.responses.some(
        (response) => response.path === '/v1/auth/refresh' && response.status === 200
      )
    );
  });
  await check('verification-email-link-and-token-removal', async () => {
    await page.goto(baseUrl + mailHash(emailA, 'Confirm your bBall account'));
    await page.waitForFunction(
      async () =>
        (await import('/src/core/account/store.ts')).accountStore.getSnapshot().user
          ?.emailVerified === true
    );
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(await page.getByRole('dialog', { name: 'Leave bBall?', exact: true }).count(), 0);
    await account();
    await page.getByText('Email confirmed', { exact: true }).waitFor();
    await page.screenshot({ path: `${output}/verified-account.png` });
    await page.goBack();
    await heading('Profile');
    await click(emailA);
    await heading('Account');
  });
  await check('signout-restores-full-guest-and-invalid-login', async () => {
    await signOut();
    sameGuest((await state()).profile, guest);
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(emailA);
    await page.getByLabel('Password', { exact: true }).fill('an-incorrect-password');
    const response = page.waitForResponse((response) => response.url().endsWith('/v1/auth/login'));
    await click('Sign in');
    assert.equal((await response).status(), 401);
    await page.locator('p[class*="_error_"]').waitFor();
    assert.equal((await state()).account.status, 'guest');
    sameGuest((await state()).profile, guest);
  });
  await check('sign-in-and-offline-identity-queue', async () => {
    await signIn(emailA, GOOD_PASSWORD);
    assert.equal((await state()).profile.name, 'Cloud browser');
    await context.setOffline(true);
    const field = page.getByRole('textbox', { name: 'Player name', exact: true });
    await field.fill('Offline change');
    await field.press('Enter');
    await page.waitForFunction(
      async () =>
        (await import('/src/core/account/store.ts')).accountStore.getSnapshot().pending > 0
    );
    assert.equal((await state()).profile.name, 'Offline change');
    await context.setOffline(false);
    await click(emailA);
    await heading('Account');
    await click('Sync now');
    await settled();
    await home();
    await settled();
    assert.equal((await state()).profile.name, 'Offline change');
    await account();
    await signOut();
  });
  await check('password-reset-link-real-mail-and-login', async () => {
    await click('Forgotten your password?');
    await heading('Reset password');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(emailA);
    await click('Send reset link');
    await page.getByRole('tab', { name: 'Sign in', exact: true }).waitFor();
    const resetHash = mailHash(emailA, 'Reset your bBall password');
    await page.goto(baseUrl + resetHash);
    await heading('Choose a password');
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(await page.getByRole('dialog', { name: 'Leave bBall?', exact: true }).count(), 0);
    await page.goBack();
    await heading('Profile');
    await click('Sign in');
    await heading('Account');
    await page.getByLabel('Password', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('New password', { exact: true }).count(), 0);
    await page.goto(baseUrl + resetHash);
    await heading('Choose a password');
    await page.getByLabel('New password', { exact: true }).fill(resetPassword);
    await click('Set password');
    await page.getByText('Your password is updated. Sign in with it.', { exact: true }).waitFor();
    await signIn(emailA, resetPassword);
    assert.equal((await state()).account.user.id, accountA);
    assert.equal((await state()).profile.name, 'Offline change');
    await click(emailA);
    await heading('Account');
    await signOut();
  });
  await check('second-account-isolated-ownership', async () => {
    await page.getByRole('tab', { name: 'Create account', exact: true }).click();
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(emailB);
    await page.getByLabel('New password', { exact: true }).fill(GOOD_PASSWORD);
    await page
      .getByRole('textbox', { name: 'Display name (optional)', exact: true })
      .fill('Account B');
    await click('Create account');
    await settled();
    await heading('Profile');
    accountB = (await state()).account.user.id;
    assert.notEqual(accountB, accountA);
    assert.equal((await state()).profile.name, 'Account B');
    await click(emailB);
    await heading('Account');
    await signOut();
    sameGuest((await state()).profile, guest);
    await signIn(emailA, resetPassword);
    assert.equal((await state()).account.user.id, accountA);
    assert.equal((await state()).profile.name, 'Offline change');
    await click(emailA);
    await heading('Account');
    await signOut();
  });
  await check('cancelled-oauth-deep-link-and-browser-back', async () => {
    await home();
    await page.goto(baseUrl + '#/oauth?status=cancelled');
    await heading('Account');
    await page.getByText('Sign-in cancelled.', { exact: true }).waitFor();
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(await page.getByRole('dialog', { name: 'Leave bBall?', exact: true }).count(), 0);
    await page.goBack();
    await page.getByRole('button', { name: 'More modes', exact: true }).waitFor();
    await account();
  });
  await check('delete-isolated-test-account-and-restore-guest', async () => {
    await signIn(emailB, GOOD_PASSWORD);
    await click(emailB);
    await heading('Account');
    await click('Delete account');
    await page.getByLabel('Confirm your password', { exact: true }).fill(GOOD_PASSWORD);
    await click('Cancel');
    assert.equal((await state()).account.user.id, accountB);
    await click('Delete account');
    await page.getByLabel('Confirm your password', { exact: true }).fill(GOOD_PASSWORD);
    await click('Delete for good');
    await settled('guest');
    sameGuest((await state()).profile, guest);
  });
  assert.deepEqual(report.errors, []);
  console.log(`${report.checks.length} browser/API account scenarios passed.`);
} catch (error) {
  report.failure = { current, error: error.message };
  await page?.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  if (page)
    report.failure.screen = await page
      .locator('body')
      .innerText()
      .catch(() => 'unavailable');
  console.error(`FAIL account/${current}: ${error.message}`);
  throw error;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
  await browser?.close();
  await vite?.close();
  await backend.close();
}
