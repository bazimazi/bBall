import { EQUIP_SLOTS, type Equipped } from '../cosmetics/catalog';
import { syncUnlocks } from '../progression/apply';
import { LEVEL_CEILING, xpToReach } from '../progression/levels';
import { createTalentSave, reconcile } from '../talents/save';
import { createProfile, createStats } from './defaults';
import type { PlayerProfile } from './types';

/**
 * The throwaway profile behind Demo mode.
 *
 * A demo profile is an ordinary {@link PlayerProfile} parked at a chosen
 * level: the rest of the game reads level from `xp` and nothing else, so
 * every talent gate, tournament tier and cosmetic unlock lands where it
 * would for a real player who had got that far. The store never persists it,
 * which is what makes the whole mode free of consequences.
 */

/**
 * The highest level the demo picker offers.
 *
 * Levelling is uncapped, but a demo is for seeing the game at a level rather
 * than for exploring the far end of the curve, and a typed number needs some
 * limit. Everything a level buys has long since capped out here.
 */
export const DEMO_LEVEL_MAX = 999;

export function clampDemoLevel(level: number): number {
  const wanted = Math.round(level);
  if (!Number.isFinite(wanted)) return 1;
  return Math.max(1, Math.min(DEMO_LEVEL_MAX, Math.min(LEVEL_CEILING, wanted)));
}

/**
 * Build a demo profile sitting exactly at `level`.
 *
 * Identity and look are borrowed from the real save so the demo still feels
 * like the player's game; history - matches, achievements, cups, challenges -
 * starts empty, because a demo is a fresh look at a level rather than a
 * fabricated career.
 */
export function createDemoProfile(level: number, source: PlayerProfile): PlayerProfile {
  const wanted = clampDemoLevel(level);

  const profile: PlayerProfile = {
    ...createProfile(),
    id: `demo_${wanted}`,
    name: source.name,
    avatar: source.avatar,
    onboarded: true,
    xp: xpToReach(wanted),
    stats: createStats(),
    talents: reconcile(createTalentSave(), wanted)
  };

  // Level-gated cosmetics this level has earned. Achievement-gated ones stay
  // locked: the demo shows the level, not a full completion save.
  syncUnlocks(profile);

  // Keep the player's own kit wherever the demo level already owns it.
  const equipped: Equipped = { ...profile.equipped };
  for (const slot of EQUIP_SLOTS) {
    const id = source.equipped[slot];
    if (profile.unlocks.includes(id)) equipped[slot] = id;
  }
  profile.equipped = equipped;

  return profile;
}
