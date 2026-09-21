/**
 * The write-side records that make progression auditable and replay-safe:
 * accepted matches, the progression event log, applied sync operations,
 * response-level idempotency, and claimed guest saves.
 */

import type { ModeId } from '../../../src/core/modes/types';
import type { Db } from '../db/index';
import { newSortableId } from '../lib/ids';

export interface MatchRow {
  id: string;
  user_id: string;
  client_match_id: string;
  mode: string;
  bot_id: string;
  ranked: number;
  won: number;
  score_you: number;
  score_bot: number;
  best_rally: number;
  hits: number;
  seconds: number;
  xp_awarded: number;
  challenge_id: string | null;
  tournament_id: string | null;
  objective_met: number;
  played_at: number;
  recorded_at: number;
}

export interface RecordMatchInput {
  readonly userId: string;
  readonly clientMatchId: string;
  readonly mode: ModeId;
  readonly botId: string;
  readonly ranked: boolean;
  readonly won: boolean;
  readonly scoreYou: number;
  readonly scoreBot: number;
  readonly bestRally: number;
  readonly hits: number;
  readonly seconds: number;
  readonly xpAwarded: number;
  readonly challengeId: string | null;
  readonly tournamentId: string | null;
  readonly objectiveMet: boolean;
  readonly playedAt: number;
}

export function findMatchByClientId(
  db: Db,
  userId: string,
  clientMatchId: string
): MatchRow | null {
  const row = db
    .prepare('SELECT * FROM matches WHERE user_id = ? AND client_match_id = ?')
    .get(userId, clientMatchId) as MatchRow | undefined;
  return row ?? null;
}

