/**
 * Server-authoritative progression.
 *
 * Every function here follows the same shape: open one transaction, load the
 * profile, run the *shared* pure domain function, write the result back under
 * an optimistic version guard, and record what happened in the audit log.
 * Because the transaction is IMMEDIATE, a read-modify-write cannot interleave
 * with another one - two devices finishing a match at the same instant are
 * serialised by the database rather than by hope.
 *
 * What the client is allowed to say is deliberately small: which talent it
 * wants, which slot, which match it played. It never says how much XP that is
 * worth, what level it reached, how many points it has, or what it unlocked.
 * Those come out of `applyMatchResult`, `buyTalent` and `reconcile`, which is
 * the same code the client runs locally for its optimistic preview - so an
 * honest client's preview matches, and a dishonest one's simply does not
 * count.
 */

import type { MatchResult } from '../../../src/core/modes/types';
import { grantAchievements, syncUnlocks } from '../../../src/core/progression/apply';
import { applyMatchResult } from '../../../src/core/progression/apply';
import { levelOf } from '../../../src/core/progression/levels';
import { cleanName } from '../../../src/core/profile/defaults';
import type { AvatarId, PlayerProfile } from '../../../src/core/profile/types';
import { AVATARS } from '../../../src/core/profile/types';
import {
  buyTalent,
  cloneTalentSave,
  equipAbility,
  respec,
  respecBranch
} from '../../../src/core/talents/save';
import { talentById } from '../../../src/core/talents/catalog';
import type { AbilityId, BranchId, TalentId } from '../../../src/core/talents/types';
import { cosmeticById, EQUIP_SLOTS, type Equipped } from '../../../src/core/cosmetics/catalog';
import { isBotLevelId } from '../../../src/core/bots/levels';
import type { BotLevelId } from '../../../src/core/bots/types';
import {
  createTournament,
  tierById,
  TOURNAMENT_TIERS,
  type TournamentSave
} from '../../../src/core/tournament/bracket';
import type {
  MatchSubmissionDto,
  ProgressionSummaryDto,
  UpdateProfileRequest
} from '../../../shared/protocol';
import { transaction } from '../db/index';
import { conflict, notFound, rejected, versionConflict } from '../domain/errors';
import { validateMatch } from '../domain/matchValidation';
import { LIMITS } from '../domain/matchValidation';
import { toCloudProfile, withProfile, type ServerProfile } from '../domain/profile';
import {
  activeTournamentId,
  foldModeStats,
  loadProfile,
  ProfileVersionConflict,
  saveProfile
} from '../repositories/profiles';
import {
  findAppliedOp,
  findMatchByClientId,
  insertMatch,
  logProgressionEvent,
  markOpApplied,
  playedSecondsSince
} from '../repositories/progression';
import type { ServiceContext } from './context';

export interface MatchOutcome {
  readonly profile: ServerProfile;
  readonly summary: ProgressionSummaryDto;
  readonly duplicate: boolean;
}

const EMPTY_SUMMARY = (profile: PlayerProfile): ProgressionSummaryDto => ({
  xpBefore: profile.xp,
  xpAfter: profile.xp,
  xpAwarded: 0,
  lines: [],
  multiplier: 1,
  talentMultiplier: 1,
  damped: false,
  levelBefore: levelOf(profile.xp),
  levelAfter: levelOf(profile.xp),
  levelsGained: 0,
  talentPointsGranted: 0,
  talentPointsAvailable: profile.talents.points,
  achievements: [],
  unlocks: [],
  newBestRally: false,
  challengeCleared: false,
  cupWon: false,
  tournament: null
});

/** The op id a direct match submission is recorded under. */
export const matchOpId = (clientMatchId: string): string => `match:${clientMatchId}`;

function requireProfile(context: ServiceContext, userId: string): ServerProfile {
  const profile = loadProfile(context.db, userId);
  if (!profile) throw notFound('No profile for this account.');
  return profile;
}

/**
 * Record a finished match.
 *
 * Idempotent on `clientMatchId`: a retried submission returns the summary the
 * first one produced rather than a second helping of XP. That matters more
 * than it sounds - the offline queue retries by design, and a dropped
 * response is indistinguishable from a dropped request.
 */
