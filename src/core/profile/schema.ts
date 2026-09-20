import { isAchievementId } from '../achievements/catalog';
import { isBotLevelId, DEFAULT_BOT } from '../bots/levels';
import {
  DEFAULT_EQUIPPED,
  DEFAULT_UNLOCKS,
  EQUIP_SLOTS,
  cosmeticById,
  type Equipped
} from '../cosmetics/catalog';
import { challengeById } from '../modes/challenges';
import { levelOf } from '../progression/levels';
import { dayKey } from '../progression/xp';
import type { StoreSpec } from '../storage/localStore';
import { talentSaveOf } from '../talents/save';
import { TOURNAMENT_ROUNDS, TOURNAMENT_TIERS, type TournamentSave } from '../tournament/bracket';
import { cleanName, createProfile, createStats } from './defaults';
import { AVATARS, type AvatarId, type ChallengeRecord, type PlayerProfile } from './types';

export const PROFILE_KEY = 'bball.profile';
/** 1: the original profile. 2: adds the talent build. */
export const PROFILE_VERSION = 2;

type Bag = Record<string, unknown>;

function bag(value: unknown): Bag {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Bag) : {};
}

function num(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function avatarOf(value: unknown): AvatarId {
  return AVATARS.includes(value as AvatarId) ? (value as AvatarId) : 'orb';
}

function equippedOf(value: unknown): Equipped {
  const source = bag(value);
  const result = { ...DEFAULT_EQUIPPED } as Equipped;
  for (const slot of EQUIP_SLOTS) {
    const id = source[slot];
    if (typeof id !== 'string') continue;
    const cosmetic = cosmeticById(id);
    if (cosmetic && cosmetic.kind === slot) result[slot] = id;
  }
  return result;
}

function tournamentOf(value: unknown): TournamentSave | null {
  if (!value || typeof value !== 'object') return null;
  const source = bag(value);
  const results = Array.isArray(source.results) ? source.results : [];
  const tier = num(source.tier, 0, 0, TOURNAMENT_TIERS.length - 1);
  return {
    tier,
    round: num(source.round, 0, 0, TOURNAMENT_ROUNDS.length),
    results: results.slice(0, TOURNAMENT_ROUNDS.length).map((entry) => {
      const item = bag(entry);
      return {
        you: num(item.you, 0, 0, 99),
        bot: num(item.bot, 0, 0, 99),
        won: bool(item.won, false)
      };
    }),
    startedAt: num(source.startedAt, Date.now()),
    finished: bool(source.finished, false),
    champion: bool(source.champion, false)
  };
}

function challengesOf(value: unknown): Record<string, ChallengeRecord> {
  const source = bag(value);
  const result: Record<string, ChallengeRecord> = {};
  for (const [id, entry] of Object.entries(source)) {
    if (!challengeById(id)) continue; // a challenge that no longer exists
    const item = bag(entry);
    result[id] = {
      attempts: num(item.attempts, 0),
      cleared: bool(item.cleared, false),
      bestRally: num(item.bestRally, 0),
      clearedAt: num(item.clearedAt, 0)
    };
  }
  return result;
}

function achievementsOf(value: unknown): Record<string, number> {
  const source = bag(value);
  const result: Record<string, number> = {};
  for (const [id, at] of Object.entries(source)) {
    if (isAchievementId(id)) result[id] = num(at, Date.now());
  }
  return result;
}

function unlocksOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  const owned = new Set<string>(DEFAULT_UNLOCKS);
  for (const id of list) {
    if (typeof id === 'string' && cosmeticById(id)) owned.add(id);
  }
  return [...owned];
}

