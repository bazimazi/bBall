import { useMemo, useSyncExternalStore } from 'react';

import { resolveTheme, type ResolvedTheme } from '../../core/cosmetics/theme';
import { profileStore } from '../../core/profile/store';
import type { PlayerProfile } from '../../core/profile/types';

/** The player's saved profile, re-rendering only when it actually changes. */
export function useProfile(): PlayerProfile {
  return useSyncExternalStore(
    profileStore.subscribe,
    profileStore.getSnapshot,
    profileStore.getSnapshot
  );
}

/** The equipped cosmetics, resolved once per change rather than per frame. */
export function useTheme(profile: PlayerProfile): ResolvedTheme {
  return useMemo(() => resolveTheme(profile.equipped), [profile.equipped]);
}
