/**
 * Local and cloud, reconciled.
 *
 * Three situations, three behaviours:
 *
 * **Guest becomes account.** {@link claimLocalSave} imports a local save once,
 * through {@link sanitizeClaim}, and merges it with whatever the account
 * already had. Nothing is ever subtracted, and the save id is recorded so the
 * same save cannot be claimed twice.
 *
 * **Signed in and online.** The server is authoritative. The client holds a
 * cache; {@link pullProfile} refreshes it.
 *
 * **Signed in and offline.** The client keeps playing against its cache and
 * queues what it did. {@link pushOperations} drains that queue. Every
 * operation carries a client-generated id and is applied at most once, so a
 * queue flushed twice - which is the normal case when a response is lost -
 * produces the same profile as one flushed once.
 *
 * A failing operation does not fail the batch. A queue built offline will
 * legitimately contain operations that are no longer valid (a talent bought
 * twice on two devices, a cup abandoned elsewhere), and refusing the whole
 * push because of one of them would strand the rest forever. Each operation
 * gets its own verdict and the client reconciles from the profile that comes
 * back.
 */

import { syncUnlocks } from '../../../src/core/progression/apply';
import { grantAchievements } from '../../../src/core/progression/apply';
import { levelOf } from '../../../src/core/progression/levels';
import type { PlayerProfile } from '../../../src/core/profile/types';
import type {
  ClaimOutcome,
  ClaimOutcomeDto,
  LocalSaveDto,
  SyncOp,
  SyncOpResult,
  SyncPushResponse
} from '../../../shared/protocol';
import { transaction } from '../db/index';
import { AppError, isAppError, notFound } from '../domain/errors';
import { mergeProfiles, sanitizeClaim } from '../domain/claim';
import { isBlank, toCloudProfile, withProfile, type ServerProfile } from '../domain/profile';
import { loadProfile, saveProfile } from '../repositories/profiles';
import {
  findAppliedOp,
  findClaimedSave,
  logProgressionEvent,
  markOpApplied,
  recordClaimedSave,
  touchSyncState
} from '../repositories/progression';
import type { ServiceContext } from './context';
import {
  abandonTournament,
  equipAbilitySlot,
  equipCosmetic,
  purchaseTalent,
  recordMatch,
  respecTalents,
  startTournament,
  updateProfile
} from './progression';

export interface ClaimResultInternal {
  readonly profile: ServerProfile;
  readonly claim: ClaimOutcomeDto;
}

function requireProfile(context: ServiceContext, userId: string): ServerProfile {
  const profile = loadProfile(context.db, userId);
  if (!profile) throw notFound('No profile for this account.');
  return profile;
}

export function pullProfile(
  context: ServiceContext,
  userId: string,
  deviceId?: string
): ServerProfile {
  const server = requireProfile(context, userId);
  if (deviceId) {
    touchSyncState(
      context.db,
      userId,
      deviceId,
      { pulled: true, version: server.version },
      context.now()
    );
  }
  return server;
}

/**
 * Import a guest save into an account.
 *
 * Idempotent on the save's own id: pressing "bring my progress over" twice,
 * or retrying after a dropped response, reports what happened the first time
 * instead of merging again.
 */
export function claimLocalSave(
  context: ServiceContext,
  userId: string,
  save: LocalSaveDto
): ClaimResultInternal {
  return transaction(context.db, () => {
    const server = requireProfile(context, userId);
    const now = context.now();

    const already = findClaimedSave(context.db, userId, save.saveId);
    if (already) {
      return {
        profile: server,
        claim: {
          outcome: 'already-claimed' as ClaimOutcome,
          notes: ['This save has already been added to your account.'],
          xpBefore: already.xp_before,
          xpAfter: already.xp_after
        }
      };
    }

    const sanitized = sanitizeClaim(save.profile);
    if (!sanitized || isBlank(sanitized.profile)) {
      recordClaimedSave(
        context.db,
        {
          user_id: userId,
          save_id: save.saveId,
          outcome: 'rejected',
          xp_before: server.profile.xp,
          xp_after: server.profile.xp
        },
        now
      );
      return {
        profile: server,
        claim: {
          outcome: 'rejected' as ClaimOutcome,
          notes: sanitized
            ? ['That save had no progress to bring over.']
            : ['That save could not be read.'],
          xpBefore: server.profile.xp,
          xpAfter: server.profile.xp
        }
      };
    }

    const xpBefore = server.profile.xp;
    const cloudBlank = isBlank(server.profile);
    const notes = [...sanitized.notes];

    let merged: PlayerProfile;
    let outcome: ClaimOutcome;

    if (cloudBlank) {
      outcome = 'adopted';
      // The account is empty, so the save becomes it - keeping the account's
      // own identity, which the player just chose during sign-up.
      merged = {
        ...sanitized.profile,
        id: server.profile.id,
        name: server.profile.name,
        avatar: server.profile.avatar,
        onboarded: true,
        createdAt: server.profile.createdAt
      };
      notes.push('Your guest progress is now on your account.');
    } else {
      merged = mergeProfiles(server.profile, sanitized.profile);
      const moved = merged.xp > xpBefore || progressMoved(server.profile, merged);
      outcome = moved ? 'merged' : 'kept-cloud';
      notes.push(
        moved
          ? 'Your guest progress was merged with what was already on the account.'
          : 'Your account already had everything from that save.'
      );
    }

    // Achievements and cosmetics are re-derived from the merged state rather
    // than carried across, so nothing arrives that has not been earned.
    grantAchievements(merged, null);
    syncUnlocks(merged);
    merged.updatedAt = now;

    const saved = saveProfile(
      context.db,
      withProfile(server, merged, server.modeStats),
      now,
      server.version
    );

    recordClaimedSave(
      context.db,
      {
        user_id: userId,
        save_id: save.saveId,
        outcome,
        xp_before: xpBefore,
        xp_after: merged.xp
      },
      now
    );

    logProgressionEvent(
      context.db,
      {
        userId,
        kind: 'claim',
        xpDelta: merged.xp - xpBefore,
        levelBefore: levelOf(xpBefore),
        levelAfter: levelOf(merged.xp),
        detail: {
          saveId: save.saveId,
          outcome,
          claimedXp: sanitized.claimedXp,
          keptXp: sanitized.profile.xp
        }
      },
      now
    );

    return {
      profile: saved,
      claim: { outcome, notes, xpBefore, xpAfter: merged.xp }
    };
  });
}

