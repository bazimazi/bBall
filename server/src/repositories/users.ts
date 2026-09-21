/**
 * Users, linked identities and the one-time email tokens.
 *
 * Email is stored twice on purpose: `email` keeps whatever the player typed,
 * so mail to them looks right, and `email_normalized` is the lowercased,
 * trimmed form that carries the unique constraint. Without the second column
 * two accounts could differ only by capitalisation.
 */

import type { Db } from '../db/index';
import { newId } from '../lib/ids';

export type UserStatus = 'active' | 'disabled' | 'deleted';

export interface UserRow {
  id: string;
  email: string;
  email_normalized: string;
  email_verified: number;
  password_hash: string | null;
  status: UserStatus;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function findUserByEmail(db: Db, email: string): UserRow | null {
  const row = db
    .prepare('SELECT * FROM users WHERE email_normalized = ?')
    .get(normalizeEmail(email)) as UserRow | undefined;
  return row ?? null;
}

export function findUserById(db: Db, id: string): UserRow | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ?? null;
}

export interface CreateUserInput {
  readonly email: string;
  readonly passwordHash: string;
  readonly emailVerified?: boolean;
}

export function createUser(db: Db, input: CreateUserInput, now = Date.now()): UserRow {
  const id = newId();
  db.prepare(
    `INSERT INTO users (id, email, email_normalized, email_verified, password_hash,
                        status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
  ).run(
    id,
    input.email.trim(),
    normalizeEmail(input.email),
    input.emailVerified ? 1 : 0,
    input.passwordHash,
    now,
    now
  );
  db.prepare(
    `INSERT INTO auth_identities (id, user_id, provider, subject, created_at)
     VALUES (?, ?, 'password', ?, ?)`
  ).run(newId(), id, normalizeEmail(input.email), now);
  return findUserById(db, id)!;
}

/**
 * Create an account that has no password, only a linked provider.
 *
 * `password_hash` stays null, which is what makes sign-in refuse a password
 * attempt on this account rather than comparing against something empty.
 */
export function createUserWithIdentity(
  db: Db,
  input: {
    readonly email: string;
    readonly emailVerified: boolean;
    readonly provider: string;
    readonly subject: string;
  },
  now = Date.now()
): UserRow {
  const id = newId();
  db.prepare(
    `INSERT INTO users (id, email, email_normalized, email_verified, password_hash,
                        status, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, 'active', ?, ?)`
  ).run(id, input.email.trim(), normalizeEmail(input.email), input.emailVerified ? 1 : 0, now, now);
  db.prepare(
    `INSERT INTO auth_identities (id, user_id, provider, subject, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(newId(), id, input.provider, input.subject, now);
  return findUserById(db, id)!;
}

export function hasPassword(db: Db, userId: string): boolean {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as
    { password_hash: string | null } | undefined;
  return typeof row?.password_hash === 'string' && row.password_hash.length > 0;
}

export function setPasswordHash(db: Db, userId: string, hash: string, now = Date.now()): void {
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    hash,
    now,
    userId
  );
}

export function markEmailVerified(db: Db, userId: string, now = Date.now()): void {
  db.prepare('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?').run(now, userId);
}

/**
 * Delete an account and everything hanging off it.
 *
 * A real delete, not a flag: every child table cascades from `users`, so this
 * single statement removes the profile, the progression history, the sessions
 * and the match log. The row is what the player asked to be gone.
 */
export function deleteUser(db: Db, userId: string): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

export function listProviders(db: Db, userId: string): string[] {
  return (
    db.prepare('SELECT provider FROM auth_identities WHERE user_id = ?').all(userId) as {
      provider: string;
    }[]
  ).map((row) => row.provider);
}

/**
 * Link an external identity provider to an account.
 *
 * Unused today and deliberately present: adding Google or Apple is a route
 * that resolves the provider's subject, calls this, and then issues a session
 * exactly like a password sign-in does. No table changes, no reshaping of the
 * user record.
 */
export function linkIdentity(
  db: Db,
  userId: string,
  provider: string,
  subject: string,
  now = Date.now()
): void {
  db.prepare(
    `INSERT INTO auth_identities (id, user_id, provider, subject, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (provider, subject) DO NOTHING`
  ).run(newId(), userId, provider, subject, now);
}

export function findUserByIdentity(db: Db, provider: string, subject: string): UserRow | null {
  const row = db
    .prepare(
      `SELECT u.* FROM users u
         JOIN auth_identities i ON i.user_id = u.id
        WHERE i.provider = ? AND i.subject = ?`
    )
    .get(provider, subject) as UserRow | undefined;
  return row ?? null;
}

// ---------------------------------------------------------- email tokens

export type EmailTokenKind = 'verify' | 'reset';

export interface EmailTokenRow {
  id: string;
  user_id: string;
  kind: EmailTokenKind;
  token_hash: string;
  created_at: number;
  expires_at: number;
  consumed_at: number | null;
}

/**
 * Issue a one-time token, retiring any earlier one of the same kind.
 *
 * Retiring the old one is the point: a player who clicks "send me another
 * link" three times should not end up with three live password resets.
 */
export function createEmailToken(
  db: Db,
  userId: string,
  kind: EmailTokenKind,
  tokenHash: string,
  ttlSeconds: number,
  now = Date.now()
): EmailTokenRow {
  db.prepare(
    'UPDATE email_tokens SET consumed_at = ? WHERE user_id = ? AND kind = ? AND consumed_at IS NULL'
  ).run(now, userId, kind);

  const id = newId();
  db.prepare(
    `INSERT INTO email_tokens (id, user_id, kind, token_hash, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, kind, tokenHash, now, now + ttlSeconds * 1000);

  return db.prepare('SELECT * FROM email_tokens WHERE id = ?').get(id) as EmailTokenRow;
}

/**
 * Spend a token, returning it only if it was live.
 *
 * The consume and the check are one statement, so two clicks on the same
 * reset link cannot both succeed.
 */
export function consumeEmailToken(
  db: Db,
  kind: EmailTokenKind,
  tokenHash: string,
  now = Date.now()
): EmailTokenRow | null {
  const row = db
    .prepare('SELECT * FROM email_tokens WHERE token_hash = ? AND kind = ?')
    .get(tokenHash, kind) as EmailTokenRow | undefined;
  if (!row) return null;
  if (row.consumed_at !== null || row.expires_at <= now) return null;

  const result = db
    .prepare('UPDATE email_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL')
    .run(now, row.id);
  if (result.changes === 0) return null;
  return { ...row, consumed_at: now };
}
