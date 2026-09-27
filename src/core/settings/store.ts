/**
 * Settings that belong to this device rather than to the player.
 *
 * Which thumb reaches for the skill buttons depends on the hand holding this
 * phone, not on the account, so these live in localStorage beside the save
 * and are never synced. Framework-free like the profile store; the UI reads
 * them through `useSyncExternalStore`.
 */

import { loadRecord, saveRecord, type StoreSpec } from '../storage/localStore';

export type SkillSide = 'left' | 'right';

export interface DeviceSettings {
  /** The screen edge the in-game skill buttons sit on. */
  skillSide: SkillSide;
}

const DEFAULTS: DeviceSettings = { skillSide: 'left' };

const SPEC: StoreSpec<DeviceSettings> = {
  key: 'bball.settings',
  version: 1,
  create: () => ({ ...DEFAULTS }),
  migrate: (data) => data,
  validate(data) {
    if (typeof data !== 'object' || data === null) return null;
    const source = data as Partial<DeviceSettings>;
    return {
      skillSide: source.skillSide === 'right' ? 'right' : DEFAULTS.skillSide
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
