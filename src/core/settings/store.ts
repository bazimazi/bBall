/**
 * Settings that belong to this device rather than to the player.
 *
 * Which thumb reaches for the skill buttons depends on the hand holding this
 * phone, not on the account, and how loud the game should be depends on the
 * room it is played in - so these live in localStorage beside the save and
 * are never synced. Framework-free like the profile store; the UI reads them
 * through `useSyncExternalStore`, and the engine is handed them by React.
 */

import { loadRecord, saveRecord, type StoreSpec } from '../storage/localStore';
import { AUDIO_MIX } from '../../game/audioMix';
import type { PracticePace } from '../modes/types';
import { DEFAULT_BINDINGS, validateBindings, type KeyBindings } from './controls';
import type { Language } from '../i18n/languages';

export type SkillSide = 'left' | 'right';

/** How hard the camera moves: the full shake, a gentle one, or none at all. */
export type ShakeLevel = 'full' | 'gentle' | 'off';
export type EffectsLevel = 'full' | 'calm';
export type CanvasQuality = 'high' | 'balanced' | 'low';
export type TouchMode = 'direct' | 'relative';

export interface DeviceSettings {
  /** Display language on this device; never changes shared game data. */
  language: Language;
  /** The screen edge the in-game skill buttons sit on. */
  skillSide: SkillSide;
  /** 0..1. The soundtrack's own level, under the master mute. */
  musicVolume: number;
  /** 0..1. Hits, skills and everything else that is not the soundtrack. */
  sfxVolume: number;
  shake: ShakeLevel;
  /** Short buzzes on hits and points, where the device can make them. */
  haptics: boolean;
  /** A slow-motion replay of the point that decided the match. */
  replays: boolean;
  /** Calm keeps local feedback but removes camera motion and screen flashes. */
  effects: EffectsLevel;
  /** Court pixel density; independent of effects, input and simulation timing. */
  canvasQuality: CanvasQuality;
  /** Hide mobile system bars; a browser re-enters on the next play gesture. */
  fullscreen: boolean;
  /** Automatically launch after the serve delay, or wait for the player. */
  autoServe: boolean;
  /** A short 3–2–1 before a paused rally resumes. */
  resumeCountdown: boolean;
  keyBindings: KeyBindings;
  touchMode: TouchMode;
  /** Relative drag distance multiplier, from 0.5 to 2. */
  touchSensitivity: number;
  practicePace: PracticePace;
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  language: 'en',
  skillSide: 'left',
  musicVolume: AUDIO_MIX.musicDefault,
  sfxVolume: AUDIO_MIX.effectsDefault,
  shake: 'full',
  haptics: true,
  replays: true,
  effects: 'full',
  canvasQuality: 'high',
  fullscreen: false,
  autoServe: true,
  resumeCountdown: true,
  keyBindings: DEFAULT_BINDINGS,
  touchMode: 'direct',
  touchSensitivity: 1,
  practicePace: 'normal'
};

/** The camera multiplier each shake level stands for. */
export const SHAKE_SCALE: Readonly<Record<ShakeLevel, number>> = {
  full: 1,
  gentle: 0.45,
  off: 0
};

function unit(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

const SPEC: StoreSpec<DeviceSettings> = {
  key: 'bball.settings',
  version: 1,
  create: () => ({ ...DEFAULT_SETTINGS }),
  migrate: (data) => data,
  // Field by field, so a save written before a setting existed simply picks
  // up its default rather than being thrown away.
  validate(data) {
    if (typeof data !== 'object' || data === null) return null;
    const source = data as Partial<DeviceSettings>;
    return {
      language: source.language === 'fa' ? 'fa' : DEFAULT_SETTINGS.language,
      skillSide: source.skillSide === 'right' ? 'right' : DEFAULT_SETTINGS.skillSide,
      musicVolume: unit(source.musicVolume, DEFAULT_SETTINGS.musicVolume),
      sfxVolume: unit(source.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
      shake:
        source.shake === 'gentle' || source.shake === 'off' ? source.shake : DEFAULT_SETTINGS.shake,
      haptics: typeof source.haptics === 'boolean' ? source.haptics : DEFAULT_SETTINGS.haptics,
      replays: typeof source.replays === 'boolean' ? source.replays : DEFAULT_SETTINGS.replays,
      effects: source.effects === 'calm' ? 'calm' : DEFAULT_SETTINGS.effects,
      canvasQuality:
        source.canvasQuality === 'balanced' || source.canvasQuality === 'low'
          ? source.canvasQuality
          : DEFAULT_SETTINGS.canvasQuality,
      fullscreen:
        typeof source.fullscreen === 'boolean' ? source.fullscreen : DEFAULT_SETTINGS.fullscreen,
      autoServe:
        typeof source.autoServe === 'boolean' ? source.autoServe : DEFAULT_SETTINGS.autoServe,
      resumeCountdown:
        typeof source.resumeCountdown === 'boolean'
          ? source.resumeCountdown
          : DEFAULT_SETTINGS.resumeCountdown,
      keyBindings: validateBindings(source.keyBindings),
      touchMode: source.touchMode === 'relative' ? 'relative' : DEFAULT_SETTINGS.touchMode,
      touchSensitivity:
        typeof source.touchSensitivity === 'number' && Number.isFinite(source.touchSensitivity)
          ? Math.min(2, Math.max(0.5, source.touchSensitivity))
          : DEFAULT_SETTINGS.touchSensitivity,
      practicePace: source.practicePace === 'relaxed' ? 'relaxed' : DEFAULT_SETTINGS.practicePace
    };
  }
};

type Listener = () => void;

let current: DeviceSettings = loadRecord(SPEC).value;
const listeners = new Set<Listener>();

export const settingsStore = {
  getSnapshot: (): DeviceSettings => current,

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  update(patch: Partial<DeviceSettings>): void {
    current = SPEC.validate({ ...current, ...patch }) ?? { ...DEFAULT_SETTINGS };
    saveRecord(SPEC, current);
    for (const listener of listeners) listener();
  }
};
