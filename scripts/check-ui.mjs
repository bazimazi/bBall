import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { act, createElement as h, Fragment, lazy, StrictMode, useState } from 'react';
import { createServer } from 'vite';

// Real React DOM mounts/events in a local DOM implementation. Layout boxes
// below are substitutes: this is not CSS, browser Tab order or screen-reader QA.
const vite = await createServer({
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'error'
});
const win = new Window({ url: 'https://bball.test/' });
const replacements = {
  window: win,
  document: win.document,
  navigator: win.navigator,
  HTMLElement: win.HTMLElement,
  HTMLButtonElement: win.HTMLButtonElement,
  Node: win.Node,
  Element: win.Element,
  MutationObserver: win.MutationObserver,
  getComputedStyle: win.getComputedStyle.bind(win),
  IS_REACT_ACT_ENVIRONMENT: true
};
const saved = new Map(
  Object.keys(replacements).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
for (const [key, value] of Object.entries(replacements))
  Object.defineProperty(globalThis, key, { value, configurable: true });
win.HTMLElement.prototype.getClientRects = function () {
  if (this.closest('[hidden]') || win.getComputedStyle(this).display === 'none') return [];
  for (let node = this.parentElement; node; node = node.parentElement) {
    if (
      node.tagName === 'DETAILS' &&
      !node.hasAttribute('open') &&
      !node.querySelector('summary')?.contains(this)
    )
      return [];
  }
  return [{ x: 0, y: 0, width: 100, height: 44 }];
};
const host = win.document.createElement('div');
host.id = 'root';
host.setAttribute('aria-hidden', 'false');
host.style.pointerEvents = 'auto';
win.document.body.append(host);
const { createRoot } = await import('react-dom/client');
const caughtErrors = [];
const root = createRoot(host, { onCaughtError: (error) => caughtErrors.push(error) });
let checks = 0;
const query = (selector) => {
  const element = win.document.querySelector(selector);
  assert.ok(element, `Missing ${selector}`);
  return element;
};
const focused = (element) =>
  assert.ok(
    win.document.activeElement === element,
    `Expected focus on ${element.tagName} ${element.textContent?.slice(0, 45)}; got ${win.document.activeElement?.tagName} ${win.document.activeElement?.textContent?.slice(0, 45)}`
  );
const button = (text) => {
  const element = [...win.document.querySelectorAll('button')].find(
    (entry) => entry.textContent === text
  );
  assert.ok(element, `Missing button: ${text}`);
  return element;
};
const click = async (element) => {
  element.focus();
  await act(() => element.click());
};
const key = async (element, name, shiftKey = false) => {
  const event = new win.KeyboardEvent('keydown', {
    key: name,
    shiftKey,
    bubbles: true,
    cancelable: true
  });
  await act(() => element.dispatchEvent(event));
  return event;
};
const mount = async (element) => {
  await act(async () => root.render(null));
  await act(async () => root.render(h(StrictMode, null, element)));
};
const check = async (name, test) => {
  await test();
  checks++;
  console.log(`✓ ${name}`);
};
const noop = () => {};
try {
  const [
    { Screen },
    { BrandLogo },
    { Overlay },
    { PausePanel },
    { ExitPanel },
    { Dialog },
    { TalentScreen },
    { createProfile },
    { MenuBoundary }
  ] = await Promise.all(
    [
      '/src/ui/components/Screen.tsx',
      '/src/ui/components/BrandLogo.tsx',
      '/src/ui/Overlay.tsx',
      '/src/ui/panels/PausePanel.tsx',
      '/src/ui/panels/ExitPanel.tsx',
      '/src/ui/components/Dialog.tsx',
      '/src/ui/screens/TalentScreen.tsx',
      '/src/core/profile/defaults.ts',
      '/src/ui/components/MenuBoundary.tsx'
    ].map((path) => vite.ssrLoadModule(path))
  );

  await check(
    'new page headings receive focus; ordinary rerenders preserve control focus',
    async () => {
      await mount(h(BrandLogo));
      focused(query('h1'));
      await mount(
        h(Screen, { title: 'Settings', onBack: noop }, h('button', null, 'Change quality'))
      );
      const heading = query('h2');
      focused(heading);
      assert.equal(query('section').getAttribute('aria-labelledby'), heading.id);
      const control = button('Change quality');
      control.focus();
      await act(() =>
        root.render(
          h(
            StrictMode,
            null,
            h(
              Screen,
              { title: 'Settings', subtitle: 'Updated', onBack: noop },
              h('button', null, 'Change quality')
            )
          )
        )
      );
      focused(control);
    }
  );

  await check(
    'Pause focuses Resume, wraps Tab, blocks background and restores the invoker',
    async () => {
      let resumes = 0;
      function Fixture() {
        const [show, setShow] = useState(false);
        const resume = () => {
          resumes++;
          setShow(false);
        };
        return h(
          Fragment,
          null,
          h('button', { onClick: () => setShow(true) }, 'Pause game'),
          h(
            Overlay,
            { show, label: 'Paused', onDismiss: resume, gameShortcuts: true },
            h(PausePanel, {
              label: 'Quick Match',
              onResume: resume,
              onSettings: noop,
              onRestart: noop,
              onQuit: noop
            })
          )
        );
      }
      await mount(h(Fixture));
      const opener = button('Pause game');
      await click(opener);
      const dialog = query('[role="dialog"]');
      assert.equal(dialog.getAttribute('aria-modal'), 'true');
      assert.equal(dialog.getAttribute('aria-label'), 'Paused');
      focused(button('Resume'));
      const summary = query('summary');
      assert.equal((await key(button('Resume'), 'Tab', true)).defaultPrevented, true);
      focused(summary);
      await key(summary, 'Tab');
      focused(button('Resume'));
      assert.equal(host.getAttribute('inert'), '');
      assert.equal(host.getAttribute('aria-hidden'), 'true');
      assert.equal(host.style.pointerEvents, 'none');
      opener.focus();
      focused(button('Resume'));
      let bubbledEscape = 0;
      const listen = (event) => {
        if (event.key === 'Escape') bubbledEscape++;
      };
      win.addEventListener('keydown', listen);
      await key(button('Resume'), 'Escape');
      win.removeEventListener('keydown', listen);
      assert.equal(resumes, 1);
      assert.equal(bubbledEscape, 0, 'dismissal cannot also reach the engine');
      focused(opener);
      assert.equal(host.hasAttribute('inert'), false);
      assert.equal(host.getAttribute('aria-hidden'), 'false');
      assert.equal(host.style.pointerEvents, 'auto');
    }
  );

  await check(
    'Exit starts on Keep playing; background clicks and Escape cannot confirm exit',
    async () => {
      let exits = 0;
      function Fixture() {
        const [show, setShow] = useState(false);
        return h(
          Fragment,
          null,
          h('button', { onClick: () => exits++ }, 'Background action'),
          h('button', { onClick: () => setShow(true) }, 'Show exit'),
          h(
            Overlay,
            { show, label: 'Leave bBall?', onDismiss: () => setShow(false) },
            h(ExitPanel, { native: false, onExit: () => exits++, onCancel: () => setShow(false) })
          )
        );
      }
      await mount(h(Fixture));
      await click(button('Show exit'));
      focused(button('Keep playing'));
      assert.equal(query('[role="dialog"]').dataset.gameModal, 'blocked');
      await act(() => button('Background action').click());
      assert.equal(exits, 0);
      await key(button('Keep playing'), 'Escape');
      assert.equal(exits, 0);
      assert.equal(win.document.querySelector('[role="dialog"]'), null);
      focused(button('Show exit'));
    }
  );

  await check(
    'talent details focus their name and close through a button, Escape or scrim',
    async () => {
      await mount(h(TalentScreen, { profile: createProfile(), onBack: noop }));
      const tile = query('button[aria-label*="rank 0 of"]');
      for (const close of ['button', 'escape', 'scrim']) {
        await click(tile);
        const dialog = query('[role="dialog"]');
        focused(dialog.querySelector('[data-dialog-initial]'));
        assert.ok(dialog.parentElement === win.document.body);
        assert.ok(dialog.getAttribute('aria-label'));
        const cancel = button('Close details');
        if (close === 'button') await click(cancel);
        else if (close === 'escape') await key(win.document.activeElement, 'Escape');
        else await act(() => query('button[aria-label="Close talent details"]').click());
        assert.equal(win.document.querySelector('[role="dialog"]'), null);
        focused(tile);
      }
    }
  );

  await check(
    'dialog containment excludes hidden/disabled controls and covers replaced backgrounds',
    async () => {
      await mount(
        h(
          Dialog,
          { label: 'Test dialog', onDismiss: noop, portal: true },
          h('button', { disabled: true }, 'Disabled'),
          h('button', { hidden: true }, 'Hidden'),
          h('button', { style: { visibility: 'hidden' } }, 'Invisible'),
          h('button', null, 'First'),
          h('details', null, h('summary', { tabIndex: 0 }, 'More'), h('button', null, 'Collapsed')),
          h('button', null, 'Last')
        )
      );
      focused(button('First'));
      button('Last').focus();
      await key(button('Last'), 'Tab');
      focused(button('First'));
      await key(button('First'), 'Tab', true);
      focused(button('Last'));
      const added = win.document.createElement('button');
      added.textContent = 'New background';
      await act(async () => {
        win.document.body.append(added);
        await Promise.resolve();
      });
      assert.equal(added.hasAttribute('inert'), true);
      await act(() => root.render(null));
      assert.equal(added.hasAttribute('inert'), false);
      added.remove();
    }
  );

  await check('nested dialogs give only the top layer Escape and restore outer focus', async () => {
    function Fixture() {
      const [inner, setInner] = useState(false);
      return h(
        Dialog,
        { label: 'Outer', onDismiss: noop, portal: true },
        h('button', { onClick: () => setInner(true) }, 'Open inner'),
        inner &&
          h(
            Dialog,
            { label: 'Inner', onDismiss: () => setInner(false), portal: true },
            h('button', null, 'Inner action')
          )
      );
    }
    await mount(h(Fixture));
    const opener = button('Open inner');
    await click(opener);
    focused(button('Inner action'));
    assert.equal(query('[aria-label="Outer"]').hasAttribute('inert'), true);
    await key(button('Inner action'), 'Escape');
    assert.equal(win.document.querySelector('[aria-label="Inner"]'), null);
    assert.equal(query('[aria-label="Outer"]').hasAttribute('inert'), false);
    focused(opener);
  });

  await check(
    'an empty dialog contains Tab and returns to the playfield after its opener disappears',
    async () => {
      function Fixture() {
        const [show, setShow] = useState(false);
        return h(
          Fragment,
          null,
          h('canvas', { tabIndex: -1 }),
          !show && h('button', { onClick: () => setShow(true) }, 'Temporary opener'),
          show &&
            h(
              Dialog,
              { label: 'Empty dialog', onDismiss: () => setShow(false), portal: true },
              'Waiting'
            )
        );
      }
      await mount(h(Fixture));
      await click(button('Temporary opener'));
      const dialog = query('[role="dialog"]');
      focused(dialog);
      for (const backwards of [false, true]) {
        assert.equal((await key(dialog, 'Tab', backwards)).defaultPrevented, true);
        focused(dialog);
      }
      await key(dialog, 'Escape');
      assert.equal(win.document.querySelector('[role="dialog"]'), null);
      focused(query('canvas'));
    }
  );

  await check(
    'lazy menu loading and completion move focus; leaving a pending page stays put',
    async () => {
      let resolve;
      const Pending = lazy(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      );
      function Fixture() {
        const [show, setShow] = useState(true);
        return show
          ? h(MenuBoundary, { screen: 'settings', onBack: () => setShow(false) }, h(Pending))
          : h(BrandLogo);
      }
      await mount(h(Fixture));
      focused(query('h2'));
      await click(query('button[aria-label="Back"]'));
      focused(query('h1'));
      await act(async () => resolve({ default: () => h(Screen, { title: 'Settings' }, 'Loaded') }));
      focused(query('h1'));
      await mount(h(MenuBoundary, { screen: 'settings', onBack: noop }, h(Pending)));
      focused(query('h2'));
      assert.match(host.textContent, /Loaded/);
      let complete;
      const Waiting = lazy(
        () =>
          new Promise((done) => {
            complete = done;
          })
      );
      await mount(h(MenuBoundary, { screen: 'settings', onBack: noop }, h(Waiting)));
      const waitingHeading = query('h2');
      focused(waitingHeading);
      await act(async () =>
        complete({ default: () => h(Screen, { title: 'Settings' }, 'Ready menu') })
      );
      assert.ok(query('h2') !== waitingHeading, 'completion must replace the waiting page');
      focused(query('h2'));
      assert.match(host.textContent, /Ready menu/);
    }
  );

  await check('failed menus focus recovery and Back can leave the failed boundary', async () => {
    const failure = new Error('Intentional unavailable menu');
    let reject;
    const Failed = lazy(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        })
    );
    function Fixture() {
      const [show, setShow] = useState(true);
      return show
        ? h(MenuBoundary, { screen: 'settings', onBack: () => setShow(false) }, h(Failed))
        : h(BrandLogo);
    }
    await mount(h(Fixture));
    await act(async () => reject(failure));
    assert.match(query('[role="alert"]').textContent, /couldn’t be opened/);
    focused(query('h2'));
    let reloads = 0;
    const reload = win.location.reload;
    win.location.reload = () => {
      reloads++;
    };
    try {
      assert.equal(reloads, 0, 'failed loads never reload automatically');
      await click(button('Reload game'));
      assert.equal(reloads, 1);
    } finally {
      win.location.reload = reload;
    }
    await click(button('Back'));
    focused(query('h1'));
    assert.deepEqual(caughtErrors, [failure]);
  });

  await check(
    'menu navigation, native-style Back dispatch and Gauntlet scores work without Array.at',
    async () => {
      const [{ useGameFlow }, { idleSnapshot }, routing, { GauntletScreen }, { createRun }] =
        await Promise.all(
          [
            '/src/ui/hooks/useGameFlow.ts',
            '/src/game/engine.ts',
            '/src/core/platform/back.ts',
            '/src/ui/screens/GauntletScreen.tsx',
            '/src/core/run/run.ts'
          ].map((path) => vite.ssrLoadModule(path))
        );
      const at = Object.getOwnPropertyDescriptor(Array.prototype, 'at');
      function Fixture() {
        const flow = useGameFlow(null, idleSnapshot());
        return h(
          Screen,
          { key: flow.screen, title: flow.screen },
          h('button', { onClick: () => flow.go('settings') }, 'Open settings'),
          h('button', { onClick: flow.back }, 'Route back')
        );
      }
      try {
        Reflect.deleteProperty(Array.prototype, 'at');
        await mount(h(Fixture));
        const initial = query('h2').textContent;
        await click(button('Open settings'));
        assert.equal(query('h2').textContent, 'settings');
        await click(button('Route back'));
        assert.equal(query('h2').textContent, initial);
        routing.installBackRouting();
        let backs = 0;
        const remove = routing.pushBackHandler(() => backs++);
        try {
          win.dispatchEvent(new win.PopStateEvent('popstate'));
          assert.equal(backs, 1);
        } finally {
          remove();
        }
        const profile = createProfile();
        profile.progress.run = createRun('ui-check', 0);
        profile.progress.run.stage = 1;
        profile.progress.run.results = [
          { stage: 0, won: false, you: 1, bot: 3 },
          { stage: 0, won: true, you: 3, bot: 2 }
        ];
        await mount(
          h(GauntletScreen, {
            profile,
            onStart: noop,
            onPlay: noop,
            onPick: noop,
            onAbandon: noop,
            onBack: noop
          })
        );
        assert.match(host.textContent, /3-2/);
        assert.doesNotMatch(host.textContent, /1-3/);
      } finally {
        if (at) Object.defineProperty(Array.prototype, 'at', at);
      }
    }
  );
  await check(
    'Pause settings return without restarting or resuming; key capture owns Escape',
    async () => {
      const [
        { useGameFlow },
        { idleSnapshot },
        { SettingsScreen },
        { settingsStore },
        { useBackHandler },
        routing
      ] = await Promise.all(
        [
          '/src/ui/hooks/useGameFlow.ts',
          '/src/game/engine.ts',
          '/src/ui/screens/SettingsScreen.tsx',
          '/src/core/settings/store.ts',
          '/src/ui/hooks/useBackHandler.ts',
          '/src/core/platform/back.ts'
        ].map((path) => vite.ssrLoadModule(path))
      );
      const previousSettings = settingsStore.getSnapshot();
      const calls = [];
      const commands = {
        play: () => calls.push('play'),
        replay: () => calls.push('replay'),
        quitToMenu: () => calls.push('quit'),
        resume: () => calls.push('resume')
      };
      const snapshot = {
        ...idleSnapshot(),
        status: 'paused',
        label: 'Quick Match',
        scoreYou: 2,
        scoreBot: 1
      };
      let stoppedPreviews = 0;
      const stopPreview = () => stoppedPreviews++;
      function Fixture() {
        const flow = useGameFlow(commands, snapshot);
        useBackHandler(flow.screen === 'settings', flow.back);
        return h(
          Fragment,
          null,
          h('canvas', { tabIndex: -1 }),
          flow.screen !== 'playing' &&
            flow.screen !== 'settings' &&
            h('button', { onClick: () => flow.startQuick('rookie') }, 'Start match'),
          flow.screen === 'settings' &&
            h(SettingsScreen, {
              pausedGame: true,
              onBack: flow.back,
              onPreview: noop,
              onMusicPreview: noop,
              onStopPreview: stopPreview
            }),
          h(
            Overlay,
            {
              show: flow.screen === 'playing',
              label: 'Paused',
              onDismiss: commands.resume,
              gameShortcuts: true
            },
            h(PausePanel, {
              label: snapshot.label,
              score: { you: 2, bot: 1 },
              onResume: commands.resume,
              onSettings: () => flow.go('settings'),
              onRestart: flow.replay,
              onQuit: flow.quitToMenu
            })
          )
        );
      }
      try {
        routing.installBackRouting();
        await mount(h(Fixture));
        await click(button('Start match'));
        focused(button('Resume'));
        for (const exit of ['footer', 'header', 'escape', 'back']) {
          await click(button('Settings'));
          focused(query('h2'));
          assert.match(host.textContent, /Game paused/);
          assert.equal(win.document.querySelector('[role="dialog"]'), null);
          const low = query('[aria-label="Court image quality"] button:last-child');
          await click(low);
          assert.equal(settingsStore.getSnapshot().canvasQuality, 'low');
          focused(low);
          // Escape cancels remapping first, then a second Escape can leave Settings.
          if (exit === 'escape') {
            query('details').setAttribute('open', '');
            const binding = query('button[aria-label*="primary key:"]');
            await click(binding);
            assert.equal(binding.getAttribute('aria-pressed'), 'true');
            await key(binding, 'Escape');
            assert.equal(binding.getAttribute('aria-pressed'), 'false');
            assert.match(host.textContent, /Change cancelled/);
            assert.ok(button('Return to paused game'));
          }
          const stopped = stoppedPreviews;
          if (exit === 'footer') await click(button('Return to paused game'));
          else if (exit === 'header') await click(query('button[aria-label="Back"]'));
          else if (exit === 'escape') await key(win.document.activeElement, 'Escape');
          else await act(() => win.dispatchEvent(new win.PopStateEvent('popstate')));
          assert.ok(stoppedPreviews > stopped, 'leaving stops the audio preview');
          focused(button('Resume'));
          assert.equal(query('[role="dialog"]').getAttribute('aria-label'), 'Paused');
          assert.ok(query('[role="dialog"] [aria-label="You 2, opponent 1"]'));
          assert.deepEqual(
            calls,
            ['play'],
            'returning must not resume, restart or abandon the match'
          );
        }
        await click(button('Resume'));
        assert.deepEqual(calls, ['play', 'resume']);
      } finally {
        await act(() => root.render(null));
        settingsStore.update(previousSettings);
      }
    }
  );

  await check(
    'pending or failed Pause settings keep a return route and explain reload',
    async () => {
      let resolve;
      const Pending = lazy(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      );
      function PendingFixture() {
        const [show, setShow] = useState(true);
        return show
          ? h(
              MenuBoundary,
              { screen: 'settings', pausedGame: true, onBack: () => setShow(false) },
              h(Pending)
            )
          : h(
              Overlay,
              { show: true, label: 'Paused', onDismiss: noop, gameShortcuts: true },
              h(PausePanel, {
                label: 'Quick Match',
                onResume: noop,
                onSettings: noop,
                onRestart: noop,
                onQuit: noop
              })
            );
      }
      await mount(h(PendingFixture));
      assert.match(host.textContent, /Game paused/);
      await key(query('h2'), 'Escape');
      focused(button('Resume'));
      await act(async () =>
        resolve({ default: () => h(Screen, { title: 'Settings' }, 'Late menu') })
      );
      focused(button('Resume'));
      let reject;
      const failure = new Error('Intentional unavailable Pause settings');
      const Failed = lazy(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          })
      );
      function FailedFixture() {
        const [show, setShow] = useState(true);
        return show
          ? h(
              MenuBoundary,
              { screen: 'settings', pausedGame: true, onBack: () => setShow(false) },
              h(Failed)
            )
          : h(
              Overlay,
              { show: true, label: 'Paused', onDismiss: noop, gameShortcuts: true },
              h(PausePanel, {
                label: 'Quick Match',
                onResume: noop,
                onSettings: noop,
                onRestart: noop,
                onQuit: noop
              })
            );
      }
      await mount(h(FailedFixture));
      await act(async () => reject(failure));
      focused(query('h2'));
      assert.match(query('[role="alert"]').textContent, /Reload ends the current match/);
      const choices = [...query('footer').querySelectorAll('button')].map(
        (entry) => entry.textContent
      );
      assert.deepEqual(choices, ['Return to paused game', 'Reload game']);
      await click(button('Return to paused game'));
      focused(button('Resume'));
      assert.ok(caughtErrors.includes(failure));
    }
  );

  console.log(
    `${checks} UI interaction checks passed (DOM only; layout and assistive technology need manual QA).`
  );
} finally {
  await act(() => root.unmount());
  await vite.close();
  await win.happyDOM.abort();
  win.close();
  for (const [key, original] of saved) {
    if (original) Object.defineProperty(globalThis, key, original);
    else Reflect.deleteProperty(globalThis, key);
  }
}
