import { ACHIEVEMENTS, type Achievement } from '../achievements/catalog';
import { BALANCE } from '../balance/config';
import { COSMETICS, isUnlocked, type Cosmetic } from '../cosmetics/catalog';
import type { MatchResult } from '../modes/types';
import { createStats } from '../profile/defaults';
import type { PlayerProfile } from '../profile/types';
import { resolveLoadout } from '../talents/effects';
import { cloneTalentSave, reconcile } from '../talents/save';
import { advanceTournament, TOURNAMENT_ROUNDS, type TournamentSave } from '../tournament/bracket';
import { levelFromXp, levelOf } from './levels';
import { computeMatchXp, dayKey, EMPTY_AWARD, type XpAward } from './xp';

export interface ProgressSummary {
  readonly profile: PlayerProfile;
  readonly award: XpAward;
  readonly xpBefore: number;
  readonly xpAfter: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly levelsGained: number;
  readonly achievements: readonly Achievement[];
  readonly unlocks: readonly Cosmetic[];
  readonly newBestRally: boolean;
  readonly challengeCleared: boolean;
  readonly tournament: TournamentSave | null;
  readonly cupWon: boolean;
  /** Talent points granted by the levels gained in this match. */
  readonly talentPoints: number;
  /** Unspent points afterwards, so the result card can nudge the player. */
  readonly talentPointsAvailable: number;
}

function cloneProfile(profile: PlayerProfile): PlayerProfile {
  return {
    ...profile,
    stats: { ...createStats(), ...profile.stats, winsByBot: { ...profile.stats.winsByBot } },
    talents: cloneTalentSave(profile.talents),
    achievements: { ...profile.achievements },
    unlocks: [...profile.unlocks],
    equipped: { ...profile.equipped },
    challenges: { ...profile.challenges },
    tournament: profile.tournament
      ? { ...profile.tournament, results: [...profile.tournament.results] }
      : null,
    lastTournament: profile.lastTournament
      ? { ...profile.lastTournament, results: [...profile.lastTournament.results] }
      : null,
    daily: { ...profile.daily },
    preferences: { ...profile.preferences }
  };
}

/**
 * Grant every cosmetic the player now qualifies for. Safe to run at any time -
 * it only ever adds, so an unlock can never be taken back by a later catalogue
 * change.
 */
export function syncUnlocks(profile: PlayerProfile): Cosmetic[] {
  const level = levelOf(profile.xp);
  const owned = new Set(profile.unlocks);
  const earned = new Set(Object.keys(profile.achievements));
  const added: Cosmetic[] = [];

  for (const cosmetic of COSMETICS) {
    if (owned.has(cosmetic.id)) continue;
    if (!isUnlocked(cosmetic, level, earned)) continue;
    owned.add(cosmetic.id);
    added.push(cosmetic);
  }
  if (added.length > 0) profile.unlocks = [...owned];
  return added;
}

/** Unlock everything the player has just qualified for, XP bonuses included. */
function grantAchievements(profile: PlayerProfile, result: MatchResult | null): Achievement[] {
  const unlocked: Achievement[] = [];
  const now = Date.now();

  // Two passes: an achievement's XP bonus can push the player over a level
  // boundary, which can in turn unlock a level achievement.
  for (let pass = 0; pass < 2; pass++) {
    const context = { profile, level: levelOf(profile.xp), result };
    let changed = false;
    for (const achievement of ACHIEVEMENTS) {
      if (profile.achievements[achievement.id] !== undefined) continue;
      if (!achievement.check(context)) continue;
      profile.achievements[achievement.id] = now;
      profile.xp += achievement.xp;
      unlocked.push(achievement);
      changed = true;
    }
    if (!changed) break;
  }
  return unlocked;
}

function rollDaily(profile: PlayerProfile): void {
  const today = dayKey();
  if (profile.daily.day !== today) profile.daily = { day: today, matches: 0 };
}

function applyStats(profile: PlayerProfile, result: MatchResult): boolean {
  const stats = profile.stats;
  let newBestRally = false;

  stats.playSeconds += Math.round(result.seconds);
  stats.rallyHits += result.hits;
  if (result.bestRally > stats.bestRally) {
    stats.bestRally = result.bestRally;
    newBestRally = true;
  }

  if (result.mode === 'endless') {
    stats.endlessRuns += 1;
    if (result.bestRally > stats.endlessBest) stats.endlessBest = result.bestRally;
    return newBestRally;
  }

  stats.matches += 1;
  stats.pointsWon += result.scoreYou;
  stats.pointsLost += result.scoreBot;

  if (result.won) {
    stats.wins += 1;
    stats.currentStreak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    stats.winsByBot[result.botId] = (stats.winsByBot[result.botId] ?? 0) + 1;
    if (result.shutout) stats.shutouts += 1;
    if (result.comeback) stats.comebacks += 1;
  } else {
    stats.losses += 1;
    stats.currentStreak = 0;
  }
  return newBestRally;
}

