/**
 * The single exit for every failure.
 *
 * Two rules, both about what does *not* come out:
 *
 * - A response body only ever contains an {@link AppError}'s player-facing
 *   message. Anything unrecognised becomes a generic INTERNAL, so a stack
 *   trace, a SQL string or a constraint name cannot reach a client by
 *   accident.
 * - The log gets the opposite treatment: the real error, the request id, the
 *   route and the user - but never a password, a token or an email body.
 *   Fastify is configured with redaction paths for the headers that carry
 *   credentials.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { ApiErrorBody, ErrorCode } from '../../../../shared/protocol';
import { AppError, isAppError } from '../../domain/errors';
import { MigrationError } from '../../db/index';

/** The optional halves of an error body, mutable while it is assembled. */
interface ErrorExtras {
  details?: ApiErrorBody['error']['details'];
  retryAfter?: number;
}

function body(
  code: ErrorCode,
  message: string,
  requestId: string,
  extra: ErrorExtras = {}
): ApiErrorBody {
  return { error: { code, message, requestId, ...extra } };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    void reply
      .code(404)
      .send(body('NOT_FOUND', 'That endpoint does not exist.', request.id as string));
  });

  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id as string;

    if (isAppError(error)) {
      const extra: ErrorExtras = {};
      if (error.details) extra.details = error.details;
      if (error.retryAfter !== undefined) {
        extra.retryAfter = error.retryAfter;
        void reply.header('retry-after', String(error.retryAfter));
      }

      // Client mistakes are info; a 5xx is an error worth waking up for.
      const level = error.status >= 500 ? 'error' : 'info';
      request.log[level](
        { code: error.code, status: error.status, internal: error.internal },
        'request failed'
      );
      return reply.code(error.status).send(body(error.code, error.message, requestId, extra));
    }

    const fastifyError = error as { statusCode?: number; code?: string; message?: string };

    // Fastify's own guards - body too large, malformed JSON, rate limit - are
    // translated rather than passed through, so the wire shape stays uniform.
    if (fastifyError.statusCode === 413 || fastifyError.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply
        .code(413)
        .send(body('PAYLOAD_TOO_LARGE', 'That request is too large.', requestId));
    }
    if (fastifyError.statusCode === 429) {
      return reply
        .code(429)
        .send(body('RATE_LIMITED', 'Too many requests. Wait a moment.', requestId));
    }
    if (fastifyError.statusCode === 400) {
      return reply
        .code(400)
        .send(body('BAD_REQUEST', 'That request could not be read.', requestId));
    }
    if (error instanceof MigrationError) {
      request.log.fatal({ err: error }, 'database schema is not usable');
      return reply.code(500).send(body('INTERNAL', 'Something went wrong. Try again.', requestId));
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send(body('INTERNAL', 'Something went wrong. Try again.', requestId));
  });
}

export { AppError };
