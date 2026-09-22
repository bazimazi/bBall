/**
 * The wire contract between the bBall client and the bBall server.
 *
 * This file is shared source: the client imports it directly and so does the
 * server, so a change to a payload shape breaks the build on both sides at
 * once rather than at runtime in front of a player.
 *
 * It contains types and constants only - no validation, no dependencies.
 * The server re-declares every request body as a zod schema (it must never
 * trust a shape just because a type exists); the client uses these types to
 * build requests and read responses.
 */

import type { BotLevelId } from '../src/core/bots/types';
import type { Equipped } from '../src/core/cosmetics/catalog';
import type { ModeId } from '../src/core/modes/types';
import type { AvatarId, ChallengeRecord, LifetimeStats } from '../src/core/profile/types';
import type { AbilityId, BranchId, TalentId, TalentStats } from '../src/core/talents/types';
import type { TournamentSave } from '../src/core/tournament/bracket';

export const API_PREFIX = '/v1';

/** Bumped when the wire shape changes in a way old clients cannot read. */
export const PROTOCOL_VERSION = 1;

/** Header carrying the caller's protocol version, for future negotiation. */
export const HEADER_PROTOCOL = 'x-bball-protocol';
/** Header carrying a client-generated idempotency key on unsafe requests. */
export const HEADER_IDEMPOTENCY = 'idempotency-key';
/** Header echoed on every response so a player can quote it in a report. */
export const HEADER_REQUEST_ID = 'x-request-id';

// --------------------------------------------------------------- errors

/**
 * Stable, machine-readable failure codes.
 *
 * Authentication deliberately collapses "no such email" and "wrong password"
 * into INVALID_CREDENTIALS so the API cannot be used to enumerate accounts.
 */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VERSION_CONFLICT',
  'EMAIL_IN_USE',
  'EMAIL_NOT_VERIFIED',
  'INVALID_TOKEN',
  'RATE_LIMITED',
  'PAYLOAD_TOO_LARGE',
  'REJECTED',
  'INTERNAL'
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorDetail {
  readonly path: string;
  readonly message: string;
}

export interface ApiErrorBody {
  readonly error: {
    readonly code: ErrorCode;
    /** Safe to show a player. Never contains internal detail. */
    readonly message: string;
    /** Field-level validation detail, when the code is VALIDATION_FAILED. */
    readonly details?: readonly ApiErrorDetail[] | undefined;
    readonly requestId: string;
    /** Seconds to wait, when the code is RATE_LIMITED. */
    readonly retryAfter?: number | undefined;
  };
}

// ---------------------------------------------------------------- auth

export interface UserDto {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly createdAt: number;
  /** Identity providers linked to this account. 'password' is always one. */
  readonly providers: readonly string[];
}

export interface TokensDto {
  readonly accessToken: string;
  /** Epoch ms. The client refreshes shortly before this. */
  readonly accessExpiresAt: number;
  /**
   * Opaque, single-use. Also set as an httpOnly cookie when the caller can
   * use one; returned here for clients that cannot.
   */
  readonly refreshToken: string;
  readonly refreshExpiresAt: number;
}