function statsOf(value: unknown): PlayerProfile['stats'] {
  const source = bag(value);
  const base = createStats();
  const wins = bag(source.winsByBot);
  const winsByBot: PlayerProfile['stats']['winsByBot'] = {};
  for (const [id, count] of Object.entries(wins)) {
    if (isBotLevelId(id)) winsByBot[id] = num(count, 0);
  }

  return {
    matches: num(source.matches, base.matches),
    wins: num(source.wins, base.wins),
    losses: num(source.losses, base.losses),
    pointsWon: num(source.pointsWon, base.pointsWon),
    pointsLost: num(source.pointsLost, base.pointsLost),
    rallyHits: num(source.rallyHits, base.rallyHits),
    bestRally: num(source.bestRally, base.bestRally),
    currentStreak: num(source.currentStreak, base.currentStreak),
    bestStreak: num(source.bestStreak, base.bestStreak),
    playSeconds: num(source.playSeconds, base.playSeconds),
    shutouts: num(source.shutouts, base.shutouts),
    comebacks: num(source.comebacks, base.comebacks),
    endlessRuns: num(source.endlessRuns, base.endlessRuns),
    endlessBest: num(source.endlessBest, base.endlessBest),
    challengesCleared: num(source.challengesCleared, base.challengesCleared),
    cupsPlayed: num(source.cupsPlayed, base.cupsPlayed),
    cupsWon: num(source.cupsWon, base.cupsWon),
    bestCupRound: num(source.bestCupRound, base.bestCupRound, 0, TOURNAMENT_ROUNDS.length),
    bestCupTier: num(source.bestCupTier, base.bestCupTier, -1, TOURNAMENT_TIERS.length - 1),
    winsByBot
  };
}

/**
 * Repair-first validation: a save is only thrown away when it is not an
 * object at all. Every other problem - a missing field, a string where a
 * number belongs, a cosmetic that no longer exists - is patched in place, so
 * a player never loses their history to a bad write.
 */
export function validateProfile(data: unknown): PlayerProfile | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const source = data as Bag;
  const blank = createProfile();
  const preferences = bag(source.preferences);

  const xp = num(source.xp, 0);

  const profile: PlayerProfile = {
    id: text(source.id, blank.id),
    name: cleanName(text(source.name, blank.name)),
    avatar: avatarOf(source.avatar),
    createdAt: num(source.createdAt, blank.createdAt),
    updatedAt: num(source.updatedAt, blank.updatedAt),
    onboarded: bool(source.onboarded, false),
    xp,
    stats: statsOf(source.stats),
    // Points are always recomputed from level and spend, so a truncated,
    // stale or tampered-with build converges on an honest total.
    talents: talentSaveOf(source.talents, levelOf(xp)),
    achievements: achievementsOf(source.achievements),
    unlocks: unlocksOf(source.unlocks),
    equipped: equippedOf(source.equipped),
    challenges: challengesOf(source.challenges),
    tournament: tournamentOf(source.tournament),
    lastTournament: tournamentOf(source.lastTournament),
    daily: {
      day: text(bag(source.daily).day, dayKey()),
      matches: num(bag(source.daily).matches, 0)
    },
    preferences: {
      lastBot: isBotLevelId(preferences.lastBot) ? preferences.lastBot : DEFAULT_BOT,
      lastPracticeBot: isBotLevelId(preferences.lastPracticeBot)
        ? preferences.lastPracticeBot
        : DEFAULT_BOT
    }
  };

  // A finished cup belongs in `lastTournament`, never as the live run.
  if (profile.tournament?.finished) {
    profile.lastTournament = profile.tournament;
    profile.tournament = null;
  }
  return profile;
}

/**
 * One step forward, per call. `from` is the version the payload is currently
 * at, so a save written months ago walks every step in order.
 *
 * Every step here only has to *shape* the data; validateProfile still runs
 * afterwards and repairs anything a step left approximate.
 */
function migrateProfile(data: unknown, from: number): unknown {
  const source = bag(data);
  switch (from) {
    // 1 -> 2: talents arrive. A returning player is handed the points their
    // level has already earned, with nothing spent, so their save is worth
    // more after the update rather than less.
    case 1:
      return { ...source, talents: talentSaveOf(source.talents, levelOf(num(source.xp, 0))) };
    default:
      return source;
  }
}

export const PROFILE_SPEC: StoreSpec<PlayerProfile> = {
  key: PROFILE_KEY,
  version: PROFILE_VERSION,
  create: () => createProfile(),
  // A future version adds its case to migrateProfile and bumps
  // PROFILE_VERSION. Versions from the future fall through to
  // validateProfile, which repairs whatever it recognises.
  migrate: migrateProfile,
  validate: validateProfile
};
