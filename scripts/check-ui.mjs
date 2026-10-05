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
  element.focus();
  await act(async () => element.click());
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
    await test(async (milliseconds) => {
      now += milliseconds;
      await act(() => {
        for (const [handle, timer] of [...pending]) {
          if (timer.at > now) continue;
          pending.delete(handle);
          timer.callback();
        }
      });
    });
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
