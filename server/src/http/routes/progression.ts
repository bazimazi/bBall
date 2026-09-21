/**
 * /v1/profile and /v1/progression - everything that changes a player's save.
 *
 * The grain is chosen around what the game actually does. Recording a match
 * is one call that carries the whole post-match batch - stats, XP, level,
 * talent points, achievements, unlocks and cup progress land in a single
 * transaction - because the alternative, a call per thing that changed, would
 * put a handful of round trips between the last point and the result card.
 *
 * Menu actions (buying a talent, equipping a skill) are their own small calls
 * because that is how a player performs them: one at a time, while looking at
 * the screen, with nothing else in flight.
 *
 * Nothing here runs during a rally.
 */

import type { FastifyInstance } from 'fastify';

import type { ProfileMutationResponse, RecordMatchResponse } from '../../../../shared/protocol';
import { toCloudProfile } from '../../domain/profile';
import {
  abandonTournament,
  claimRewards,
  equipAbilitySlot,
  equipCosmetic,
  purchaseTalent,
  recordMatch,
  respecTalents,
  startTournament,
  updateProfile
} from '../../services/progression';
import type { ServiceContext } from '../../services/context';
import {
  equipAbilitySchema,
  equipCosmeticSchema,
  matchSubmissionSchema,
  purchaseTalentSchema,
  respecSchema,
  startTournamentSchema,
  updateProfileSchema
} from '../schemas';
import { parse } from '../validate';
import { makeRequireAuth, makeRequireVerified, principalOf } from '../plugins/auth';
import { beginIdempotent, finishIdempotent } from '../plugins/idempotency';

export function registerProgressionRoutes(app: FastifyInstance, context: ServiceContext): void {
  const requireAuth = makeRequireAuth(context);
  const requireVerified = makeRequireVerified(context);
  const guarded = { preHandler: [requireAuth, requireVerified] };

  app.patch('/v1/profile', guarded, async (request, reply) => {
    const patch = parse(updateProfileSchema, request.body);
    const profile = updateProfile(context, principalOf(request).userId, patch);
    const payload: ProfileMutationResponse = { profile: toCloudProfile(profile) };
    return reply.send(payload);
  });

  app.post('/v1/progression/match', guarded, async (request, reply) => {
    const { key, hash, hit } = beginIdempotent(context, request);
    if (hit) return reply.code(hit.status).send(hit.payload);

    const submission = parse(matchSubmissionSchema, request.body);
    const outcome = recordMatch(context, principalOf(request).userId, submission);

    const payload: RecordMatchResponse = {
      profile: toCloudProfile(outcome.profile),
      summary: outcome.summary,
      duplicate: outcome.duplicate
    };
    void reply.code(200);
    finishIdempotent(context, request, reply, key, hash, payload);
    return reply.send(payload);
  });

  app.post('/v1/progression/talents/purchase', guarded, async (request, reply) => {
    const input = parse(purchaseTalentSchema, request.body);
    const profile = purchaseTalent(
      context,
      principalOf(request).userId,
      input.talentId,
      input.expectedRank,
      input.baseVersion
    );
    const payload: ProfileMutationResponse = { profile: toCloudProfile(profile) };
    return reply.send(payload);
  });

  app.post('/v1/progression/talents/respec', guarded, async (request, reply) => {
    const input = parse(respecSchema, request.body ?? {});
    const profile = respecTalents(
      context,
      principalOf(request).userId,
      input.branch,
      input.baseVersion
    );
    const payload: ProfileMutationResponse = { profile: toCloudProfile(profile) };
    return reply.send(payload);
  });

  app.post('/v1/progression/abilities/equip', guarded, async (request, reply) => {
    const input = parse(equipAbilitySchema, request.body);
    const profile = equipAbilitySlot(
      context,
      principalOf(request).userId,
      input.slot,
      input.abilityId,
      input.baseVersion
    );
    const payload: ProfileMutationResponse = { profile: toCloudProfile(profile) };
    return reply.send(payload);
  });

  app.post('/v1/progression/cosmetics/equip', guarded, async (request, reply) => {
    const input = parse(equipCosmeticSchema, request.body);
    const profile = equipCosmetic(
      context,
      principalOf(request).userId,
      input.slot,
      input.cosmeticId,
      input.baseVersion
    );
    const payload: ProfileMutationResponse = { profile: toCloudProfile(profile) };
    return reply.send(payload);
  });

  app.post('/v1/progression/tournament/start', guarded, async (request, reply) => {
    const input = parse(startTournamentSchema, request.body);
    const profile = startTournament(
      context,
      principalOf(request).userId,
      input.tier,
      input.baseVersion
    );
    const payload: ProfileMutationResponse = { profile: toCloudProfile(profile) };
    return reply.code(201).send(payload);
  });

  app.post('/v1/progression/tournament/abandon', guarded, async (request, reply) => {
    const profile = abandonTournament(context, principalOf(request).userId);
    const payload: ProfileMutationResponse = { profile: toCloudProfile(profile) };
    return reply.send(payload);
  });

  /**
   * Grant anything already earned but not yet recorded.
   *
   * There is no reward to "claim" in the loot-box sense - achievements pay
   * out the moment a match is recorded. This exists for the seams: after a
   * guest save is imported, and after a release adds an achievement that
   * existing players already qualify for.
   */
  app.post('/v1/progression/claim', guarded, async (request, reply) => {
    const result = claimRewards(context, principalOf(request).userId);
    return reply.send({
      profile: toCloudProfile(result.profile),
      achievements: result.achievements,
      unlocks: result.unlocks
    });
  });
}
