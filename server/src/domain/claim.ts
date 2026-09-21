/**
 * Carrying a guest save into an account.
 *
 * This is the one place where the server has to take a number from the client
 * and keep it. A guest has been playing offline; there are no match records
 * to re-derive their XP from, so either their progress is imported on trust
 * or it is thrown away. Throwing it away is the wrong answer - it is the
 * exact moment a player is being asked to make an account, and losing a
 * week's progress for it is a reason never to.
 *
 * So the save is imported, but only as far as its own evidence supports:
 *
 * - The payload goes through the client's own `validateProfile`, which
 *   repairs what it can and rejects what it cannot read.
 * - Lifetime statistics are clamped against each other and against time. A
 *   save claiming ten thousand matches in four minutes of play is trimmed to
 *   what four minutes could hold.
 * - XP is capped at the most the save's own match record could possibly have
 *   paid, computed from the real reward rules rather than a guess.
 * - Talent points, levels and unlocks are never imported at all: they are
 *   re-derived from the XP that survived.
 * - The save id is recorded, so the same guest save cannot be claimed twice.
 *
 * A player who plays honestly keeps everything. A player who edits their
 * localStorage keeps whatever a real player with the same match record would
 * have had, which is the most that can be said without a server-side replay
 * of every rally.
 */

import { ACHIEVEMENTS } from '../../../src/core/achievements/catalog';
import { DEFAULT_UNLOCKS } from '../../../src/core/cosmetics/catalog';
import { CHALLENGES } from '../../../src/core/modes/challenges';
import type { PlayerProfile } from '../../../src/core/profile/types';
import { validateProfile } from '../../../src/core/profile/schema';
import { levelOf } from '../../../src/core/progression/levels';
import { reconcile } from '../../../src/core/talents/save';
import { TOURNAMENT_ROUNDS } from '../../../src/core/tournament/bracket';
import { progressWeight } from './profile';

/** Ceilings used when trimming a claimed save back to something possible. */
export const CLAIM_LIMITS = {
  /**
   * The most a single ranked match can pay.
   *
   * Every line in `computeMatchXp` at once - played, victory, five points,
   * a long rally, shutout and comeback - against a Legend, with the largest
   * multiplier a build can reach. Real matches pay a fraction of it.
   */
  xpPerMatch: 600,
  /** An endless run's ceiling: survival, a long rally and capped returns. */
  xpPerEndlessRun: 500,
  xpPerChallengeClear: 500,
  xpPerCupWon: 800,
  /** Every cup round, win or lose, is worth at most this. */
  xpPerCupPlayed: 250,
  /**
   * XP per second of recorded play.
   *
   * A five-point match is a minute or two of real time; this allows for one
   * every ten seconds, which no human reaches and no cheat can hide behind.
   */
  xpPerSecond: 60,
  /** The fastest a ranked match could conceivably be finished. */
  secondsPerMatch: 8,
  /** Returns a player could make per second of play, generously. */
  hitsPerSecond: 4
} as const;

export interface SanitizedClaim {
  readonly profile: PlayerProfile;
  /** Lines describing anything that had to be trimmed. */
  readonly notes: readonly string[];
  /** XP the save asked for, before any clamping. */
  readonly claimedXp: number;
}

function achievementXpFor(profile: PlayerProfile): number {
  let total = 0;
  for (const achievement of ACHIEVEMENTS) {
    if (profile.achievements[achievement.id] !== undefined) total += achievement.xp;
  }
  return total;
}

/**
 * The most XP this save's own record could have paid.
 *
 * Deliberately generous: the aim is to make a fabricated save worth no more
 * than a real one with the same history, not to shave an honest player.
 */
export function maxSupportableXp(profile: PlayerProfile): number {
  const stats = profile.stats;
  const fromPlay =
    stats.matches * CLAIM_LIMITS.xpPerMatch +
    stats.endlessRuns * CLAIM_LIMITS.xpPerEndlessRun +
    stats.challengesCleared * CLAIM_LIMITS.xpPerChallengeClear +
    stats.cupsWon * CLAIM_LIMITS.xpPerCupWon +
    stats.cupsPlayed * CLAIM_LIMITS.xpPerCupPlayed +
    achievementXpFor(profile);

  const fromTime = stats.playSeconds * CLAIM_LIMITS.xpPerSecond;
  return Math.max(0, Math.min(fromPlay, fromTime));
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(Math.round(value), Math.round(max)));
}

