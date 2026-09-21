/**
 * Profile persistence.
 *
 * Loading rebuilds the shared `PlayerProfile` from its tables; saving writes
 * it straight back. The child tables are rewritten wholesale rather than
 * diffed, which is the right trade here: the largest of them is twenty-seven
 * talent rows, and a diff is where an off-by-one quietly eats a player's
 * achievement.
 *
 * Every write goes through {@link saveProfile}, which is guarded by the
 * profile's `version` column. Two devices finishing a match at the same
 * moment cannot interleave: the second update matches zero rows and the
 * caller retries against fresh state.
 */

import { DEFAULT_BOT, isBotLevelId } from '../../../src/core/bots/levels';
import {
  DEFAULT_EQUIPPED,
  EQUIP_SLOTS,
  cosmeticById,
  type Equipped
} from '../../../src/core/cosmetics/catalog';
import { isModeId, MODES } from '../../../src/core/modes/catalog';
import type { ModeId } from '../../../src/core/modes/types';
import { createStats } from '../../../src/core/profile/defaults';
import type { AvatarId, ChallengeRecord, PlayerProfile } from '../../../src/core/profile/types';
import { AVATARS } from '../../../src/core/profile/types';
import { levelOf } from '../../../src/core/progression/levels';
import { isAbilityId } from '../../../src/core/talents/abilities';
import { createTalentSave, reconcile } from '../../../src/core/talents/save';
import type { AbilityId, TalentId, TalentSave } from '../../../src/core/talents/types';
import { isTalentId } from '../../../src/core/talents/catalog';
import type { TournamentSave } from '../../../src/core/tournament/bracket';
import type { Db } from '../db/index';
import { emptyModeStats, type ModeStats, type ServerProfile } from '../domain/profile';
import { newId } from '../lib/ids';

interface ProfileRow {
  user_id: string;
  save_id: string;
  version: number;
  display_name: string;
  avatar: string;
  xp: number;
  daily_day: string;
  daily_matches: number;
  last_bot: string;
  last_practice_bot: string;
  created_at: number;
  updated_at: number;
}

interface StatsRow {
  matches: number;
  wins: number;
  losses: number;
  points_won: number;
  points_lost: number;
  rally_hits: number;
  best_rally: number;
  current_streak: number;
  best_streak: number;
  play_seconds: number;
  shutouts: number;
  comebacks: number;
  endless_runs: number;
  endless_best: number;
  challenges_cleared: number;
  cups_played: number;
  cups_won: number;
  best_cup_round: number;
  best_cup_tier: number;
}

interface TalentStatsRow {
  points_earned: number;
  respecs: number;
  abilities_used: number;
  power_strikes: number;
  dashes: number;
  perfect_guards: number;
  crits: number;
  shield_saves: number;
  second_chances: number;
  ultimates: number;
  best_drive: number;
}

interface TournamentRow {
  id: string;
  user_id: string;
  tier: number;
  round: number;
  results_json: string;
  status: 'active' | 'finished' | 'abandoned';
  champion: number;
  started_at: number;
  updated_at: number;
  finished_at: number | null;
}

function avatarOf(value: string): AvatarId {
  return AVATARS.includes(value as AvatarId) ? (value as AvatarId) : 'orb';
}

function parseTournament(row: TournamentRow | undefined): TournamentSave | null {
  if (!row) return null;
  let results: TournamentSave['results'] = [];
  try {
    const parsed: unknown = JSON.parse(row.results_json);
    if (Array.isArray(parsed)) results = parsed as TournamentSave['results'];
  } catch {
    results = [];
  }
  return {
    tier: row.tier,
    round: row.round,
    results,
    startedAt: row.started_at,
    finished: row.status !== 'active',
    champion: row.champion === 1
  };
}

