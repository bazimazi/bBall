/**
 * The XP curve.
 *
 * Early levels arrive in a match or two so a new player sees progress on
 * their first session; later ones stretch out without ever needing a grind,
 * because the biggest XP sources (challenges, cups, long rallies) are things
 * a player wants to do anyway.
 *
 * There is no level cap: the curve simply keeps going, so a player who wants
 * to keep climbing always can. What *is* capped is what a level buys - talent
 * points stop at `BALANCE.talents.pointsUntilLevel` and paddle speed at
 * `BALANCE.paddle.max` - so levels past that point are a record of play
 * rather than a power gap.
 */

/**
 * A loop guard, not a design cap.
 *
 * Every threshold is computed on demand, so a nonsense XP value (or a demo
 * level typed with too many digits) must not be allowed to walk the curve
 * forever. No reachable amount of play comes near it.
 */
export const LEVEL_CEILING = 10_000;

/** XP needed to go from `level` to `level + 1`. */
function stepFor(level: number): number {
  return Math.round(80 + 45 * Math.pow(level, 1.15));
}

/** CUMULATIVE[i] is the total XP needed to reach level `i + 1`. Grown lazily. */
const CUMULATIVE: number[] = [0];

/** Total XP needed to reach `level`, extending the table as far as it takes. */
function totalFor(level: number): number {
  const wanted = Math.min(LEVEL_CEILING, level);
  while (CUMULATIVE.length < wanted) {
    const reached = CUMULATIVE.length;
    CUMULATIVE.push(CUMULATIVE[reached - 1]! + stepFor(reached));
  }
  return CUMULATIVE[wanted - 1]!;
}

export interface LevelInfo {
  readonly level: number;
  /** XP earned since this level started. */
  readonly into: number;
  /** XP this level costs in total. */
  readonly span: number;
  /** 0..1 progress through the current level. */
  readonly progress: number;
}

export function xpToReach(level: number): number {
  const wanted = Math.round(level);
  if (!Number.isFinite(wanted)) return 0;
  return totalFor(Math.max(1, wanted));
}

export function levelFromXp(xp: number): LevelInfo {
  const total = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;

  let level = 1;
  while (level < LEVEL_CEILING && total >= totalFor(level + 1)) level++;

  const floor = totalFor(level);
  const span = totalFor(level + 1) - floor;
  const into = total - floor;
  return { level, into, span, progress: span > 0 ? Math.min(1, into / span) : 1 };
}

export function levelOf(xp: number): number {
  return levelFromXp(xp).level;
}
