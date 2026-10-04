import { useSyncExternalStore } from 'react';
import { localSaveStatus, type LocalSaveState } from '../../core/storage/localStore';

/** Device persistence and protection of data that could not be read at startup. */
export function useLocalSave(): LocalSaveState {
  return useSyncExternalStore(
    localSaveStatus.subscribe,
    localSaveStatus.getSnapshot,
    localSaveStatus.getSnapshot
  );
}
