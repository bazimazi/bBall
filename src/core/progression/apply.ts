import { ACHIEVEMENTS, type Achievement } from '../achievements/catalog';
import { stageById, starXp } from '../campaign/journey';
import { applyDaily, dailySpec } from '../daily/daily';
import { starCount, starsEarned } from '../modes/stars';
import { cloneProgress } from '../profile/progress';
import { applyQuests, QUEST_BONUS_XP, QUEST_XP, type QuestDef } from '../quests/quests';
import { advanceRun, type RunAdvance } from '../run/run';
import { COSMETICS, isUnlocked, type Cosmetic } from '../cosmetics/catalog';
import type { MatchResult } from '../modes/types';
import { createStats } from '../profile/defaults';
import type { PlayerProfile } from '../profile/types';
import { cloneTalentSave, reconcile } from '../talents/save';
import { advanceTournament, TOURNAMENT_ROUNDS, type TournamentSave } from '../tournament/bracket';
import { levelFromXp, levelOf } from './levels';
import { computeMatchXp, dayKey, EMPTY_AWARD, type XpAward, type XpLine } from './xp';

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
  /** Stars this match earned (a mask), in a Journey stage or the daily. */
  readonly stars: number;
  /** Of those, how many had never been earned before. */
  readonly newStars: number;
  /** The daily was cleared for the first time today; the streak it now stands at. */
  readonly dailyCleared: boolean;
  readonly dailyStreak: number;
  /** Quests this match finished, and whether it finished the day's set. */
  readonly questsDone: readonly QuestDef[];
  readonly questBonus: boolean;
  /** What the match did to a Gauntlet run, if it was a run match. */
  readonly run: RunAdvance | null;
  /** A boss fell. */
  readonly bossBeaten: boolean;
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
    progress: cloneProgress(profile.progress),
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

/**
 * Unlock everything the player has just qualified for, XP bonuses included.
 *
 * Exported because the server runs it outside a match too - after a guest
 * save is carried into an account, the merged profile may already qualify for
 * achievements neither save had banked. Re-running it is safe: an achievement
 * already recorded is skipped, so its XP is never granted twice.
 */
export function grantAchievements(
  profile: PlayerProfile,
  result: MatchResult | null
): Achievement[] {
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
  stats.ultimates += from.ultimates;
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
      talentPointsAvailable: source.talents.points,
      stars: 0,
      newStars: 0,
      dailyCleared: false,
      dailyStreak: source.progress.daily.streak,
      questsDone: [],
      questBonus: false,
      run: null,
      bossBeaten: false
    };
  }

  const newBestRally = applyStats(profile, result);
  const challengeCleared = applyChallenge(profile, result);
  const tournament = applyTournament(profile, result);
  applyTalentStats(profile, result);

  const base = computeMatchXp(result, {
    matchesToday: profile.daily.matches,
    firstChallengeClear: challengeCleared,
    // No talent pays XP any more: with points this scarce, every one of them
    // buys something that changes a rally, never how fast the next arrives.
    talentXpMul: 1
  });
  const modes = applyModes(profile, result);
  const award = withExtraLines(base, modes.lines);
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
    talentPointsAvailable: profile.talents.points,
    stars: modes.stars,
    newStars: modes.newStars,
    dailyCleared: modes.dailyCleared,
    dailyStreak: profile.progress.daily.streak,
    questsDone: modes.questsDone,
    questBonus: modes.questBonus,
    run: modes.run,
    bossBeaten: modes.bossBeaten
  };
}

interface ModesOutcome {
  lines: XpLine[];
  stars: number;
  newStars: number;
  dailyCleared: boolean;
  questsDone: readonly QuestDef[];
  questBonus: boolean;
  run: RunAdvance | null;
  bossBeaten: boolean;
}

/** XP for the Journey, the daily and the Gauntlet. Each is paid once, so none of it is damped. */
const DAILY_CLEAR_XP = 150;
const DAILY_STREAK_XP = 10;
const DAILY_STAR_XP = 40;
const RUN_WIN_XP = 40;
const RUN_BOSS_XP = 90;
const RUN_CLEAR_XP = 400;
const RUN_PRESSURE_XP = 150;

