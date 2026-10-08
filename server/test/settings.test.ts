import assert from 'node:assert/strict';
import { it } from 'node:test';

it('older device settings retain preferences and pick up the new pacing defaults', async (t) => {
  const values = new Map<string, string>([
    [
      'bball.settings',
      JSON.stringify({
        v: 1,
        data: {
          musicVolume: 0.2,
          sfxVolume: 0.7,
          shake: 'off',
          skillSide: 'right',
          haptics: false,
          replays: false
        }
      })
    ]
  ]);
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value)
      }
    },
    configurable: true
  });
  t.after(() => {
    if (saved) Object.defineProperty(globalThis, 'window', saved);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  const { settingsStore, DEFAULT_SETTINGS } = await import('../../src/core/settings/store');
  assert.deepEqual(settingsStore.getSnapshot(), {
    language: 'en',
    musicVolume: 0.2,
    sfxVolume: 0.7,
    shake: 'off',
    skillSide: 'right',
    matchInfoExpanded: false,
    haptics: false,
    replays: false,
    effects: 'full',
    canvasQuality: 'high',
    fullscreen: false,
    autoServe: true,
    resumeCountdown: true,
    keyBindings: DEFAULT_SETTINGS.keyBindings,
    touchMode: 'direct',
    touchSensitivity: 1,
    practicePace: 'normal'
  });
  settingsStore.update({
    effects: 'calm',
    canvasQuality: 'balanced',
    autoServe: false,
    resumeCountdown: false
  });
  const stored = JSON.parse(values.get('bball.settings')!);
  assert.equal(stored.data.effects, 'calm');
  assert.equal(stored.data.canvasQuality, 'balanced');
  assert.equal(stored.data.autoServe, false);
  assert.equal(stored.data.resumeCountdown, false);
  assert.equal(stored.data.musicVolume, 0.2);
  settingsStore.update({
    practicePace: 'relaxed',
    touchMode: 'relative',
    touchSensitivity: 1.5,
    keyBindings: { ...DEFAULT_SETTINGS.keyBindings, up: ['i'] }
  });
  assert.equal(settingsStore.getSnapshot().keyBindings.up[0], 'i');
  assert.equal(JSON.parse(values.get('bball.settings')!).data.practicePace, 'relaxed');
  settingsStore.update({
    touchSensitivity: Infinity,
    keyBindings: { ...DEFAULT_SETTINGS.keyBindings, up: ['s'] }
  });
  assert.equal(settingsStore.getSnapshot().touchSensitivity, 1);
  assert.deepEqual(settingsStore.getSnapshot().keyBindings, DEFAULT_SETTINGS.keyBindings);
  settingsStore.update({ touchSensitivity: 100 });
  assert.equal(settingsStore.getSnapshot().touchSensitivity, 2);
  settingsStore.update({ touchSensitivity: -10 });
  assert.equal(settingsStore.getSnapshot().touchSensitivity, 0.5);
  settingsStore.update({ canvasQuality: 'low' });
  assert.equal(JSON.parse(values.get('bball.settings')!).data.canvasQuality, 'low');
  settingsStore.update({ canvasQuality: 'invalid' as typeof DEFAULT_SETTINGS.canvasQuality });
  assert.equal(settingsStore.getSnapshot().canvasQuality, 'high');
  settingsStore.update({ fullscreen: true });
  assert.equal(JSON.parse(values.get('bball.settings')!).data.fullscreen, true);
  settingsStore.update({ fullscreen: 'yes' as unknown as boolean });
  assert.equal(settingsStore.getSnapshot().fullscreen, false);
  settingsStore.update({ matchInfoExpanded: true });
  assert.equal(JSON.parse(values.get('bball.settings')!).data.matchInfoExpanded, true);
  settingsStore.update({ matchInfoExpanded: 'yes' as unknown as boolean });
  assert.equal(settingsStore.getSnapshot().matchInfoExpanded, false);
});
