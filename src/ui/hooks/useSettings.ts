import { useSyncExternalStore } from 'react';

import { settingsStore, type DeviceSettings } from '../../core/settings/store';

/** This device's own settings, re-rendering when one of them changes. */
export function useSettings(): DeviceSettings {
  return useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getSnapshot,
    settingsStore.getSnapshot
  );
}
