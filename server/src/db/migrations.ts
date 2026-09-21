/**
 * The schema, as an ordered list of forward migrations.
 *
 * Each entry is applied exactly once, inside a transaction, and recorded in
 * `schema_migrations` with a checksum of its SQL. Editing a migration that
 * has already run is therefore a startup error rather than a silent drift
 * between environments - the fix is always a new migration.
 *
 * Keeping the SQL in a TypeScript module rather than in `.sql` files on disk
 * means the production bundle carries its own schema: there is no "did the
 * migrations folder get deployed" failure mode.
 *
 * Conventions:
 * - Timestamps are epoch milliseconds in INTEGER columns.
 * - Booleans are INTEGER 0/1 with a CHECK constraint.
 * - Every child row cascades from its owner, so deleting a user really does
 *   delete the account.
 */

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly up: string;
}

const init = `
CREATE TABLE users (
  id                TEXT    PRIMARY KEY,
  email             TEXT    NOT NULL,
  -- Lowercased and trimmed. The unique constraint lives here rather than on
  -- email so Player@x.com and player@x.com cannot both register.
  email_normalized  TEXT    NOT NULL UNIQUE,
  email_verified    INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1)),
  -- Null for an account that only has a third-party identity.
  password_hash     TEXT,
  status            TEXT    NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active', 'disabled', 'deleted')),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  deleted_at        INTEGER
);

CREATE INDEX idx_users_status ON users (status);

-- One row per linked sign-in method. 'password' is one of them, which is what
-- lets Google or Apple be added later without touching the users table.
CREATE TABLE auth_identities (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider    TEXT    NOT NULL,
  -- The provider's own stable id for the account.
  subject     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (provider, subject)
);

CREATE INDEX idx_auth_identities_user ON auth_identities (user_id);

-- One row per refresh token ever issued. Rotation inserts a new row and
-- points the old one at it, so a stolen token that is replayed can be traced
-- to its family and the whole family revoked.
CREATE TABLE sessions (
  id                TEXT    PRIMARY KEY,
  user_id           TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  family_id         TEXT    NOT NULL,
  refresh_hash      TEXT    NOT NULL UNIQUE,
  created_at        INTEGER NOT NULL,
  last_used_at      INTEGER NOT NULL,
  expires_at        INTEGER NOT NULL,
  revoked_at        INTEGER,
  revoked_reason    TEXT,
  replaced_by       TEXT REFERENCES sessions (id) ON DELETE SET NULL,
  ip_fingerprint    TEXT,
  agent_fingerprint TEXT
);

CREATE INDEX idx_sessions_user    ON sessions (user_id, expires_at);
CREATE INDEX idx_sessions_family  ON sessions (family_id);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

CREATE TABLE email_tokens (
  id          TEXT    PRIMARY KEY,
  user_id     TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL CHECK (kind IN ('verify', 'reset')),
  token_hash  TEXT    NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX idx_email_tokens_user ON email_tokens (user_id, kind);
CREATE INDEX idx_email_tokens_expires ON email_tokens (expires_at);

-- The authoritative profile. Scalars that the server owns outright live in
-- columns; everything with a natural key of its own gets its own table.
CREATE TABLE profiles (
  user_id           TEXT    PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  -- Identifies this save lineage. A reset mints a new one, which is how a
  -- client tells "my cache is stale" from "my cache is for a save that no
  -- longer exists".
  save_id           TEXT    NOT NULL,
  -- Optimistic concurrency. Bumped by every accepted write.
  version           INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  display_name      TEXT    NOT NULL,
  avatar            TEXT    NOT NULL,
  xp                INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  -- The anti-farm damper's counter, reset when the local day rolls over.
  daily_day         TEXT    NOT NULL,
  daily_matches     INTEGER NOT NULL DEFAULT 0 CHECK (daily_matches >= 0),
  last_bot          TEXT    NOT NULL,
  last_practice_bot TEXT    NOT NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX idx_profiles_updated ON profiles (updated_at);
-- Leaderboards read this; it exists now so adding one is a query, not a migration.
CREATE INDEX idx_profiles_xp ON profiles (xp DESC);

CREATE TABLE profile_stats (
  user_id            TEXT    PRIMARY KEY REFERENCES profiles (user_id) ON DELETE CASCADE,
  matches            INTEGER NOT NULL DEFAULT 0 CHECK (matches >= 0),
  wins               INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses             INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
  points_won         INTEGER NOT NULL DEFAULT 0 CHECK (points_won >= 0),
  points_lost        INTEGER NOT NULL DEFAULT 0 CHECK (points_lost >= 0),
  rally_hits         INTEGER NOT NULL DEFAULT 0 CHECK (rally_hits >= 0),
  best_rally         INTEGER NOT NULL DEFAULT 0 CHECK (best_rally >= 0),
  current_streak     INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  best_streak        INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  play_seconds       INTEGER NOT NULL DEFAULT 0 CHECK (play_seconds >= 0),
  shutouts           INTEGER NOT NULL DEFAULT 0 CHECK (shutouts >= 0),
  comebacks          INTEGER NOT NULL DEFAULT 0 CHECK (comebacks >= 0),
  endless_runs       INTEGER NOT NULL DEFAULT 0 CHECK (endless_runs >= 0),
  endless_best       INTEGER NOT NULL DEFAULT 0 CHECK (endless_best >= 0),
  challenges_cleared INTEGER NOT NULL DEFAULT 0 CHECK (challenges_cleared >= 0),
  cups_played        INTEGER NOT NULL DEFAULT 0 CHECK (cups_played >= 0),
  cups_won           INTEGER NOT NULL DEFAULT 0 CHECK (cups_won >= 0),
  best_cup_round     INTEGER NOT NULL DEFAULT 0 CHECK (best_cup_round >= 0),
  best_cup_tier      INTEGER NOT NULL DEFAULT -1 CHECK (best_cup_tier >= -1)
);

CREATE TABLE profile_talent_stats (
  user_id         TEXT    PRIMARY KEY REFERENCES profiles (user_id) ON DELETE CASCADE,
  points_earned   INTEGER NOT NULL DEFAULT 0 CHECK (points_earned >= 0),
  respecs         INTEGER NOT NULL DEFAULT 0 CHECK (respecs >= 0),
  abilities_used  INTEGER NOT NULL DEFAULT 0 CHECK (abilities_used >= 0),
  power_strikes   INTEGER NOT NULL DEFAULT 0 CHECK (power_strikes >= 0),
  dashes          INTEGER NOT NULL DEFAULT 0 CHECK (dashes >= 0),
  perfect_guards  INTEGER NOT NULL DEFAULT 0 CHECK (perfect_guards >= 0),
  crits           INTEGER NOT NULL DEFAULT 0 CHECK (crits >= 0),
  shield_saves    INTEGER NOT NULL DEFAULT 0 CHECK (shield_saves >= 0),
  second_chances  INTEGER NOT NULL DEFAULT 0 CHECK (second_chances >= 0),
  ultimates       INTEGER NOT NULL DEFAULT 0 CHECK (ultimates >= 0),
  best_drive      INTEGER NOT NULL DEFAULT 0 CHECK (best_drive >= 0)
);

CREATE TABLE profile_bot_wins (
  user_id TEXT    NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  bot_id  TEXT    NOT NULL,
  wins    INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
  PRIMARY KEY (user_id, bot_id)
) WITHOUT ROWID;

-- Per-mode statistics. Not derivable from the lifetime totals, and the shape
-- leaderboards and seasons will want.
CREATE TABLE profile_mode_stats (
  user_id      TEXT    NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  mode_id      TEXT    NOT NULL,
  matches      INTEGER NOT NULL DEFAULT 0 CHECK (matches >= 0),
  wins         INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses       INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
  points_won   INTEGER NOT NULL DEFAULT 0 CHECK (points_won >= 0),
  points_lost  INTEGER NOT NULL DEFAULT 0 CHECK (points_lost >= 0),
  best_rally   INTEGER NOT NULL DEFAULT 0 CHECK (best_rally >= 0),
  play_seconds INTEGER NOT NULL DEFAULT 0 CHECK (play_seconds >= 0),
  xp_earned    INTEGER NOT NULL DEFAULT 0 CHECK (xp_earned >= 0),
  PRIMARY KEY (user_id, mode_id)
) WITHOUT ROWID;

CREATE TABLE talent_ranks (
  user_id   TEXT    NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  talent_id TEXT    NOT NULL,
  rank      INTEGER NOT NULL CHECK (rank > 0),
  PRIMARY KEY (user_id, talent_id)
) WITHOUT ROWID;

CREATE TABLE equipped_abilities (
  user_id    TEXT    NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  slot       INTEGER NOT NULL CHECK (slot >= 0),
  ability_id TEXT    NOT NULL,
  PRIMARY KEY (user_id, slot),
  -- An ability may be slotted once. The database says so as well as the code.
  UNIQUE (user_id, ability_id)
);

CREATE TABLE profile_achievements (
  user_id        TEXT    NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  achievement_id TEXT    NOT NULL,
  unlocked_at    INTEGER NOT NULL,
  -- Recorded so a reward can never be granted twice for the same row.
  xp_awarded     INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  PRIMARY KEY (user_id, achievement_id)
) WITHOUT ROWID;

CREATE TABLE profile_unlocks (
  user_id     TEXT    NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  cosmetic_id TEXT    NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, cosmetic_id)
) WITHOUT ROWID;

CREATE TABLE equipped_cosmetics (
  user_id     TEXT NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  slot        TEXT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  PRIMARY KEY (user_id, slot)
) WITHOUT ROWID;

CREATE TABLE challenge_records (
  user_id      TEXT    NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  challenge_id TEXT    NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  cleared      INTEGER NOT NULL DEFAULT 0 CHECK (cleared IN (0, 1)),
  best_rally   INTEGER NOT NULL DEFAULT 0 CHECK (best_rally >= 0),
  cleared_at   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, challenge_id)
) WITHOUT ROWID;

-- Cup runs, live and historic. The live one is the single row with
-- status = 'active'; the rest are the player's record.
CREATE TABLE tournaments (
  id           TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES profiles (user_id) ON DELETE CASCADE,
  tier         INTEGER NOT NULL CHECK (tier >= 0),
  round        INTEGER NOT NULL DEFAULT 0 CHECK (round >= 0),
  results_json TEXT    NOT NULL DEFAULT '[]',
  status       TEXT    NOT NULL CHECK (status IN ('active', 'finished', 'abandoned')),
  champion     INTEGER NOT NULL DEFAULT 0 CHECK (champion IN (0, 1)),
  started_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  finished_at  INTEGER
);

CREATE INDEX idx_tournaments_user ON tournaments (user_id, started_at DESC);
-- At most one cup in progress per player, enforced by the database.
CREATE UNIQUE INDEX idx_tournaments_active
  ON tournaments (user_id) WHERE status = 'active';

-- Every accepted match. client_match_id is what makes a re-send a no-op
-- rather than a second helping of XP.
CREATE TABLE matches (
  id               TEXT    PRIMARY KEY,
  user_id          TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  client_match_id  TEXT    NOT NULL,
  mode             TEXT    NOT NULL,
  bot_id           TEXT    NOT NULL,
  ranked           INTEGER NOT NULL CHECK (ranked IN (0, 1)),
  won              INTEGER NOT NULL CHECK (won IN (0, 1)),
  score_you        INTEGER NOT NULL CHECK (score_you >= 0),
  score_bot        INTEGER NOT NULL CHECK (score_bot >= 0),
  best_rally       INTEGER NOT NULL CHECK (best_rally >= 0),
  hits             INTEGER NOT NULL CHECK (hits >= 0),
  seconds          INTEGER NOT NULL CHECK (seconds >= 0),
  xp_awarded       INTEGER NOT NULL DEFAULT 0 CHECK (xp_awarded >= 0),
  challenge_id     TEXT,
  tournament_id    TEXT REFERENCES tournaments (id) ON DELETE SET NULL,
  objective_met    INTEGER NOT NULL DEFAULT 0 CHECK (objective_met IN (0, 1)),
  played_at        INTEGER NOT NULL,
  recorded_at      INTEGER NOT NULL,
  UNIQUE (user_id, client_match_id)
);

CREATE INDEX idx_matches_user ON matches (user_id, recorded_at DESC);
CREATE INDEX idx_matches_mode ON matches (user_id, mode, recorded_at DESC);

-- The progression audit trail: what changed, when, and why. Answers "where
-- did my XP go", and is the raw material for any later fraud review.
CREATE TABLE progression_events (
  id           TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind         TEXT    NOT NULL,
  xp_delta     INTEGER NOT NULL DEFAULT 0,
  level_before INTEGER NOT NULL DEFAULT 1,
  level_after  INTEGER NOT NULL DEFAULT 1,
  detail_json  TEXT    NOT NULL DEFAULT '{}',
  created_at   INTEGER NOT NULL
);

CREATE INDEX idx_progression_events_user ON progression_events (user_id, created_at DESC);

-- Sync operations already applied, keyed by the client's own op id. A queue
-- that is flushed twice after a dropped response applies once.
CREATE TABLE applied_ops (
  user_id     TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  op_id       TEXT    NOT NULL,
  kind        TEXT    NOT NULL,
  result_json TEXT    NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, op_id)
) WITHOUT ROWID;

CREATE INDEX idx_applied_ops_created ON applied_ops (created_at);

-- Whole-response idempotency for unsafe endpoints, keyed by the caller's
-- Idempotency-Key header. The request hash is stored so the same key used for
-- a different body is a conflict rather than a wrong replay.
CREATE TABLE idempotency_keys (
  user_id       TEXT    NOT NULL,
  key           TEXT    NOT NULL,
  endpoint      TEXT    NOT NULL,
  request_hash  TEXT    NOT NULL,
  status_code   INTEGER NOT NULL,
  response_json TEXT    NOT NULL,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
) WITHOUT ROWID;

CREATE INDEX idx_idempotency_expires ON idempotency_keys (expires_at);

-- Guest saves that have already been carried into an account, so pressing
-- "bring my progress over" twice cannot double a player's XP.
CREATE TABLE claimed_saves (
  user_id    TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  save_id    TEXT    NOT NULL,
  outcome    TEXT    NOT NULL,
  xp_before  INTEGER NOT NULL DEFAULT 0,
  xp_after   INTEGER NOT NULL DEFAULT 0,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, save_id)
) WITHOUT ROWID;
`;