export function recordMatch(
  context: ServiceContext,
  userId: string,
  submission: MatchSubmissionDto
): MatchOutcome {
  const opId = matchOpId(submission.clientMatchId);

  return transaction(context.db, () => {
    const existingOp = findAppliedOp(context.db, userId, opId);
    if (existingOp) {
      const server = requireProfile(context, userId);
      let summary: ProgressionSummaryDto;
      try {
        summary = JSON.parse(existingOp.result_json) as ProgressionSummaryDto;
      } catch {
        summary = EMPTY_SUMMARY(server.profile);
      }
      return { profile: server, summary, duplicate: true };
    }

    // The unique index on (user_id, client_match_id) is the real guard; this
    // catches the case where the op log and the match log disagree.
    if (findMatchByClientId(context.db, userId, submission.clientMatchId)) {
      const server = requireProfile(context, userId);
      return { profile: server, summary: EMPTY_SUMMARY(server.profile), duplicate: true };
    }

    const server = requireProfile(context, userId);
    const now = context.now();

    const verdict = validateMatch(submission, {
      profile: server.profile,
      recentPlaySeconds: playedSecondsSince(context.db, userId, now - LIMITS.playBudgetWindowMs),
      now
    });

    if (!verdict.ok) {
      // Rejections are logged with the reason so a pattern is visible, but the
      // player is told something plain and the transaction leaves no trace.
      context.log.warn(
        { userId, code: verdict.code, mode: submission.mode },
        'progression: match rejected'
      );
      throw rejected(verdict.reason, { internal: verdict.code });
    }

    const result: MatchResult = verdict.result;
    const tournamentId =
      result.mode === 'tournament' ? activeTournamentId(context.db, userId) : null;

    const applied = applyMatchResult(server.profile, result);
    const summary = toSummary(applied);

    const modeStats = foldModeStats(server.modeStats, result.mode, {
      won: result.won,
      counts: result.ranked && !result.abandoned,
      scoreYou: result.scoreYou,
      scoreBot: result.scoreBot,
      bestRally: result.bestRally,
      seconds: result.seconds,
      xp: applied.award.total
    });

    const next = saveProfile(
      context.db,
      withProfile(server, applied.profile, modeStats),
      now,
      server.version
    );

    insertMatch(
      context.db,
      {
        userId,
        clientMatchId: submission.clientMatchId,
        mode: result.mode,
        botId: result.botId,
        ranked: result.ranked,
        won: result.won,
        scoreYou: result.scoreYou,
        scoreBot: result.scoreBot,
        bestRally: result.bestRally,
        hits: result.hits,
        seconds: result.seconds,
        xpAwarded: applied.award.total,
        challengeId: result.challengeId ?? null,
        tournamentId,
        objectiveMet: result.objectiveMet,
        playedAt: submission.playedAt
      },
      now
    );

    logProgressionEvent(
      context.db,
      {
        userId,
        kind: 'match',
        xpDelta: applied.award.total,
        levelBefore: applied.levelBefore,
        levelAfter: applied.levelAfter,
        detail: {
          clientMatchId: submission.clientMatchId,
          mode: result.mode,
          botId: result.botId,
          won: result.won,
          achievements: summary.achievements,
          notes: verdict.notes
        }
      },
      now
    );

    markOpApplied(context.db, userId, opId, 'match', summary, now);

    return { profile: next, summary, duplicate: false };
  });
}

function toSummary(applied: ReturnType<typeof applyMatchResult>): ProgressionSummaryDto {
  return {
    xpBefore: applied.xpBefore,
    xpAfter: applied.xpAfter,
    xpAwarded: applied.award.total,
    lines: applied.award.lines.map((line) => ({ label: line.label, xp: line.xp })),
    multiplier: applied.award.multiplier,
    talentMultiplier: applied.award.talentMultiplier,
    damped: applied.award.damped,
    levelBefore: applied.levelBefore,
    levelAfter: applied.levelAfter,
    levelsGained: applied.levelsGained,
    talentPointsGranted: applied.talentPoints,
    talentPointsAvailable: applied.talentPointsAvailable,
    achievements: applied.achievements.map((item) => item.id),
    unlocks: applied.unlocks.map((item) => item.id),
    newBestRally: applied.newBestRally,
    challengeCleared: applied.challengeCleared,
    cupWon: applied.cupWon,
    tournament: applied.tournament
  };
}

/**
 * Run a read-modify-write against the profile under one transaction.
 *
 * `baseVersion`, when supplied, is the client's claim about what it was
 * looking at. A mismatch is a real conflict and is reported as one rather
 * than being applied to newer state the player has not seen.
 */
