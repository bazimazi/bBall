/**
 * Request schemas.
 *
 * Every request body is parsed here before a service sees it. The types in
 * `shared/protocol.ts` describe what an honest client sends; these schemas
 * are what the server is willing to accept, and the two are deliberately
 * separate - a type is a promise between developers, and a schema is a
 * boundary against everyone else.
 *
 * Two habits worth keeping:
 *
 * - Objects are `strict()`, so an unexpected field is an error rather than
 *   something that silently rides along into a spread.
 * - Every string and array is bounded. An unbounded string is a memory
 *   allocation controlled by the caller.
 */

import { z } from 'zod';

import { ABILITIES } from '../../../src/core/talents/types';
import { BRANCHES } from '../../../src/core/talents/types';
import { AVATARS } from '../../../src/core/profile/types';
import { EQUIP_SLOTS } from '../../../src/core/cosmetics/catalog';
import { TALENTS } from '../../../src/core/talents/catalog';
import { MODES } from '../../../src/core/modes/catalog';
import { BOT_LEVELS } from '../../../src/core/bots/levels';
import { MAX_SYNC_OPS } from '../../../shared/protocol';
import { PASSWORD_MAX, PASSWORD_MIN } from '../lib/password';
import { NAME_MAX } from '../../../src/core/profile/defaults';

const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as [T, ...T[]]);

export const avatarSchema = enumOf(AVATARS);
export const abilitySchema = enumOf(ABILITIES);
export const branchSchema = enumOf(BRANCHES);
export const talentSchema = enumOf(TALENTS.map((talent) => talent.id));
export const modeSchema = enumOf(MODES.map((mode) => mode.id));
export const botSchema = enumOf(Object.keys(BOT_LEVELS) as (keyof typeof BOT_LEVELS)[]);
export const cosmeticSlotSchema = enumOf(EQUIP_SLOTS);

/**
 * Length, not composition.
 *
 * The upper bound matters as much as the lower one: without it a registration
 * body can ask the server to run scrypt over a megabyte.
 */
export const passwordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'Enter a valid email address.');

export const displayNameSchema = z.string().trim().min(1).max(NAME_MAX);

/** Client-generated ids. Opaque to the server, but bounded and printable. */
export const clientIdSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_:.-]+$/, 'Not a valid identifier.');

export const localSaveSchema = z
  .object({
    schemaVersion: z.number().int().min(0).max(1000),
    saveId: clientIdSchema,
    updatedAt: z.number().int().min(0),
    // The profile itself is not described here: it is handed to the client's
    // own validator, which repairs what it can rather than rejecting a save
    // that a schema would simply refuse.
    profile: z.unknown()
  })
  .strict();

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: displayNameSchema.optional(),
    claim: localSaveSchema.optional()
  })
  .strict();

export const loginSchema = z.object({ email: emailSchema, password: passwordSchema }).strict();

export const refreshSchema = z
  .object({ refreshToken: z.string().min(16).max(512).optional() })
  .strict();

export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();

export const resetPasswordSchema = z
  .object({ token: z.string().min(16).max(512), password: passwordSchema })
  .strict();

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(PASSWORD_MAX), newPassword: passwordSchema })
  .strict();

export const verifyEmailSchema = z.object({ token: z.string().min(16).max(512) }).strict();

export const deleteAccountSchema = z
  // Optional because an account created through a provider may never have had
  // a password; the service requires it whenever one exists.
  .object({ password: z.string().min(1).max(PASSWORD_MAX).optional() })
  .strict();

/** Provider ids appear in URLs, so they are kept to a boring alphabet. */
export const oauthProviderParamSchema = z
  .object({
    provider: z
      .string()
      .min(2)
      .max(32)
      .regex(/^[a-z][a-z0-9-]*$/)
  })
  .strict();

export const oauthCompleteSchema = z
  .object({ code: z.string().min(16).max(512), claim: localSaveSchema.optional() })
  .strict();

export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    avatar: avatarSchema.optional(),
    equipped: z
      .object(
        Object.fromEntries(
          EQUIP_SLOTS.map((slot) => [slot, z.string().min(1).max(64).optional()])
        ) as Record<(typeof EQUIP_SLOTS)[number], z.ZodOptional<z.ZodString>>
      )
      .strict()
      .optional(),
    preferences: z
      .object({ lastBot: botSchema.optional(), lastPracticeBot: botSchema.optional() })
      .strict()
      .optional(),
    baseVersion: z.number().int().min(0).optional()
  })
  .strict();

