import { componentById } from '../../../src/core/equipment/catalog';
import { WORKSHOP_CONTRACTS, workshopOf } from '../../../src/core/equipment/workshop';
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
import {
  STAGES,
  stageOpen,
  stageById,
  totalStars,
  type JourneyProgress
} from '../../../src/core/campaign/journey';
import { cloneProgress, type ProgressState } from '../../../src/core/profile/progress';
import { DEFAULT_UNLOCKS } from '../../../src/core/cosmetics/catalog';
import { CHALLENGES } from '../../../src/core/modes/challenges';
import type { PlayerProfile } from '../../../src/core/profile/types';
import { validateProfile } from '../../../src/core/profile/schema';
import { levelOf } from '../../../src/core/progression/levels';
import { reconcile } from '../../../src/core/talents/save';

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
  xpPerMatch: 1700,
  /** An endless run's ceiling: survival, a long rally and capped returns. */
  xpPerEndlessRun: 500,
  xpPerChallengeClear: 500,
  xpPerCupWon: 2300,
  /** Every cup round, win or lose, is worth at most this. */
  xpPerCupPlayed: 250,
  /**
   * XP per second of recorded play.
   *
   * A five-point match is a minute or two of real time; this allows for one
   * every ten seconds, which no human reaches and no cheat can hide behind.
   */
  xpPerSecond: 170,
  /** The fastest a ranked match could conceivably be finished. */
  secondsPerMatch: 8,
  /** Returns a player could make per second of play, generously. */
  hitsPerSecond: 4,
  /** The most a Journey star can pay: the last world's rate. */
  xpPerStar: 110,
  /** A daily clear with a full streak and both goals. */
  xpPerDailyClear: 300,
  /** A day of quests, all three and the bonus. */
  xpPerQuestDay: 410,
  /** A Gauntlet clear at the top Pressure, plus a boss's worth per match. */
  xpPerRunClear: 1200,
  xpPerRunPlayed: 810
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

  const progress = profile.progress;
  const fromModes =
    totalStars(progress.journey) * CLAIM_LIMITS.xpPerStar +
    progress.daily.clears * CLAIM_LIMITS.xpPerDailyClear +
    (progress.daily.clears + progress.questSweeps) * CLAIM_LIMITS.xpPerQuestDay +
    progress.runRecords.clears * CLAIM_LIMITS.xpPerRunClear +
    progress.runRecords.runs * CLAIM_LIMITS.xpPerRunPlayed;

  const fromTime = stats.playSeconds * CLAIM_LIMITS.xpPerSecond;
  return Math.max(0, Math.min(fromPlay + fromModes, fromTime));
}

/**
 * Trim a claimed save's newer-mode progress to what its own record supports.
 *
 * Journey stars are walked in order, so a stage only survives if the stages
 * before it did; a streak cannot outrun its clears, nor clears the matches
 * played. A run in progress is never imported - it cannot be checked, and
 * starting a fresh one costs nothing.
 */
