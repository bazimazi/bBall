/**
 * The service context.
 *
 * Every service takes one of these rather than importing a database handle or
 * reading `process.env`. That is what lets a test build a whole server around
 * an in-memory database, a memory mailer and a frozen clock without any
 * module-level state to reset between cases.
 */

import type { FastifyBaseLogger } from 'fastify';

import type { AppConfig } from '../config/env';
import type { Db } from '../db/index';
import type { ScryptParams } from '../lib/password';
import { DEFAULT_PARAMS, FAST_PARAMS } from '../lib/password';
import type { Mailer } from './mail';
import type { OAuthRegistry } from './oauth/registry';

export interface ServiceContext {
  readonly db: Db;
  readonly config: AppConfig;
  readonly mailer: Mailer;
  /** Which social sign-in providers this deployment has configured. */
  readonly oauth: OAuthRegistry;
  readonly log: FastifyBaseLogger;
  /** Injected so a suite can hash at a cost that keeps it fast. */
  readonly passwordParams: ScryptParams;
  /** Injected so time-dependent behaviour is testable without waiting. */
  readonly now: () => number;
}

export function passwordParamsFor(config: AppConfig): ScryptParams {
  return config.isTest ? FAST_PARAMS : DEFAULT_PARAMS;
}
