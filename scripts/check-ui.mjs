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
// DOM/event-object assertion diffs can traverse React's graph on a failure.
const absent = (selector) =>
  assert.ok(win.document.querySelector(selector) === null, `Unexpected ${selector}`);
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
  await act(async () => {
    element.focus();
    element.click();
  });
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
async function withClipboard(clipboard, test) {
  const original = Object.getOwnPropertyDescriptor(win.navigator, 'clipboard');
  Object.defineProperty(win.navigator, 'clipboard', { value: clipboard, configurable: true });
  try {
    await test();
  } finally {
    await act(() => root.render(null));
    if (original) Object.defineProperty(win.navigator, 'clipboard', original);
    else Reflect.deleteProperty(win.navigator, 'clipboard');
  }
}
async function withLocalDate(start, test) {
  const OriginalDate = globalThis.Date;
  let now = start.getTime();
  class LocalDate extends OriginalDate {
    constructor(...args) {
      if (args.length) super(...args);
      else super(now);
    }
    static now() {
      return now;
    }
  }
  globalThis.Date = LocalDate;
  try {
    await test((milliseconds) => {
      now += milliseconds;
    });
  } finally {
    await act(() => root.render(null));
    globalThis.Date = OriginalDate;
  }
}
async function withVisibility(test, initiallyHidden = false) {
  const original = Object.getOwnPropertyDescriptor(win.document, 'hidden');
  Object.defineProperty(win.document, 'hidden', {
    value: initiallyHidden,
    writable: true,
    configurable: true
  });
  try {
    await test(async (hidden) => {
      await act(() => {
        win.document.hidden = hidden;
        win.document.dispatchEvent(new win.Event('visibilitychange'));
      });
    });
  } finally {
    await act(() => root.render(null));
    if (original) Object.defineProperty(win.document, 'hidden', original);
    else Reflect.deleteProperty(win.document, 'hidden');
  }
}
// Advance only component timeouts. React/Vite keep their real Node timers.
async function withUiClock(test) {
  const set = win.setTimeout;
  const clear = win.clearTimeout;
  const pending = new Map();
  let now = 0;
  let id = 0;
  win.setTimeout = (callback, delay) => {
    pending.set(++id, { callback, at: now + delay });
    return id;
  };
  win.clearTimeout = (handle) => pending.delete(handle);
  try {
    await test(
      async (milliseconds) => {
        now += milliseconds;
        await act(() => {
          for (const [handle, timer] of [...pending]) {
            if (timer.at > now) continue;
            pending.delete(handle);
            timer.callback();
          }
        });
      },
      () => pending.size
    );
  } finally {
    try {
      await act(() => root.render(null));
      assert.equal(pending.size, 0, 'unmount must remove pending feedback timeouts');
    } finally {
      win.setTimeout = set;
      win.clearTimeout = clear;
    }
  }
}
// Drive the result count-up without real animation frames or incidental act warnings.
async function withUiFrames(test) {
  const originals = new Map(
    ['requestAnimationFrame', 'cancelAnimationFrame'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key)
    ])
  );
  const pending = new Map();
  let now = performance.now();
  let id = 0;
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback) => {
      pending.set(++id, callback);
      return id;
    }
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: (handle) => pending.delete(handle)
  });
  try {
    await test(async (milliseconds) => {
      now += milliseconds;
      await act(() => {
        for (const [handle, callback] of [...pending]) {
          pending.delete(handle);
          callback(now);
        }
      });
    });
  } finally {
    try {
      await act(() => root.render(null));
      assert.equal(pending.size, 0, 'unmount must cancel the result animation frame');
    } finally {
      for (const [key, original] of originals) {
        if (original) Object.defineProperty(globalThis, key, original);
        else Reflect.deleteProperty(globalThis, key);
      }
    }
  }
}
try {
  const { AbilityBar } = await vite.ssrLoadModule('/src/ui/AbilityBar.tsx');
  const skill = {
    slot: 2,
    id: 'power-strike',
    name: 'Power Strike',
    talent: 'power-strike',
    ready: true,
    progress: 1,
    castId: 0,
    refreshId: 0,
    active: false,
    ultimate: false,
    hue: 30,
    cooldownLeft: 0,
    remain: 0,
    duration: 0,
    charges: 0,
    maxCharges: 0
  };
  const bar = (ability, onUse = noop, show = true) =>
    h(AbilityBar, { abilities: [ability], show, side: 'right', onUse });
  const renderBar = async (ability, show = true) =>
    act(() => root.render(h(StrictMode, null, bar(ability, noop, show))));
  const burstSelector = 'span[class*="burstCast"], span[class*="burstRefresh"]';

  await check('skill feedback expires even while its cooldown ring keeps updating', async () => {
    await withUiClock(async (advance) => {
      await mount(bar(skill));
      await renderBar({ ...skill, ready: false, progress: 0, castId: 1 });
      query('span[class*="burstCast"]');
      await advance(300);
      await renderBar({ ...skill, ready: false, progress: 0.05, castId: 1 });
      await advance(399);
      query('span[class*="burstCast"]');
      await advance(1);
      absent(burstSelector);
    });
  });

  await check(
    'skill buttons accept primary mouse/touch/pen and keyboard activation once, preserving slots',
    async () => {
      const used = [];
      let bubbled = 0;
      const fixture = (ability) =>
        h(
          'div',
          { onPointerDown: () => bubbled++ },
          bar(ability, (slot) => used.push(slot))
        );
      await mount(fixture(skill));
      const control = query('button');
      const pointerDown = async (button, pointerType) => {
        const event = new win.PointerEvent('pointerdown', {
          button,
          pointerType,
          bubbles: true,
          cancelable: true
        });
        await act(() => control.dispatchEvent(event));
        return event;
      };
      for (const pointerType of ['mouse', 'pen']) {
        for (const button of [1, 2, 3, 4]) await pointerDown(button, pointerType);
      }
      assert.deepEqual(used, [], 'secondary and auxiliary presses cannot spend a skill');
      for (const pointerType of ['mouse', 'touch', 'pen']) {
        assert.equal((await pointerDown(0, pointerType)).defaultPrevented, true);
        await act(() =>
          control.dispatchEvent(new win.MouseEvent('click', { detail: 1, bubbles: true }))
        );
      }
      assert.deepEqual(used, [2, 2, 2], 'pointer click cannot repeat its pointerdown cast');
      assert.equal(bubbled, 0, 'presses must stay out of paddle controls');
      await click(control);
      assert.deepEqual(used, [2, 2, 2, 2], 'keyboard/assistive click uses the real equipped slot');
      await act(() =>
        root.render(h(StrictMode, null, fixture({ ...skill, ready: false, cooldownLeft: 3 })))
      );
      focused(control);
      assert.equal(control.getAttribute('aria-disabled'), 'true');
      assert.equal(control.disabled, false, 'cooldown details remain keyboard discoverable');
      await pointerDown(0, 'touch');
      await click(control);
      assert.deepEqual(used, [2, 2, 2, 2], 'unavailable controls cannot invoke a cast');
    }
  );

  await check(
    'skill cast and Echo feedback follow events, including identical cooldown progress',
    async () => {
      await withUiClock(async (advance) => {
        await mount(bar({ ...skill, ready: false, progress: 0, castId: 1 }));
        absent(burstSelector);
        await renderBar({ ...skill, ready: false, progress: 0, castId: 2, refreshId: 1 });
        const first = query('span[class*="burstCast"]');
        await advance(400);
        await renderBar({ ...skill, ready: false, progress: 0, castId: 3, refreshId: 2 });
        const second = query('span[class*="burstCast"]');
        assert.ok(second !== first, 'each accepted cast restarts its acknowledgement');
        await advance(300);
        query('span[class*="burstCast"]');
        await advance(400);
        absent(burstSelector);
        await renderBar({ ...skill, ready: false, progress: 0.8, castId: 3, refreshId: 2 });
        await renderBar({ ...skill, castId: 3, refreshId: 2 });
        absent(burstSelector);
        // Echo clears cooldown without bypassing a short recast lockout.
        await renderBar({ ...skill, ready: false, progress: 0.9, castId: 3, refreshId: 3 });
        query('span[class*="burstRefresh"]');
        await renderBar({ ...skill, castId: 3, refreshId: 3 });
        await advance(700);
        absent(burstSelector);
      });
    }
  );

  await check(
    'hiding or resetting the skill bar clears feedback without replaying old casts',
    async () => {
      await withUiClock(async (advance) => {
        await mount(bar(skill));
        await renderBar({ ...skill, ready: false, progress: 0, castId: 1 });
        query('span[class*="burstCast"]');
        await renderBar(skill);
        absent(burstSelector);
        await renderBar({ ...skill, ready: false, progress: 0, castId: 1 });
        query('span[class*="burstCast"]');
        await renderBar({ ...skill, castId: 1 }, false);
        absent(burstSelector);
        await advance(1000);
        await renderBar({ ...skill, castId: 1 });
        absent(burstSelector);
        await renderBar({ ...skill, ready: false, progress: 0, castId: 2 });
        query('span[class*="burstCast"]');
      });
    }
  );

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

  const [{ DailyScreen }, { dayKey }, { dailySpec }] = await Promise.all(
    [
      '/src/ui/screens/DailyScreen.tsx',
      '/src/core/progression/xp.ts',
      '/src/core/daily/daily.ts'
    ].map((path) => vite.ssrLoadModule(path))
  );
  const dailyProfile = (medals = 3) => {
    const profile = createProfile();
    Object.assign(profile.progress.daily, {
      day: dayKey(),
      medals,
      attempts: 2,
      streak: 8,
      bestStreak: 8,
      lastClear: dayKey()
    });
    return profile;
  };
  const { HomeScreen } = await vite.ssrLoadModule('/src/ui/screens/HomeScreen.tsx');
  const homePage = (profile, onPick = noop) =>
    h(HomeScreen, {
      profile,
      account: { status: 'guest', pending: 0 },
      demoLevel: null,
      onPick,
      onModes: noop,
      onExitDemo: noop,
      onProfile: noop,
      onTalents: noop,
      onSettings: noop,
      onHelp: noop
    });
  const dailyTile = () => {
    const tile = [...host.querySelectorAll('button')].find((entry) =>
      entry.textContent.includes('Daily challenge')
    );
    assert.ok(tile, 'Home needs a Daily tile');
    return tile;
  };
  const tileTitle = () => dailyTile().querySelector('span[class*="featureSub"]').textContent;

  await check(
    'Home refreshes cleared Daily content at local midnight without losing tile focus',
    async () => {
      await withUiClock(async (advance) =>
        withLocalDate(new Date(2026, 11, 31, 23, 59, 59, 900), async (moveTime) => {
          const profile = dailyProfile(7);
          const before = JSON.stringify(profile);
          const played = [];
          function Fixture() {
            const [daily, setDaily] = useState(false);
            return daily
              ? h(DailyScreen, { profile, onPlay: (day) => played.push(day), onBack: noop })
              : homePage(profile, (mode) => {
                  if (mode === 'daily') setDaily(true);
                });
          }
          await mount(h(Fixture));
          const tile = dailyTile();
          tile.focus();
          assert.ok(tile.querySelector('[aria-label="3 of 3 stars"]'));
          const oldTitle = tileTitle();
          moveTime(99);
          await advance(99);
          assert.equal(tileTitle(), oldTitle);
          assert.ok(!tile.textContent.includes('New today'));
          moveTime(1);
          await advance(1);
          assert.match(tile.textContent, /New today/);
          assert.equal(tileTitle(), dailySpec(dayKey()).title);
          assert.ok(!tile.querySelector('[aria-label="3 of 3 stars"]'));
          assert.equal(tile.querySelector('span[class*="featureMeta"]').textContent, '8');
          assert.ok(dailyTile() === tile, 'rollover preserves the tile node');
          focused(tile);
          await click(tile);
          assert.ok(host.textContent.includes(dayKey()));
          assert.equal(query('h3').textContent, dailySpec(dayKey()).title);
          await click(button("Play today's challenge"));
          assert.deepEqual(played, [dayKey()]);
          assert.equal(
            JSON.stringify(profile),
            before,
            'calendar presentation cannot apply rewards or resets'
          );
        })
      );
    }
  );
  await check(
    'Home catches up after background days without consuming saved freezes or moving other focus',
    async () => {
      for (const freezes of [0, 2]) {
        await withUiClock(async (advance, pendingCount) =>
          withLocalDate(new Date(2026, 9, 5, 12), async (moveTime) =>
            withVisibility(async (setHidden) => {
              const profile = dailyProfile(7);
              profile.progress.daily.freezes = freezes;
              const before = JSON.stringify(profile);
              await mount(homePage(profile));
              const settings = button('Settings');
              settings.focus();
              await advance(80);
              assert.equal(
                pendingCount(),
                1,
                'one calendar timer remains after the XP bar settles'
              );
              const oldTitle = tileTitle();
              await setHidden(true);
              assert.equal(pendingCount(), 0, 'hidden Home does not keep a polling timer');
              moveTime(3 * 86_400_000);
              await advance(3 * 86_400_000);
              await act(() => win.dispatchEvent(new win.Event('focus')));
              assert.equal(pendingCount(), 0, 'hidden focus cannot restart polling');
              assert.equal(tileTitle(), oldTitle);
              await setHidden(false);
              assert.equal(tileTitle(), dailySpec(dayKey()).title);
              assert.match(dailyTile().textContent, /New today/);
              assert.equal(
                dailyTile().querySelector('span[class*="featureMeta"]').textContent,
                freezes ? '8' : '0'
              );
              focused(settings);
              moveTime(86_400_000);
              for (let i = 0; i < 3; i++)
                await act(() => win.dispatchEvent(new win.Event('focus')));
              assert.equal(tileTitle(), dailySpec(dayKey()).title);
              assert.equal(
                dailyTile().querySelector('span[class*="featureMeta"]').textContent,
                '0'
              );
              assert.equal(pendingCount(), 1, 'repeated return events replace the pending timer');
              assert.equal(JSON.stringify(profile), before);
              await act(() => root.render(null));
              await act(() => {
                win.dispatchEvent(new win.Event('focus'));
                win.document.dispatchEvent(new win.Event('visibilitychange'));
              });
              await advance(30_000);
              assert.equal(pendingCount(), 0, 'navigation removes calendar listeners and timeouts');
            })
          )
        );
      }
    }
  );

  await check(
    'Home reconciles foreground clock corrections in both directions without editing the Daily record',
    async () => {
      await withUiClock(async (advance) =>
        withLocalDate(new Date(2026, 9, 5, 12), async (moveTime) => {
          const profile = dailyProfile(7);
          const before = JSON.stringify(profile);
          await mount(homePage(profile));
          const tile = dailyTile();
          tile.focus();
          moveTime(2 * 86_400_000 + 29_999);
          await advance(29_999);
          assert.ok(tile.querySelector('[aria-label="3 of 3 stars"]'));
          moveTime(1);
          await advance(1);
          assert.match(tile.textContent, /New today/);
          assert.equal(tileTitle(), dailySpec(dayKey()).title);
          assert.equal(tile.querySelector('span[class*="featureMeta"]').textContent, '0');
          moveTime(-2 * 86_400_000 + 30_000);
          await advance(30_000);
          assert.ok(!tile.textContent.includes('New today'));
          assert.ok(tile.querySelector('[aria-label="3 of 3 stars"]'));
          assert.equal(tileTitle(), dailySpec(dayKey()).title);
          focused(tile);
          assert.equal(JSON.stringify(profile), before);
        })
      );
    }
  );

  await check(
    'Home and Daily mounted in the background defer calendar polling until visible return',
    async () => {
      for (const surface of ['home', 'daily']) {
        await withUiClock(async (advance, pendingCount) =>
          withLocalDate(new Date(2026, 9, 5, 12), async (moveTime) =>
            withVisibility(async (setHidden) => {
              const profile = dailyProfile(7);
              await mount(
                surface === 'home'
                  ? homePage(profile)
                  : h(DailyScreen, { profile, onPlay: noop, onBack: noop })
              );
              await advance(80);
              assert.equal(pendingCount(), 0, 'a hidden initial mount has no calendar timeout');
              moveTime(3 * 86_400_000);
              await advance(90_000);
              assert.equal(pendingCount(), 0);
              await setHidden(false);
              assert.equal(
                surface === 'home' ? tileTitle() : query('h3').textContent,
                dailySpec(dayKey()).title
              );
              assert.equal(pendingCount(), 1);
              await setHidden(true);
              assert.equal(pendingCount(), 0);
            }, true)
          )
        );
      }
    }
  );

  const [
    { OnboardingScreen },
    { useGameFlow: onboardingFlow },
    { useProfile: onboardingProfile },
    { profileStore: onboardingStore },
    { idleSnapshot: onboardingSnapshot }
  ] = await Promise.all(
    [
      '/src/ui/screens/OnboardingScreen.tsx',
      '/src/ui/hooks/useGameFlow.ts',
      '/src/ui/hooks/useProfile.ts',
      '/src/core/profile/store.ts',
      '/src/game/engine.ts'
    ].map((path) => vite.ssrLoadModule(path))
  );
  const onboardingCloud = () => ({
    ...createProfile(),
    userId: 'ui-onboarding-account',
    saveId: 'ui-onboarding-save',
    version: 1,
    displayName: 'Cloud player',
    avatar: 'bolt'
  });
  let firstRunFlow;
  function OnboardingFixture() {
    const profile = onboardingProfile();
    const flow = onboardingFlow(null, onboardingSnapshot());
    firstRunFlow = flow;
    return flow.screen === 'onboarding'
      ? h(OnboardingScreen, { key: profile.id, profile, onDone: () => flow.replace('home') })
      : h(
          Screen,
          { title: flow.screen },
          h('button', { onClick: flow.back }, 'Back to previous page')
        );
  }
  await check(
    'late onboarding actions cannot edit a restored profile before React commits',
    async () => {
      for (const action of ['Start playing', 'Skip']) {
        try {
          await mount(h(OnboardingFixture));
          const input = query('#player-name');
          const setter = Object.getOwnPropertyDescriptor(
            win.HTMLInputElement.prototype,
            'value'
          ).set;
          await act(() => {
            setter.call(input, 'Old guest draft');
            input.dispatchEvent(new win.Event('input', { bubbles: true }));
          });
          await click(query('button[aria-label="Avatar ring"]'));
          const submit = button(action);
          let restored;
          await act(() => {
            onboardingStore.signIn(onboardingCloud());
            restored = onboardingStore.getSnapshot();
            submit.click();
          });
          assert.equal(onboardingStore.getSnapshot().name, 'Cloud player');
          assert.equal(onboardingStore.getSnapshot().avatar, 'bolt');
          assert.ok(
            onboardingStore.getSnapshot() === restored,
            'old Start/Skip cannot write the restored save'
          );
          assert.equal(firstRunFlow.screen, 'home');
          assert.equal(firstRunFlow.canGoBack, false);
        } finally {
          await act(() => root.render(null));
          await act(() => onboardingStore.signOut(true));
        }
      }
    }
  );
  await check(
    'a late sign-in replaces dormant onboarding without changing the active page or focus',
    async () => {
      assert.equal(onboardingStore.getSnapshot().onboarded, false);
      try {
        await mount(h(OnboardingFixture));
        assert.equal(firstRunFlow.screen, 'onboarding');
        await act(() => firstRunFlow.go('account'));
        const back = button('Back to previous page');
        back.focus();
        await act(() => onboardingStore.signIn(onboardingCloud()));
        const restored = onboardingStore.getSnapshot();
        assert.equal(firstRunFlow.screen, 'account');
        focused(back);
        await click(back);
        assert.equal(
          firstRunFlow.screen,
          'home',
          'Back after sign-in cannot reopen first-run editing'
        );
        assert.equal(firstRunFlow.canGoBack, false);
        assert.ok(
          onboardingStore.getSnapshot() === restored,
          'routing cannot write the restored profile'
        );
      } finally {
        await act(() => root.render(null));
        await act(() => onboardingStore.signOut(true));
      }
    }
  );

  await check(
    'completed and cached profiles dismiss active onboarding but preserve later navigation',
    async () => {
      const guest = { ...onboardingStore.getSnapshot(), updatedAt: 0 };
      const dto = onboardingCloud();
      try {
        await mount(h(OnboardingFixture));
        assert.equal(firstRunFlow.screen, 'onboarding');
        await act(() => onboardingStore.signIn(dto));
        assert.equal(firstRunFlow.screen, 'home');
        absent('#player-name');
        focused(query('h2'));
        await act(() => onboardingStore.signOut());
        assert.deepEqual({ ...onboardingStore.getSnapshot(), updatedAt: 0 }, guest);
        assert.equal(
          firstRunFlow.screen,
          'home',
          'sign-out cannot interrupt navigation with onboarding'
        );

        await act(() => root.render(null));
        await act(() => assert.ok(onboardingStore.restoreCachedCloud(dto.userId)));
        await mount(h(OnboardingFixture));
        assert.equal(firstRunFlow.screen, 'home', 'a cache restored before mount starts at Home');
        await act(() => firstRunFlow.go('profile'));
        const back = button('Back to previous page');
        back.focus();
        await act(() =>
          onboardingStore.applyCloud({ ...dto, displayName: 'Synced player', version: 2 })
        );
        assert.equal(firstRunFlow.screen, 'profile');
        focused(back);
        await click(back);
        assert.equal(firstRunFlow.screen, 'home');
        assert.equal(firstRunFlow.canGoBack, false);

        await act(() => root.render(null));
        await act(() => onboardingStore.signOut());
        await mount(h(OnboardingFixture));
        assert.equal(firstRunFlow.screen, 'onboarding');
        await act(() => assert.ok(onboardingStore.restoreCachedCloud(dto.userId)));
        assert.equal(
          firstRunFlow.screen,
          'home',
          'a cache restored after mount dismisses the obsolete form'
        );
      } finally {
        await act(() => root.render(null));
        await act(() => onboardingStore.signOut(true));
      }
    }
  );

  await check(
    'fresh onboarding keeps draft choices optional and completes once with heading focus',
    async () => {
      await mount(h(OnboardingFixture));
      assert.equal(firstRunFlow.screen, 'onboarding');
      focused(query('h1'));
      const input = query('#player-name');
      const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
      await act(() => {
        setter.call(input, '  New   player ');
        input.dispatchEvent(new win.Event('input', { bubbles: true }));
      });
      await click(query('button[aria-label="Avatar ring"]'));
      await click(query('button[aria-label="Violet"]'));
      assert.equal(
        onboardingStore.getSnapshot().onboarded,
        false,
        'draft choices cannot complete early'
      );
      const submit = button('Start playing');
      let completed;
      await act(() => {
        submit.click();
        completed = onboardingStore.getSnapshot();
        submit.click();
      });
      assert.ok(
        onboardingStore.getSnapshot() === completed,
        'duplicate activation cannot complete twice'
      );
      assert.equal(firstRunFlow.screen, 'home');
      assert.equal(firstRunFlow.canGoBack, false);
      absent('#player-name');
      focused(query('h2'));
      const saved = onboardingStore.getSnapshot();
      assert.equal(saved.name, 'New player');
      assert.equal(saved.avatar, 'ring');
      assert.equal(saved.equipped.accent, 'accent-violet');
      assert.equal(saved.onboarded, true);
      const guestSave = win.localStorage.getItem('bball.profile');
      await act(() => firstRunFlow.go('settings'));
      const back = button('Back to previous page');
      back.focus();
      await act(() => onboardingStore.setLastBot('amateur'));
      assert.equal(firstRunFlow.screen, 'settings');
      focused(back);
      await click(back);
      assert.equal(firstRunFlow.screen, 'home');
      assert.equal(firstRunFlow.canGoBack, false);
      assert.equal(JSON.parse(guestSave).data.name, 'New player');
    }
  );

  const copyStatus = () => {
    const status = button('Copy result').parentElement.querySelector('[role="status"]');
    assert.ok(status, 'Daily copy needs a status message');
    return status;
  };

  await check(
    'a refused Daily copy offers selectable result text without changing progress',
    async () => {
      await withClipboard(
        { writeText: () => Promise.reject(new Error('Clipboard denied')) },
        async () => {
          const profile = dailyProfile();
          const before = JSON.stringify(profile);
          let plays = 0;
          let backs = 0;
          await mount(h(DailyScreen, { profile, onPlay: () => plays++, onBack: () => backs++ }));
          await click(button('Copy result'));
          const text = query('textarea[aria-label="Daily result text"]');
          assert.equal(text.readOnly, true);
          assert.equal(
            text.value,
            `bBall Daily ${dayKey()} · ${dailySpec(dayKey()).title}\n★★☆ · streak 8`
          );
          focused(text);
          assert.equal(text.selectionStart, 0);
          assert.equal(text.selectionEnd, text.value.length);
          assert.match(copyStatus().textContent, /copy.*result below/i);
          assert.equal(JSON.stringify(profile), before);
          await click(button('Play again'));
          await click(query('button[aria-label="Back"]'));
          assert.equal(plays, 1);
          assert.equal(backs, 1);
        }
      );
    }
  );

  await check(
    'Daily copy contains missing and throwing clipboard APIs and supports a later retry',
    async () => {
      for (const clipboard of [
        undefined,
        {
          writeText: () => {
            throw new Error('Clipboard blocked');
          }
        }
      ]) {
        await withClipboard(clipboard, async () => {
          await mount(h(DailyScreen, { profile: dailyProfile(7), onPlay: noop, onBack: noop }));
          const control = button('Copy result');
          await click(control);
          const field = query('textarea[aria-label="Daily result text"]');
          assert.match(field.value, /★★★ · streak 8$/);
          focused(field);
          const status = copyStatus();
          assert.equal(field.getAttribute('aria-describedby'), status.id);
          assert.equal(status.getAttribute('aria-atomic'), 'true');
          assert.equal(control.disabled, false);
          const writes = [];
          Object.defineProperty(win.navigator, 'clipboard', {
            value: { writeText: async (text) => writes.push(text) },
            configurable: true
          });
          await click(control);
          assert.deepEqual(writes, [field.value]);
          assert.equal(status.textContent, 'Copied to clipboard.');
          focused(control);
          absent('textarea');
        });
      }
    }
  );

  await check(
    'pending Daily copy requests run once and only report success after completion',
    async () => {
      let resolve;
      const writes = [];
      await withClipboard(
        {
          writeText: (text) => {
            writes.push(text);
            return new Promise((done) => {
              resolve = done;
            });
          }
        },
        async () => {
          await withUiClock(async (advance) => {
            await mount(h(DailyScreen, { profile: dailyProfile(), onPlay: noop, onBack: noop }));
            const control = button('Copy result');
            const status = copyStatus();
            assert.equal(status.textContent, '');
            await act(async () => {
              control.focus();
              control.click();
              control.click();
            });
            assert.equal(writes.length, 1, 'the guard works before React rerenders');
            assert.equal(control.getAttribute('aria-disabled'), 'true');
            assert.equal(control.getAttribute('aria-busy'), 'true');
            assert.equal(control.disabled, false, 'a pending copy retains keyboard focus');
            focused(control);
            assert.equal(status.textContent, 'Copying result…');
            await click(control);
            assert.equal(writes.length, 1);
            await act(async () => resolve());
            assert.equal(control.getAttribute('aria-disabled'), 'false');
            assert.equal(status.textContent, 'Copied to clipboard.');
            await advance(10_000);
            assert.equal(
              status.textContent,
              'Copied to clipboard.',
              'no timer hides the outcome early'
            );
            assert.ok(
              control.closest('footer') === null,
              'copy feedback belongs in the scrolling body'
            );
            assert.ok(button('Play again').closest('footer'));
          });
        }
      );
    }
  );

  await check(
    'changed Daily results discard old copy responses without blocking a new request',
    async () => {
      const requests = [];
      await withClipboard(
        {
          writeText: (text) =>
            new Promise((resolve, reject) => {
              requests.push({ text, resolve, reject });
            })
        },
        async () => {
          let profile = dailyProfile(1);
          const screen = () => h(DailyScreen, { profile, onPlay: noop, onBack: noop });
          await mount(screen());
          const control = button('Copy result');
          await click(control);
          profile = dailyProfile(3);
          await act(async () => root.render(h(StrictMode, null, screen())));
          assert.ok(
            control === button('Copy result'),
            'a result update preserves the copy control'
          );
          focused(control);
          assert.equal(copyStatus().textContent, '');
          await click(control);
          assert.equal(requests.length, 2);
          await act(async () => requests[0].reject(new Error('Old request failed')));
          assert.equal(copyStatus().textContent, 'Copying result…');
          absent('textarea');
          await click(control);
          assert.equal(requests.length, 2, 'old completion cannot release the current guard');
          await act(async () => requests[1].resolve());
          assert.equal(copyStatus().textContent, 'Copied to clipboard.');
          profile = dailyProfile(7);
          await act(async () => root.render(h(StrictMode, null, screen())));
          assert.equal(copyStatus().textContent, '');
          await click(control);
          profile = dailyProfile(1);
          await act(async () => root.render(h(StrictMode, null, screen())));
          await act(async () => requests[2].resolve());
          assert.equal(copyStatus().textContent, '', 'old success cannot describe a new result');
          assert.match(requests[0].text, /★☆☆/);
          assert.match(requests[1].text, /★★☆/);
          assert.match(requests[2].text, /★★★/);
        }
      );
    }
  );

  await check('Daily copy failures respect moved focus and keep manual text current', async () => {
    let reject;
    let resolve;
    await withClipboard(
      {
        writeText: () =>
          new Promise((done, fail) => {
            resolve = done;
            reject = fail;
          })
      },
      async () => {
        let profile = dailyProfile();
        const screen = () => h(DailyScreen, { profile, onPlay: noop, onBack: noop });
        await mount(screen());
        const control = button('Copy result');
        await click(control);
        const play = button('Play again');
        play.focus();
        await act(async () => reject(new Error('Copy refused')));
        focused(play);
        const field = query('textarea[aria-label="Daily result text"]');
        field.focus();
        assert.equal(field.selectionEnd, field.value.length);
        profile = dailyProfile(7);
        await act(async () => root.render(h(StrictMode, null, screen())));
        focused(field);
        assert.match(field.value, /★★★ · streak 8$/);
        assert.match(copyStatus().textContent, /^Select and copy/);
        await click(control);
        field.focus();
        await act(async () => resolve());
        absent('textarea');
        focused(control);
      }
    );
  });

  await check(
    'Daily navigation and unavailable records ignore late clipboard completion',
    async () => {
      let settle;
      for (const succeeds of [true, false]) {
        await withClipboard(
          {
            writeText: () =>
              new Promise((resolve, reject) => {
                settle = () => (succeeds ? resolve() : reject(new Error('Late refusal')));
              })
          },
          async () => {
            const profile = dailyProfile();
            await mount(h(DailyScreen, { profile, onPlay: noop, onBack: noop }));
            await click(button('Copy result'));
            await mount(h(Screen, { title: 'Home' }, h('button', null, 'Continue')));
            const heading = query('h2');
            focused(heading);
            await act(async () => settle());
            focused(heading);
            absent('textarea');
            absent('[role="status"]');
            profile.progress.daily.day = '2000-01-01';
            await mount(h(DailyScreen, { profile, onPlay: noop, onBack: noop }));
            assert.ok(
              ![...host.querySelectorAll('button')].some(
                (entry) => entry.textContent === 'Copy result'
              )
            );
            profile.progress.daily.day = dayKey();
            profile.progress.daily.medals = 0;
            await act(async () =>
              root.render(
                h(StrictMode, null, h(DailyScreen, { profile, onPlay: noop, onBack: noop }))
              )
            );
            assert.ok(
              ![...host.querySelectorAll('button')].some(
                (entry) => entry.textContent === 'Copy result'
              )
            );
          }
        );
      }
    }
  );

  await check(
    'a stale Daily play press refreshes the preview before launching the reviewed day',
    async () => {
      await withUiClock(async () =>
        withLocalDate(new Date(2026, 9, 4, 23, 59, 59, 900), async (moveTime) => {
          const days = [];
          const yesterday = dayKey();
          await mount(
            h(DailyScreen, {
              profile: dailyProfile(),
              onPlay: (day) => days.push(day),
              onBack: noop
            })
          );
          moveTime(200);
          const today = dayKey();
          await click(button('Play again'));
          assert.equal(days.length, 0, 'a stale preview cannot launch unseen rules');
          assert.ok(!host.textContent.includes(yesterday));
          assert.ok(host.textContent.includes(today));
          assert.match(query('[role="status"]').textContent, /new daily challenge.*review/i);
          absent('textarea');
          const play = button("Play today's challenge");
          focused(play);
          await click(play);
          assert.deepEqual(days, [today]);
        })
      );
    }
  );

  await check(
    'Daily midnight and return events refresh the court, results and quests together',
    async () => {
      const [{ questStateFor, questById }] = await Promise.all(
        ['/src/core/quests/quests.ts'].map((path) => vite.ssrLoadModule(path))
      );
      await withUiClock(async (advance) =>
        withLocalDate(new Date(2026, 11, 31, 23, 59, 59, 900), async (moveTime) => {
          const profile = dailyProfile();
          await mount(h(DailyScreen, { profile, onPlay: noop, onBack: noop }));
          const oldDay = dayKey();
          button('Copy result').focus();
          moveTime(99);
          await advance(99);
          assert.ok(host.textContent.includes(oldDay));
          moveTime(1);
          await advance(1);
          const newDay = dayKey();
          assert.ok(!host.textContent.includes(oldDay));
          assert.ok(host.textContent.includes(newDay));
          focused(button("Play today's challenge"));
          const checkQuests = () => {
            for (const id of questStateFor(profile.progress.quests, dayKey()).ids) {
              assert.ok(
                host.textContent.includes(questById(id).label),
                'quests must share the preview day'
              );
            }
          };
          checkQuests();
          const hidden = Object.getOwnPropertyDescriptor(win.document, 'hidden');
          Object.defineProperty(win.document, 'hidden', {
            value: true,
            writable: true,
            configurable: true
          });
          try {
            moveTime(3 * 86_400_000);
            await act(async () => win.document.dispatchEvent(new win.Event('visibilitychange')));
            await act(async () => win.dispatchEvent(new win.Event('focus')));
            assert.ok(
              host.textContent.includes(newDay),
              'hidden events do not refresh the preview'
            );
            win.document.hidden = false;
            await act(async () => win.document.dispatchEvent(new win.Event('visibilitychange')));
            assert.ok(host.textContent.includes(dayKey()));
            assert.ok(!host.textContent.includes(newDay));
            checkQuests();
            moveTime(86_400_000);
            await act(async () => win.dispatchEvent(new win.Event('focus')));
            assert.ok(host.textContent.includes(dayKey()));
            checkQuests();
            const renderedDay = dayKey();
            await act(async () => root.render(null));
            moveTime(86_400_000);
            await act(async () => {
              win.dispatchEvent(new win.Event('focus'));
              win.document.dispatchEvent(new win.Event('visibilitychange'));
            });
            await advance(30_000);
            assert.equal(host.textContent, '', `listeners must be removed after ${renderedDay}`);
          } finally {
            if (hidden) Object.defineProperty(win.document, 'hidden', hidden);
            else Reflect.deleteProperty(win.document, 'hidden');
          }
        })
      );
    }
  );

  await check(
    'Daily flow launches the supplied preview day and keeps today as its default',
    async () => {
      const [{ useGameFlow }, { idleSnapshot }] = await Promise.all(
        ['/src/ui/hooks/useGameFlow.ts', '/src/game/engine.ts'].map((path) =>
          vite.ssrLoadModule(path)
        )
      );
      await withLocalDate(new Date(2026, 9, 4, 23, 59, 59, 900), async (moveTime) => {
        const reviewedDay = dayKey();
        const launched = [];
        const engine = { play: (rules) => launched.push(rules) };
        function Fixture() {
          const flow = useGameFlow(engine, idleSnapshot());
          return h(
            Screen,
            { title: flow.screen },
            h('button', { onClick: () => flow.startDaily(reviewedDay) }, 'Launch reviewed Daily'),
            h('button', { onClick: () => flow.startDaily() }, 'Launch current Daily')
          );
        }
        await mount(h(Fixture));
        moveTime(200);
        await click(button('Launch reviewed Daily'));
        assert.equal(launched.length, 1);
        assert.equal(launched[0].dailyKey, reviewedDay);
        assert.equal(launched[0].label, `Daily · ${dailySpec(reviewedDay).title}`);
        assert.deepEqual(launched[0].goals, dailySpec(reviewedDay).goals);
        assert.equal(query('h2').textContent, 'playing');
        await click(button('Launch current Daily'));
        assert.equal(launched.length, 2);
        assert.equal(launched[1].dailyKey, dayKey());
      });
    }
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
    'resize pause explains the interruption and keeps Resume as its initial action',
    async () => {
      let resumes = 0;
      const panel = (resized) =>
        h(
          Overlay,
          { show: true, label: 'Paused', onDismiss: noop, gameShortcuts: true },
          h(PausePanel, {
            label: 'Quick Match',
            resized,
            onResume: () => resumes++,
            onSettings: noop,
            onRestart: noop,
            onQuit: noop
          })
        );
      await mount(panel(true));
      focused(button('Resume'));
      assert.match(query('[role="dialog"]').textContent, /court size changed.*resume when ready/i);
      await click(button('Resume'));
      assert.equal(resumes, 1);
      await act(() => root.render(h(StrictMode, null, panel(false))));
      assert.doesNotMatch(query('[role="dialog"]').textContent, /court size changed/i);
      focused(button('Resume'));
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
      absent('[role="dialog"]');
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
        absent('[role="dialog"]');
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
    absent('[aria-label="Inner"]');
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
      absent('[role="dialog"]');
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
          absent('[role="dialog"]');
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
    'mobile fullscreen applies from a gesture, survives exit, and contains refused requests',
    async () => {
      const [{ SettingsScreen }, { settingsStore }, fullscreen] = await Promise.all([
        vite.ssrLoadModule('/src/ui/screens/SettingsScreen.tsx'),
        vite.ssrLoadModule('/src/core/settings/store.ts'),
        vite.ssrLoadModule('/src/core/platform/fullscreen.ts')
      ]);
      const previous = settingsStore.getSnapshot();
      let active = null;
      let finishEntry;
      let fail = false;
      const requests = [];
      const patches = [
        [win.document, 'fullscreenEnabled', { value: true }],
        [win.document, 'fullscreenElement', { get: () => active }],
        [
          win.document.documentElement,
          'requestFullscreen',
          {
            value: (options) => {
              requests.push(options);
              if (fail) return Promise.reject(new Error('Refused fullscreen'));
              return new Promise((resolve) => {
                finishEntry = () => {
                  active = win.document.documentElement;
                  win.document.dispatchEvent(new win.Event('fullscreenchange'));
                  resolve();
                };
              });
            }
          }
        ],
        [
          win.document,
          'exitFullscreen',
          {
            value: async () => {
              active = null;
              win.document.dispatchEvent(new win.Event('fullscreenchange'));
            }
          }
        ],
        [win, 'ontouchstart', { value: null }]
      ].map(([target, key, descriptor]) => ({
        target,
        key,
        descriptor,
        previous: Object.getOwnPropertyDescriptor(target, key)
      }));
      for (const patch of patches)
        Object.defineProperty(patch.target, patch.key, { ...patch.descriptor, configurable: true });
      try {
        settingsStore.update({ fullscreen: true });
        await act(() => fullscreen.restoreFullscreen());
        assert.equal(requests.length, 0, 'a browser launch waits for a player gesture');
        await mount(
          h(SettingsScreen, {
            onBack: noop,
            onPreview: noop,
            onMusicPreview: noop,
            onStopPreview: noop
          })
        );
        const on = query('[aria-label="Fullscreen"] button:first-child');
        const off = query('[aria-label="Fullscreen"] button:last-child');
        await click(on);
        assert.deepEqual(requests, [{ navigationUI: 'hide' }]);
        assert.equal(on.disabled, true, 'block duplicate toggles during entry');
        await act(async () => finishEntry());
        assert.equal(fullscreen.fullscreenStore.getSnapshot().active, true);
        assert.equal(on.disabled, false);
        assert.equal(JSON.parse(win.localStorage.getItem('bball.settings')).data.fullscreen, true);
        await act(() => {
          active = null;
          win.document.dispatchEvent(new win.Event('fullscreenchange'));
        });
        assert.equal(settingsStore.getSnapshot().fullscreen, true);
        assert.match(host.textContent, /start a match to enter fullscreen again/);
        await act(() => fullscreen.enterPreferredFullscreen());
        assert.equal(requests.length, 2, 'the next play gesture can re-enter');
        await act(async () => finishEntry());
        await click(off);
        assert.equal(active, null);
        assert.equal(settingsStore.getSnapshot().fullscreen, false);
        fail = true;
        await click(on);
        assert.equal(fullscreen.fullscreenStore.getSnapshot().active, false);
        assert.match(host.textContent, /Fullscreen couldn't open/);
        assert.equal(on.disabled, false, 'a refused request remains retryable');
        await click(off);
        Object.defineProperty(win.document, 'fullscreenEnabled', {
          value: false,
          configurable: true
        });
        await act(() => fullscreen.initializeFullscreen());
        assert.equal(on.disabled, true);
        assert.match(host.textContent, /Fullscreen is unavailable/);
      } finally {
        await act(() => root.render(null));
        settingsStore.update(previous);
        for (const patch of patches) {
          if (patch.previous) Object.defineProperty(patch.target, patch.key, patch.previous);
          else Reflect.deleteProperty(patch.target, patch.key);
        }
        await fullscreen.initializeFullscreen();
      }
    }
  );

  await check(
    'Android fullscreen restores its device preference and returns system bars on Off',
    async () => {
      const [{ SettingsScreen }, { settingsStore }, fullscreen] = await Promise.all([
        vite.ssrLoadModule('/src/ui/screens/SettingsScreen.tsx'),
        vite.ssrLoadModule('/src/core/settings/store.ts'),
        vite.ssrLoadModule('/src/core/platform/fullscreen.ts')
      ]);
      const previous = settingsStore.getSnapshot();
      let active = false;
      const calls = [];
      win.bBallScreen = {
        isFullscreen: () => active,
        setFullscreen: (enabled) => {
          active = enabled;
          calls.push(enabled);
          win.dispatchEvent(new win.Event('bball:fullscreen'));
        }
      };
      try {
        settingsStore.update({ fullscreen: true });
        await act(() => fullscreen.restoreFullscreen());
        assert.deepEqual(calls, [true]);
        await mount(
          h(SettingsScreen, {
            onBack: noop,
            onPreview: noop,
            onMusicPreview: noop,
            onStopPreview: noop
          })
        );
        assert.equal(fullscreen.fullscreenStore.getSnapshot().active, true);
        await click(query('[aria-label="Fullscreen"] button:last-child'));
        assert.deepEqual(calls, [true, false]);
        assert.equal(active, false);
        assert.equal(settingsStore.getSnapshot().fullscreen, false);
        await act(() => fullscreen.restoreFullscreen());
        assert.deepEqual(calls, [true, false, false]);
        assert.equal(active, false, 'a later launch restores the Off preference too');
      } finally {
        await act(() => root.render(null));
        settingsStore.update(previous);
        Reflect.deleteProperty(win, 'bBallScreen');
        await fullscreen.initializeFullscreen();
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

  const [
    { ConfirmAction },
    { TournamentScreen },
    { GauntletScreen },
    { ProfileScreen },
    { useProfile },
    { profileStore },
    progression,
    { accountStore },
    { settingsStore },
    { createWorld },
    { startMatch, publishResult },
    { quickMatchRules },
    { useBackHandler },
    routing
  ] = await Promise.all(
    [
      '/src/ui/components/ConfirmAction.tsx',
      '/src/ui/screens/TournamentScreen.tsx',
      '/src/ui/screens/GauntletScreen.tsx',
      '/src/ui/screens/ProfileScreen.tsx',
      '/src/ui/hooks/useProfile.ts',
      '/src/core/profile/store.ts',
      '/src/core/account/progression.ts',
      '/src/core/account/store.ts',
      '/src/core/settings/store.ts',
      '/src/game/world.ts',
      '/src/game/match.ts',
      '/src/core/modes/rules.ts',
      '/src/ui/hooks/useBackHandler.ts',
      '/src/core/platform/back.ts'
    ].map((path) => vite.ssrLoadModule(path))
  );
  routing.installBackRouting();

  const [{ ResultScreen }, { applyMatchResult }] = await Promise.all(
    ['/src/ui/screens/ResultScreen.tsx', '/src/core/progression/apply.ts'].map((path) =>
      vite.ssrLoadModule(path)
    )
  );
  const resultWorld = createWorld(new Proxy({}, { get: () => () => 0 }), 1);
  startMatch(resultWorld, quickMatchRules('rookie'));
  resultWorld.match.score.you = resultWorld.rules.winScore;
  resultWorld.match.winner = 'you';
  resultWorld.match.elapsed = 60;
  publishResult(resultWorld);
  const quickResult = resultWorld.match.result;
  const resultPage = (result = quickResult, summary = null, extra = {}) =>
    h(ResultScreen, {
      result,
      summary,
      label: 'Quick Match',
      primaryLabel: 'Play again',
      secondaryLabel: 'Menu',
      onPrimary: noop,
      onSecondary: noop,
      onHelp: noop,
      onTutorial: noop,
      onTalents: noop,
      ...extra
    });
  const dailyResult = { ...quickResult, mode: 'daily', dailyKey: dayKey() };
  const starSummary = { ...applyMatchResult(createProfile(), dailyResult), stars: 5 };
  const litStars = () => host.querySelectorAll('span[class*="bigStarOn"]').length;

  await check(
    'result stars finish on schedule with the latest callback despite rerenders',
    async () => {
      await withUiFrames(async (advanceFrames) => {
        await withUiClock(async (advance) => {
          const chimes = [];
          const page = (version) =>
            resultPage(dailyResult, starSummary, {
              onStar: (index) => chimes.push(`${version}:${index}`)
            });
          const rerender = (version) => act(() => root.render(h(StrictMode, null, page(version))));
          await mount(page('initial'));
          assert.equal(query('[role="img"][aria-label="2 of 3 stars"]').textContent, '');
          await advance(200);
          await rerender('latest');
          await advance(179);
          assert.deepEqual(chimes, []);
          await advance(1);
          assert.deepEqual(chimes, ['latest:0']);
          assert.equal(litStars(), 1);
          await rerender('changed');
          await advance(330);
          assert.equal(litStars(), 1, 'unearned second star stays dark and silent');
          await advance(330);
          assert.deepEqual(chimes, ['latest:0', 'changed:2']);
          assert.equal(litStars(), 2);
          await rerender('after');
          await advance(1500);
          assert.deepEqual(chimes, ['latest:0', 'changed:2'], 'completed reveal cannot replay');
          assert.ok(starSummary.award.total > 0, 'fixture includes a real XP award');
          await advanceFrames(2000);
          assert.equal(
            query('p[class*="xpTotal"] > span:last-child').textContent,
            `+${starSummary.award.total}`
          );
          focused(query('h2'));
        });
      });
    }
  );

  await check(
    'changed star awards reset the reveal and leaving Results cancels pending chimes',
    async () => {
      await withUiFrames(async () => {
        await withUiClock(async (advance) => {
          const chimes = [];
          const onStar = (index) => chimes.push(index);
          await mount(resultPage(dailyResult, { ...starSummary, stars: 7 }, { onStar }));
          await advance(1040);
          assert.equal(litStars(), 3);
          assert.deepEqual(chimes, [0, 1, 2]);
          await click(button('Menu'));
          await act(() =>
            root.render(h(StrictMode, null, resultPage(dailyResult, starSummary, { onStar })))
          );
          assert.equal(litStars(), 0, 'new mask cannot reuse the preceding reveal state');
          focused(button('Menu'));
          await advance(380);
          assert.deepEqual(chimes, [0, 1, 2, 0]);
          await act(() => root.render(h(StrictMode, null, resultPage(dailyResult, starSummary))));
          await advance(660);
          assert.equal(litStars(), 2, 'removing sound keeps the visual reveal running');
          assert.deepEqual(chimes, [0, 1, 2, 0], 'removed callback cannot play a stale chime');
          await act(() =>
            root.render(
              h(StrictMode, null, resultPage(dailyResult, { ...starSummary, stars: 7 }, { onStar }))
            )
          );
          await advance(380);
          assert.deepEqual(chimes, [0, 1, 2, 0, 0]);
          await mount(h(Screen, { title: 'Menu' }, h('button', null, 'Continue')));
          focused(query('h2'));
          await advance(2000);
          assert.deepEqual(chimes, [0, 1, 2, 0, 0]);
        });
      });
    }
  );

  await check(
    'Results owns a named heading while actions and rerenders keep player focus',
    async () => {
      let primary = 0;
      let secondary = 0;
      const page = () =>
        resultPage(quickResult, null, {
          onPrimary: () => primary++,
          onSecondary: () => secondary++
        });
      await mount(page());
      const heading = query('h2');
      focused(heading);
      assert.equal(heading.textContent, 'You win');
      assert.equal(heading.getAttribute('tabindex'), '-1');
      assert.equal(query('section').getAttribute('aria-labelledby'), heading.id);
      assert.ok(heading.hasAttribute('data-screen-heading'));
      await click(button('Play again'));
      await act(() => root.render(h(StrictMode, null, page())));
      focused(button('Play again'));
      await click(button('Menu'));
      assert.equal(primary, 1);
      assert.equal(secondary, 1);
    }
  );

  await check('result times round the whole duration across minute boundaries', async () => {
    for (const [seconds, expected] of [
      [0, '0s'],
      [59.4, '59s'],
      [59.6, '1m 0s'],
      [119.6, '2m 0s']
    ]) {
      await mount(resultPage({ ...quickResult, seconds, flicks: 0 }));
      const label = [...host.querySelectorAll('div')].find((node) => node.textContent === 'Time');
      assert.ok(label);
      assert.equal(label.parentElement.firstElementChild.textContent, expected);
    }
  });

  await check(
    'progress-loss confirmation names its consequence, keeps focus on Cancel and executes once',
    async () => {
      let confirms = 0;
      let backs = 0;
      function Fixture() {
        const [show, setShow] = useState(false);
        useBackHandler(true, () => backs++);
        return h(
          Fragment,
          null,
          h('button', { onClick: () => setShow(true) }, 'Discard saved progress'),
          h(ConfirmAction, {
            show,
            title: 'Discard this save?',
            description: 'Discarding cannot be undone.',
            cancelLabel: 'Keep save',
            confirmLabel: 'Discard save',
            onCancel: () => setShow(false),
            onConfirm: () => confirms++
          })
        );
      }
      await mount(h(Fixture));
      const opener = button('Discard saved progress');
      for (const cancel of ['button', 'escape', 'back']) {
        await click(opener);
        const dialog = query('[role="alertdialog"]');
        assert.equal(dialog.getAttribute('aria-modal'), 'true');
        assert.equal(dialog.dataset.gameModal, 'blocked');
        assert.equal(
          query(`#${dialog.getAttribute('aria-labelledby')}`).textContent,
          'Discard this save?'
        );
        assert.equal(
          query(`#${dialog.getAttribute('aria-describedby')}`).textContent,
          'Discarding cannot be undone.'
        );
        focused(button('Keep save'));
        await key(button('Keep save'), 'Tab', true);
        focused(button('Discard save'));
        await key(button('Discard save'), 'Tab');
        focused(button('Keep save'));
        if (cancel === 'button') await click(button('Keep save'));
        else if (cancel === 'escape') await key(button('Keep save'), 'Escape');
        else await act(() => win.dispatchEvent(new win.PopStateEvent('popstate')));
        assert.equal(confirms, 0);
        assert.equal(backs, 0, 'Back cancels the dialog before leaving its screen');
        focused(opener);
      }
      await click(opener);
      const confirm = button('Discard save');
      // A slow consumer can leave the dialog mounted after accepting the first click.
      await act(() => {
        confirm.click();
        confirm.click();
      });
      assert.equal(confirms, 1);
      await click(button('Keep save'));
      await click(opener);
      await click(button('Discard save'));
      assert.equal(confirms, 2, 'a fresh opening permits one fresh action');
      await click(button('Keep save'));
    }
  );

  // Seed earned progress through the real local progression path; all storage
  // belongs to this isolated Happy DOM window, never the player's browser.
  const world = createWorld(new Proxy({}, { get: () => () => 0 }), 1);
  startMatch(world, quickMatchRules('rookie'));
  world.match.score.you = world.rules.winScore;
  world.match.score.bot = 2;
  world.match.winner = 'you';
  world.match.elapsed = 60;
  publishResult(world);
  progression.recordMatch(world.match.result);
  assert.ok(profileStore.getSnapshot().xp > 0);

  await check(
    'Tournament cancellation preserves the saved cup; only confirmation ends it',
    async () => {
      await act(() => progression.startTournament(0));
      let abandons = 0;
      let backs = 0;
      function Fixture() {
        const profile = useProfile();
        useBackHandler(true, () => backs++);
        return h(TournamentScreen, {
          profile,
          onPlay: noop,
          onStart: noop,
          onBack: () => backs++,
          onAbandon: () => {
            abandons++;
            progression.abandonTournament();
          }
        });
      }
      await mount(h(Fixture));
      const before = JSON.stringify(profileStore.getSnapshot());
      for (const cancel of ['button', 'escape', 'back']) {
        const opener = button('Give up the cup');
        await click(opener);
        focused(button('Keep cup'));
        assert.match(query('[role="alertdialog"]').textContent, /Bronze Cup at round 1 of 3/);
        // A second click on the original trigger cannot serve as acceptance.
        await act(() => opener.click());
        assert.equal(abandons, 0);
        if (cancel === 'button') await click(button('Keep cup'));
        else if (cancel === 'escape') await key(button('Keep cup'), 'Escape');
        else await act(() => win.dispatchEvent(new win.PopStateEvent('popstate')));
        assert.equal(JSON.stringify(profileStore.getSnapshot()), before);
        assert.equal(backs, 0);
        focused(opener);
      }
      await click(button('Give up the cup'));
      // An authoritative replacement must not inherit the old cup's confirmation.
      await act(() => progression.startTournament(0));
      absent('[role="alertdialog"]');
      assert.equal(abandons, 0);
      const saved = profileStore.getSnapshot();
      const cup = JSON.stringify(saved.tournament);
      await click(button('Give up the cup'));
      await click(button('Give up cup'));
      assert.equal(abandons, 1);
      const after = profileStore.getSnapshot();
      assert.equal(after.tournament, null);
      assert.equal(JSON.stringify({ ...after.lastTournament, finished: false }), cup);
      assert.equal(after.lastTournament.champion, false);
      assert.equal(after.xp, saved.xp);
      assert.deepEqual(after.unlocks, saved.unlocks);
      absent('[role="alertdialog"]');
    }
  );

  await check(
    'Gauntlet cancellation preserves the run; a replaced run needs a fresh confirmation',
    async () => {
      await act(() => assert.equal(progression.startRun(0), true));
      let abandons = 0;
      let backs = 0;
      function Fixture() {
        const profile = useProfile();
        useBackHandler(true, () => backs++);
        return h(GauntletScreen, {
          profile,
          onStart: noop,
          onPlay: noop,
          onPick: noop,
          onBack: () => backs++,
          onAbandon: () => {
            abandons++;
            progression.abandonRun();
          }
        });
      }
      await mount(h(Fixture));
      const before = JSON.stringify(profileStore.getSnapshot());
      for (const cancel of ['button', 'escape', 'back']) {
        const opener = button('End run');
        await click(opener);
        focused(button('Keep run'));
        assert.match(query('[role="alertdialog"]').textContent, /match 1 of 9/);
        await act(() => opener.click());
        assert.equal(abandons, 0);
        if (cancel === 'button') await click(button('Keep run'));
        else if (cancel === 'escape') await key(button('Keep run'), 'Escape');
        else await act(() => win.dispatchEvent(new win.PopStateEvent('popstate')));
        assert.equal(JSON.stringify(profileStore.getSnapshot()), before);
        assert.equal(backs, 0);
        focused(opener);
      }
      await click(button('End run'));
      await act(() => {
        progression.abandonRun();
        progression.startRun(0);
      });
      absent('[role="alertdialog"]');
      assert.equal(abandons, 0);
      const saved = profileStore.getSnapshot();
      const run = saved.progress.run;
      const records = saved.progress.runRecords;
      await click(button('End run'));
      await click(button('End this run'));
      assert.equal(abandons, 1);
      const after = profileStore.getSnapshot();
      assert.equal(after.progress.run, null);
      assert.equal(after.progress.lastRun.seed, run.seed);
      assert.equal(after.progress.lastRun.finished, true);
      assert.equal(after.progress.lastRun.won, false);
      assert.equal(after.progress.runRecords.runs, records.runs + 1);
      assert.equal(after.progress.runRecords.clears, records.clears);
      assert.equal(after.xp, saved.xp);
      assert.deepEqual(after.unlocks, saved.unlocks);
      absent('[role="alertdialog"]');
    }
  );

  await check(
    'guest reset requires explicit acceptance and is unavailable for account restoration, cloud or demo',
    async () => {
      await act(() => profileStore.setIdentity('UI Tester', 'ring'));
      const device = settingsStore.getSnapshot();
      const deviceSave = win.localStorage.getItem('bball.settings');
      let backs = 0;
      let status = 'guest';
      function Fixture() {
        const profile = useProfile();
        useBackHandler(true, () => backs++);
        return h(ProfileScreen, {
          profile,
          account: { ...accountStore.getSnapshot(), status },
          onAccount: noop,
          onAchievements: noop,
          onCustomize: noop,
          onSettings: noop,
          onDemo: noop,
          onBack: () => backs++
        });
      }
      await mount(h(Fixture));
      const before = JSON.stringify(profileStore.getSnapshot());
      const stored = win.localStorage.getItem('bball.profile');
      for (const cancel of ['button', 'escape', 'back']) {
        const opener = button('Reset progress');
        await click(opener);
        focused(button('Keep progress'));
        assert.match(query('[role="alertdialog"]').textContent, /cannot be undone/);
        await act(() => opener.click());
        if (cancel === 'button') await click(button('Keep progress'));
        else if (cancel === 'escape') await key(button('Keep progress'), 'Escape');
        else await act(() => win.dispatchEvent(new win.PopStateEvent('popstate')));
        assert.equal(JSON.stringify(profileStore.getSnapshot()), before);
        assert.equal(win.localStorage.getItem('bball.profile'), stored);
        assert.equal(backs, 0);
        focused(opener);
      }
      await click(button('Reset progress'));
      for (status of ['restoring', 'authenticated']) {
        await act(() => root.render(h(StrictMode, null, h(Fixture))));
        absent('[role="alertdialog"]');
        assert.equal(
          [...host.querySelectorAll('button')].some(
            (entry) => entry.textContent === 'Reset progress'
          ),
          false
        );
        assert.equal(JSON.stringify(profileStore.getSnapshot()), before);
      }
      status = 'guest';
      await act(() => root.render(h(StrictMode, null, h(Fixture))));
      assert.ok(
        !win.document.querySelector('[role="alertdialog"]'),
        'returning to guest must not restore an armed reset'
      );
      await click(button('Reset progress'));
      await act(() => profileStore.startDemo(5));
      absent('[role="alertdialog"]');
      assert.match(host.textContent, /Demo profile/);
      assert.equal(
        [...host.querySelectorAll('button')].some(
          (entry) => entry.textContent === 'Reset progress'
        ),
        false
      );
      await act(() => profileStore.endDemo());
      assert.equal(JSON.stringify(profileStore.getSnapshot()), before);
      assert.ok(
        !win.document.querySelector('[role="alertdialog"]'),
        'leaving Demo must not restore an armed reset'
      );
      // Starting another view of the real profile does not retain an armed reset.
      await mount(h(Fixture));
      await click(button('Reset progress'));
      await click(button('Erase guest progress'));
      const after = profileStore.getSnapshot();
      assert.equal(after.xp, 0);
      assert.equal(after.name, 'Player');
      assert.equal(after.stats.matches, 0);
      assert.equal(query('input[aria-label="Player name"]').value, 'Player');
      absent('[role="alertdialog"]');
      assert.equal(settingsStore.getSnapshot(), device);
      assert.equal(win.localStorage.getItem('bball.settings'), deviceSave);
    }
  );

  const { AccountScreen } = await vite.ssrLoadModule('/src/ui/screens/AccountScreen.tsx');
  async function withAccountUi(test) {
    const methods = {
      getSnapshot: accountStore.getSnapshot,
      subscribe: accountStore.subscribe,
      flush: accountStore.flush,
      loadProviders: accountStore.loadProviders
    };
    let state = {
      ...methods.getSnapshot(),
      status: 'restoring',
      sync: 'offline',
      online: false,
      email: 'returning@example.test',
      providers: []
    };
    const listeners = new Set();
    let work = async () => {};
    const calls = [];
    accountStore.getSnapshot = () => state;
    accountStore.subscribe = (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };
    accountStore.loadProviders = async () => [];
    accountStore.flush = async (force) => {
      calls.push(force);
      await work();
    };
    try {
      await test({
        calls,
        retry: (next) => {
          work = next;
        },
        update: async (patch) =>
          act(() => {
            state = { ...state, ...patch };
            for (const listener of listeners) listener();
          })
      });
    } finally {
      await act(() => root.render(null));
      Object.assign(accountStore, methods);
    }
  }

  await check(
    'uncached account recovery reports guest play and allows explicit retry despite offline hints',
    async () => {
      await withAccountUi(async ({ update, calls }) => {
        const before = JSON.stringify(profileStore.getSnapshot());
        await mount(h(AccountScreen, { onBack: noop }));
        assert.match(query('[role="status"]').textContent, /Account offline.*playing as guest/);
        const restore = button('Try restoring account');
        assert.equal(restore.getAttribute('aria-disabled'), 'false');
        await update({ sync: 'syncing' });
        assert.match(query('[role="status"]').textContent, /Restoring your account/);
        await click(restore);
        assert.deepEqual(calls, [], 'a restoring request cannot be activated again');
        await update({ sync: 'error', notice: 'Try again later.' });
        assert.match(
          query('[role="status"]').textContent,
          /Could not restore account.*playing as guest/
        );
        assert.ok(host.textContent.includes('Try again later.'));
        await click(restore);
        assert.deepEqual(calls, [true]);
        await update({ status: 'authenticated', sync: 'offline', notice: null });
        assert.equal(button('Sync now').disabled, false);
        await click(button('Sync now'));
        assert.deepEqual(calls, [true, true], 'both retry routes override advisory connectivity');
        assert.equal(JSON.stringify(profileStore.getSnapshot()), before);
      });
    }
  );

  await check(
    'account retry preserves focus on failure and hands it to Sync only while the retry owns focus',
    async () => {
      for (const keepFocus of [true, false]) {
        await withAccountUi(async ({ retry, update, calls }) => {
          let refuse;
          retry(
            () =>
              new Promise((_, reject) => {
                refuse = reject;
              })
          );
          await mount(h(AccountScreen, { onBack: noop }));
          const restore = button('Try restoring account');
          await click(restore);
          focused(restore);
          assert.equal(restore.getAttribute('aria-disabled'), 'true');
          await click(restore);
          assert.equal(calls.length, 1);
          await act(() => refuse(new Error('No connection.')));
          focused(restore);
          assert.equal(restore.getAttribute('aria-disabled'), 'false');
          let finish;
          retry(
            () =>
              new Promise((resolve) => {
                finish = resolve;
              })
          );
          await click(restore);
          const back = query('button[aria-label="Back"]');
          if (!keepFocus) await act(() => back.focus());
          await update({ status: 'authenticated', sync: 'idle', online: true });
          await act(() => finish());
          focused(keepFocus ? button('Sync now') : back);
          absent('button[aria-disabled="true"]');
        });
      }
    }
  );

  await check(
    'an ended remembered session explains sign-in recovery on the Account page',
    async () => {
      await withAccountUi(async ({ update }) => {
        await update({
          status: 'guest',
          sync: 'idle',
          notice: 'Your session ended. Sign in again to sync.'
        });
        await mount(h(AccountScreen, { onBack: noop }));
        assert.ok(host.textContent.includes('Your session ended. Sign in again to sync.'));
        assert.ok(host.querySelector('#account-email'));
        assert.ok(!host.textContent.includes('Try restoring account'));
        focused(query('h2'));
      });
    }
  );

  const profilePage = (profile, status = 'guest') =>
    h(ProfileScreen, {
      profile,
      account: { ...accountStore.getSnapshot(), status },
      onAccount: noop,
      onAchievements: noop,
      onCustomize: noop,
      onSettings: noop,
      onDemo: noop,
      onBack: noop
    });
  const nameInput = () => query('input[aria-label="Player name"]');
  const typeName = async (value) => {
    const input = nameInput();
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
    await act(() => {
      setter.call(input, value);
      input.dispatchEvent(new win.Event('input', { bubbles: true }));
    });
    assert.equal(input.value, value);
  };
  const cloudName = (displayName, extra = {}) => ({
    ...createProfile(),
    userId: 'ui-profile-name-account',
    saveId: 'ui-profile-name-save',
    version: 1,
    displayName,
    ...extra
  });

  await check(
    'Account offers the real guest progress during Demo and never a throwaway level',
    async () => {
      await withAccountUi(async ({ update }) => {
        await update({ status: 'guest', sync: 'idle', email: null, notice: null });
        await act(() => profileStore.reset());
        for (const earned of [false, true]) {
          if (earned) await act(() => progression.recordMatch(quickResult));
          const guest = profileStore.getSnapshot();
          const guestBytes = win.localStorage.getItem('bball.profile');
          await act(() => profileStore.startDemo(400));
          await act(() => progression.recordMatch(quickResult));
          try {
            await mount(h(AccountScreen, { onBack: noop }));
            assert.equal(!!host.querySelector('input[type="checkbox"]'), earned);
            if (earned) {
              const hint = host.querySelector('input[type="checkbox"]').parentElement.textContent;
              assert.ok(hint.includes('1 matches'));
              assert.ok(!hint.includes('Level 400'));
              assert.equal(profileStore.guestSave().saveId, guest.id);
            }
            assert.equal(win.localStorage.getItem('bball.profile'), guestBytes);
            focused(query('h2'));
          } finally {
            await act(() => root.render(null));
            await act(() => profileStore.endDemo());
          }
        }
      });
    }
  );

  await check(
    'Profile keeps the demo name draft and focus during hidden account sync, then shows the latest real name',
    async () => {
      const dto = cloudName('Before sync');
      await act(() => profileStore.signIn(dto));
      await act(() => profileStore.startDemo(40));
      function Fixture() {
        return profilePage(useProfile(), 'authenticated');
      }
      try {
        await mount(h(Fixture));
        await typeName('Demo draft');
        const input = nameInput();
        const demo = profileStore.getSnapshot();
        await act(() =>
          profileStore.applyCloud({ ...dto, displayName: 'Latest real', version: 2 })
        );
        assert.ok(profileStore.getSnapshot() === demo);
        assert.ok(nameInput() === input);
        assert.equal(input.value, 'Demo draft');
        assert.match(host.textContent, /Demo profile.*level 40/);
        focused(input);
        await act(() => profileStore.endDemo());
        assert.equal(nameInput().value, 'Latest real');
        await act(() => nameInput().blur());
        assert.equal(profileStore.getSnapshot().name, 'Latest real');
      } finally {
        await act(() => root.render(null));
        await act(() => profileStore.signOut(true));
      }
    }
  );

  await check(
    'an untouched Profile name follows cloud updates and cannot overwrite them on blur',
    async () => {
      const guest = profileStore.getSnapshot();
      const dto = cloudName('Before sync');
      await act(() => profileStore.signIn(dto));
      function Fixture() {
        return profilePage(useProfile(), 'authenticated');
      }
      try {
        await mount(h(Fixture));
        const input = nameInput();
        input.focus();
        await act(() => profileStore.applyCloud({ ...dto, displayName: 'After sync', version: 2 }));
        assert.equal(input.value, 'After sync');
        assert.ok(nameInput() === input, 'same-account updates keep the input node');
        focused(input);
        const synced = profileStore.getSnapshot();
        await act(() => input.blur());
        assert.ok(
          profileStore.getSnapshot() === synced,
          'blur without an edit cannot rewrite the profile'
        );
        const avatar = query('button[aria-label="Avatar ring"]');
        await click(avatar);
        assert.equal(profileStore.getSnapshot().name, 'After sync');
        assert.equal(profileStore.getSnapshot().avatar, 'ring');
      } finally {
        await act(() => root.render(null));
        await act(() => profileStore.signOut(true));
        assert.equal(profileStore.getSnapshot().name, guest.name);
      }
    }
  );

  await check(
    'Profile keeps a real draft through sync and saves its cleaned name with the latest avatar',
    async () => {
      const dto = cloudName('Original', { avatar: 'orb' });
      await act(() => profileStore.signIn(dto));
      function Fixture() {
        return profilePage(useProfile(), 'authenticated');
      }
      try {
        await mount(h(Fixture));
        const input = nameInput();
        await typeName('  My   name  ');
        // Same-account profile updates include ordinary progression and remote identity edits.
        await act(() => profileStore.setLastBot('amateur'));
        assert.equal(input.value, '  My   name  ');
        await act(() =>
          profileStore.applyCloud({ ...dto, displayName: 'Remote', avatar: 'bolt', version: 2 })
        );
        assert.equal(input.value, '  My   name  ');
        focused(input);
        await key(input, 'Enter');
        assert.equal(profileStore.getSnapshot().name, 'My name');
        assert.equal(profileStore.getSnapshot().avatar, 'bolt');
        assert.equal(input.value, 'My name', 'the field reflects the actual cleaned saved name');
        const saved = profileStore.getSnapshot();
        input.focus();
        await act(() => input.blur());
        await click(query('button[aria-label="Avatar bolt"]'));
        assert.ok(
          profileStore.getSnapshot() === saved,
          'unchanged blur and avatar cannot queue duplicate edits'
        );
        await typeName('My name ');
        await act(() => input.blur());
        assert.ok(
          profileStore.getSnapshot() === saved,
          'equivalent whitespace cannot rewrite the save'
        );
        assert.equal(input.value, 'My name');
        await typeName('');
        await act(() => input.blur());
        assert.equal(profileStore.getSnapshot().name, 'Player');
        assert.equal(input.value, 'Player');
      } finally {
        await act(() => root.render(null));
        await act(() => profileStore.signOut(true));
      }
    }
  );

  await check(
    'Profile drafts cannot cross guest/account/Demo/reset ownership changes',
    async () => {
      await act(() => profileStore.setIdentity('Guest name', 'orb'));
      const guestSave = win.localStorage.getItem('bball.profile');
      function Fixture() {
        return profilePage(useProfile(), profileStore.isCloud() ? 'authenticated' : 'guest');
      }
      try {
        await mount(h(Fixture));
        const input = nameInput();
        await typeName('Guest draft');
        await act(() => profileStore.signIn(cloudName('Cloud name')));
        assert.equal(input.value, 'Cloud name');
        focused(input);
        assert.equal(
          win.localStorage.getItem('bball.profile'),
          guestSave,
          'restore cannot commit the guest draft'
        );
        await typeName('Cloud draft');
        await act(() => profileStore.signOut(true));
        assert.equal(input.value, 'Guest name');
        assert.equal(profileStore.getSnapshot().name, 'Guest name');
        focused(input);
        await typeName('Real draft');
        await act(() => profileStore.startDemo(5));
        assert.equal(input.value, 'Guest name');
        await typeName('Demo draft');
        await act(() => profileStore.endDemo());
        assert.equal(input.value, 'Guest name');
        assert.equal(profileStore.getSnapshot().name, 'Guest name');
        await typeName('Reset draft');
        await act(() => profileStore.reset());
        assert.equal(input.value, 'Player');
        focused(input);
        await act(() => input.blur());
        assert.equal(profileStore.getSnapshot().name, 'Player');
      } finally {
        await act(() => root.render(null));
        await act(() => {
          profileStore.endDemo();
          profileStore.signOut(true);
        });
      }
    }
  );

  await check(
    'identity actions use the current store when a restore or rename precedes React commit',
    async () => {
      await act(() => profileStore.setIdentity('Guest name', 'orb'));
      function Fixture() {
        return profilePage(useProfile(), profileStore.isCloud() ? 'authenticated' : 'guest');
      }
      try {
        await mount(h(Fixture));
        await typeName('Guest draft');
        const input = nameInput();
        const dto = cloudName('Cloud name', { avatar: 'orb' });
        let restored;
        await act(() => {
          profileStore.signIn(dto);
          restored = profileStore.getSnapshot();
          input.blur();
        });
        assert.ok(
          profileStore.getSnapshot() === restored,
          'a late guest blur cannot modify the restored account'
        );
        assert.equal(input.value, 'Cloud name');
        const avatar = query('button[aria-label="Avatar ring"]');
        await act(() => {
          profileStore.applyCloud({ ...dto, displayName: 'Latest name', version: 2 });
          avatar.click();
        });
        assert.equal(profileStore.getSnapshot().name, 'Latest name');
        assert.equal(profileStore.getSnapshot().avatar, 'ring');
        assert.equal(input.value, 'Latest name');
      } finally {
        await act(() => root.render(null));
        await act(() => profileStore.signOut(true));
      }
    }
  );

  await check('Enter during name composition keeps editing until a deliberate commit', async () => {
    await act(() => profileStore.setIdentity('Before', 'orb'));
    function Fixture() {
      return profilePage(useProfile());
    }
    await mount(h(Fixture));
    await typeName('雨');
    const input = nameInput();
    const before = profileStore.getSnapshot();
    for (const [isComposing, keyCode] of [
      [true, 0],
      [false, 229]
    ]) {
      await act(() =>
        input.dispatchEvent(
          new win.KeyboardEvent('keydown', { key: 'Enter', isComposing, keyCode, bubbles: true })
        )
      );
      focused(input);
      assert.ok(
        profileStore.getSnapshot() === before,
        'composition confirmation cannot save prematurely'
      );
      assert.equal(input.value, '雨');
    }
    await key(input, 'Enter');
    assert.equal(profileStore.getSnapshot().name, '雨');
    assert.equal(input.value, '雨');
  });

  await check(
    'failed device saves are visible and Exit never promises unsaved progress is safe',
    async () => {
      const storage = win.localStorage;
      const original = Object.getOwnPropertyDescriptor(win, 'localStorage');
      const write = storage.setItem.bind(storage);
      let blocked = true;
      const failingWrite = (key, value) => {
        if (blocked) throw new win.DOMException('Storage full', 'QuotaExceededError');
        write(key, value);
      };
      Object.defineProperty(win, 'localStorage', {
        configurable: true,
        value: new Proxy(storage, {
          get: (target, key) => (key === 'setItem' ? failingWrite : Reflect.get(target, key))
        })
      });
      try {
        assert.throws(() => win.localStorage.setItem('bball.test.probe', 'unused'), {
          name: 'QuotaExceededError'
        });
        await act(() => profileStore.setIdentity('Unsaved player', 'ring'));
        await mount(
          h(
            Overlay,
            { show: true, label: 'Exit', onDismiss: noop },
            h(ExitPanel, { native: true, onExit: noop, onCancel: noop })
          )
        );
        assert.ok(
          !win.document.body.textContent.includes('Your progress is saved on this device.'),
          'Exit must not reassure the player after a failed device write'
        );
        assert.match(win.document.body.textContent, /could not be saved on this device/i);
        focused(button('Keep playing'));
        await click(button('Try saving again'));
        assert.match(win.document.body.textContent, /could not be saved on this device/i);
        blocked = false;
        await click(button('Try saving again'));
        assert.equal(JSON.parse(storage.getItem('bball.profile')).data.name, 'Unsaved player');
        assert.match(win.document.body.textContent, /Changes saved on this device/);
        focused(query('[role="status"]'));
      } finally {
        Object.defineProperty(win, 'localStorage', original);
      }
    }
  );

  await check(
    'device retry survives menu changes and Demo without replaying earned rewards or saving the demo',
    async () => {
      const { HomeScreen } = await vite.ssrLoadModule('/src/ui/screens/HomeScreen.tsx');
      const storage = win.localStorage;
      const original = Object.getOwnPropertyDescriptor(win, 'localStorage');
      const write = storage.setItem.bind(storage);
      let blocked = true;
      Object.defineProperty(win, 'localStorage', {
        configurable: true,
        value: new Proxy(storage, {
          get: (target, key) =>
            key === 'setItem'
              ? (key, value) => {
                  if (blocked) throw new win.DOMException('Storage full', 'QuotaExceededError');
                  write(key, value);
                }
              : Reflect.get(target, key)
        })
      });
      try {
        const earned = createWorld(new Proxy({}, { get: () => () => 0 }), 1);
        startMatch(earned, quickMatchRules('rookie'));
        earned.match.score.you = earned.rules.winScore;
        earned.match.winner = 'you';
        earned.match.elapsed = 60;
        publishResult(earned);
        let summary;
        await act(() => {
          summary = progression.recordMatch(earned.match.result);
        });
        await act(() => settingsStore.update({ touchSensitivity: 1.75 }));
        const profile = profileStore.getSnapshot();
        const settings = settingsStore.getSnapshot();
        await withUiFrames(async () => {
          await mount(resultPage(earned.match.result, summary));
          assert.match(host.textContent, /could not be saved/);
          focused(query('h2'));
          assert.ok(!button('Try saving again').closest('footer'));
          await click(button('Try saving again'));
          assert.match(host.textContent, /Saving is still unavailable/);
          focused(button('Try saving again'));
          blocked = false;
          await click(button('Try saving again'));
          assert.match(host.textContent, /Changes saved on this device/);
          focused(query('[role="status"]'));
          const saved = JSON.parse(storage.getItem('bball.profile')).data;
          assert.equal(saved.xp, profile.xp);
          assert.equal(saved.stats.matches, profile.stats.matches);
          assert.ok(profileStore.getSnapshot() === profile, 'Results retry cannot reapply rewards');
          assert.ok(
            settingsStore.getSnapshot() === settings,
            'Results retry cannot reapply settings'
          );
        });
        // A later failure still follows the player to another menu and survives Demo.
        blocked = true;
        await act(() => settingsStore.update({ touchSensitivity: 1.75 }));
        const latestSettings = settingsStore.getSnapshot();
        await mount(
          h(HomeScreen, {
            profile,
            account: accountStore.getSnapshot(),
            demoLevel: null,
            onPick: noop,
            onModes: noop,
            onExitDemo: noop,
            onProfile: noop,
            onTalents: noop,
            onSettings: noop,
            onHelp: noop
          })
        );
        assert.match(host.textContent, /could not be saved/);
        focused(query('h1'));
        await act(() => profileStore.startDemo(5));
        await act(() => profileStore.setIdentity('Throwaway demo', 'ring'));
        blocked = false;
        await click(button('Try saving again'));
        const saved = JSON.parse(storage.getItem('bball.profile')).data;
        assert.equal(saved.xp, profile.xp);
        assert.equal(saved.name, profile.name);
        assert.equal(saved.stats.matches, profile.stats.matches);
        assert.equal(JSON.parse(storage.getItem('bball.settings')).data.touchSensitivity, 1.75);
        assert.equal(profileStore.getDemoLevel(), 5);
        focused(query('[role="status"]'));
        await act(() => profileStore.endDemo());
        assert.ok(
          profileStore.getSnapshot() === profile,
          'retry must not apply a second match or change the real save'
        );
        assert.ok(
          settingsStore.getSnapshot() === latestSettings,
          'retry must not reapply preferences'
        );
      } finally {
        Object.defineProperty(win, 'localStorage', original);
      }
    }
  );

  await check('guest and offline status never claim a failed device save succeeded', async () => {
    const { SyncBadge } = await vite.ssrLoadModule('/src/ui/components/SyncBadge.tsx');
    const { localSaveStatus } = await vite.ssrLoadModule('/src/core/storage/localStore.ts');
    const original = Object.getOwnPropertyDescriptor(win, 'localStorage');
    Object.defineProperty(win, 'localStorage', {
      configurable: true,
      get: () => {
        throw new win.DOMException('Storage blocked', 'SecurityError');
      }
    });
    try {
      await act(() => settingsStore.update({ touchSensitivity: 1.5 }));
      const guest = accountStore.getSnapshot();
      await mount(h(SyncBadge, { account: guest, showGuest: true }));
      assert.equal(host.textContent, 'Playing as guest');
      await mount(
        h(SyncBadge, {
          account: { ...guest, status: 'authenticated', sync: 'offline', pending: 2 }
        })
      );
      assert.ok(!host.textContent.includes('progress is saved here'));
      Object.defineProperty(win, 'localStorage', original);
      await act(() => assert.equal(localSaveStatus.retry(), true));
      assert.match(host.textContent, /Offline - progress is saved here/);
    } finally {
      Object.defineProperty(win, 'localStorage', original);
    }
  });

  await check(
    'recovery protects an unread existing record and explains how to restore it',
    async () => {
      const { loadRecord, saveRecord, clearRecord, localSaveStatus } = await vite.ssrLoadModule(
        '/src/core/storage/localStore.ts'
      );
      const { Screen } = await vite.ssrLoadModule('/src/ui/components/Screen.tsx');
      const spec = {
        key: 'bball.test.protected',
        version: 1,
        create: () => ({}),
        migrate: (value) => value,
        validate: (value) => value
      };
      const storage = win.localStorage;
      const original = Object.getOwnPropertyDescriptor(win, 'localStorage');
      const existing = JSON.stringify({ v: 1, data: { name: 'Existing player', xp: 500 } });
      storage.setItem(spec.key, existing);
      Object.defineProperty(win, 'localStorage', {
        configurable: true,
        get: () => {
          throw new win.DOMException('Read blocked', 'SecurityError');
        }
      });
      try {
        loadRecord(spec);
        await act(() => saveRecord(spec, { name: 'Temporary player', xp: 10 }));
        await mount(h(Screen, { title: 'Progress' }, h('button', null, 'Continue')));
        Object.defineProperty(win, 'localStorage', original);
        await click(button('Try saving again'));
        assert.equal(localSaveStatus.getSnapshot(), 'restore');
        assert.equal(storage.getItem(spec.key), existing);
        assert.match(query('[role="status"]').textContent, /Existing saved data is protected/);
        assert.match(query('[role="status"]').textContent, /Reopen bBall to load it/);
        focused(button('Try saving again'));
        await click(button('Try saving again'));
        assert.equal(storage.getItem(spec.key), existing);
      } finally {
        Object.defineProperty(win, 'localStorage', original);
        await act(() => clearRecord(spec));
      }
    }
  );

  const [
    { JourneyScreen: ExpansionJourney },
    { DifficultyScreen: ExpansionDifficulty },
    { GauntletScreen: ExpansionGauntlet },
    { TournamentScreen: ExpansionCup },
    expansionJourney,
    { xpToReach: expansionXp }
  ] = await Promise.all([
    vite.ssrLoadModule('/src/ui/screens/JourneyScreen.tsx'),
    vite.ssrLoadModule('/src/ui/screens/DifficultyScreen.tsx'),
    vite.ssrLoadModule('/src/ui/screens/GauntletScreen.tsx'),
    vite.ssrLoadModule('/src/ui/screens/TournamentScreen.tsx'),
    vite.ssrLoadModule('/src/core/campaign/journey.ts'),
    vite.ssrLoadModule('/src/core/progression/levels.ts')
  ]);
  const { GamePicker } = await vite.ssrLoadModule('/src/ui/components/GamePicker.tsx');
  const finishPicker = async () => {
    const sheet = query('[data-picker-sheet][data-closing="true"]');
    await act(() => sheet.dispatchEvent(new win.Event('animationend', { bubbles: true })));
    absent('[role="dialog"]');
  };
  await check(
    'game choices skip locked options, commit once and restore trigger focus on selection or Escape',
    async () => {
      const changes = [];
      function Choices() {
        const [value, setValue] = useState('story');
        return h(GamePicker, {
          label: 'Journey rules',
          value,
          onChange: (next) => {
            changes.push(next);
            setValue(next);
          },
          options: [
            { value: 'story', name: 'Story' },
            { value: 'veteran', name: 'Veteran', disabled: true, hint: 'Locked' },
            { value: 'ascendant', name: 'Ascendant' }
          ]
        });
      }
      await mount(h(Choices));
      const trigger = query('[aria-label="Journey rules"]');
      await click(trigger);
      const list = query('[role="listbox"]');
      focused(list);
      assert.equal(host.hasAttribute('inert'), true);
      await key(list, 'ArrowDown');
      assert.equal(
        win.document
          .getElementById(list.getAttribute('aria-activedescendant'))
          .getAttribute('data-value'),
        'ascendant'
      );
      assert.equal(changes.length, 0);
      await key(list, 'Enter');
      assert.deepEqual(changes, ['ascendant']);
      assert.equal(trigger.getAttribute('data-value'), 'ascendant');
      assert.equal(host.hasAttribute('inert'), true, 'keep the background blocked during exit');
      await key(list, 'Enter');
      await click(query('[aria-label="Close choices"]'));
      assert.deepEqual(changes, ['ascendant'], 'ignore repeated input during exit');
      await finishPicker();
      focused(trigger);
      assert.equal(host.hasAttribute('inert'), false);
      await click(trigger);
      await key(query('[role="listbox"]'), 's');
      await key(query('[role="listbox"]'), 'Escape');
      assert.deepEqual(changes, ['ascendant']);
      await finishPicker();
      focused(trigger);
    }
  );
  await check(
    'long game choice lists filter, explain empty results and support keyboard selection without opening a keyboard on entry',
    async () => {
      const changes = [];
      await mount(
        h(GamePicker, {
          label: 'Court',
          value: 'court-0',
          onChange: (value) => changes.push(value),
          options: Array.from({ length: 30 }, (_, i) => ({
            value: `court-${i}`,
            name: `Court ${i}`
          }))
        })
      );
      await click(query('[aria-label="Court"]'));
      focused(query('[role="listbox"]'));
      const search = query('[aria-label="Search court"]');
      const setSearch = Object.getOwnPropertyDescriptor(
        win.HTMLInputElement.prototype,
        'value'
      ).set;
      await act(() => {
        setSearch.call(search, 'missing');
        search.dispatchEvent(new win.Event('input', { bubbles: true }));
      });
      assert.equal(win.document.querySelectorAll('[role="option"]').length, 0);
      assert.match(query('[role="status"]').textContent, /No choices match/);
      await key(query('[role="listbox"]'), 'Enter');
      assert.equal(changes.length, 0);
      await act(() => {
        setSearch.call(search, 'Court 29');
        search.dispatchEvent(new win.Event('input', { bubbles: true }));
      });
      assert.equal(win.document.querySelectorAll('[role="option"]').length, 1);
      await key(search, 'ArrowDown');
      focused(query('[role="listbox"]'));
      await key(query('[role="listbox"]'), 'Enter');
      assert.deepEqual(changes, ['court-29']);
      await finishPicker();
    }
  );
  await check(
    'choice panels dismiss through their backdrop and release background blocking when unmounted',
    async () => {
      const changes = [];
      const props = {
        label: 'Chapter',
        value: 0,
        onChange: (value) => changes.push(value),
        options: [
          { value: 0, name: 'Original Journey' },
          { value: 1, name: 'Precision Circuit' }
        ]
      };
      await mount(h(GamePicker, props));
      const trigger = query('[aria-label="Chapter"]');
      await click(trigger);
      await click(query('[aria-label="Dismiss Chapter"]'));
      await finishPicker();
      assert.equal(changes.length, 0);
      focused(trigger);
      await click(trigger);
      await act(() => win.dispatchEvent(new win.PopStateEvent('popstate')));
      await finishPicker();
      focused(trigger);
      await click(trigger);
      await act(() => root.render(null));
      absent('[role="dialog"]');
      assert.equal(host.hasAttribute('inert'), false);
      await mount(h(GamePicker, { ...props, disabled: true }));
      await click(query('[aria-label="Chapter"]'));
      absent('[role="dialog"]');
    }
  );
  await check('choice exit fallback restores focus and unmount cancels its timer', async () => {
    await withUiClock(async (advance, pendingCount) => {
      await mount(
        h(GamePicker, {
          label: 'Rules',
          value: 'story',
          options: [{ value: 'story', name: 'Story' }],
          onChange: noop
        })
      );
      const trigger = query('[aria-label="Rules"]');
      await click(trigger);
      await key(query('[role="listbox"]'), 'Escape');
      assert.equal(pendingCount(), 1);
      await advance(200);
      query('[data-picker-sheet][data-closing="true"]');
      assert.equal(host.hasAttribute('inert'), true);
      await advance(80);
      absent('[role="dialog"]');
      focused(trigger);
      assert.equal(host.hasAttribute('inert'), false);
      await click(trigger);
      await key(query('[role="listbox"]'), 'Escape');
      assert.equal(pendingCount(), 1);
      await act(() => root.render(null));
      assert.equal(pendingCount(), 0);
      absent('[role="dialog"]');
      assert.equal(host.hasAttribute('inert'), false);
    });
  });
  const choose = async (label, value) => {
    const field = [...host.querySelectorAll('[data-picker]')].find((e) =>
      e.getAttribute('data-picker').startsWith(label)
    );
    const control = field?.querySelector('button');
    assert.ok(control, label);
    const details = field.closest('details');
    if (details && !details.open) await click(details.querySelector('summary'));
    await click(control);
    const option = [...win.document.querySelectorAll('[role="option"]')].find(
      (e) => e.getAttribute('data-value') === String(value)
    );
    assert.ok(option, `${label}: ${value}`);
    assert.equal(option.disabled, false);
    await click(option);
    await finishPicker();
  };
  await check('Journey variants and Frontier launch their actual stage IDs', async () => {
    const profile = createProfile();
    profile.progress.journey = Object.fromEntries(
      expansionJourney.LEGACY_STAGES.map((s) => [s.id, 7])
    );
    const played = [];
    await mount(h(ExpansionJourney, { profile, onPlay: (id) => played.push(id), onBack: noop }));
    await choose('Chapter', 0);
    await choose('Journey rules', 'veteran');
    await click(button('Play 1-1'));
    assert.equal(played.at(-1), 'veteran-w1-1');
    await click(button('Journey Beyond · next frontier sector'));
    await click(button('Play 31-1'));
    assert.equal(played.at(-1), 'f2-1-1');
    assert.ok(host.querySelectorAll('[role="tab"]').length === 1);
  });
  await check('Quick contracts and isolated boss drills pass the configured options', async () => {
    const profile = createProfile(),
      picked = [];
    const props = {
      profile,
      onPick: (bot, options) => picked.push({ bot, options }),
      onBack: noop
    };
    await mount(h(ExpansionDifficulty, { ...props, practice: false }));
    await choose('Contract', 'mythic');
    await choose('Court', 'gatehouse-1');
    await choose('Opponent school', 'banker');
    await click([...host.querySelectorAll('button')].find((b) => b.textContent.includes('Legend')));
    assert.deepEqual(picked.at(-1), {
      bot: 'legend',
      options: { personality: 'banker', arenaId: 'gatehouse-1', contract: 'mythic' }
    });
    await mount(h(ExpansionDifficulty, { ...props, practice: true }));
    await choose('Court', 'gatehouse-1');
    await choose('Boss drill', 'gatekeeper');
    await choose('Isolated phase', 2);
    assert.equal(host.querySelector('[aria-label="Court"]'), null);
    assert.equal(
      [...host.querySelectorAll('button')].some((b) => b.textContent.includes('Rookie')),
      false
    );
    await click(button('Start boss drill'));
    assert.equal(picked.at(-1).options.bossId, 'gatekeeper');
    assert.equal(picked.at(-1).options.bossPhase, 2);
    assert.equal(
      picked.at(-1).options.arenaId,
      undefined,
      'An ordinary court must not override the phase court'
    );
    await choose('Boss drill', '');
    assert.equal(
      host.querySelector('[aria-label="Court"]').getAttribute('data-value'),
      'gatehouse-1'
    );
    await click([...host.querySelectorAll('button')].find((b) => b.textContent.includes('Rookie')));
    assert.equal(picked.at(-1).bot, 'rookie');
    assert.equal(picked.at(-1).options.bossId, undefined);
  });
  await check('Gauntlet and cup format controls launch the selected long format', async () => {
    const profile = createProfile(),
      started = [];
    await mount(
      h(ExpansionGauntlet, {
        profile,
        onStart: (p, f) => started.push([p, f]),
        onPlay: noop,
        onPick: noop,
        onAbandon: noop,
        onBack: noop
      })
    );
    await click(
      [...host.querySelectorAll('button')].find((b) => b.textContent.startsWith('Endless'))
    );
    await click(button('Start a run'));
    assert.deepEqual(started.at(-1), [0, 'endless']);
    await mount(
      h(ExpansionCup, {
        profile,
        onStart: (tier, f) => started.push([tier, f]),
        onAbandon: noop,
        onBack: noop
      })
    );
    await click(
      [...host.querySelectorAll('button')].find((b) => b.textContent.startsWith('Marathon'))
    );
    await click(button('Start Bronze Cup'));
    assert.deepEqual(started.at(-1), [0, 'marathon']);
  });
  await check(
    'Master Daily launches its separate dated card and exposes the fixed build',
    async () => {
      const profile = createProfile(),
        played = [];
      await mount(h(DailyScreen, { profile, onPlay: (key) => played.push(key), onBack: noop }));
      await click(button('Master · Legend'));
      assert.match(host.textContent, /Fixed level-50 Control build/);
      await click(button("Play today's challenge"));
      assert.equal(played.at(-1), `m2-${dayKey()}`);
    }
  );
  await check(
    'saved build slots grow with mastery and empty loads remain unavailable',
    async () => {
      const profile = createProfile();
      profile.xp = expansionXp(100);
      await mount(h(TalentScreen, { profile, onBack: noop }));
      assert.equal(
        host.querySelectorAll('[aria-label^="Save current talents to build"]').length,
        8
      );
      assert.equal(host.querySelector('[aria-label="Load build 1"]').disabled, true);
    }
  );

  await check(
    'wave and couch controls preserve series, symmetry, modifiers and local presets',
    async () => {
      const { ModesScreen } = await vite.ssrLoadModule('/src/ui/screens/ModesScreen.tsx');
      const picked = [];
      await mount(
        h(ModesScreen, {
          profile: createProfile(),
          onPick: (mode, options) => picked.push({ mode, options }),
          onBack: noop
        })
      );
      await choose('Court for Endless', 'switchyard-1');
      await choose('Endless format', 'waves');
      await choose('Versus series', 5);
      await choose('Versus rule', 'precision');
      await choose('Versus court', 'mirror');
      await click(button('Save couch 1'));
      await choose('Versus series', 1);
      await click(button('Load couch 1'));
      await click(
        [...host.querySelectorAll('button')].find(
          (b) => b.textContent.includes('Versus') && !b.textContent.includes('Save')
        )
      );
      assert.deepEqual(picked.at(-1), {
        mode: 'versus',
        options: { arenaId: 'switchyard-1', series: 5, duel: 'precision', mirror: true }
      });
      await click(
        [...host.querySelectorAll('button')].find((b) => b.textContent.startsWith('Endless'))
      );
      assert.deepEqual(picked.at(-1), {
        mode: 'endless',
        options: { arenaId: 'switchyard-1', waves: true }
      });
    }
  );
  await check('five-trial playlists expose saved progress and lock future contracts', async () => {
    const { ChallengeScreen } = await vite.ssrLoadModule('/src/ui/screens/ChallengeScreen.tsx');
    const profile = createProfile();
    profile.progress.contracts = 2;
    await mount(h(ChallengeScreen, { profile, onPick: noop, onBack: noop }));
    await click(
      [...host.querySelectorAll('summary')].find((s) =>
        s.textContent.includes('Five-trial contract playlist')
      )
    );
    assert.match(host.textContent, /2 of 5 cleared/);
    const trialButtons = [...host.querySelectorAll('button')].filter((b) =>
      b.textContent.startsWith('Contract ')
    );
    assert.equal(trialButtons.filter((b) => b.disabled).length, 2);
  });
  await check(
    'match rules pointer activation releases focus; keyboard activation preserves it',
    async () => {
      const [{ MatchHud }, { idleSnapshot }] = await Promise.all([
        vite.ssrLoadModule('/src/ui/MatchHud.tsx'),
        vite.ssrLoadModule('/src/game/engine.ts')
      ]);
      let opened = 0;
      await mount(
        h(MatchHud, {
          snapshot: { ...idleSnapshot(), canPause: true },
          objective: 'Test match rules',
          onGoals: () => opened++
        })
      );
      const rules = query('button');
      rules.focus();
      await act(() =>
        rules.dispatchEvent(new win.MouseEvent('click', { detail: 1, bubbles: true }))
      );
      assert.equal(opened, 1);
      assert.ok(
        win.document.activeElement !== rules,
        'pointer focus must not consume the next Space serve'
      );
      await click(rules);
      assert.equal(opened, 2);
      focused(rules);
    }
  );
  console.log(
    `${checks} UI interaction checks passed (DOM only; check:layout covers real browser geometry).`
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