export function loadProfile(db: Db, userId: string): ServerProfile | null {
  const row = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) as
    ProfileRow | undefined;
  if (!row) return null;

  const statsRow = db.prepare('SELECT * FROM profile_stats WHERE user_id = ?').get(userId) as
    StatsRow | undefined;
  const talentStatsRow = db
    .prepare('SELECT * FROM profile_talent_stats WHERE user_id = ?')
    .get(userId) as TalentStatsRow | undefined;

  const stats = createStats();
  if (statsRow) {
    stats.matches = statsRow.matches;
    stats.wins = statsRow.wins;
    stats.losses = statsRow.losses;
    stats.pointsWon = statsRow.points_won;
    stats.pointsLost = statsRow.points_lost;
    stats.rallyHits = statsRow.rally_hits;
    stats.bestRally = statsRow.best_rally;
    stats.currentStreak = statsRow.current_streak;
    stats.bestStreak = statsRow.best_streak;
    stats.playSeconds = statsRow.play_seconds;
    stats.shutouts = statsRow.shutouts;
    stats.comebacks = statsRow.comebacks;
    stats.endlessRuns = statsRow.endless_runs;
    stats.endlessBest = statsRow.endless_best;
    stats.challengesCleared = statsRow.challenges_cleared;
    stats.cupsPlayed = statsRow.cups_played;
    stats.cupsWon = statsRow.cups_won;
    stats.bestCupRound = statsRow.best_cup_round;
    stats.bestCupTier = statsRow.best_cup_tier;
  }

  for (const win of db
    .prepare('SELECT bot_id, wins FROM profile_bot_wins WHERE user_id = ?')
    .all(userId) as { bot_id: string; wins: number }[]) {
    if (isBotLevelId(win.bot_id)) stats.winsByBot[win.bot_id] = win.wins;
  }

  const talents: TalentSave = createTalentSave();
  for (const rank of db
    .prepare('SELECT talent_id, rank FROM talent_ranks WHERE user_id = ?')
    .all(userId) as { talent_id: string; rank: number }[]) {
    if (isTalentId(rank.talent_id)) talents.ranks[rank.talent_id as TalentId] = rank.rank;
  }
  for (const slot of db
    .prepare('SELECT slot, ability_id FROM equipped_abilities WHERE user_id = ? ORDER BY slot')
    .all(userId) as { slot: number; ability_id: string }[]) {
    if (slot.slot >= 0 && slot.slot < talents.equipped.length && isAbilityId(slot.ability_id)) {
      talents.equipped[slot.slot] = slot.ability_id as AbilityId;
    }
  }
  if (talentStatsRow) {
    talents.stats = {
      pointsEarned: talentStatsRow.points_earned,
      respecs: talentStatsRow.respecs,
      abilitiesUsed: talentStatsRow.abilities_used,
      powerStrikes: talentStatsRow.power_strikes,
      dashes: talentStatsRow.dashes,
      perfectGuards: talentStatsRow.perfect_guards,
      crits: talentStatsRow.crits,
      shieldSaves: talentStatsRow.shield_saves,
      secondChances: talentStatsRow.second_chances,
      ultimates: talentStatsRow.ultimates,
      bestDrive: talentStatsRow.best_drive
    };
  }

  const achievements: Record<string, number> = {};
  for (const item of db
    .prepare('SELECT achievement_id, unlocked_at FROM profile_achievements WHERE user_id = ?')
    .all(userId) as { achievement_id: string; unlocked_at: number }[]) {
    achievements[item.achievement_id] = item.unlocked_at;
  }

  const unlocks = (
    db.prepare('SELECT cosmetic_id FROM profile_unlocks WHERE user_id = ?').all(userId) as {
      cosmetic_id: string;
    }[]
  ).map((item) => item.cosmetic_id);

  const equipped: Equipped = { ...DEFAULT_EQUIPPED };
  for (const item of db
    .prepare('SELECT slot, cosmetic_id FROM equipped_cosmetics WHERE user_id = ?')
    .all(userId) as { slot: string; cosmetic_id: string }[]) {
    const slot = item.slot as keyof Equipped;
    if (EQUIP_SLOTS.includes(slot) && cosmeticById(item.cosmetic_id)) {
      equipped[slot] = item.cosmetic_id;
    }
  }

  const challenges: Record<string, ChallengeRecord> = {};
  for (const item of db
    .prepare('SELECT * FROM challenge_records WHERE user_id = ?')
    .all(userId) as {
    challenge_id: string;
    attempts: number;
    cleared: number;
    best_rally: number;
    cleared_at: number;
  }[]) {
    challenges[item.challenge_id] = {
      attempts: item.attempts,
      cleared: item.cleared === 1,
      bestRally: item.best_rally,
      clearedAt: item.cleared_at
    };
  }

  const activeRow = db
    .prepare("SELECT * FROM tournaments WHERE user_id = ? AND status = 'active'")
    .get(userId) as TournamentRow | undefined;
  const lastRow = db
    .prepare(
      "SELECT * FROM tournaments WHERE user_id = ? AND status <> 'active' " +
        'ORDER BY started_at DESC LIMIT 1'
    )
    .get(userId) as TournamentRow | undefined;

  const modeStats: Partial<Record<ModeId, ModeStats>> = {};
  for (const item of db
    .prepare('SELECT * FROM profile_mode_stats WHERE user_id = ?')
    .all(userId) as {
    mode_id: string;
    matches: number;
    wins: number;
    losses: number;
    points_won: number;
    points_lost: number;
    best_rally: number;
    play_seconds: number;
    xp_earned: number;
  }[]) {
    if (!isModeId(item.mode_id)) continue;
    modeStats[item.mode_id] = {
      matches: item.matches,
      wins: item.wins,
      losses: item.losses,
      pointsWon: item.points_won,
      pointsLost: item.points_lost,
      bestRally: item.best_rally,
      playSeconds: item.play_seconds,
      xpEarned: item.xp_earned
    };
  }

  const profile: PlayerProfile = {
    id: row.user_id,
    name: row.display_name,
    avatar: avatarOf(row.avatar),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    onboarded: true,
    xp: row.xp,
    stats,
    // Points are never read from storage - they are recomputed from level and
    // spend, exactly as the client does it, so a tampered row converges.
    talents: reconcile(talents, levelOf(row.xp)),
    achievements,
    unlocks,
    equipped,
    challenges,
    tournament: parseTournament(activeRow),
    lastTournament: parseTournament(lastRow),
    daily: { day: row.daily_day, matches: row.daily_matches },
    preferences: {
      lastBot: isBotLevelId(row.last_bot) ? row.last_bot : DEFAULT_BOT,
      lastPracticeBot: isBotLevelId(row.last_practice_bot) ? row.last_practice_bot : DEFAULT_BOT
    }
  };

  return {
    userId: row.user_id,
    saveId: row.save_id,
    version: row.version,
    profile,
    modeStats,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** Insert a brand new profile and all of its child rows. Caller owns the transaction. */
export function insertProfile(db: Db, server: ServerProfile): void {
  const { profile } = server;
  db.prepare(
    `INSERT INTO profiles
       (user_id, save_id, version, display_name, avatar, xp, daily_day, daily_matches,
        last_bot, last_practice_bot, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    server.userId,
    server.saveId,
    server.version,
    profile.name,
    profile.avatar,
    profile.xp,
    profile.daily.day,
    profile.daily.matches,
    profile.preferences.lastBot,
    profile.preferences.lastPracticeBot,
    server.createdAt,
    server.updatedAt
  );
  db.prepare('INSERT INTO profile_stats (user_id) VALUES (?)').run(server.userId);
  db.prepare('INSERT INTO profile_talent_stats (user_id) VALUES (?)').run(server.userId);
  writeChildren(db, server);
}

export class ProfileVersionConflict extends Error {
  constructor() {
    super('profile version conflict');
    this.name = 'ProfileVersionConflict';
  }
}

/**
 * Persist an aggregate, bumping its version.
 *
 * `expectedVersion` defaults to the version the aggregate was loaded at, so
 * the ordinary read-modify-write is already guarded without the caller
 * thinking about it. A mismatch throws {@link ProfileVersionConflict}.
 *
 * Caller owns the transaction.
 */
export function saveProfile(
  db: Db,
  server: ServerProfile,
  now = Date.now(),
  expectedVersion: number = server.version
): ServerProfile {
  const { profile } = server;
  const result = db
    .prepare(
      `UPDATE profiles SET
         version = version + 1,
         display_name = ?, avatar = ?, xp = ?,
         daily_day = ?, daily_matches = ?,
         last_bot = ?, last_practice_bot = ?,
         updated_at = ?
       WHERE user_id = ? AND version = ?`
    )
    .run(
      profile.name,
      profile.avatar,
      profile.xp,
      profile.daily.day,
      profile.daily.matches,
      profile.preferences.lastBot,
      profile.preferences.lastPracticeBot,
      now,
      server.userId,
      expectedVersion
    );

  if (result.changes === 0) throw new ProfileVersionConflict();

  db.prepare(
    `UPDATE profile_stats SET
       matches = ?, wins = ?, losses = ?, points_won = ?, points_lost = ?,
       rally_hits = ?, best_rally = ?, current_streak = ?, best_streak = ?,
       play_seconds = ?, shutouts = ?, comebacks = ?, endless_runs = ?, endless_best = ?,
       challenges_cleared = ?, cups_played = ?, cups_won = ?, best_cup_round = ?, best_cup_tier = ?
     WHERE user_id = ?`
  ).run(
    profile.stats.matches,
    profile.stats.wins,
    profile.stats.losses,
    profile.stats.pointsWon,
    profile.stats.pointsLost,
    profile.stats.rallyHits,
    profile.stats.bestRally,
    profile.stats.currentStreak,
    profile.stats.bestStreak,
    profile.stats.playSeconds,
    profile.stats.shutouts,
    profile.stats.comebacks,
    profile.stats.endlessRuns,
    profile.stats.endlessBest,
    profile.stats.challengesCleared,
    profile.stats.cupsPlayed,
    profile.stats.cupsWon,
    profile.stats.bestCupRound,
    profile.stats.bestCupTier,
    server.userId
  );

  const ts = profile.talents.stats;
  db.prepare(
    `UPDATE profile_talent_stats SET
       points_earned = ?, respecs = ?, abilities_used = ?, power_strikes = ?, dashes = ?,
       perfect_guards = ?, crits = ?, shield_saves = ?, second_chances = ?, ultimates = ?,
       best_drive = ?
     WHERE user_id = ?`
  ).run(
    ts.pointsEarned,
    ts.respecs,
    ts.abilitiesUsed,
    ts.powerStrikes,
    ts.dashes,
    ts.perfectGuards,
    ts.crits,
    ts.shieldSaves,
    ts.secondChances,
    ts.ultimates,
    ts.bestDrive,
    server.userId
  );

  writeChildren(db, server, now);

  return { ...server, version: expectedVersion + 1, updatedAt: now };
}

/** Rewrite the small keyed tables. Volumes are tiny; correctness is not. */
function writeChildren(db: Db, server: ServerProfile, now = Date.now()): void {
  const userId = server.userId;
  const { profile } = server;

  db.prepare('DELETE FROM profile_bot_wins WHERE user_id = ?').run(userId);
  const insertBotWin = db.prepare(
    'INSERT INTO profile_bot_wins (user_id, bot_id, wins) VALUES (?, ?, ?)'
  );
  for (const [botId, wins] of Object.entries(profile.stats.winsByBot)) {
    if (typeof wins === 'number' && wins > 0) insertBotWin.run(userId, botId, wins);
  }

  db.prepare('DELETE FROM talent_ranks WHERE user_id = ?').run(userId);
  const insertRank = db.prepare(
    'INSERT INTO talent_ranks (user_id, talent_id, rank) VALUES (?, ?, ?)'
  );
  for (const [talentId, rank] of Object.entries(profile.talents.ranks)) {
    if (typeof rank === 'number' && rank > 0) insertRank.run(userId, talentId, rank);
  }

  db.prepare('DELETE FROM equipped_abilities WHERE user_id = ?').run(userId);
  const insertEquipped = db.prepare(
    'INSERT INTO equipped_abilities (user_id, slot, ability_id) VALUES (?, ?, ?)'
  );
  profile.talents.equipped.forEach((ability, slot) => {
    if (ability) insertEquipped.run(userId, slot, ability);
  });

  const insertAchievement = db.prepare(
    `INSERT INTO profile_achievements (user_id, achievement_id, unlocked_at, xp_awarded)
     VALUES (?, ?, ?, 0)
     ON CONFLICT (user_id, achievement_id) DO NOTHING`
  );
  for (const [id, at] of Object.entries(profile.achievements))
    insertAchievement.run(userId, id, at);

  const insertUnlock = db.prepare(
    `INSERT INTO profile_unlocks (user_id, cosmetic_id, unlocked_at) VALUES (?, ?, ?)
     ON CONFLICT (user_id, cosmetic_id) DO NOTHING`
  );
  for (const id of profile.unlocks) insertUnlock.run(userId, id, now);

  db.prepare('DELETE FROM equipped_cosmetics WHERE user_id = ?').run(userId);
  const insertCosmetic = db.prepare(
    'INSERT INTO equipped_cosmetics (user_id, slot, cosmetic_id) VALUES (?, ?, ?)'
  );
  for (const slot of EQUIP_SLOTS) insertCosmetic.run(userId, slot, profile.equipped[slot]);

  const upsertChallenge = db.prepare(
    `INSERT INTO challenge_records (user_id, challenge_id, attempts, cleared, best_rally, cleared_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, challenge_id) DO UPDATE SET
       attempts = excluded.attempts,
       cleared = excluded.cleared,
       best_rally = excluded.best_rally,
       cleared_at = excluded.cleared_at`
  );
  for (const [id, record] of Object.entries(profile.challenges)) {
    upsertChallenge.run(
      userId,
      id,
      record.attempts,
      record.cleared ? 1 : 0,
      record.bestRally,
      record.clearedAt
    );
  }

  const upsertMode = db.prepare(
    `INSERT INTO profile_mode_stats
       (user_id, mode_id, matches, wins, losses, points_won, points_lost, best_rally,
        play_seconds, xp_earned)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, mode_id) DO UPDATE SET
       matches = excluded.matches, wins = excluded.wins, losses = excluded.losses,
       points_won = excluded.points_won, points_lost = excluded.points_lost,
       best_rally = excluded.best_rally, play_seconds = excluded.play_seconds,
       xp_earned = excluded.xp_earned`
  );
  for (const mode of MODES) {
    const item = server.modeStats[mode.id];
    if (!item) continue;
    upsertMode.run(
      userId,
      mode.id,
      item.matches,
      item.wins,
      item.losses,
      item.pointsWon,
      item.pointsLost,
      item.bestRally,
      item.playSeconds,
      item.xpEarned
    );
  }

  writeTournaments(db, userId, profile, now);
}

function writeTournaments(db: Db, userId: string, profile: PlayerProfile, now: number): void {
  const active = profile.tournament;

  // Anything the model no longer calls "live" is closed, so the partial
  // unique index that allows one active cup per player always holds.
  db.prepare(
    `UPDATE tournaments SET status = 'finished', finished_at = COALESCE(finished_at, ?), updated_at = ?
     WHERE user_id = ? AND status = 'active' AND started_at <> ?`
  ).run(now, now, userId, active?.startedAt ?? -1);

  if (active) upsertTournament(db, userId, active, 'active', now);
  if (profile.lastTournament) {
    upsertTournament(db, userId, profile.lastTournament, 'finished', now);
  }
}

function upsertTournament(
  db: Db,
  userId: string,
  save: TournamentSave,
  status: 'active' | 'finished',
  now: number
): string {
  const existing = db
    .prepare('SELECT id FROM tournaments WHERE user_id = ? AND started_at = ?')
    .get(userId, save.startedAt) as { id: string } | undefined;

  const results = JSON.stringify(save.results);
  if (existing) {
    db.prepare(
      `UPDATE tournaments SET tier = ?, round = ?, results_json = ?, status = ?, champion = ?,
         updated_at = ?, finished_at = CASE WHEN ? = 'finished' THEN COALESCE(finished_at, ?) ELSE NULL END
       WHERE id = ?`
    ).run(
      save.tier,
      save.round,
      results,
      status,
      save.champion ? 1 : 0,
      now,
      status,
      now,
      existing.id
    );
    return existing.id;
  }

  const id = newId();
  db.prepare(
    `INSERT INTO tournaments
       (id, user_id, tier, round, results_json, status, champion, started_at, updated_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    save.tier,
    save.round,
    results,
    status,
    save.champion ? 1 : 0,
    save.startedAt,
    now,
    status === 'finished' ? now : null
  );
  return id;
}

/** The id of the cup currently in progress, if any. */
export function activeTournamentId(db: Db, userId: string): string | null {
  const row = db
    .prepare("SELECT id FROM tournaments WHERE user_id = ? AND status = 'active'")
    .get(userId) as { id: string } | undefined;
  return row?.id ?? null;
}

/** Mode statistics after a finished match. Pure; the caller persists it. */
export function foldModeStats(
  current: Partial<Record<ModeId, ModeStats>>,
  mode: ModeId,
  delta: {
    readonly won: boolean;
    readonly counts: boolean;
    readonly scoreYou: number;
    readonly scoreBot: number;
    readonly bestRally: number;
    readonly seconds: number;
    readonly xp: number;
  }
): Partial<Record<ModeId, ModeStats>> {
  const base = current[mode] ?? emptyModeStats();
  const next: ModeStats = {
    matches: base.matches + (delta.counts ? 1 : 0),
    wins: base.wins + (delta.counts && delta.won ? 1 : 0),
    losses: base.losses + (delta.counts && !delta.won ? 1 : 0),
    pointsWon: base.pointsWon + delta.scoreYou,
    pointsLost: base.pointsLost + delta.scoreBot,
    bestRally: Math.max(base.bestRally, delta.bestRally),
    playSeconds: base.playSeconds + Math.round(delta.seconds),
    xpEarned: base.xpEarned + delta.xp
  };
  return { ...current, [mode]: next };
}