export interface RegisterRequest {
  readonly email: string;
  readonly password: string;
  readonly displayName?: string | undefined;
  /**
   * A guest save to adopt into the new account, when the player chose to
   * carry their progress over. Validated and re-derived server-side.
   */
  readonly claim?: LocalSaveDto | undefined;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface AuthResponse {
  readonly user: UserDto;
  readonly tokens: TokensDto;
  readonly profile: CloudProfileDto;
  /** Present when a claim was supplied with the request. */
  readonly claim?: ClaimOutcomeDto | undefined;
}

export interface RefreshRequest {
  /** Omitted when the refresh cookie is being used. */
  readonly refreshToken?: string | undefined;
}

export interface RefreshResponse {
  readonly tokens: TokensDto;
}

export interface RequestPasswordResetRequest {
  readonly email: string;
}

export interface ResetPasswordRequest {
  readonly token: string;
  readonly password: string;
}

export interface ChangePasswordRequest {
  readonly currentPassword: string;
  readonly newPassword: string;
}

export interface VerifyEmailRequest {
  readonly token: string;
}

export interface DeleteAccountRequest {
  /**
   * Proof of presence, required even for a live session.
   *
   * Omitted only by an account that has no password at all - one created
   * through Google, Apple or another provider and never given one. There is
   * nothing to re-enter in that case, so the live session is the proof.
   */
  readonly password?: string | undefined;
}

// ------------------------------------------------------- social sign-in

/**
 * A third-party sign-in method this deployment has configured.
 *
 * The list is served rather than hard-coded in the client, so turning Apple
 * on is an environment change rather than a release: a provider without
 * credentials simply does not appear.
 */
export interface OAuthProviderDto {
  /** Stable id used in URLs: 'google', 'apple', and so on. */
  readonly id: string;
  /** What the button should say, after "Continue with". */
  readonly name: string;
}

export interface OAuthProvidersResponse {
  readonly providers: readonly OAuthProviderDto[];
}

/**
 * Which kind of client is starting the sign-in.
 *
 * It decides one thing only: where the provider's callback sends the player
 * afterwards. A browser is sent back to the game's own URL; a packaged app is
 * sent to its URL scheme, because the round trip happens in the system
 * browser and has to cross back into the app. Both targets are configured on
 * the server, so this is a choice between two known destinations and never an
 * address the client supplies.
 */
export type OAuthClientKind = 'web' | 'native';

export interface OAuthStartRequest {
  readonly client?: OAuthClientKind | undefined;
}

export interface OAuthStartResponse {
  /** Send the browser here. */
  readonly authorizeUrl: string;
  /** Echoed back on the callback; the server checks it, not the client. */
  readonly state: string;
  readonly expiresAt: number;
}

/**
 * Finish a social sign-in.
 *
 * `code` is the one-time handoff code the callback redirected back with -
 * not the provider's own authorization code, which never reaches the game.
 */
export interface OAuthCompleteRequest {
  readonly code: string;
  /** A guest save to adopt, when this sign-in created the account. */
  readonly claim?: LocalSaveDto | undefined;
}

export interface OAuthCompleteResponse extends AuthResponse {
  readonly provider: string;
  /** True when this sign-in created the account rather than matching one. */
  readonly created: boolean;
}

// -------------------------------------------------------------- profile

export interface ModeStatsDto {
  readonly matches: number;
  readonly wins: number;
  readonly losses: number;
  readonly pointsWon: number;
  readonly pointsLost: number;
  readonly bestRally: number;
  readonly playSeconds: number;
  readonly xpEarned: number;
}

export interface TalentBuildDto {
  readonly ranks: Partial<Record<TalentId, number>>;
  readonly equipped: readonly (AbilityId | null)[];
  readonly stats: TalentStats;
}

/**
 * The server's authoritative view of a player.
 *
 * Deliberately shaped like the client's `PlayerProfile` so the cache layer is
 * a field-for-field mapping rather than a translation, with three additions
 * the cloud needs: `version` for optimistic concurrency, `saveId` to detect a
 * save lineage change, and per-mode statistics.
 */
export interface CloudProfileDto {
  readonly userId: string;
  /** Increments on every accepted write. Sent back with every mutation. */
  readonly version: number;
  /** Stable id of this save lineage. Changes only on a full reset. */
  readonly saveId: string;

  readonly displayName: string;
  readonly avatar: AvatarId;

  readonly xp: number;
  /** Derived from xp by the server. Never accepted from a client. */
  readonly level: number;
  /** Unspent points. Derived from level and spend. Never client-supplied. */
  readonly talentPoints: number;

  readonly talents: TalentBuildDto;
  readonly achievements: Record<string, number>;
  readonly unlocks: readonly string[];
  readonly equipped: Equipped;

  readonly stats: LifetimeStats;
  readonly modeStats: Partial<Record<ModeId, ModeStatsDto>>;
  readonly challenges: Record<string, ChallengeRecord>;

  readonly tournament: TournamentSave | null;
  readonly lastTournament: TournamentSave | null;

