/**
 * Process entry point.
 *
 * Three jobs, in order: fail fast on bad configuration, migrate before
 * serving, and shut down without dropping requests.
 *
 * The periodic sweep is here rather than in a cron job because it is the only
 * background work the server has, and one interval is a smaller operational
 * surface than a second deployment artefact. It removes expired sessions,
 * spent email tokens and stale idempotency records - none of which are
 * correctness-critical (every one of them is also checked on read), just
 * housekeeping so the file does not grow without bound.
 */

import { buildApp } from './app';
import { ConfigError, loadConfig } from './config/env';
import { vacuumExpired } from './db/index';

/** How often expired rows are swept. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      process.exit(78); // EX_CONFIG
    }
    throw error;
  }

  const built = await buildApp({ config });
  const { app, db } = built;

  // None of the bundled drivers actually deliver mail - see services/mail.ts,
  // where adding a provider is one more implementation of `Mailer`. Until one
  // is wired, a production deployment should know that verification and reset
  // links are going nowhere.
  if (config.isProduction) {
    app.log.warn(
      { driver: config.mail.driver },
      'no real mail provider is configured; verification and reset messages will not be delivered'
    );
  }
  if (config.isProduction && config.http.corsOrigins.length === 0) {
    app.log.warn('CORS_ORIGINS is empty; only same-origin browser callers will be accepted');
  }

  const sweep = setInterval(() => {
    try {
      const { removed } = vacuumExpired(db, Date.now());
      if (removed > 0) app.log.info({ removed }, 'sweep: expired rows removed');
    } catch (error) {
      app.log.error({ err: error }, 'sweep failed');
    }
  }, SWEEP_INTERVAL_MS);
  sweep.unref();

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    clearInterval(sweep);
    try {
      // Fastify stops accepting connections and waits for in-flight requests,
      // so a deploy cannot cut a match submission in half.
      await built.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'shutdown failed');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'unhandled rejection');
  });
  process.on('uncaughtException', (error) => {
    // An uncaught exception leaves the process in an unknown state; log it and
    // let the supervisor restart rather than carrying on regardless.
    app.log.fatal({ err: error }, 'uncaught exception');
    void shutdown('uncaughtException');
  });

  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    { env: config.env, port: config.port, database: config.database.file },
    'bBall server listening'
  );
}

void main();