function mutate(
  context: ServiceContext,
  userId: string,
  baseVersion: number | undefined,
  edit: (profile: PlayerProfile, server: ServerProfile) => PlayerProfile
): ServerProfile {
  return transaction(context.db, () => {
    const server = requireProfile(context, userId);
    if (baseVersion !== undefined && baseVersion !== server.version) {
      throw versionConflict(`base=${baseVersion} current=${server.version}`);
    }
    const next = edit(server.profile, server);
    try {
      return saveProfile(context.db, withProfile(server, next), context.now(), server.version);
    } catch (error) {
      if (error instanceof ProfileVersionConflict) throw versionConflict('write raced');
      throw error;
    }
  });
}

// -------------------------------------------------------------- talents

export function purchaseTalent(
  context: ServiceContext,
  userId: string,
  talentId: TalentId,
  expectedRank: number,
  baseVersion?: number
): ServerProfile {
  const talent = talentById(talentId);
  if (!talent) throw notFound('That talent does not exist.');

  const before = { xp: 0, level: 1, rank: 0 };

  const server = mutate(context, userId, baseVersion, (profile) => {
    const level = levelOf(profile.xp);
    const owned = profile.talents.ranks[talentId] ?? 0;

    // The client sends the rank it believes it has. A double-tapped button,
    // or a replayed request, arrives with a stale number and is refused
    // rather than quietly spending a second point.
    if (expectedRank !== owned) {
      throw conflict('That talent is not at the rank you expected.', {
        internal: `expected=${expectedRank} actual=${owned}`
      });
    }

    const next = buyTalent(profile.talents, level, talentId);
    if (!next) {
      throw rejected('You cannot buy that talent yet.', {
        internal: `talent=${talentId} rank=${owned} points=${profile.talents.points}`
      });
    }

    before.xp = profile.xp;
    before.level = level;
    before.rank = owned;
    return { ...profile, talents: next };
  });

  logProgressionEvent(
    context.db,
    {
      userId,
      kind: 'talent.purchase',
      levelBefore: before.level,
      levelAfter: before.level,
      detail: { talentId, from: before.rank, to: before.rank + 1 }
    },
    context.now()
  );
  return server;
}

export function respecTalents(
  context: ServiceContext,
  userId: string,
  branch?: BranchId,
  baseVersion?: number
): ServerProfile {
  const server = mutate(context, userId, baseVersion, (profile) => {
    const level = levelOf(profile.xp);
    const next = branch
      ? respecBranch(profile.talents, level, branch)
      : respec(profile.talents, level);
    return { ...profile, talents: next };
  });

  logProgressionEvent(
    context.db,
    { userId, kind: 'talent.respec', detail: { branch: branch ?? 'all' } },
    context.now()
  );
  return server;
}

export function equipAbilitySlot(
  context: ServiceContext,
  userId: string,
  slot: number,
  abilityId: AbilityId | null,
  baseVersion?: number
): ServerProfile {
  return mutate(context, userId, baseVersion, (profile) => {
    const level = levelOf(profile.xp);
    const next = equipAbility(profile.talents, level, slot, abilityId);
    if (!next) {
      throw rejected('That skill cannot go in that slot.', {
        internal: `slot=${slot} ability=${abilityId ?? 'null'}`
      });
    }
    return { ...profile, talents: next };
  });
}

// ------------------------------------------------------------ cosmetics

export function equipCosmetic(
  context: ServiceContext,
  userId: string,
  slot: keyof Equipped,
  cosmeticId: string,
  baseVersion?: number
): ServerProfile {
  return mutate(context, userId, baseVersion, (profile) => {
    const cosmetic = cosmeticById(cosmeticId);
    if (!cosmetic || cosmetic.kind !== slot) {
      throw rejected('That item does not go in that slot.');
    }
    // Ownership is the whole check: unlocks are granted by the server, so a
    // client cannot equip its way into one.
    if (!profile.unlocks.includes(cosmeticId)) {
      throw rejected('You have not unlocked that yet.', { internal: `cosmetic=${cosmeticId}` });
    }
    return { ...profile, equipped: { ...profile.equipped, [slot]: cosmeticId } };
  });
}

// -------------------------------------------------------------- profile