/**
 * Read a client payload into a profile that is internally consistent.
 *
 * Returns null when the payload is not a profile at all - the client's own
 * validator has already repaired everything that could be repaired.
 */
export function sanitizeClaim(payload: unknown): SanitizedClaim | null {
  const parsed = validateProfile(payload);
  if (!parsed) return null;

  const notes: string[] = [];
  const claimedXp = parsed.xp;
  const stats = { ...parsed.stats, winsByBot: { ...parsed.stats.winsByBot } };

  // Time is the anchor: everything else is trimmed against how long the save
  // says it was played for.
  const seconds = clamp(stats.playSeconds, 365 * 24 * 60 * 60);
  if (seconds !== stats.playSeconds) notes.push('Play time was out of range.');
  stats.playSeconds = seconds;

  const maxMatches = Math.floor(seconds / CLAIM_LIMITS.secondsPerMatch) + 1;
  if (stats.matches > maxMatches) {
    notes.push('Match count was trimmed to fit the time played.');
    stats.matches = maxMatches;
  }
  stats.wins = clamp(stats.wins, stats.matches);
  stats.losses = clamp(stats.losses, Math.max(0, stats.matches - stats.wins));
  stats.bestStreak = clamp(stats.bestStreak, stats.wins);
  stats.currentStreak = clamp(stats.currentStreak, stats.bestStreak);
  stats.shutouts = clamp(stats.shutouts, stats.wins);
  stats.comebacks = clamp(stats.comebacks, stats.wins);

  const maxHits = seconds * CLAIM_LIMITS.hitsPerSecond + 1;
  if (stats.rallyHits > maxHits) {
    notes.push('Return count was trimmed to fit the time played.');
    stats.rallyHits = Math.round(maxHits);
  }
  stats.bestRally = clamp(stats.bestRally, stats.rallyHits + 1);
  stats.endlessBest = clamp(stats.endlessBest, stats.bestRally);
  stats.endlessRuns = clamp(stats.endlessRuns, maxMatches);
  stats.challengesCleared = clamp(stats.challengesCleared, CHALLENGES.length);
  stats.cupsPlayed = clamp(stats.cupsPlayed, maxMatches);
  stats.cupsWon = clamp(stats.cupsWon, stats.cupsPlayed);
  stats.bestCupRound = clamp(stats.bestCupRound, TOURNAMENT_ROUNDS.length);

  let botWins = 0;
  for (const [id, wins] of Object.entries(stats.winsByBot)) {
    const capped = clamp(wins ?? 0, stats.wins);
    stats.winsByBot[id as keyof typeof stats.winsByBot] = capped;
    botWins += capped;
  }
  if (botWins > stats.wins) {
    notes.push('Wins per opponent did not add up and were trimmed.');
    let budget = stats.wins;
    for (const id of Object.keys(stats.winsByBot) as (keyof typeof stats.winsByBot)[]) {
      const take = Math.min(stats.winsByBot[id] ?? 0, budget);
      stats.winsByBot[id] = take;
      budget -= take;
    }
  }

  const profile: PlayerProfile = { ...parsed, stats };

  const ceiling = maxSupportableXp(profile);
  if (profile.xp > ceiling) {
    notes.push('XP was capped to what the recorded matches could have paid.');
    profile.xp = ceiling;
  }

  // Talent points, ranks and slots all follow from the level the surviving XP
  // buys. Nothing about the build is imported on trust.
  profile.talents = reconcile(profile.talents, levelOf(profile.xp));

  // Same for cosmetics: the caller re-grants whatever the surviving level and
  // achievements earn, so a hand-edited unlock list buys nothing.
  profile.unlocks = [...DEFAULT_UNLOCKS];

  return { profile, notes, claimedXp };
}

/**
 * Merge a claimed save into an existing cloud profile.
 *
 * Every field takes the better of the two. Nothing is ever subtracted, and
 * nothing the account already had can be lost by claiming - which is the
 * promise that makes "bring my progress over" safe to press.
 */
