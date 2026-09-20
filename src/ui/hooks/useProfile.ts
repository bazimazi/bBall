import { useMemo, useSyncExternalStore } from 'react';

import { resolveTheme, type ResolvedTheme } from '../../core/cosmetics/theme';
import { profileStore } from '../../core/profile/store';
import type { PlayerProfile } from '../../core/profile/types';
import { levelOf } from '../../core/progression/levels';
import { resolveLoadout, type ResolvedLoadout } from '../../core/talents/effects';

/** The player's saved profile, re-rendering only when it actually changes. */
export function useProfile(): PlayerProfile {
  return useSyncExternalStore(
    profileStore.subscribe,
    profileStore.getSnapshot,
    profileStore.getSnapshot
  );
}

/**
 * The level being demoed, or null when the real save is in play.
 *
 * It rides the same store subscription as the profile, so entering or leaving
 * Demo mode re-renders the chrome exactly like any other profile change.
 */
export function useDemoLevel(): number | null {
  return useSyncExternalStore(
    profileStore.subscribe,
    profileStore.getDemoLevel,
    profileStore.getDemoLevel
  );
}

/** The equipped cosmetics, resolved once per change rather than per frame. */
export function useTheme(profile: PlayerProfile): ResolvedTheme {
  return useMemo(() => resolveTheme(profile.equipped), [profile.equipped]);
}

/**
 * The player's build, resolved into the numbers the engine reads.
 *
 * Resolving is pure and cheap, but it happens once per build change rather
 * than once per frame - the engine is handed the result and never looks a
 * talent up itself.
 */
export function useLoadout(profile: PlayerProfile): ResolvedLoadout {
  const level = levelOf(profile.xp);
  return useMemo(() => resolveLoadout(profile.talents, level), [profile.talents, level]);
}