function sanitizeProgress(
  source: ProgressState,
  matches: number,
  wins: number,
  hits: number
): ProgressState {
  const progress = cloneProgress(source);
  const journey: JourneyProgress = {};
  let played = 0;
  for (const stage of STAGES) {
    const mask = progress.journey[stage.id] ?? 0;
    if (mask === 0 || played >= matches) continue;
    if (!stageOpen(journey, stage)) continue;
    journey[stage.id] = mask;
    played += 1;
  }
  const sectors = clamp(
    progress.journey['frontier-v2'] ?? 0,
    Math.floor(Math.max(0, wins - played) / 20)
  );
  if (sectors > 0 && journey['w5-6']) journey['frontier-v2'] = sectors;
  for (const [id, mask] of Object.entries(progress.journey)) {
    if (id.startsWith('veteran-') || id.startsWith('ascendant-')) {
      const stage = stageById(id);
      if (stage && played < matches && stageOpen(journey, stage)) {
        journey[id] = mask;
        played++;
      }
    }
  }
  // At most the in-progress sector is kept beside the compact completion marker.
  const frontier = sectors + 1;
  for (let i = 1; i <= 20 && played < matches; i++) {
    const id = `f2-${frontier}-${i}`,
      stage = stageById(id),
      mask = progress.journey[id] ?? 0;
    if (stage && mask && stageOpen(journey, stage)) {
      journey[id] = mask;
      played++;
    }
  }
  progress.journey = journey;
  for (const record of Object.values(progress.endlessRecords)) {
    record.rally = clamp(record.rally, hits * 2 + 1);
    record.waves = clamp(record.waves, Math.floor(hits / 12));
  }
  progress.contracts = clamp(progress.contracts ?? 0, wins);
  const workshop = progress.workshop;
  workshop.attempts = {};
  for (const c of WORKSHOP_CONTRACTS) {
    const cap =
      c.id === 'route'
        ? wins
        : c.id === 'school'
          ? matches
          : Math.min(hits, matches * (c.id === 'centre' ? 8 : c.id === 'absorb' ? 4 : 6));
    workshop.contracts[c.id] = clamp(workshop.contracts[c.id] ?? 0, cap);
  }
  const earnedContracts = WORKSHOP_CONTRACTS.reduce(
    (n, c) => n + ((workshop.contracts[c.id] ?? 0) >= c.target ? c.reward : 0),
    0
  );
  const budget = (workshop.introduced ? 12 : 0) + matches * 4 + earnedContracts;
  let spent = 0;
  workshop.owned = workshop.owned.filter((id) => {
    const part = componentById(id);
    if (!part) return false;
    if (part.cost === 0) return true;
    if (spent + part.cost > budget) return false;
    spent += part.cost;
    return true;
  });
  workshop.marks = clamp(workshop.marks, Math.max(0, budget - spent));
  // Fixed Daily cards can teach a surface the guest has never crafted.
  workshop.surfaces = workshop.surfaces.slice(0, matches);
  workshop.signatures = clamp(workshop.signatures, wins);
  for (const record of Object.values(workshop.endless)) {
    record.rally = clamp(record.rally, hits * 2 + 1);
    record.waves = clamp(record.waves, Math.floor(hits / 12));
  }
  progress.workshop = workshopOf(workshop);
  for (const id of Object.keys(progress.mastery))
    progress.mastery[id] = clamp(progress.mastery[id]!, wins * 8);
  const master = progress.dailyMaster;
  master.clears = clamp(master.clears, matches);
  master.bestStreak = clamp(master.bestStreak, master.clears);
  master.streak = clamp(master.streak, master.bestStreak);

  const daily = progress.daily;
  daily.clears = clamp(daily.clears, matches);
  daily.bestStreak = clamp(daily.bestStreak, daily.clears);
  daily.streak = clamp(daily.streak, daily.bestStreak);
  progress.questSweeps = clamp(progress.questSweeps, Math.floor(matches / 3));

  const records = progress.runRecords;
  records.runs = clamp(records.runs, matches);
  records.clears = clamp(records.clears, Math.floor(wins / 6));
  if (records.clears === 0) records.bestPressure = -1;
  progress.run = null;

  for (const [id, count] of Object.entries(progress.bosses))
    progress.bosses[id] = clamp(count, wins);
  progress.flicks = clamp(progress.flicks, hits);
  return progress;
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
  stats.bestCupRound = clamp(stats.bestCupRound, 7);

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

  const profile: PlayerProfile = {
    ...parsed,
    stats,
    progress: sanitizeProgress(parsed.progress, stats.matches, stats.wins, stats.rallyHits)
  };

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
    lastTournament: cloud.lastTournament ?? local.lastTournament,
    progress: mergeProgress(cloud.progress, local.progress)
  };

  return merged;
}

