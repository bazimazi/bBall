/**
 * /v1/sync - the cache reconciliation endpoints.
 *
 * `pull` is the client refreshing its cache. `push` drains the queue a client
 * built while it could not reach the server. `claim` is the one-time import
 * of a guest save.
 *
 * `push` is the interesting one: it is a batch with per-item results rather
 * than an all-or-nothing transaction. A queue assembled offline will contain
 * operations that have since become invalid - a talent already bought on
 * another device, a cup abandoned elsewhere - and refusing the batch over one
 * of them would strand every match behind it. Each item succeeds, duplicates
 * or is refused on its own, and the authoritative profile comes back with the
 * results so the client can reconcile in one step.
 */

import type { FastifyInstance } from 'fastify';

import type { ClaimResponse, SyncPullResponse } from '../../../../shared/protocol';
import { toCloudProfile } from '../../domain/profile';
import type { ServiceContext } from '../../services/context';
import { claimLocalSave, pullProfile, pushOperations } from '../../services/sync';
import { claimSchema, deviceIdSchema, syncPushSchema } from '../schemas';
import { parse } from '../validate';
import { makeRequireAuth, makeRequireVerified, principalOf } from '../plugins/auth';
import { beginIdempotent, finishIdempotent } from '../plugins/idempotency';

/** The device header is advisory: absent is fine, malformed is ignored. */
function deviceIdOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const parsed = deviceIdSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function registerSyncRoutes(app: FastifyInstance, context: ServiceContext): void {
  const requireAuth = makeRequireAuth(context);
  const requireVerified = makeRequireVerified(context);
  const guarded = { preHandler: [requireAuth, requireVerified] };

  app.get('/v1/sync/pull', { preHandler: requireAuth }, async (request, reply) => {
    const device = deviceIdOf(request.headers['x-bball-device']);
    const profile = pullProfile(context, principalOf(request).userId, device);
    const payload: SyncPullResponse = {
      profile: toCloudProfile(profile),
      serverTime: context.now()
    };
    return reply.send(payload);
  });

  app.post('/v1/sync/push', guarded, async (request, reply) => {
    const { key, hash, hit } = beginIdempotent(context, request);
    if (hit) return reply.code(hit.status).send(hit.payload);

    const input = parse(syncPushSchema, request.body);
    const device = deviceIdOf(request.headers['x-bball-device']);
    const payload = pushOperations(
      context,
      principalOf(request).userId,
      input.baseVersion,
      input.ops,
      device
    );

    void reply.code(200);
    finishIdempotent(context, request, reply, key, hash, payload);
    return reply.send(payload);
  });

  app.post('/v1/sync/claim', guarded, async (request, reply) => {
    const input = parse(claimSchema, request.body);
    const result = claimLocalSave(context, principalOf(request).userId, input.save);
    const payload: ClaimResponse = {
      profile: toCloudProfile(result.profile),
      claim: result.claim
    };
    return reply.send(payload);
  });
}