function applyChallenge(profile: PlayerProfile, result: MatchResult): boolean {
  if (result.mode !== 'challenge' || !result.challengeId) return false;
  const id = result.challengeId;
  const record = profile.challenges[id] ?? {
    attempts: 0,
    cleared: false,
    bestRally: 0,
    clearedAt: 0
  };
  const firstClear = result.objectiveMet && !record.cleared;

  profile.challenges[id] = {
    attempts: record.attempts + 1,
    cleared: record.cleared || result.objectiveMet,
    bestRally: Math.max(record.bestRally, result.bestRally),
    clearedAt: record.cleared ? record.clearedAt : result.objectiveMet ? Date.now() : 0
  };
  if (firstClear) profile.stats.challengesCleared += 1;
  return firstClear;
}

function applyTournament(profile: PlayerProfile, result: MatchResult): TournamentSave | null {
  if (result.mode !== 'tournament' || !profile.tournament) return null;

  const next = advanceTournament(profile.tournament, {
    you: result.scoreYou,
    bot: result.scoreBot,
    won: result.won
  });
  const roundIndex = result.tournamentRound ?? profile.tournament.round;
  const reached = result.won ? Math.min(TOURNAMENT_ROUNDS.length, roundIndex + 2) : roundIndex + 1;
  profile.stats.bestCupRound = Math.max(profile.stats.bestCupRound, reached);

  if (next.champion) {
    profile.stats.cupsWon += 1;
    profile.stats.bestCupTier = Math.max(profile.stats.bestCupTier, next.tier);
  }

  if (next.finished) {
    profile.lastTournament = next;
    profile.tournament = null;
  } else {
    profile.tournament = next;
  }
  return next;
}

/**
 * The XP multiplier this build has earned.
 *
 * Experience Boost and Combo Drive are multiplied together and then capped
 * once, so no combination of the two can turn into a farming loop - the cap
 * is the promise that a build changes *how* you play, not how fast you level.
 */
function talentXpMul(profile: PlayerProfile, result: MatchResult): number {
  const { effects } = resolveLoadout(profile.talents, levelOf(profile.xp));
  const drive = Math.min(effects.driveCap, result.talent.bestDrive * effects.drivePerReturn);
  return Math.min(BALANCE.rewards.maxXpMul, effects.xpMul * (1 + drive));
}

/** Fold what the build did this match into the lifetime talent numbers. */
function applyTalentStats(profile: PlayerProfile, result: MatchResult): void {
  const from = result.talent;
  const stats = profile.talents.stats;
  stats.abilitiesUsed += from.abilitiesUsed;
  stats.powerStrikes += from.powerStrikes;
  stats.dashes += from.dashes;
  stats.perfectGuards += from.perfectGuards;
  stats.crits += from.crits;
  stats.shieldSaves += from.shieldSaves;
  stats.secondChances += from.secondChances;
  stats.bestDrive = Math.max(stats.bestDrive, from.bestDrive);
}

/**
 * Fold a finished match into a profile.
 *
 * Pure: the profile passed in is never mutated, and nothing here touches
 * storage or React - the caller decides when to commit the result.
 */
export function applyMatchResult(source: PlayerProfile, result: MatchResult): ProgressSummary {
  const profile = cloneProfile(source);
  const xpBefore = profile.xp;
  const levelBefore = levelOf(xpBefore);

  rollDaily(profile);

  // Practice and abandoned matches leave no trace at all.
  const counts = result.ranked && !result.abandoned;
  if (!counts) {
    return {
      profile: source,
      award: EMPTY_AWARD,
      xpBefore,
      xpAfter: xpBefore,
      levelBefore,
      levelAfter: levelBefore,
      levelsGained: 0,
      achievements: [],
      unlocks: [],
      newBestRally: false,
      challengeCleared: false,
      tournament: null,
      cupWon: false,
      talentPoints: 0,
      talentPointsAvailable: source.talents.points
    };
  }

  const newBestRally = applyStats(profile, result);
  const challengeCleared = applyChallenge(profile, result);
  const tournament = applyTournament(profile, result);
  applyTalentStats(profile, result);

  const award = computeMatchXp(result, {
    matchesToday: profile.daily.matches,
    firstChallengeClear: challengeCleared,
    talentXpMul: talentXpMul(profile, result)
  });
  profile.xp += award.total;
  profile.daily.matches += 1;

  const achievements = grantAchievements(profile, result);
  const unlocks = syncUnlocks(profile);
  profile.updatedAt = Date.now();

  const levelAfter = levelFromXp(profile.xp).level;

  // Levelling is the only source of talent points, so the grant is simply
  // the build re-reconciled against the new level. Difficulty never touches
  // it, and neither does anything the player does mid-match.
  const pointsBefore = profile.talents.points;
  profile.talents = reconcile(profile.talents, levelAfter);

  return {
    profile,
    award,
    xpBefore,
    xpAfter: profile.xp,
    levelBefore,
    levelAfter,
    levelsGained: Math.max(0, levelAfter - levelBefore),
    achievements,
    unlocks,
    newBestRally,
    challengeCleared,
    tournament,
    cupWon: tournament?.champion ?? false,
    talentPoints: Math.max(0, profile.talents.points - pointsBefore),
    talentPointsAvailable: profile.talents.points
  };
}