const syncState = `
-- Per-device sync bookkeeping. Kept out of profiles so a new device is an
-- insert rather than a profile write, and so a device can be forgotten
-- without touching progression.
CREATE TABLE sync_state (
  user_id        TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  device_id      TEXT    NOT NULL,
  last_pull_at   INTEGER,
  last_push_at   INTEGER,
  -- The profile version this device last saw. Drives conflict detection.
  last_version   INTEGER NOT NULL DEFAULT 0,
  platform       TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (user_id, device_id)
) WITHOUT ROWID;

CREATE INDEX idx_sync_state_user ON sync_state (user_id, updated_at DESC);
`;

const oauth = `
-- An authorization request that has been started but not yet answered.
--
-- The PKCE verifier and the nonce live here rather than in a cookie, because
-- a provider redirect can land in a different browsing context to the one
-- that started it and a cookie would not always come back. The row is the
-- proof that this callback belongs to a flow we began; it is single use and
-- short lived.
CREATE TABLE oauth_flows (
  state          TEXT    PRIMARY KEY,
  provider       TEXT    NOT NULL,
  code_verifier  TEXT    NOT NULL,
  nonce          TEXT    NOT NULL,
  redirect_uri   TEXT    NOT NULL,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,
  consumed_at    INTEGER
) WITHOUT ROWID;

CREATE INDEX idx_oauth_flows_expires ON oauth_flows (expires_at);

-- The one-time code handed back to the game after a successful sign-in.
--
-- Tokens are deliberately not put in the redirect URL: a URL ends up in
-- browser history, in a screenshot and in whatever gets pasted into a bug
-- report. The game exchanges this code for a session over POST instead, which
-- also means the flow works identically whether or not cookies survived the
-- round trip through the provider.
CREATE TABLE oauth_handoffs (
  code_hash    TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider     TEXT    NOT NULL,
  -- True when this sign-in created the account, so the game knows to offer
  -- carrying the guest save over.
  created_user INTEGER NOT NULL DEFAULT 0 CHECK (created_user IN (0, 1)),
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  consumed_at  INTEGER
) WITHOUT ROWID;

CREATE INDEX idx_oauth_handoffs_user ON oauth_handoffs (user_id);
CREATE INDEX idx_oauth_handoffs_expires ON oauth_handoffs (expires_at);
`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'init', up: init },
  { version: 2, name: 'sync_state', up: syncState },
  { version: 3, name: 'oauth', up: oauth }
];
