/**
 * /v1/health - liveness and readiness.
 *
 * Two endpoints, because the two questions have different answers. `live`
 * asks whether the process should be restarted; it must not touch the
 * database, or a slow query becomes a restart loop. `ready` asks whether this
 * instance should receive traffic, so it does check the database and the
 * schema version.
 *
 * Neither reveals anything: no versions of dependencies, no file paths, no
 * row counts. A health endpoint is reachable by definition, so it is the
 * worst possible place to describe the deployment.
 */

import type { FastifyInstance } from 'fastify';

import type { HealthCheck, HealthResponse } from '../../../../shared/protocol';
import { MIGRATIONS } from '../../db/migrations';
import type { ServiceContext } from '../../services/context';

export function registerHealthRoutes(app: FastifyInstance, context: ServiceContext): void {
  const startedAt = context.now();

  app.get('/v1/health/live', async (_request, reply) => {
    return reply.send({ status: 'ok' });
  });

  app.get('/v1/health', async (_request, reply) => {
    const checks: Record<string, HealthCheck> = {};

    try {
      const row = context.db.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
      checks.database = { ok: row?.ok === 1 };
    } catch (error) {
      context.log.error({ err: error }, 'health: database check failed');
      checks.database = { ok: false, detail: 'unavailable' };
    }

    try {
      const row = context.db
        .prepare('SELECT MAX(version) AS version FROM schema_migrations')
        .get() as { version: number | null };
      const expected = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
      checks.schema = {
        ok: (row.version ?? 0) >= expected,
        ...(row.version === expected ? {} : { detail: 'pending migrations' })
      };
    } catch {
      checks.schema = { ok: false, detail: 'unavailable' };
    }

    const ok = Object.values(checks).every((check) => check.ok);
    const payload: HealthResponse = {
      status: ok ? 'ok' : 'degraded',
      uptimeSeconds: Math.round((context.now() - startedAt) / 1000),
      version: context.config.version,
      checks
    };
    return reply.code(ok ? 200 : 503).send(payload);
  });
}
