import { challengeById } from '../modes/challenges';
import type { MatchResult } from '../modes/types';
import { botProfile } from '../bots/levels';
import {
  createTournament,
  opponentFor,
  tierById,
  roundsFor,
  type TournamentFormat
} from '../tournament/bracket';

export interface XpLine {
  readonly label: string;
  readonly xp: number;
}

export interface XpAward {
  readonly lines: readonly XpLine[];
  /**
   * One-off rewards on top of the match itself - Journey stars, a daily
   * clear, a finished quest. Already in {@link total}, and never multiplied
   * by difficulty or halved by the daily damper.
   */
  readonly extras: readonly XpLine[];
  /** Difficulty multiplier, already applied to {@link total}. */
  readonly multiplier: number;
  /** The build's own multiplier - Experience Boost and Combo Drive. */
  readonly talentMultiplier: number;
  readonly total: number;
  /** True when the daily anti-farm damper reduced the award. */
  readonly damped: boolean;
}

export interface XpContext {
  /** Ranked matches already finished today, before this one. */
  readonly matchesToday: number;
  /** True the first time a given challenge objective is met. */
  readonly firstChallengeClear: boolean;
  /**
   * The build's XP multiplier, already capped by
   * `BALANCE.rewards.maxXpMul`. Always 1 today: no talent pays XP, so the
   * hook is kept only for the wire format and a future source of it.
   */
  readonly talentXpMul: number;
}

/** Ranked matches per day before awards are halved. */
export const DAILY_SOFT_CAP = 25;

export const EMPTY_AWARD: XpAward = {
  lines: [],
  extras: [],
  multiplier: 1,
  talentMultiplier: 1,
  total: 0,
  damped: false
};

function rallyBonus(bestRally: number): number {
  // Generous up to a point, then flat - a single endless rally should not
  // out-earn an afternoon of matches.
  return Math.min(90, Math.round(bestRally * 1.8));
}

/** The fewest returns of the player's own a lost match needs to pay more than taking part. */
export const MIN_ENGAGED_RETURNS = 3;
/** What a match pays when the player barely played it. Never multiplied by difficulty. */
export const PARTICIPATION_XP = 10;

/**
 * Did the player actually play this match? A won match always counts. A lost
 * one needs the player's own returns - a rally counts the opponent's too, so
 * it proves nothing - at least {@link MIN_ENGAGED_RETURNS} and about one per
 * point played. An idle paddle still meets the odd ball, but nowhere near
 * that often.
 */
export function engaged(result: MatchResult): boolean {
  if (result.won) return true;
  const points = result.mode === 'endless' ? 0 : result.scoreYou + result.scoreBot;
  return result.hits >= Math.max(MIN_ENGAGED_RETURNS, points);
}

/**
 * Work out what a finished match is worth.
 *
 * Nothing is awarded for practice, for a quit, or for a match the player
 * never touched the ball in, and a loss the player barely took part in pays
 * only a small flat amount - otherwise standing still against the hardest
 * opponent would out-earn winning against an easier one.
 */
export function computeMatchXp(result: MatchResult, context: XpContext): XpAward {
  if (!result.ranked || result.abandoned) return EMPTY_AWARD;
  if (result.hits === 0 && result.bestRally === 0) return EMPTY_AWARD;

  const lines: XpLine[] = [];
  const add = (label: string, xp: number) => {
    if (xp > 0) lines.push({ label, xp: Math.round(xp) });
  };

  if (!engaged(result)) {
    add('Match played', PARTICIPATION_XP);
    const damped = context.matchesToday >= DAILY_SOFT_CAP;
    return {
      lines,
      extras: [],
      multiplier: 1,
      talentMultiplier: 1,
      total: Math.round(PARTICIPATION_XP * (damped ? 0.5 : 1)),
      damped
    };
  }

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
    const finalRound =
      (result.tournamentRound ?? 0) ===
      roundsFor(result.tournamentFormat ? { format: result.tournamentFormat } : {}).length - 1;
    if (result.won && finalRound) {
      add('Champion', tierById(result.tournamentTier ?? 0).trophyXp);
    }
  }

  const multiplier = result.mode === 'endless' ? 1 : result.botRank ? botMultiplier(result) : 1;
  const talentMultiplier = Math.max(1, context.talentXpMul);
  const raw = lines.reduce((sum, line) => sum + line.xp, 0) * multiplier * talentMultiplier;
  const damped = context.matchesToday >= DAILY_SOFT_CAP;
  const total = Math.max(0, Math.round(raw * (damped ? 0.5 : 1)));

  return { lines, extras: [], multiplier, talentMultiplier, total, damped };
}

/** Rank 1..6 maps onto the same factors the bot catalogue advertises. */
const BOT_FACTORS = [0.7, 1.5, 2.5, 3.5, 5, 6.5] as const;

function rankFactor(rank: number): number {
  return BOT_FACTORS[Math.min(BOT_FACTORS.length, Math.max(1, rank)) - 1]!;
}

function botMultiplier(result: MatchResult): number {
  return rankFactor(result.botRank);
}

/**
 * The XP lifting a cup's trophy pays: its trophy bonus, multiplied - like the
 * rest of the final - by the finalist's difficulty factor. This is the figure
 * a cup list should show; the daily damper can still halve it on a long day.
 */
export function trophyAward(tier: number, format?: TournamentFormat): number {
  const save = createTournament(tier, 0, format);
  const finalist = opponentFor(save, roundsFor(save).length - 1);
  return Math.round(tierById(tier).trophyXp * rankFactor(botProfile(finalist).rank));
}

/** Today's date as a stable `YYYY-MM-DD` key in the player's own timezone. */
export function dayKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