export function insertMatch(db: Db, input: RecordMatchInput, now = Date.now()): MatchRow {
  const id = newSortableId(now);
  db.prepare(
    `INSERT INTO matches
       (id, user_id, client_match_id, mode, bot_id, ranked, won, score_you, score_bot,
        best_rally, hits, seconds, xp_awarded, challenge_id, tournament_id, objective_met,
        played_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.clientMatchId,
    input.mode,
    input.botId,
    input.ranked ? 1 : 0,
    input.won ? 1 : 0,
    input.scoreYou,
    input.scoreBot,
    input.bestRally,
    input.hits,
    Math.round(input.seconds),
    input.xpAwarded,
    input.challengeId,
    input.tournamentId,
    input.objectiveMet ? 1 : 0,
    input.playedAt,
    now
  );
  return db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow;
}

/**
 * Seconds of play already submitted inside a window.
 *
 * The anti-cheat budget: a player cannot have played ninety minutes of
 * matches in the last hour, however the submissions are shaped.
 */
export function playedSecondsSince(db: Db, userId: string, since: number): number {
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(seconds), 0) AS total FROM matches WHERE user_id = ? AND recorded_at >= ?'
    )
    .get(userId, since) as { total: number };
  return row.total;
}

export function matchesSince(db: Db, userId: string, since: number): number {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM matches WHERE user_id = ? AND recorded_at >= ?')
    .get(userId, since) as { n: number };
  return row.n;
}

export function recentMatches(db: Db, userId: string, limit = 20): MatchRow[] {
  return db
    .prepare('SELECT * FROM matches WHERE user_id = ? ORDER BY id DESC LIMIT ?')
    .all(userId, limit) as MatchRow[];
}

// ------------------------------------------------------------- event log

export type ProgressionEventKind =
  | 'match'
  | 'talent.purchase'
  | 'talent.respec'
  | 'ability.equip'
  | 'cosmetic.equip'
  | 'achievement'
  | 'claim'
  | 'tournament.start'
  | 'tournament.abandon'
  | 'profile.update';

export interface LogEventInput {
  readonly userId: string;
  readonly kind: ProgressionEventKind;
  readonly xpDelta?: number;
  readonly levelBefore?: number;
  readonly levelAfter?: number;
  readonly detail?: unknown;
}

export function logProgressionEvent(db: Db, input: LogEventInput, now = Date.now()): void {
  db.prepare(
    `INSERT INTO progression_events
       (id, user_id, kind, xp_delta, level_before, level_after, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newSortableId(now),
    input.userId,
    input.kind,
    Math.round(input.xpDelta ?? 0),
    input.levelBefore ?? 1,
    input.levelAfter ?? input.levelBefore ?? 1,
    JSON.stringify(input.detail ?? {}),
    now
  );
}

// ---------------------------------------------------------- applied ops

export interface AppliedOpRow {
  user_id: string;
  op_id: string;
  kind: string;
  result_json: string;
  created_at: number;
}

export function findAppliedOp(db: Db, userId: string, opId: string): AppliedOpRow | null {
  const row = db
    .prepare('SELECT * FROM applied_ops WHERE user_id = ? AND op_id = ?')
    .get(userId, opId) as AppliedOpRow | undefined;
  return row ?? null;
}

/** Returns false when the op had already been applied. */
export function markOpApplied(
  db: Db,
  userId: string,
  opId: string,
  kind: string,
  result: unknown,
  now = Date.now()
): boolean {
  const outcome = db
    .prepare(
      `INSERT INTO applied_ops (user_id, op_id, kind, result_json, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, op_id) DO NOTHING`
    )
    .run(userId, opId, kind, JSON.stringify(result ?? {}), now);
  return outcome.changes > 0;
}

// ------------------------------------------------------- idempotency keys

export interface IdempotencyRow {
  user_id: string;
  key: string;
  endpoint: string;
  request_hash: string;
  status_code: number;
  response_json: string;
  created_at: number;
  expires_at: number;
}

export function findIdempotent(db: Db, userId: string, key: string): IdempotencyRow | null {
  const row = db
    .prepare('SELECT * FROM idempotency_keys WHERE user_id = ? AND key = ?')
    .get(userId, key) as IdempotencyRow | undefined;
  return row ?? null;
}

export function saveIdempotent(
  db: Db,
  row: Omit<IdempotencyRow, 'created_at' | 'expires_at'>,
  ttlSeconds: number,
  now = Date.now()
): void {
  db.prepare(
    `INSERT INTO idempotency_keys
       (user_id, key, endpoint, request_hash, status_code, response_json, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, key) DO UPDATE SET
       status_code = excluded.status_code,
       response_json = excluded.response_json`
  ).run(
    row.user_id,
    row.key,
    row.endpoint,
    row.request_hash,
    row.status_code,
    row.response_json,
    now,
    now + ttlSeconds * 1000
  );
}

// --------------------------------------------------------- claimed saves

export interface ClaimedSaveRow {
  user_id: string;
  save_id: string;
  outcome: string;
  xp_before: number;
  xp_after: number;
  claimed_at: number;
}

export function findClaimedSave(db: Db, userId: string, saveId: string): ClaimedSaveRow | null {
  const row = db
    .prepare('SELECT * FROM claimed_saves WHERE user_id = ? AND save_id = ?')
    .get(userId, saveId) as ClaimedSaveRow | undefined;
  return row ?? null;
}

export function recordClaimedSave(
  db: Db,
  row: Omit<ClaimedSaveRow, 'claimed_at'>,
  now = Date.now()
): void {
  db.prepare(
    `INSERT INTO claimed_saves (user_id, save_id, outcome, xp_before, xp_after, claimed_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, save_id) DO NOTHING`
  ).run(row.user_id, row.save_id, row.outcome, row.xp_before, row.xp_after, now);
}

// ------------------------------------------------------------ sync state

export function touchSyncState(
  db: Db,
  userId: string,
  deviceId: string,
  patch: { readonly pulled?: boolean; readonly pushed?: boolean; readonly version?: number },
  now = Date.now()
): void {
  db.prepare(
    `INSERT INTO sync_state (user_id, device_id, last_pull_at, last_push_at, last_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, device_id) DO UPDATE SET
       last_pull_at = COALESCE(excluded.last_pull_at, sync_state.last_pull_at),
       last_push_at = COALESCE(excluded.last_push_at, sync_state.last_push_at),
       last_version = MAX(excluded.last_version, sync_state.last_version),
       updated_at = excluded.updated_at`
  ).run(
    userId,
    deviceId,
    patch.pulled ? now : null,
    patch.pushed ? now : null,
    patch.version ?? 0,
    now,
    now
  );
}