function progressMoved(before: PlayerProfile, after: PlayerProfile): boolean {
  return (
    after.stats.matches > before.stats.matches ||
    after.stats.bestRally > before.stats.bestRally ||
    Object.keys(after.achievements).length > Object.keys(before.achievements).length ||
    after.stats.cupsWon > before.stats.cupsWon ||
    after.stats.challengesCleared > before.stats.challengesCleared
  );
}

// ----------------------------------------------------------------- push

function applyOne(context: ServiceContext, userId: string, op: SyncOp): SyncOpResult {
  const now = context.now();

  // The op log is checked before the work, so a replay is cheap as well as
  // harmless. `recordMatch` keeps its own record under the same key, which is
  // why a match op is allowed through to it rather than short-circuiting here.
  if (op.kind !== 'match') {
    const seen = findAppliedOp(context.db, userId, op.opId);
    if (seen) return { opId: op.opId, kind: op.kind, status: 'duplicate' };
  }

  try {
    switch (op.kind) {
      case 'match': {
        const outcome = recordMatch(context, userId, op.payload);
        return {
          opId: op.opId,
          kind: op.kind,
          status: outcome.duplicate ? 'duplicate' : 'applied',
          summary: outcome.summary
        };
      }
      case 'talent.purchase':
        purchaseTalent(context, userId, op.payload.talentId, op.payload.expectedRank);
        break;
      case 'talent.respec':
        respecTalents(context, userId, op.payload.branch);
        break;
      case 'ability.equip':
        equipAbilitySlot(context, userId, op.payload.slot, op.payload.abilityId);
        break;
      case 'cosmetic.equip':
        equipCosmetic(context, userId, op.payload.slot, op.payload.cosmeticId);
        break;
      case 'profile.update':
        updateProfile(context, userId, {
          ...(op.payload.displayName !== undefined ? { displayName: op.payload.displayName } : {}),
          ...(op.payload.avatar !== undefined ? { avatar: op.payload.avatar } : {})
        });
        break;
      case 'preferences.update':
        updateProfile(context, userId, { preferences: op.payload });
        break;
      case 'tournament.start':
        startTournament(context, userId, op.payload.tier);
        break;
      case 'tournament.abandon':
        abandonTournament(context, userId);
        break;
    }

    markOpApplied(context.db, userId, op.opId, op.kind, {}, now);
    return { opId: op.opId, kind: op.kind, status: 'applied' };
  } catch (error) {
    if (isAppError(error)) {
      // A rejected operation is still *resolved*: recording it stops the
      // client retrying something that will never succeed. A conflict is not
      // recorded, because it may well succeed on the next attempt.
      if (error.code === 'REJECTED' || error.code === 'NOT_FOUND') {
        markOpApplied(context.db, userId, op.opId, op.kind, { rejected: error.code }, now);
      }
      return {
        opId: op.opId,
        kind: op.kind,
        status: 'rejected',
        reason: error.message,
        code: error.code
      };
    }
    throw error;
  }
}

/**
 * Drain a client's queue.
 *
 * Operations are applied in order, each in its own transaction. That is
 * deliberate: one atomic batch would mean a single stale operation discarding
 * every match the player finished while offline.
 */
export function pushOperations(
  context: ServiceContext,
  userId: string,
  baseVersion: number,
  ops: readonly SyncOp[],
  deviceId?: string
): SyncPushResponse {
  const start = requireProfile(context, userId);
  const diverged = baseVersion > 0 && baseVersion !== start.version;

  const results: SyncOpResult[] = [];
  for (const op of ops) {
    try {
      results.push(applyOne(context, userId, op));
    } catch (error) {
      // An unexpected failure stops this operation, not the batch: the rest of
      // the queue is still worth applying, and the client will retry this one.
      context.log.error(
        { userId, opId: op.opId, kind: op.kind, err: error },
        'sync: operation failed'
      );
      results.push({
        opId: op.opId,
        kind: op.kind,
        status: 'rejected',
        reason: 'That change could not be applied.',
        code: 'INTERNAL'
      });
    }
  }

  const finished = requireProfile(context, userId);
  if (deviceId) {
    touchSyncState(
      context.db,
      userId,
      deviceId,
      { pushed: true, version: finished.version },
      context.now()
    );
  }

  return { profile: toCloudProfile(finished), results, diverged };
}

/** Re-exported so routes do not have to reach into the error module. */
export { AppError };