/**
 * The newer modes' share of a finished match: Journey stars, the daily and
 * its streak, a Gauntlet run's next step, bosses, flicks and the day's
 * quests. Mutates the (already cloned) profile and reports what happened,
 * with the XP lines it is worth.
 */
function applyModes(profile: PlayerProfile, result: MatchResult): ModesOutcome {
  const progress = profile.progress;
  const lines: XpLine[] = [];
  const add = (label: string, xp: number) => {
    if (xp > 0) lines.push({ label, xp: Math.round(xp) });
  };
  let stars = 0;
  let newStars = 0;
  let dailyCleared = false;
  let run: RunAdvance | null = null;

  progress.flicks += Math.max(0, result.flicks);

  if (result.mode === 'campaign' && result.stageId) {
    const stage = stageById(result.stageId);
    if (stage) {
      stars = starsEarned(stage.goals, result);
      const before = progress.journey[stage.id] ?? 0;
      const after = before | stars;
      newStars = starCount(after) - starCount(before);
      if (after !== before) progress.journey[stage.id] = after;
      add(newStars > 1 ? `${newStars} new stars` : 'New star', newStars * starXp(stage.world));
    }
  }

  if (result.mode === 'daily' && result.dailyKey) {
    const spec = dailySpec(result.dailyKey);
    stars = starsEarned(spec.goals, result);
    const outcome = applyDaily(progress.daily, result.dailyKey, stars);
    progress.daily = outcome.record;
    dailyCleared = outcome.firstClear;
    if (outcome.firstClear) {
      add('Daily clear', DAILY_CLEAR_XP);
      add(`Streak ×${outcome.record.streak}`, Math.min(7, outcome.record.streak) * DAILY_STREAK_XP);
    }
    const goals = outcome.newMedals - (outcome.firstClear ? 1 : 0);
    add('Daily stars', Math.max(0, goals) * DAILY_STAR_XP);
  }

  if (result.mode === 'run' && progress.run && !progress.run.finished) {
    if (result.runStage === undefined || result.runStage === progress.run.stage) {
      const pressure = progress.run.pressure;
      run = advanceRun(progress.run, result.won, result.scoreYou, result.scoreBot);
      if (result.won) {
        add(
          result.bossId ? 'Boss defeated' : 'Gauntlet win',
          result.bossId ? RUN_BOSS_XP : RUN_WIN_XP
        );
      }
      if (run.cleared) add('Gauntlet cleared', RUN_CLEAR_XP + pressure * RUN_PRESSURE_XP);
      if (run.ended) {
        const records = progress.runRecords;
        records.runs += 1;
        records.bestStage = Math.max(records.bestStage, run.save.stage);
        if (run.cleared) {
          records.clears += 1;
          records.bestPressure = Math.max(records.bestPressure, pressure);
        }
        progress.lastRun = run.save;
        progress.run = null;
      } else {
        progress.run = run.save;
      }
    }
  }

  const bossBeaten = result.won && !!result.bossId;
  if (bossBeaten && result.bossId) {
    progress.bosses[result.bossId] = (progress.bosses[result.bossId] ?? 0) + 1;
  }

  const quests = applyQuests(progress.quests, result.day ?? dayKey(), {
    result,
    newStars,
    bossBeaten,
    dailyCleared,
    runWin: result.mode === 'run' && result.won
  });
  progress.quests = quests.state;
  for (const quest of quests.completed) add(`Quest · ${quest.label}`, QUEST_XP[quest.tier] ?? 0);
  if (quests.bonus) {
    progress.questSweeps += 1;
    add('All three quests', QUEST_BONUS_XP);
  }

  return {
    lines,
    stars,
    newStars,
    dailyCleared,
    questsDone: quests.completed,
    questBonus: quests.bonus,
    run,
    bossBeaten
  };
}

/** Fold one-off lines into an award. They are never multiplied or damped. */
function withExtraLines(award: XpAward, lines: readonly XpLine[]): XpAward {
  if (lines.length === 0) return award;
  const extra = lines.reduce((sum, line) => sum + line.xp, 0);
  return { ...award, extras: lines, total: award.total + extra };
}
