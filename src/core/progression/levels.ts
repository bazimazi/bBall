/**
 * The XP curve.
 *
 * Early levels arrive in a match or two so a new player sees progress on
 * their first session; later ones stretch out without ever needing a grind,
 * because the biggest XP sources (challenges, cups, long rallies) are things
 * a player wants to do anyway.
 */

export const MAX_LEVEL = 30;

/** XP needed to go from `level` to `level + 1`. */
function stepFor(level: number): number {
  return Math.round(80 + 45 * Math.pow(level, 1.15));
}

/** CUMULATIVE[i] is the total XP needed to reach level `i + 1`. */
const CUMULATIVE: readonly number[] = (() => {
  const totals = [0];
  for (let level = 1; level < MAX_LEVEL; level++) {
    totals.push(totals[level - 1]! + stepFor(level));
  }
  return totals;
})();

export interface LevelInfo {
  readonly level: number;
  /** XP earned since this level started. */
  readonly into: number;
  /** XP this level costs in total. 0 at the level cap. */
  readonly span: number;
  /** 0..1 progress through the current level. 1 at the cap. */
  readonly progress: number;
  readonly maxed: boolean;
}

export function xpToReach(level: number): number {
  const index = Math.max(1, Math.min(MAX_LEVEL, Math.round(level))) - 1;
  return CUMULATIVE[index]!;
}

export function levelFromXp(xp: number): LevelInfo {
  const total = Math.max(0, Math.floor(xp) || 0);
  let level = 1;
  while (level < MAX_LEVEL && total >= CUMULATIVE[level]!) level++;

  if (level >= MAX_LEVEL) {
    return { level: MAX_LEVEL, into: 0, span: 0, progress: 1, maxed: true };
  }

  const floor = CUMULATIVE[level - 1]!;
  const span = CUMULATIVE[level]! - floor;
  const into = total - floor;
  return { level, into, span, progress: span > 0 ? into / span : 1, maxed: false };
}

export function levelOf(xp: number): number {
  return levelFromXp(xp).level;
}