const count = (max: number) => z.number().int().min(0).max(max);

export const talentMatchStatsSchema = z
  .object({
    abilitiesUsed: count(100_000),
    powerStrikes: count(100_000),
    dashes: count(100_000),
    perfectGuards: count(100_000),
    crits: count(100_000),
    shieldSaves: count(100_000),
    secondChances: count(100_000),
    ultimates: count(100_000),
    bestDrive: count(100_000)
  })
  .strict();

export const matchSubmissionSchema = z
  .object({
    clientMatchId: clientIdSchema,
    mode: modeSchema,
    botId: botSchema,
    won: z.boolean(),
    scoreYou: count(99),
    scoreBot: count(99),
    bestRally: count(100_000),
    hits: count(100_000),
    seconds: z
      .number()
      .min(0)
      .max(4 * 60 * 60),
    livesLeft: count(10),
    objectiveMet: z.boolean(),
    shutout: z.boolean(),
    comeback: z.boolean(),
    abandoned: z.boolean(),
    challengeId: z.string().min(1).max(64).optional(),
    tournamentRound: z.number().int().min(0).max(8).optional(),
    tournamentTier: z.number().int().min(0).max(8).optional(),
    talent: talentMatchStatsSchema,
    playedAt: z.number().int().min(0)
  })
  .strict();

export const purchaseTalentSchema = z
  .object({
    talentId: talentSchema,
    expectedRank: z.number().int().min(0).max(10),
    baseVersion: z.number().int().min(0).optional()
  })
  .strict();

export const respecSchema = z
  .object({ branch: branchSchema.optional(), baseVersion: z.number().int().min(0).optional() })
  .strict();

export const equipAbilitySchema = z
  .object({
    slot: z.number().int().min(0).max(7),
    abilityId: abilitySchema.nullable(),
    baseVersion: z.number().int().min(0).optional()
  })
  .strict();

export const equipCosmeticSchema = z
  .object({
    slot: cosmeticSlotSchema,
    cosmeticId: z.string().min(1).max(64),
    baseVersion: z.number().int().min(0).optional()
  })
  .strict();

export const startTournamentSchema = z
  .object({
    tier: z.number().int().min(0).max(8),
    baseVersion: z.number().int().min(0).optional()
  })
  .strict();

export const claimSchema = z.object({ save: localSaveSchema }).strict();

const opId = clientIdSchema;

export const syncOpSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('match'), opId, payload: matchSubmissionSchema }).strict(),
  z
    .object({
      kind: z.literal('talent.purchase'),
      opId,
      payload: z
        .object({ talentId: talentSchema, expectedRank: z.number().int().min(0).max(10) })
        .strict()
    })
    .strict(),
  z
    .object({
      kind: z.literal('talent.respec'),
      opId,
      payload: z.object({ branch: branchSchema.optional() }).strict()
    })
    .strict(),
  z
    .object({
      kind: z.literal('ability.equip'),
      opId,
      payload: z
        .object({ slot: z.number().int().min(0).max(7), abilityId: abilitySchema.nullable() })
        .strict()
    })
    .strict(),
  z
    .object({
      kind: z.literal('cosmetic.equip'),
      opId,
      payload: z
        .object({ slot: cosmeticSlotSchema, cosmeticId: z.string().min(1).max(64) })
        .strict()
    })
    .strict(),
  z
    .object({
      kind: z.literal('profile.update'),
      opId,
      payload: z
        .object({ displayName: displayNameSchema.optional(), avatar: avatarSchema.optional() })
        .strict()
    })
    .strict(),
  z
    .object({
      kind: z.literal('preferences.update'),
      opId,
      payload: z
        .object({ lastBot: botSchema.optional(), lastPracticeBot: botSchema.optional() })
        .strict()
    })
    .strict(),
  z
    .object({
      kind: z.literal('tournament.start'),
      opId,
      payload: z.object({ tier: z.number().int().min(0).max(8) }).strict()
    })
    .strict(),
  z
    .object({
      kind: z.literal('tournament.abandon'),
      opId,
      payload: z.object({}).strict()
    })
    .strict()
]);

export const syncPushSchema = z
  .object({
    baseVersion: z.number().int().min(0),
    ops: z.array(syncOpSchema).max(MAX_SYNC_OPS)
  })
  .strict();

/** Optional device identifier, used only for sync bookkeeping. */
export const deviceIdSchema = clientIdSchema;
