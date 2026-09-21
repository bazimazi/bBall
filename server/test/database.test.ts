/**
 * Schema, migrations and the guarantees the database itself enforces.
 *
 * The constraints tested here are the ones that still hold when the code
 * above them is wrong - which is the only reason to have them.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  MigrationError,
  migrate,
  migrationStatus,
  openDatabase,
  transaction,
  vacuumExpired
} from '../src/db/index';
import { MIGRATIONS, type Migration } from '../src/db/migrations';
import {
  auth,
  makeServer,
  matchSubmission,
  recordMatch,
  register,
  type TestServer
} from './helpers';

describe('migrations', () => {
  it('applies every migration to a blank database, in order', () => {
    const db = openDatabase({ file: ':memory:' });
    try {
      const ran = migrate(db);
      assert.equal(ran.length, MIGRATIONS.length);
      assert.deepEqual(
        ran.map((item) => item.version),
        [...MIGRATIONS].sort((a, b) => a.version - b.version).map((item) => item.version)
      );
    } finally {
      db.close();
    }
  });

  it('is idempotent', () => {
    const db = openDatabase({ file: ':memory:' });
    try {
      migrate(db);
      assert.equal(migrate(db).length, 0);
      assert.ok(migrationStatus(db).every((item) => item.applied));
    } finally {
      db.close();
    }
  });

  it('applies only what is missing', () => {
    const db = openDatabase({ file: ':memory:' });
    try {
      const [first, ...rest] = [...MIGRATIONS].sort((a, b) => a.version - b.version);
      migrate(db, [first!]);
      const ran = migrate(db, MIGRATIONS);
      assert.deepEqual(
        ran.map((item) => item.version),
        rest.map((item) => item.version)
      );
    } finally {
      db.close();
    }
  });

  it('refuses to run when an applied migration has been edited', () => {
    const db = openDatabase({ file: ':memory:' });
    try {
      migrate(db);
      const tampered: Migration[] = MIGRATIONS.map((item) =>
        item.version === 1 ? { ...item, up: `${item.up}\n-- edited after the fact` } : item
      );
      assert.throws(() => migrate(db, tampered), MigrationError);
    } finally {
      db.close();
    }
  });

  it('rolls a failed migration back rather than leaving it half applied', () => {
    const db = openDatabase({ file: ':memory:' });
    try {
      migrate(db);
      const broken: Migration[] = [
        ...MIGRATIONS,
        {
          version: 9999,
          name: 'broken',
          up: 'CREATE TABLE ok_so_far (id TEXT PRIMARY KEY); CREATE TABLE users (nope TEXT);'
        }
      ];
      assert.throws(() => migrate(db, broken), MigrationError);

      const leftover = db
        .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'ok_so_far'")
        .get() as { n: number };
      assert.equal(leftover.n, 0, 'the first half of a failed migration should not survive');
    } finally {
      db.close();
    }
  });

  it('reports what is pending', () => {
    const db = openDatabase({ file: ':memory:' });
    try {
      const before = migrationStatus(db);
      assert.ok(before.every((item) => !item.applied));
      migrate(db);
      assert.ok(migrationStatus(db).every((item) => item.applied && item.appliedAt !== null));
    } finally {
      db.close();
    }
  });
});

describe('constraints', () => {
  let server: TestServer;

  before(async () => {
    server = await makeServer();
  });

  after(async () => {
    await server.close();
  });

  it('turns foreign keys on', () => {
    const [row] = server.db.pragma('foreign_keys') as { foreign_keys: number }[];
    assert.equal(row?.foreign_keys, 1);
  });

  it('refuses a profile row with no user behind it', () => {
    assert.throws(() =>
      server.db
        .prepare(
          `INSERT INTO profiles
             (user_id, save_id, version, display_name, avatar, xp, daily_day, daily_matches,
              last_bot, last_practice_bot, created_at, updated_at)
           VALUES ('ghost', 's', 1, 'Ghost', 'orb', 0, '2026-01-01', 0, 'pro', 'pro', 0, 0)`
        )
        .run()
    );
  });

  it('refuses negative XP', async () => {
    const user = await register(server.app);
    assert.throws(() =>
      server.db.prepare('UPDATE profiles SET xp = -1 WHERE user_id = ?').run(user.userId)
    );
  });

  it('refuses two matches with the same client id for one player', async () => {
    const user = await register(server.app);
    await recordMatch(
      server.app,
      user.accessToken,
      matchSubmission({ clientMatchId: 'dupe-0001' })
    );

    assert.throws(() =>
      server.db
        .prepare(
          `INSERT INTO matches
             (id, user_id, client_match_id, mode, bot_id, ranked, won, score_you, score_bot,
              best_rally, hits, seconds, xp_awarded, objective_met, played_at, recorded_at)
           VALUES ('forced', ?, 'dupe-0001', 'quick', 'pro', 1, 1, 5, 0, 1, 1, 10, 0, 1, 0, 0)`
        )
        .run(user.userId)
    );
  });

  it('allows only one cup in progress per player', async () => {
    const user = await register(server.app);
    await server.app.inject({
      method: 'POST',
      url: '/v1/progression/tournament/start',
      headers: auth(user.accessToken),
      payload: { tier: 0 }
    });

    assert.throws(() =>
      server.db
        .prepare(
          `INSERT INTO tournaments
             (id, user_id, tier, round, results_json, status, champion, started_at, updated_at)
           VALUES ('second-cup', ?, 0, 0, '[]', 'active', 0, 1, 1)`
        )
        .run(user.userId)
    );
  });

  it('cascades every child row when a user is deleted', async () => {
    const user = await register(server.app);
    await recordMatch(server.app, user.accessToken, matchSubmission());

    server.db.prepare('DELETE FROM users WHERE id = ?').run(user.userId);

    for (const table of [
      'profiles',
      'profile_stats',
      'profile_achievements',
      'profile_unlocks',
      'talent_ranks',
      'matches',
      'progression_events',
      'sessions'
    ]) {
      const row = server.db
        .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`)
        .get(user.userId) as { n: number };
      assert.equal(row.n, 0, `${table} should have been cascaded away`);
    }
  });

  it('rolls a transaction back when the work inside it throws', async () => {
    const user = await register(server.app);
    const before = server.db
      .prepare('SELECT xp FROM profiles WHERE user_id = ?')
      .get(user.userId) as { xp: number };

    assert.throws(() =>
      transaction(server.db, () => {
        server.db.prepare('UPDATE profiles SET xp = 5000 WHERE user_id = ?').run(user.userId);
        throw new Error('changed my mind');
      })
    );

    const after = server.db
      .prepare('SELECT xp FROM profiles WHERE user_id = ?')
      .get(user.userId) as { xp: number };
    assert.equal(after.xp, before.xp);
  });
});

describe('housekeeping', () => {
  it('sweeps expired sessions and tokens without touching live ones', async () => {
    const server = await makeServer({ REFRESH_TOKEN_TTL_SECONDS: '600' });
    try {
      const stale = await register(server.app);
      server.advance(601 * 1000);
      const live = await register(server.app);

      const { removed } = vacuumExpired(server.db, server.time());
      assert.ok(removed > 0);

      const staleRows = server.db
        .prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?')
        .get(stale.userId) as { n: number };
      const liveRows = server.db
        .prepare('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?')
        .get(live.userId) as { n: number };

      assert.equal(staleRows.n, 0);
      assert.equal(liveRows.n, 1);
    } finally {
      await server.close();
    }
  });
});

describe('health', () => {
  it('reports ready when the database and schema are in place', async () => {
    const server = await makeServer();
    try {
      const response = await server.app.inject({ method: 'GET', url: '/v1/health' });
      assert.equal(response.statusCode, 200);

      const body = response.json<{ status: string; checks: Record<string, { ok: boolean }> }>();
      assert.equal(body.status, 'ok');
      assert.equal(body.checks.database?.ok, true);
      assert.equal(body.checks.schema?.ok, true);
      // A health endpoint is reachable by definition, so it must not describe
      // the deployment it is guarding.
      assert.ok(!JSON.stringify(body).includes('sqlite'));
    } finally {
      await server.close();
    }
  });

  it('answers liveness without touching the database', async () => {
    const server = await makeServer();
    try {
      server.db.close();
      const response = await server.app.inject({ method: 'GET', url: '/v1/health/live' });
      assert.equal(response.statusCode, 200);
    } finally {
      await server.app.close();
    }
  });
});