/** The better of two newer-mode records, field by field. Nothing is ever lost. */
function mergeProgress(cloud: ProgressState, local: ProgressState): ProgressState {
  const merged = cloneProgress(cloud);
  const cloudWorkshop = merged.workshop;
  const localWorkshop = local.workshop;
  if (
    !cloudWorkshop.introduced &&
    cloudWorkshop.marks === 0 &&
    cloudWorkshop.owned.every((id) => componentById(id)?.cost === 0) &&
    Object.values(cloudWorkshop.contracts).every((n) => n === 0) &&
    !Object.keys(cloudWorkshop.endless).length
  ) {
    merged.workshop = workshopOf(localWorkshop);
    merged.workshop.attempts = {};
  } else {
    for (const c of WORKSHOP_CONTRACTS)
      cloudWorkshop.contracts[c.id] = Math.max(
        cloudWorkshop.contracts[c.id] ?? 0,
        localWorkshop.contracts[c.id] ?? 0
      );
    cloudWorkshop.surfaces = [...new Set([...cloudWorkshop.surfaces, ...localWorkshop.surfaces])];
    cloudWorkshop.signatures = Math.max(cloudWorkshop.signatures, localWorkshop.signatures);
  }
  for (const [key, record] of Object.entries(localWorkshop.endless)) {
    const before = merged.workshop.endless[key];
    if (
      !before ||
      record.waves > before.waves ||
      (record.waves === before.waves && record.rally > before.rally)
    )
      merged.workshop.endless[key] = { ...record, kit: { ...record.kit } };
  }
  for (const [id, mask] of Object.entries(local.journey)) {
    merged.journey[id] =
      id === 'frontier-v2'
        ? Math.max(merged.journey[id] ?? 0, mask)
        : (merged.journey[id] ?? 0) | mask;
  }
  // The streak belongs to whichever save cleared a daily most recently.
  const later = local.daily.lastClear > cloud.daily.lastClear ? local.daily : cloud.daily;
  merged.daily = {
    ...later,
    clears: Math.max(cloud.daily.clears, local.daily.clears),
    bestStreak: Math.max(cloud.daily.bestStreak, local.daily.bestStreak)
  };
  const master =
    local.dailyMaster.lastClear > cloud.dailyMaster.lastClear
      ? local.dailyMaster
      : cloud.dailyMaster;
  merged.dailyMaster = {
    ...master,
    clears: Math.max(cloud.dailyMaster.clears, local.dailyMaster.clears),
    bestStreak: Math.max(cloud.dailyMaster.bestStreak, local.dailyMaster.bestStreak)
  };
  for (const [key, record] of Object.entries(local.endlessRecords ?? {})) {
    const old = merged.endlessRecords[key] ?? { rally: 0, waves: 0 };
    merged.endlessRecords[key] = {
      rally: Math.max(old.rally, record.rally),
      waves: Math.max(old.waves, record.waves)
    };
  }
  merged.contracts = Math.max(cloud.contracts, local.contracts);
  for (const [id, n] of Object.entries(local.mastery ?? {}))
    merged.mastery[id] = Math.max(merged.mastery[id] ?? 0, n);
  for (const id of Object.keys(merged.journey))
    if (id.startsWith('f2-') && Number(id.split('-')[1]) <= (merged.journey['frontier-v2'] ?? 0))
      delete merged.journey[id];
  merged.quests = cloud.quests ?? local.quests;
  merged.questSweeps = Math.max(cloud.questSweeps, local.questSweeps);
  merged.lastRun = cloud.lastRun ?? local.lastRun;
  merged.runRecords = {
    runs: Math.max(cloud.runRecords.runs, local.runRecords.runs),
    clears: Math.max(cloud.runRecords.clears, local.runRecords.clears),
    bestStage: Math.max(cloud.runRecords.bestStage, local.runRecords.bestStage),
    bestPressure: Math.max(cloud.runRecords.bestPressure, local.runRecords.bestPressure)
  };
  for (const [id, wins] of Object.entries(local.bosses)) {
    merged.bosses[id] = Math.max(merged.bosses[id] ?? 0, wins);
  }
  merged.flicks = Math.max(cloud.flicks, local.flicks);
  return merged;
}
