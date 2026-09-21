/**
 * The server's profile aggregate.
 *
 * The important decision in this whole backend is here: the server does not
 * re-implement progression. It loads its rows into the *client's own*
 * `PlayerProfile` shape, runs the *client's own* pure domain functions over
 * it - `applyMatchResult`, `buyTalent`, `reconcile`, `syncUnlocks` - and
 * writes the result back.
 *
 * That is what stops the two sides drifting. If the XP curve moves, both move
 * together; if a talent's cost changes, both change together. An
 * authoritative server whose rules are a hand-copied approximation of the
 * client's would reject honest matches within a release or two, and every
 * balance change would become a two-place edit with a silent failure mode.
 *
 * What the server adds on top of the shared model is the part the client has
 * no business owning: a version for optimistic concurrency, a save id for
 * lineage, and per-mode statistics.
 */

import { DEFAULT_BOT } from '../../../src/core/bots/levels';
import { DEFAULT_EQUIPPED, DEFAULT_UNLOCKS } from '../../../src/core/cosmetics/catalog';
import type { ModeId } from '../../../src/core/modes/types';
import { cleanName, createProfile, createStats } from '../../../src/core/profile/defaults';
import type { PlayerProfile } from '../../../src/core/profile/types';
import { levelOf } from '../../../src/core/progression/levels';
import { dayKey } from '../../../src/core/progression/xp';
import { createTalentSave, reconcile } from '../../../src/core/talents/save';
import type { CloudProfileDto, ModeStatsDto } from '../../../shared/protocol';

export type ModeStats = ModeStatsDto;

export interface ServerProfile {
  readonly userId: string;
  readonly saveId: string;
  /** Optimistic concurrency token. Every accepted write increments it. */
  readonly version: number;
  /** The shared domain model, byte-for-byte what the client works with. */
  readonly profile: PlayerProfile;
  readonly modeStats: Partial<Record<ModeId, ModeStats>>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export function emptyModeStats(): ModeStats {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    pointsWon: 0,
    pointsLost: 0,
    bestRally: 0,
    playSeconds: 0,
    xpEarned: 0
  };
}

/**
 * A brand new cloud profile.
 *
 * Identical to what the client creates for a first run, minus the parts that
 * only make sense locally: onboarding is already done (the account *is* the
 * onboarding) and the id is the user id.
 */
export function createServerProfile(
  userId: string,
  saveId: string,
  displayName: string,
  now = Date.now()
): ServerProfile {
  const base = createProfile(now);
  const profile: PlayerProfile = {
    ...base,
    id: userId,
    name: cleanName(displayName),
    onboarded: true,
    stats: createStats(),
    talents: reconcile(createTalentSave(), 1),
    unlocks: [...DEFAULT_UNLOCKS],
    equipped: { ...DEFAULT_EQUIPPED },
    daily: { day: dayKey(new Date(now)), matches: 0 },
    preferences: { lastBot: DEFAULT_BOT, lastPracticeBot: DEFAULT_BOT },
    createdAt: now,
    updatedAt: now
  };

  return {
    userId,
    saveId,
    version: 1,
    profile,
    modeStats: {},
    createdAt: now,
    updatedAt: now
  };
}

/** Replace the domain model inside an aggregate, leaving the metadata alone. */
export function withProfile(
  current: ServerProfile,
  profile: PlayerProfile,
  modeStats: Partial<Record<ModeId, ModeStats>> = current.modeStats
): ServerProfile {
  return { ...current, profile, modeStats };
}

/**
 * The wire shape.
 *
 * `level` and `talentPoints` are derived here rather than stored, because a
 * stored copy is a second source of truth waiting to disagree with the first.
 */
export function toCloudProfile(server: ServerProfile): CloudProfileDto {
  const { profile } = server;
  return {
    userId: server.userId,
    version: server.version,
    saveId: server.saveId,

    displayName: profile.name,
    avatar: profile.avatar,

    xp: profile.xp,
    level: levelOf(profile.xp),
    talentPoints: profile.talents.points,

    talents: {
      ranks: { ...profile.talents.ranks },
      equipped: [...profile.talents.equipped],
      stats: { ...profile.talents.stats }
    },
    achievements: { ...profile.achievements },
    unlocks: [...profile.unlocks],
    equipped: { ...profile.equipped },

    stats: { ...profile.stats, winsByBot: { ...profile.stats.winsByBot } },
    modeStats: { ...server.modeStats },
    challenges: { ...profile.challenges },

    tournament: profile.tournament ? { ...profile.tournament } : null,
    lastTournament: profile.lastTournament ? { ...profile.lastTournament } : null,

    daily: { ...profile.daily },
    preferences: { ...profile.preferences },

    createdAt: server.createdAt,
    updatedAt: server.updatedAt
  };
}

/**
 * A crude "how much has this player got" score.
 *
 * Used only to decide which of two saves is worth more when a guest account
 * is carried into a cloud account that already has history. XP dominates
 * because it is the thing a player would actually mourn; the rest breaks ties
 * so a save with cups and achievements wins over a bare one at the same XP.
 */
export function progressWeight(profile: PlayerProfile): number {
  const stats = profile.stats;
  return (
    profile.xp * 10 +
    Object.keys(profile.achievements).length * 250 +
    stats.matches * 5 +
    stats.cupsWon * 400 +
    stats.challengesCleared * 200 +
    stats.bestRally * 3
  );
}

/** True when a save has nothing in it worth carrying anywhere. */
export function isBlank(profile: PlayerProfile): boolean {
  return (
    profile.xp === 0 &&
    profile.stats.matches === 0 &&
    profile.stats.endlessRuns === 0 &&
    Object.keys(profile.achievements).length === 0
  );
}
