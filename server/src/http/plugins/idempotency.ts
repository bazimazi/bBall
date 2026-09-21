/**
 * Whole-response idempotency.
 *
 * The progression endpoints already de-duplicate on their own domain keys -
 * a match on `clientMatchId`, a sync operation on `opId`. This is the layer
 * above that: if a caller sends the same `Idempotency-Key` twice, the second
 * request gets the first one's response verbatim, without the handler running
 * at all.
 *
 * That matters because "the request succeeded but the response was lost" is
 * the normal failure on a phone changing networks, and it is indistinguishable
 * from "the request never arrived". Replaying the stored response turns an
 * ambiguous retry into a safe one.
 *
 * The request body is hashed alongside the key. The same key with a different
 * body is a caller bug - most likely a reused key - and is refused rather
 * than answered with the wrong payload.
 */

import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { HEADER_IDEMPOTENCY } from '../../../../shared/protocol';
import { conflict } from '../../domain/errors';
import { findIdempotent, saveIdempotent } from '../../repositories/progression';
import type { ServiceContext } from '../../services/context';
import { principalOf } from './auth';

/** How long a stored response stays replayable. */
const TTL_SECONDS = 24 * 60 * 60;

const MAX_KEY_LENGTH = 128;

function hashBody(body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(body ?? null))
    .digest('hex');
}

export interface IdempotencyHit {
  readonly status: number;
  readonly payload: unknown;
}

/**
 * Look for a stored response.
 *
 * Returns the key to record under (or null when the caller did not ask for
 * idempotency) and the previous response, when there is one.
 */
export function beginIdempotent(
  context: ServiceContext,
  request: FastifyRequest
): { key: string | null; hash: string; hit: IdempotencyHit | null } {
  const raw = request.headers[HEADER_IDEMPOTENCY];
  const key = typeof raw === 'string' ? raw.trim() : null;
  const hash = hashBody(request.body);

  if (!key) return { key: null, hash, hit: null };
  if (key.length > MAX_KEY_LENGTH) {
    throw conflict('That idempotency key is not usable.', { internal: 'key too long' });
  }

  const userId = principalOf(request).userId;
  const stored = findIdempotent(context.db, userId, key);
  if (!stored) return { key, hash, hit: null };

  if (stored.request_hash !== hash) {
    throw conflict('That idempotency key was already used for a different request.', {
      internal: `endpoint=${stored.endpoint}`
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(stored.response_json);
  } catch {
    // A corrupted stored response is not worth failing over; re-running the
    // handler is safe because the domain-level keys still de-duplicate.
    return { key, hash, hit: null };
  }
  return { key, hash, hit: { status: stored.status_code, payload } };
}

export function finishIdempotent(
  context: ServiceContext,
  request: FastifyRequest,
  reply: FastifyReply,
  key: string | null,
  hash: string,
  payload: unknown
): void {
  if (!key) return;
  saveIdempotent(
    context.db,
    {
      user_id: principalOf(request).userId,
      key,
      endpoint: `${request.method} ${request.routeOptions.url ?? request.url}`,
      request_hash: hash,
      status_code: reply.statusCode,
      response_json: JSON.stringify(payload)
    },
    TTL_SECONDS,
    context.now()
  );
}
