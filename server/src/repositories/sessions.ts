/**
 * Refresh-token sessions.
 *
 * A session is a row per token, not per device. Refreshing inserts a new row,
 * revokes the old one and links the two, so the chain of tokens issued from a
 * single sign-in forms a *family*.
 *
 * That shape is what makes theft detectable. A refresh token is single use;
 * if an already-rotated one is presented, either the legitimate client or an
 * attacker is replaying it, and there is no way to tell which. The safe move
 * is to revoke the entire family - both parties are signed out and the real
 * player signs in again, which costs them one password entry and costs the
 * attacker everything.
 */

import type { Db } from '../db/index';
import { newId } from '../lib/ids';

export interface SessionRow {
  id: string;
  user_id: string;
  family_id: string;
  refresh_hash: string;
  created_at: number;
  last_used_at: number;
  expires_at: number;
  revoked_at: number | null;
  revoked_reason: string | null;
  replaced_by: string | null;
  ip_fingerprint: string | null;
  agent_fingerprint: string | null;
}

export interface CreateSessionInput {
  readonly userId: string;
  readonly refreshHash: string;
  readonly ttlSeconds: number;
  /** Omitted to start a new family (a fresh sign-in). */
  readonly familyId?: string;
  readonly ipFingerprint?: string | null;
  readonly agentFingerprint?: string | null;
}

export function createSession(db: Db, input: CreateSessionInput, now = Date.now()): SessionRow {
  const id = newId();
  db.prepare(
    `INSERT INTO sessions
       (id, user_id, family_id, refresh_hash, created_at, last_used_at, expires_at,
        ip_fingerprint, agent_fingerprint)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.familyId ?? id,
    input.refreshHash,
    now,
    now,
    now + input.ttlSeconds * 1000,
    input.ipFingerprint ?? null,
    input.agentFingerprint ?? null
  );
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow;
}

export function findSessionByRefreshHash(db: Db, hash: string): SessionRow | null {
  const row = db.prepare('SELECT * FROM sessions WHERE refresh_hash = ?').get(hash) as
    SessionRow | undefined;
  return row ?? null;
}

export function findSessionById(db: Db, id: string): SessionRow | null {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  return row ?? null;
}

export function isLive(session: SessionRow, now = Date.now()): boolean {
  return session.revoked_at === null && session.expires_at > now;
}

export function revokeSession(db: Db, id: string, reason: string, now = Date.now()): void {
  db.prepare(
    'UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL'
  ).run(now, reason, id);
}

/** Revoke every token in a family. The answer to a replayed refresh token. */
export function revokeFamily(db: Db, familyId: string, reason: string, now = Date.now()): number {
  return db
    .prepare(
      'UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE family_id = ? AND revoked_at IS NULL'
    )
    .run(now, reason, familyId).changes;
}

/** Sign out everywhere. Used by "log out of all devices" and by a password change. */
export function revokeAllForUser(db: Db, userId: string, reason: string, now = Date.now()): number {
  return db
    .prepare(
      'UPDATE sessions SET revoked_at = ?, revoked_reason = ? WHERE user_id = ? AND revoked_at IS NULL'
    )
    .run(now, reason, userId).changes;
}

/**
 * Rotate a session: revoke the presented token and issue its successor in the
 * same family. Caller owns the transaction.
 */
export function rotateSession(
  db: Db,
  current: SessionRow,
  nextRefreshHash: string,
  ttlSeconds: number,
  now = Date.now()
): SessionRow {
  const next = createSession(
    db,
    {
      userId: current.user_id,
      refreshHash: nextRefreshHash,
      ttlSeconds,
      familyId: current.family_id,
      ipFingerprint: current.ip_fingerprint,
      agentFingerprint: current.agent_fingerprint
    },
    now
  );
  db.prepare(
    `UPDATE sessions SET revoked_at = ?, revoked_reason = 'rotated', replaced_by = ?, last_used_at = ?
     WHERE id = ?`
  ).run(now, next.id, now, current.id);
  return next;
}

export function countLiveSessions(db: Db, userId: string, now = Date.now()): number {
  const row = db
    .prepare(
      'SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?'
    )
    .get(userId, now) as { n: number };
  return row.n;
}