export function mergeProfiles(cloud: PlayerProfile, local: PlayerProfile): PlayerProfile {
  const best = (a: number, b: number) => Math.max(a, b);
  const localWins = progressWeight(local) > progressWeight(cloud);

  const stats = { ...cloud.stats, winsByBot: { ...cloud.stats.winsByBot } };
  const from = local.stats;
  stats.matches = best(stats.matches, from.matches);
  stats.wins = best(stats.wins, from.wins);
  stats.losses = best(stats.losses, from.losses);
  stats.pointsWon = best(stats.pointsWon, from.pointsWon);
  stats.pointsLost = best(stats.pointsLost, from.pointsLost);
  stats.rallyHits = best(stats.rallyHits, from.rallyHits);
  stats.bestRally = best(stats.bestRally, from.bestRally);
  stats.currentStreak = best(stats.currentStreak, from.currentStreak);
  stats.bestStreak = best(stats.bestStreak, from.bestStreak);
  stats.playSeconds = best(stats.playSeconds, from.playSeconds);
  stats.shutouts = best(stats.shutouts, from.shutouts);
  stats.comebacks = best(stats.comebacks, from.comebacks);
  stats.endlessRuns = best(stats.endlessRuns, from.endlessRuns);
  stats.endlessBest = best(stats.endlessBest, from.endlessBest);
  stats.challengesCleared = best(stats.challengesCleared, from.challengesCleared);
  stats.cupsPlayed = best(stats.cupsPlayed, from.cupsPlayed);
  stats.cupsWon = best(stats.cupsWon, from.cupsWon);
  stats.bestCupRound = best(stats.bestCupRound, from.bestCupRound);
  stats.bestCupTier = Math.max(stats.bestCupTier, from.bestCupTier);
  for (const [id, wins] of Object.entries(from.winsByBot)) {
    const key = id as keyof typeof stats.winsByBot;
    stats.winsByBot[key] = best(stats.winsByBot[key] ?? 0, wins ?? 0);
  }

  const achievements = { ...cloud.achievements };
  for (const [id, at] of Object.entries(local.achievements)) {
    // Keep the earlier unlock date: it is the true one.
    achievements[id] = Math.min(achievements[id] ?? at, at);
  }

  const challenges = { ...cloud.challenges };
  for (const [id, record] of Object.entries(local.challenges)) {
    const existing = challenges[id];
    challenges[id] = existing
      ? {
          attempts: best(existing.attempts, record.attempts),
          cleared: existing.cleared || record.cleared,
          bestRally: best(existing.bestRally, record.bestRally),
          clearedAt:
            existing.clearedAt && record.clearedAt
              ? Math.min(existing.clearedAt, record.clearedAt)
              : existing.clearedAt || record.clearedAt
        }
      : record;
  }

  const talentStats = { ...cloud.talents.stats };
  for (const key of Object.keys(talentStats) as (keyof typeof talentStats)[]) {
    talentStats[key] = best(talentStats[key], local.talents.stats[key]);
  }

  const xp = best(cloud.xp, local.xp);
  const merged: PlayerProfile = {
    ...cloud,
    xp,
    stats,
    achievements,
    challenges,
    // Unlocks are not merged, they are re-earned: the caller runs syncUnlocks
    // over the merged profile, so a cosmetic arrives because the merged level
    // or achievement list qualifies for it, never because a payload said so.
    unlocks: [...new Set([...cloud.unlocks, ...DEFAULT_UNLOCKS])],
    // A build is a set of choices, not a pile of resources, so one of the two
    // is kept whole rather than the ranks being combined into something the
    // player never picked. The save with more behind it wins.
    talents: reconcile(
      { ...(localWins ? local.talents : cloud.talents), stats: talentStats },
      levelOf(xp)
    ),
    // A cup in progress cannot be merged; the cloud's live run wins, and the
    // local one is kept as history rather than dropped.
    tournament: cloud.tournament ?? (localWins ? local.tournament : null),
    lastTournament: cloud.lastTournament ?? local.lastTournament
  };

  return merged;
}