export function updateProfile(
  context: ServiceContext,
  userId: string,
  patch: UpdateProfileRequest
): ServerProfile {
  return mutate(context, userId, patch.baseVersion, (profile) => {
    const next: PlayerProfile = {
      ...profile,
      equipped: { ...profile.equipped },
      preferences: { ...profile.preferences }
    };

    if (patch.displayName !== undefined) next.name = cleanName(patch.displayName);
    if (patch.avatar !== undefined) {
      if (!AVATARS.includes(patch.avatar as AvatarId))
        throw rejected('That avatar does not exist.');
      next.avatar = patch.avatar;
    }

    if (patch.equipped) {
      for (const slot of EQUIP_SLOTS) {
        const id = patch.equipped[slot];
        if (id === undefined) continue;
        const cosmetic = cosmeticById(id);
        if (!cosmetic || cosmetic.kind !== slot)
          throw rejected('That item does not go in that slot.');
        if (!profile.unlocks.includes(id)) throw rejected('You have not unlocked that yet.');
        next.equipped[slot] = id;
      }
    }

    if (patch.preferences) {
      const wanted: [keyof PlayerProfile['preferences'], BotLevelId | undefined][] = [
        ['lastBot', patch.preferences.lastBot],
        ['lastPracticeBot', patch.preferences.lastPracticeBot]
      ];
      for (const [key, value] of wanted) {
        if (value === undefined) continue;
        if (!isBotLevelId(value)) throw rejected('That opponent does not exist.');
        next.preferences[key] = value;
      }
    }

    return next;
  });
}

// ----------------------------------------------------------- tournament

export function startTournament(
  context: ServiceContext,
  userId: string,
  tier: number,
  baseVersion?: number
): ServerProfile {
  return mutate(context, userId, baseVersion, (profile) => {
    if (profile.tournament) throw conflict('You already have a cup in progress.');
    if (!Number.isInteger(tier) || tier < 0 || tier >= TOURNAMENT_TIERS.length) {
      throw rejected('That cup does not exist.');
    }
    // Tier gating is progression, so the server owns it.
    const level = levelOf(profile.xp);
    if (level < tierById(tier).minLevel) {
      throw rejected('That cup is not unlocked yet.', { internal: `level=${level} tier=${tier}` });
    }

    const save: TournamentSave = createTournament(tier, context.now());
    return {
      ...profile,
      tournament: save,
      stats: { ...profile.stats, cupsPlayed: profile.stats.cupsPlayed + 1 }
    };
  });
}

export function abandonTournament(
  context: ServiceContext,
  userId: string,
  baseVersion?: number
): ServerProfile {
  return mutate(context, userId, baseVersion, (profile) => {
    const current = profile.tournament;
    if (!current) return profile;
    return {
      ...profile,
      tournament: null,
      lastTournament: { ...current, finished: true, champion: false }
    };
  });
}

// ---------------------------------------------------- rewards and sweeps

export interface ClaimResult {
  readonly profile: ServerProfile;
  readonly achievements: readonly string[];
  readonly unlocks: readonly string[];
}

/**
 * Grant anything the player already qualifies for but has not been given.
 *
 * Achievements are awarded automatically when a match is recorded, so this is
 * a reconciliation pass rather than a reward shop: it matters after a guest
 * save is carried into an account, after a catalogue change adds a new
 * achievement, and as a safety net if a match was recorded while a rule was
 * mid-deploy. Running it twice grants nothing twice - `grantAchievements`
 * skips anything already recorded.
 */
export function claimRewards(context: ServiceContext, userId: string): ClaimResult {
  let achievements: string[] = [];
  let unlocks: string[] = [];

  const server = mutate(context, userId, undefined, (profile) => {
    const next: PlayerProfile = {
      ...profile,
      stats: { ...profile.stats, winsByBot: { ...profile.stats.winsByBot } },
      talents: cloneTalentSave(profile.talents),
      achievements: { ...profile.achievements },
      unlocks: [...profile.unlocks]
    };
    achievements = grantAchievements(next, null).map((item) => item.id);
    unlocks = syncUnlocks(next).map((item) => item.id);
    return next;
  });

  if (achievements.length > 0 || unlocks.length > 0) {
    logProgressionEvent(
      context.db,
      { userId, kind: 'claim', detail: { achievements, unlocks } },
      context.now()
    );
  }
  return { profile: server, achievements, unlocks };
}

/** Convenience for routes: the aggregate as the wire sees it. */
export const asCloudProfile = toCloudProfile;
