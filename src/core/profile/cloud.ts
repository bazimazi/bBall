/**
 * Translating between the cloud profile and the local one.
 *
 * The two shapes were designed to be the same on purpose, so this is a
 * mapping rather than a conversion - but it still goes through
 * `validateProfile` on the way in. The server is trusted to be *correct*, not
 * to be the version of the server this build was written against: a payload
 * from a newer release may carry a talent, cosmetic or achievement this
 * client has never heard of, and the repair pass drops those quietly instead
 * of leaving the tree in a state the UI cannot draw.
 */

import type { CloudProfileDto, LocalSaveDto } from '../../../shared/protocol';
import { createProfile } from './defaults';
import { PROFILE_VERSION, validateProfile } from './schema';
import type { PlayerProfile } from './types';

export interface CloudMeta {
  readonly userId: string;
  /** Optimistic concurrency token, sent back with queued operations. */
  readonly version: number;
  /** Identifies the save lineage; a change means the cache is for a dead save. */
  readonly saveId: string;
  readonly updatedAt: number;
}

export function cloudToProfile(dto: CloudProfileDto): PlayerProfile {
  const repaired = validateProfile({
    id: dto.userId,
    name: dto.displayName,
    avatar: dto.avatar,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    onboarded: true,
    xp: dto.xp,
    stats: dto.stats,
    talents: dto.talents,
    achievements: dto.achievements,
    unlocks: dto.unlocks,
    equipped: dto.equipped,
    challenges: dto.challenges,
    tournament: dto.tournament,
    lastTournament: dto.lastTournament,
    daily: dto.daily,
    preferences: dto.preferences
  });
  return repaired ?? createProfile(dto.createdAt);
}

export function cloudMetaOf(dto: CloudProfileDto): CloudMeta {
  return {
    userId: dto.userId,
    version: dto.version,
    saveId: dto.saveId,
    updatedAt: dto.updatedAt
  };
}

/**
 * Package a local profile for the server.
 *
 * The profile is sent as-is rather than pre-trimmed: the server runs its own
 * validation and clamping over it, and a client that trimmed first would only
 * be able to make the claim smaller, never larger.
 */
export function toLocalSave(profile: PlayerProfile): LocalSaveDto {
  return {
    schemaVersion: PROFILE_VERSION,
    saveId: profile.id,
    updatedAt: profile.updatedAt,
    profile
  };
}
