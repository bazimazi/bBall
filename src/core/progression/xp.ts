import { challengeById } from '../modes/challenges';
import type { MatchResult } from '../modes/types';
import { tierById } from '../tournament/bracket';

export interface XpLine {
  readonly label: string;
  readonly xp: number;
}

export interface XpAward {
  readonly lines: readonly XpLine[];
  /** Difficulty multiplier, already applied to {@link total}. */
  readonly multiplier: number;
  readonly total: number;
  /** True when the daily anti-farm damper reduced the award. */
  readonly damped: boolean;
}

export interface XpContext {
  /** Ranked matches already finished today, before this one. */
  readonly matchesToday: number;
  /** True the first time a given challenge objective is met. */
  readonly firstChallengeClear: boolean;
}

/** Ranked matches per day before awards are halved. */
export const DAILY_SOFT_CAP = 25;

const EMPTY: XpAward = { lines: [], multiplier: 1, total: 0, damped: false };

function rallyBonus(bestRally: number): number {
  // Generous up to a point, then flat - a single endless rally should not
  // out-earn an afternoon of matches.
  return Math.min(90, Math.round(bestRally * 1.8));
}

/**
 * Work out what a finished match is worth.
 *
 * Nothing is awarded for practice, for a quit, or for a match the player
 * never touched the ball in, which removes the obvious ways to farm.
 */
export function computeMatchXp(result: MatchResult, context: XpContext): XpAward {
  if (!result.ranked || result.abandoned) return EMPTY;
  if (result.hits === 0 && result.bestRally === 0) return EMPTY;

  const lines: XpLine[] = [];
  const add = (label: string, xp: number) => {
    if (xp > 0) lines.push({ label, xp: Math.round(xp) });
  };

  if (result.mode === 'endless') {
    add('Run survived', 20);
    add('Longest rally', Math.min(220, result.bestRally * 4));
    add('Returns', Math.min(120, result.hits));
  } else {
    add('Match played', 20);
    if (result.won) add('Victory', 55);
    add('Points won', result.scoreYou * 8);
    add('Best rally', rallyBonus(result.bestRally));
    if (result.won && result.shutout) add('Shutout', 30);
    if (result.won && result.comeback) add('Comeback', 25);
  }

  if (result.mode === 'challenge' && result.objectiveMet) {
    const challenge = result.challengeId ? challengeById(result.challengeId) : undefined;
    const base = challenge?.xp ?? 120;
    add('Challenge complete', base);
    if (context.firstChallengeClear) add('First clear', base);
  }

  if (result.mode === 'tournament') {
    if (result.won) add('Round won', 60);
    const finalRound = (result.tournamentRound ?? 0) >= 2;
    if (result.won && finalRound) {
      add('Champion', tierById(result.tournamentTier ?? 0).trophyXp);
    }
  }

  const multiplier = result.mode === 'endless' ? 1 : result.botRank ? botMultiplier(result) : 1;
  const raw = lines.reduce((sum, line) => sum + line.xp, 0) * multiplier;
  const damped = context.matchesToday >= DAILY_SOFT_CAP;
  const total = Math.max(0, Math.round(raw * (damped ? 0.5 : 1)));

  return { lines, multiplier, total, damped };
}

function botMultiplier(result: MatchResult): number {
  // Rank 1..5 maps onto the same factors the bot catalogue advertises.
  const factors = [0.7, 0.9, 1.15, 1.4, 1.75];
  return factors[Math.min(factors.length, Math.max(1, result.botRank)) - 1]!;
}

/** Today's date as a stable `YYYY-MM-DD` key in the player's own timezone. */
export function dayKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
