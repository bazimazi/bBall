/**
 * The database handle, and the migration runner that opens it.
 *
 * SQLite is the default deployment on purpose. A single-writer embedded
 * database is the simplest thing that still gives real transactions, real
 * foreign keys and real crash safety, and it removes an entire service from
 * the operational surface of a game whose write volume is "one row per
 * finished match". Everything above this file talks to the {@link Db}
 * interface and to the repositories, so swapping in Postgres later is a new
 * driver rather than a rewrite.
 *
 * Three settings do most of the work:
 *
 * - `journal_mode = WAL` lets readers run while a writer commits, which is
 *   what makes concurrent requests behave.
 * - `foreign_keys = ON` is off by default in SQLite. Without it every
 *   `REFERENCES` clause in the schema is decoration.
 * - `busy_timeout` turns "database is locked" from an error into a wait.
 */

import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import Database from 'better-sqlite3';

import { MIGRATIONS, type Migration } from './migrations';

export type Db = Database.Database;

export interface OpenOptions {
  readonly file: string;
  readonly busyTimeoutMs?: number;
  /** Set for tests, which want a clean database and no file on disk. */
  readonly memory?: boolean;
}

export function openDatabase(options: OpenOptions): Db {
  const memory = options.memory || options.file === ':memory:';
  if (!memory) {
    const path = resolve(options.file);
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(memory ? ':memory:' : resolve(options.file));

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma(`busy_timeout = ${options.busyTimeoutMs ?? 5000}`);
  // NORMAL is the WAL-appropriate setting: a commit is durable against a
  // process crash, and only a power loss can cost the last transaction.
  db.pragma('synchronous = NORMAL');
  // Keeps deletes from leaving readable pages behind in the file.
  db.pragma('secure_delete = ON');

  return db;
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql.trim()).digest('hex').slice(0, 32);
}

export interface MigrationStatus {
  readonly version: number;
  readonly name: string;
  readonly applied: boolean;
  readonly appliedAt: number | null;
}

interface AppliedRow {
  version: number;
  name: string;
  checksum: string;
  applied_at: number;
}

function ensureLedger(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      checksum   TEXT    NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
}

export class MigrationError extends Error {}

/**
 * Bring the database up to the current schema.
 *
 * Each pending migration runs in its own transaction, so a failure leaves the
 * database at the last complete version rather than half way through one.
 * An already-applied migration whose SQL has since been edited is a hard
 * error: silently ignoring it is how a staging database and a production
 * database stop matching.
 */
export function migrate(
  db: Db,
  migrations: readonly Migration[] = MIGRATIONS
): readonly Migration[] {
  ensureLedger(db);

  const applied = new Map<number, AppliedRow>();
  for (const row of db.prepare('SELECT * FROM schema_migrations').all() as AppliedRow[]) {
    applied.set(row.version, row);
  }

  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const ran: Migration[] = [];

  for (const migration of ordered) {
    const previous = applied.get(migration.version);
    const digest = checksum(migration.up);

    if (previous) {
      if (previous.checksum !== digest) {
        throw new MigrationError(
          `Migration ${migration.version} (${migration.name}) has changed since it was applied. ` +
            'Add a new migration instead of editing an applied one.'
        );
      }
      continue;
    }

    const run = db.transaction(() => {
      db.exec(migration.up);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)'
      ).run(migration.version, migration.name, digest, Date.now());
    });

    try {
      run();
    } catch (error) {
      throw new MigrationError(
        `Migration ${migration.version} (${migration.name}) failed: ${(error as Error).message}`
      );
    }
    ran.push(migration);
  }

  // Cheap insurance against a migration that adds a constraint the existing
  // rows break. Cheap because the databases this runs against are small.
  const broken = db.pragma('foreign_key_check') as unknown[];
  if (broken.length > 0) {
    throw new MigrationError(`Foreign key violations after migrating: ${broken.length} row(s).`);
  }

  return ran;
}

export function migrationStatus(
  db: Db,
  migrations: readonly Migration[] = MIGRATIONS
): readonly MigrationStatus[] {
  ensureLedger(db);
  const applied = new Map<number, AppliedRow>();
  for (const row of db.prepare('SELECT * FROM schema_migrations').all() as AppliedRow[]) {
    applied.set(row.version, row);
  }
  return [...migrations]
    .sort((a, b) => a.version - b.version)
    .map((migration) => {
      const row = applied.get(migration.version);
      return {
        version: migration.version,
        name: migration.name,
        applied: row !== undefined,
        appliedAt: row?.applied_at ?? null
      };
    });
}

/**
 * Open and migrate in one step, the way every entry point wants it.
 */
export function createDatabase(options: OpenOptions): Db {
  const db = openDatabase(options);
  migrate(db);
  return db;
}

/**
 * Run `work` inside a transaction, returning its result.
 *
 * IMMEDIATE takes the write lock up front rather than on the first write, so
 * two concurrent progression updates queue behind each other instead of one
 * of them failing part-way through with a busy error.
 */
export function transaction<T>(db: Db, work: () => T): T {
  const wrapped = db.transaction(work);
  return wrapped.immediate();
}

/** Remove expired sessions, tokens and idempotency records. */
export function vacuumExpired(db: Db, now = Date.now()): { readonly removed: number } {
  const run = db.transaction(() => {
    let removed = 0;
    removed += db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now).changes;
    removed += db.prepare('DELETE FROM email_tokens WHERE expires_at < ?').run(now).changes;
    removed += db.prepare('DELETE FROM idempotency_keys WHERE expires_at < ?').run(now).changes;
    // Abandoned social sign-ins: a player who opened the provider and closed
    // the tab leaves a flow behind, and there is no other moment to clear it.
    removed += db.prepare('DELETE FROM oauth_flows WHERE expires_at < ?').run(now).changes;
    removed += db.prepare('DELETE FROM oauth_handoffs WHERE expires_at < ?').run(now).changes;
    return removed;
  });
  return { removed: run() };
}
