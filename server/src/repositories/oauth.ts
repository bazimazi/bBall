/**
 * The two short-lived records a social sign-in needs.
 *
 * A *flow* is an authorization request we started: it holds the PKCE verifier
 * and the nonce, and its existence is the proof that a callback belongs to us.
 * A *handoff* is the one-time code the game exchanges for a session once the
 * provider has answered.
 *
 * Both are single use and both expire in minutes. Consuming either is a
 * conditional UPDATE rather than a read followed by a write, so two callbacks
 * racing on the same state cannot both win.
 */

import { createHash } from 'node:crypto';

import type { Db } from '../db/index';

/** An authorization request lives long enough for a player to sign in. */
export const FLOW_TTL_SECONDS = 10 * 60;
/** A handoff code is redeemed by the game immediately on return. */
export const HANDOFF_TTL_SECONDS = 2 * 60;

export interface OAuthFlowRow {
  state: string;
  provider: string;
  code_verifier: string;
  nonce: string;
  redirect_uri: string;
  created_at: number;
  expires_at: number;
  consumed_at: number | null;
}

export function createFlow(
  db: Db,
  flow: {
    state: string;
    provider: string;
    codeVerifier: string;
    nonce: string;
    redirectUri: string;
  },
  now = Date.now()
): OAuthFlowRow {
  db.prepare(
    `INSERT INTO oauth_flows (state, provider, code_verifier, nonce, redirect_uri, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    flow.state,
    flow.provider,
    flow.codeVerifier,
    flow.nonce,
    flow.redirectUri,
    now,
    now + FLOW_TTL_SECONDS * 1000
  );
  return db.prepare('SELECT * FROM oauth_flows WHERE state = ?').get(flow.state) as OAuthFlowRow;
}

/**
 * Spend a flow, returning it only if it was live.
 *
 * The guard is in the UPDATE, so a replayed callback - the back button, a
 * double-submitted form, an attacker retrying a captured redirect - finds
 * nothing to consume.
 */
export function consumeFlow(db: Db, state: string, now = Date.now()): OAuthFlowRow | null {
  const row = db.prepare('SELECT * FROM oauth_flows WHERE state = ?').get(state) as
    OAuthFlowRow | undefined;
  if (!row || row.consumed_at !== null || row.expires_at <= now) return null;

  const result = db
    .prepare('UPDATE oauth_flows SET consumed_at = ? WHERE state = ? AND consumed_at IS NULL')
    .run(now, state);
  if (result.changes === 0) return null;
  return { ...row, consumed_at: now };
}

export interface OAuthHandoffRow {
  code_hash: string;
  user_id: string;
  provider: string;
  created_user: number;
  created_at: number;
  expires_at: number;
  consumed_at: number | null;
}

/** Only the digest is stored, for the same reason refresh tokens are hashed. */
export function hashHandoff(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

export function createHandoff(
  db: Db,
  handoff: { code: string; userId: string; provider: string; createdUser: boolean },
  now = Date.now()
): void {
  db.prepare(
    `INSERT INTO oauth_handoffs (code_hash, user_id, provider, created_user, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    hashHandoff(handoff.code),
    handoff.userId,
    handoff.provider,
    handoff.createdUser ? 1 : 0,
    now,
    now + HANDOFF_TTL_SECONDS * 1000
  );
}

export function consumeHandoff(db: Db, code: string, now = Date.now()): OAuthHandoffRow | null {
  const hash = hashHandoff(code);
  const row = db.prepare('SELECT * FROM oauth_handoffs WHERE code_hash = ?').get(hash) as
    OAuthHandoffRow | undefined;
  if (!row || row.consumed_at !== null || row.expires_at <= now) return null;

  const result = db
    .prepare(
      'UPDATE oauth_handoffs SET consumed_at = ? WHERE code_hash = ? AND consumed_at IS NULL'
    )
    .run(now, hash);
  if (result.changes === 0) return null;
  return { ...row, consumed_at: now };
}

/** Housekeeping, called by the same sweep that clears sessions. */
export function removeExpiredOAuth(db: Db, now = Date.now()): number {
  let removed = 0;
  removed += db.prepare('DELETE FROM oauth_flows WHERE expires_at < ?').run(now).changes;
  removed += db.prepare('DELETE FROM oauth_handoffs WHERE expires_at < ?').run(now).changes;
  return removed;
}
