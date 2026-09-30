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

export type SkillSide = 'left' | 'right';

/** How hard the camera moves: the full shake, a gentle one, or none at all. */
export type ShakeLevel = 'full' | 'gentle' | 'off';

export interface DeviceSettings {
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
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  skillSide: 'left',
  musicVolume: 0.8,
  sfxVolume: 1,
  shake: 'full',
  haptics: true,
  replays: true
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
      skillSide: source.skillSide === 'right' ? 'right' : DEFAULT_SETTINGS.skillSide,
      musicVolume: unit(source.musicVolume, DEFAULT_SETTINGS.musicVolume),
      sfxVolume: unit(source.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
      shake:
        source.shake === 'gentle' || source.shake === 'off' ? source.shake : DEFAULT_SETTINGS.shake,
      haptics: typeof source.haptics === 'boolean' ? source.haptics : DEFAULT_SETTINGS.haptics,
      replays: typeof source.replays === 'boolean' ? source.replays : DEFAULT_SETTINGS.replays
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
    current = { ...current, ...patch };
    saveRecord(SPEC, current);
    for (const listener of listeners) listener();
  }
};