  readonly daily: { readonly day: string; readonly matches: number };
  readonly preferences: {
    readonly lastBot: BotLevelId;
    readonly lastPracticeBot: BotLevelId;
  };

  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface MeResponse {
  readonly user: UserDto;
  readonly profile: CloudProfileDto;
}

export interface UpdateProfileRequest {
  readonly displayName?: string | undefined;
  readonly avatar?: AvatarId | undefined;
  /** Cosmetic slots to equip. Rejected for anything not owned. */
  readonly equipped?: { readonly [K in keyof Equipped]?: string | undefined } | undefined;
  readonly preferences?:
    | {
        readonly lastBot?: BotLevelId | undefined;
        readonly lastPracticeBot?: BotLevelId | undefined;
      }
    | undefined;
  /** Optimistic lock. Omit to accept the server's current version. */
  readonly baseVersion?: number | undefined;
}

// ---------------------------------------------------------- progression

/**
 * A finished match as reported by the client.
 *
 * Nothing here is taken at face value. XP, levels, points and unlocks are all
 * derived server-side from the mode's own rules; the numbers below are
 * evidence, and implausible evidence is rejected outright.
 */
export interface MatchSubmissionDto {
  /** Client-generated, stable across retries. Replays are ignored. */
  readonly clientMatchId: string;
  readonly mode: ModeId;
  readonly botId: BotLevelId;
  readonly won: boolean;
  readonly scoreYou: number;
  readonly scoreBot: number;
  readonly bestRally: number;
  readonly hits: number;
  /** Wall-clock length of the match. Used for plausibility checks. */
  readonly seconds: number;
  readonly livesLeft: number;
  readonly objectiveMet: boolean;
  readonly shutout: boolean;
  readonly comeback: boolean;
  readonly abandoned: boolean;
  readonly challengeId?: string | undefined;
  readonly tournamentRound?: number | undefined;
  readonly tournamentTier?: number | undefined;
  readonly talent: {
    readonly abilitiesUsed: number;
    readonly powerStrikes: number;
    readonly dashes: number;
    readonly perfectGuards: number;
    readonly crits: number;
    readonly shieldSaves: number;
    readonly secondChances: number;
    readonly ultimates: number;
    readonly bestDrive: number;
  };
  /** Client clock, epoch ms. Advisory only - the server stamps its own. */
  readonly playedAt: number;
}

export interface XpLineDto {
  readonly label: string;
  readonly xp: number;
}

/** What the server actually granted. The client shows this, not its own sum. */
export interface ProgressionSummaryDto {
  readonly xpBefore: number;
  readonly xpAfter: number;
  readonly xpAwarded: number;
  readonly lines: readonly XpLineDto[];
  readonly multiplier: number;
  readonly talentMultiplier: number;
  readonly damped: boolean;
  readonly levelBefore: number;
  readonly levelAfter: number;
  readonly levelsGained: number;
  readonly talentPointsGranted: number;
  readonly talentPointsAvailable: number;
  readonly achievements: readonly string[];
  readonly unlocks: readonly string[];
  readonly newBestRally: boolean;
  readonly challengeCleared: boolean;
  readonly cupWon: boolean;
  readonly tournament: TournamentSave | null;
}

export interface RecordMatchResponse {
  readonly profile: CloudProfileDto;
  readonly summary: ProgressionSummaryDto;
  /** True when this submission had already been recorded. */
  readonly duplicate: boolean;
}

export interface PurchaseTalentRequest {
  readonly talentId: TalentId;
  /** The rank the client believes it owns. Guards against a double tap. */
  readonly expectedRank: number;
  readonly baseVersion?: number | undefined;
}

export interface RespecRequest {
  /** Omit to refund the whole tree. */
  readonly branch?: BranchId | undefined;
  readonly baseVersion?: number | undefined;
}

export interface EquipAbilityRequest {
  readonly slot: number;
  readonly abilityId: AbilityId | null;
  readonly baseVersion?: number | undefined;
}

export interface EquipCosmeticRequest {
  readonly slot: keyof Equipped;
  readonly cosmeticId: string;
  readonly baseVersion?: number | undefined;
}

export interface StartTournamentRequest {
  readonly tier: number;
  readonly baseVersion?: number | undefined;
}

export interface ProfileMutationResponse {
  readonly profile: CloudProfileDto;
}

// ----------------------------------------------------------------- sync

/**
 * A local save offered to the server.
 *
 * The payload is the client's own profile record, exactly as it sits in
 * localStorage. The server runs the client's own validator over it and then
 * re-derives every authoritative number rather than copying one across.
 */
export interface LocalSaveDto {
  /** Schema version of the local record. */
  readonly schemaVersion: number;
  /** Stable id of the local save, so a repeat claim is recognised. */
  readonly saveId: string;
  readonly updatedAt: number;
  /** The raw profile object. Shape is validated, never trusted. */
  readonly profile: unknown;
}

export type ClaimOutcome =
  /** The account had no progress; the local save became the cloud save. */
  | 'adopted'
  /** The account already had progress; the better of the two was kept. */
  | 'merged'
  /** Nothing in the local save beat the cloud save. */
  | 'kept-cloud'
  /** This exact save had already been claimed. */
  | 'already-claimed'
  /** The local save was unreadable or empty. */
  | 'rejected';

export interface ClaimOutcomeDto {
  readonly outcome: ClaimOutcome;
  /** Human-readable lines describing what moved, for the conflict card. */
  readonly notes: readonly string[];
  readonly xpBefore: number;
  readonly xpAfter: number;
}

export interface ClaimRequest {
  readonly save: LocalSaveDto;
}

export interface ClaimResponse {
  readonly profile: CloudProfileDto;
  readonly claim: ClaimOutcomeDto;
}

export type SyncOp =
  | { readonly kind: 'match'; readonly opId: string; readonly payload: MatchSubmissionDto }
  | {
      readonly kind: 'talent.purchase';
      readonly opId: string;
      readonly payload: { readonly talentId: TalentId; readonly expectedRank: number };
    }
  | {
      readonly kind: 'talent.respec';
      readonly opId: string;
      readonly payload: { readonly branch?: BranchId | undefined };
    }
  | {
      readonly kind: 'ability.equip';
      readonly opId: string;
      readonly payload: { readonly slot: number; readonly abilityId: AbilityId | null };
    }
  | {
      readonly kind: 'cosmetic.equip';
      readonly opId: string;
      readonly payload: { readonly slot: keyof Equipped; readonly cosmeticId: string };
    }
  | {
      readonly kind: 'profile.update';
      readonly opId: string;
      readonly payload: {
        readonly displayName?: string | undefined;
        readonly avatar?: AvatarId | undefined;
      };
    }
  | {
      readonly kind: 'preferences.update';
      readonly opId: string;
      readonly payload: {
        readonly lastBot?: BotLevelId | undefined;
        readonly lastPracticeBot?: BotLevelId | undefined;
      };
    }
  | {
      readonly kind: 'tournament.start';
      readonly opId: string;
      readonly payload: { readonly tier: number };
    }
  | {
      readonly kind: 'tournament.abandon';
      readonly opId: string;
      readonly payload: Record<string, never>;
    };

export type SyncOpKind = SyncOp['kind'];

export type SyncOpStatus = 'applied' | 'duplicate' | 'rejected';

export interface SyncOpResult {
  readonly opId: string;
  readonly kind: SyncOpKind;
  readonly status: SyncOpStatus;
  /** Populated when status is 'rejected'. Safe to show a player. */
  readonly reason?: string | undefined;
  readonly code?: ErrorCode | undefined;
  /** Present for an applied 'match' op. */
  readonly summary?: ProgressionSummaryDto | undefined;
}

export interface SyncPushRequest {
  /**
   * The profile version the queued operations were built against.
   *
   * A mismatch does not fail the push - every operation is re-validated
   * against current state anyway - but it tells the client, through
   * `diverged`, that another device has been playing.
   */
  readonly baseVersion: number;
  readonly ops: readonly SyncOp[];
}

export interface SyncPushResponse {
  readonly profile: CloudProfileDto;
  readonly results: readonly SyncOpResult[];
  /** True when the profile had moved on before these ops were applied. */
  readonly diverged: boolean;
}

export interface SyncPullResponse {
  readonly profile: CloudProfileDto;
  /** Server clock, so the client can measure drift. */
  readonly serverTime: number;
}

/** The most operations one push may carry. Mirrored by the server's schema. */
export const MAX_SYNC_OPS = 50;

// --------------------------------------------------------------- config

export interface GameConfigResponse {
  /** Changes whenever any catalogue or balance number changes. */
  readonly configVersion: string;
  readonly protocolVersion: number;
  readonly serverTime: number;
  readonly balance: unknown;
  readonly bots: unknown;
  readonly modes: unknown;
  readonly challenges: unknown;
  readonly tournaments: unknown;
  readonly cosmetics: unknown;
  readonly achievements: unknown;
}

export interface TalentConfigResponse {
  readonly configVersion: string;
  readonly branches: unknown;
  readonly talents: unknown;
  readonly abilities: unknown;
}

export interface HealthCheck {
  readonly ok: boolean;
  readonly detail?: string | undefined;
}

export interface HealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly uptimeSeconds: number;
  readonly version: string;
  readonly checks: Record<string, HealthCheck>;
}
