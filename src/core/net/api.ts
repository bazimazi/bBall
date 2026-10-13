import type { TournamentFormat } from '../tournament/bracket';
/**
 * Every endpoint the game calls, in one typed list.
 *
 * Nothing here has any logic: each function is a path, a method and a shape.
 * Keeping them together means the set of things the client can ask the server
 * for is readable at a glance, and a change to the protocol breaks here
 * rather than in the middle of a screen.
 */

import type {
  AuthResponse,
  ClaimResponse,
  GameConfigResponse,
  LocalSaveDto,
  MatchSubmissionDto,
  MeResponse,
  OAuthClientKind,
  OAuthCompleteResponse,
  OAuthProvidersResponse,
  OAuthStartResponse,
  ProfileMutationResponse,
  RecordMatchResponse,
  RefreshResponse,
  SyncOp,
  SyncPullResponse,
  SyncPushResponse,
  TalentConfigResponse,
  UpdateProfileRequest
} from '../../../shared/protocol';
import { HEADER_DEVICE } from '../../../shared/protocol';
import type { AbilityId, BranchId, TalentId } from '../talents/types';
import type { Equipped } from '../cosmetics/catalog';
import { request } from './client';

export const api = {
  // ------------------------------------------------------------- account
  register(body: {
    email: string;
    password: string;
    displayName?: string;
    claim?: LocalSaveDto;
  }): Promise<AuthResponse> {
    return request('/v1/auth/register', { method: 'POST', body, auth: false, attempts: 1 });
  },

  login(body: { email: string; password: string }): Promise<AuthResponse> {
    return request('/v1/auth/login', { method: 'POST', body, auth: false, attempts: 1 });
  },

  /**
   * Refresh is never retried and never carries an idempotency key: the token
   * rotates on use, so a second attempt with the same token would look like a
   * replay and revoke the session.
   */
  refresh(refreshToken: string | null): Promise<RefreshResponse> {
    return request('/v1/auth/refresh', {
      method: 'POST',
      body: refreshToken ? { refreshToken } : {},
      auth: false,
      attempts: 1,
      idempotencyKey: null
    });
  },

  logout(refreshToken: string | null): Promise<void> {
    return request('/v1/auth/logout', {
      method: 'POST',
      body: refreshToken ? { refreshToken } : {},
      auth: false,
      attempts: 1
    });
  },

  logoutEverywhere(): Promise<{ revoked: number }> {
    return request('/v1/auth/logout-all', { method: 'POST', body: {}, attempts: 1 });
  },

  requestVerification(): Promise<void> {
    return request('/v1/auth/verify-email/request', { method: 'POST', body: {}, attempts: 1 });
  },

  confirmVerification(token: string): Promise<MeResponse> {
    return request('/v1/auth/verify-email/confirm', {
      method: 'POST',
      body: { token },
      auth: false,
      attempts: 1
    });
  },

  forgotPassword(email: string): Promise<void> {
    return request('/v1/auth/password/forgot', {
      method: 'POST',
      body: { email },
      auth: false,
      attempts: 1
    });
  },

  resetPassword(token: string, password: string): Promise<void> {
    return request('/v1/auth/password/reset', {
      method: 'POST',
      body: { token, password },
      auth: false,
      attempts: 1
    });
  },

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return request('/v1/auth/password/change', {
      method: 'POST',
      body: { currentPassword, newPassword },
      attempts: 1
    });
  },

  deleteAccount(password?: string): Promise<void> {
    return request('/v1/me', {
      method: 'DELETE',
      body: password ? { password } : {},
      attempts: 1
    });
  },

  // -------------------------------------------------------- social sign-in
  /**
   * Which providers this deployment offers.
   *
   * Served rather than hard-coded, so a deployment with no Apple credentials
   * simply shows no Apple button.
   */
  oauthProviders(): Promise<OAuthProvidersResponse> {
    return request('/v1/auth/oauth/providers', { auth: false });
  },

  oauthStart(provider: string, client: OAuthClientKind = 'web'): Promise<OAuthStartResponse> {
    return request(`/v1/auth/oauth/${encodeURIComponent(provider)}/start`, {
      method: 'POST',
      body: { client },
      auth: false,
      attempts: 1
    });
  },

  /**
   * Exchange the one-time handoff code for a session.
   *
   * Never retried: the code is single use, so a second attempt would fail
   * anyway and would only turn a successful sign-in into an error message.
   */
  oauthComplete(code: string, claim?: LocalSaveDto): Promise<OAuthCompleteResponse> {
    return request('/v1/auth/oauth/complete', {
      method: 'POST',
      body: claim ? { code, claim } : { code },
      auth: false,
      attempts: 1,
      idempotencyKey: null
    });
  },

  me(): Promise<MeResponse> {
    return request('/v1/me');
  },

  // ------------------------------------------------------------- profile
  updateProfile(patch: UpdateProfileRequest): Promise<ProfileMutationResponse> {
    return request('/v1/profile', { method: 'PATCH', body: patch });
  },

  // --------------------------------------------------------- progression
  recordMatch(submission: MatchSubmissionDto): Promise<RecordMatchResponse> {
    return request('/v1/progression/match', {
      method: 'POST',
      body: submission,
      // The submission's own clientMatchId is the durable key, so it doubles
      // as the idempotency key and survives a client restart mid-retry.
      idempotencyKey: `match:${submission.clientMatchId}`
    });
  },

  purchaseTalent(talentId: TalentId, expectedRank: number): Promise<ProfileMutationResponse> {
    return request('/v1/progression/talents/purchase', {
      method: 'POST',
      body: { talentId, expectedRank }
    });
  },

  respec(branch?: BranchId): Promise<ProfileMutationResponse> {
    return request('/v1/progression/talents/respec', {
      method: 'POST',
      body: branch ? { branch } : {}
    });
  },

  equipAbility(slot: number, abilityId: AbilityId | null): Promise<ProfileMutationResponse> {
    return request('/v1/progression/abilities/equip', {
      method: 'POST',
      body: { slot, abilityId }
    });
  },

  equipCosmetic(slot: keyof Equipped, cosmeticId: string): Promise<ProfileMutationResponse> {
    return request('/v1/progression/cosmetics/equip', {
      method: 'POST',
      body: { slot, cosmeticId }
    });
  },

  startTournament(tier: number, format?: TournamentFormat): Promise<ProfileMutationResponse> {
    return request('/v1/progression/tournament/start', {
      method: 'POST',
      body: { tier, ...(format ? { format } : {}) }
    });
  },

  abandonTournament(): Promise<ProfileMutationResponse> {
    return request('/v1/progression/tournament/abandon', { method: 'POST', body: {} });
  },

  claimRewards(): Promise<{
    profile: ProfileMutationResponse['profile'];
    achievements: string[];
    unlocks: string[];
  }> {
    return request('/v1/progression/claim', { method: 'POST', body: {} });
  },

  // ---------------------------------------------------------------- sync
  pull(deviceId: string): Promise<SyncPullResponse> {
    return request('/v1/sync/pull', { headers: { [HEADER_DEVICE]: deviceId } });
  },

  /**
   * Drain part of the outbox.
   *
   * The idempotency key is the request's own, generated once and shared by
   * that request's retries, so a lost response is answered from the stored
   * copy. A later flush is a new request with a new key even when it carries
   * the same operations: the server de-duplicates those by `opId` already,
   * and a replayed response would hide an operation it had asked to see again.
   */
  push(baseVersion: number, ops: readonly SyncOp[], deviceId: string): Promise<SyncPushResponse> {
    return request('/v1/sync/push', {
      method: 'POST',
      body: { baseVersion, ops },
      headers: { [HEADER_DEVICE]: deviceId }
    });
  },

  claim(save: LocalSaveDto): Promise<ClaimResponse> {
    return request('/v1/sync/claim', {
      method: 'POST',
      body: { save },
      idempotencyKey: `claim:${save.saveId}`
    });
  },

  // -------------------------------------------------------------- config
  config(): Promise<GameConfigResponse> {
    return request('/v1/config', { auth: false });
  },

  talentConfig(): Promise<TalentConfigResponse> {
    return request('/v1/config/talents', { auth: false });
  }
};
