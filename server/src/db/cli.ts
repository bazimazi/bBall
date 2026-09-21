/**
 * Migration CLI.
 *
 *   npm run migrate            -- bring the database up to date
 *   npm run migrate:status     -- list every migration and whether it ran
 *
 * Deliberately separate from the server's own boot-time migration so a
 * deployment can migrate once, from one place, before any instance starts.
 */

import { loadConfig } from '../config/env';
import { migrate, migrationStatus, openDatabase, vacuumExpired } from './index';

function main(): void {
  const command = process.argv[2] ?? 'migrate';
  const config = loadConfig();
  const db = openDatabase({
    file: config.database.file,
    busyTimeoutMs: config.database.busyTimeoutMs
  });

  try {
    switch (command) {
      case 'migrate': {
        const ran = migrate(db);
        if (ran.length === 0) process.stdout.write('Database already up to date.\n');
        for (const item of ran) {
          process.stdout.write(`Applied ${item.version} ${item.name}\n`);
        }
        break;
      }
      case 'status': {
        for (const item of migrationStatus(db)) {
          const when = item.appliedAt ? new Date(item.appliedAt).toISOString() : 'pending';
          process.stdout.write(
            `${item.applied ? 'x' : ' '} ${item.version} ${item.name} ${when}\n`
          );
        }
        break;
      }
      case 'vacuum': {
        migrate(db);
        const { removed } = vacuumExpired(db);
        process.stdout.write(`Removed ${removed} expired row(s).\n`);
        break;
      }
      default:
        process.stderr.write(`Unknown command: ${command}\n`);
        process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
