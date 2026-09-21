import { useSyncExternalStore } from 'react';

import { accountStore, type AccountState } from '../../core/account/store';

/**
 * The account and sync state, on the same subscription model as the profile.
 *
 * Nothing in the game *waits* on this - it is chrome. A component reads it to
 * draw a badge or a screen; the simulation never sees it.
 */
export function useAccount(): AccountState {
  return useSyncExternalStore(
    accountStore.subscribe,
    accountStore.getSnapshot,
    accountStore.getSnapshot
  );
}
