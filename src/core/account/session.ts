/**
 * Where the session lives on the device.
 *
 * Access tokens are kept in memory only. They last fifteen minutes and are
 * re-obtained on demand, so writing one to disk would buy nothing and give a
 * cross-site script something to steal.
 *
 * The refresh token is the long-lived credential, and where it goes depends
 * on how the game is deployed:
 *
 * - **Same origin as the API** (the normal production build): the server's
 *   httpOnly cookie is used and nothing is written here. A script running in
 *   the page cannot read an httpOnly cookie, which is the strongest option
 *   available to a browser client.
 * - **Different origin** (a dev build against a separate API port, or a
 *   static host with an API elsewhere): the cookie may not be sent, so the
 *   token is persisted. That is a real trade - localStorage is reachable from
 *   any script that gets into the page - and it is why the server rotates
 *   refresh tokens on every use and revokes an entire family when a spent one
 *   reappears. A stolen token is good for one refresh before it locks both
 *   the thief and the player out, and the player signs back in.
 *
 * Only the device id and the signed-in user's identity are persisted in both
 * cases, so the game knows whose cache it is holding before it has a token.
 */

import type { TokensDto, UserDto } from '../../../shared/protocol';
import { API_BASE } from '../net/client';

const SESSION_KEY = 'bball.session';
const DEVICE_KEY = 'bball.device';

/**
 * True when the API is same-origin, so the httpOnly refresh cookie will be
 * sent and there is no reason to keep a copy of the token ourselves.
 */
export const usesCookieSession = API_BASE === '';

interface StoredSession {
  readonly userId: string;
  readonly email: string;
  /** Absent under a cookie session. */
  readonly refreshToken?: string;
  readonly refreshExpiresAt?: number;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // private mode, or storage blocked by policy
  }
}

function read<T>(key: string): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* quota, or private mode - the session simply does not survive a reload */
  }
}

function drop(key: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* best effort only */
  }
}

/**
 * A stable id for this browser.
 *
 * Used only for sync bookkeeping - which device last pulled, which last
 * pushed - so a player can be told that another device has been playing. It
 * is random, per-browser, and never leaves the account it belongs to.
 */
export function deviceId(): string {
  const existing = read<string>(DEVICE_KEY);
  if (typeof existing === 'string' && existing.length >= 8) return existing;
  const id =
    `dev_${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`.slice(0, 60);
  write(DEVICE_KEY, id);
  return id;
}

/** The in-memory half of the session. Never persisted. */
let accessToken: string | null = null;
let accessExpiresAt = 0;

export function currentAccessToken(): string | null {
  // Treated as expired a little early so a request never starts with a token
  // that will have aged out by the time it arrives.
  if (!accessToken || accessExpiresAt - 5_000 <= Date.now()) return null;
  return accessToken;
}

export function accessTokenExpiresAt(): number {
  return accessExpiresAt;
}

export function storedSession(): StoredSession | null {
  const value = read<StoredSession>(SESSION_KEY);
  if (!value || typeof value.userId !== 'string' || typeof value.email !== 'string') return null;
  return value;
}

export function storedRefreshToken(): string | null {
  if (usesCookieSession) return null;
  const session = storedSession();
  if (!session?.refreshToken) return null;
  if (session.refreshExpiresAt && session.refreshExpiresAt <= Date.now()) return null;
  return session.refreshToken;
}

export function saveSession(user: UserDto, tokens: TokensDto): void {
  accessToken = tokens.accessToken;
  accessExpiresAt = tokens.accessExpiresAt;

  const stored: StoredSession = usesCookieSession
    ? { userId: user.id, email: user.email }
    : {
        userId: user.id,
        email: user.email,
        refreshToken: tokens.refreshToken,
        refreshExpiresAt: tokens.refreshExpiresAt
      };
  write(SESSION_KEY, stored);
}

/** Store rotated tokens without touching the remembered identity. */
export function updateTokens(tokens: TokensDto): void {
  accessToken = tokens.accessToken;
  accessExpiresAt = tokens.accessExpiresAt;

  if (usesCookieSession) return;
  const session = storedSession();
  if (!session) return;
  write(SESSION_KEY, {
    ...session,
    refreshToken: tokens.refreshToken,
    refreshExpiresAt: tokens.refreshExpiresAt
  } satisfies StoredSession);
}

export function clearSession(): void {
  accessToken = null;
  accessExpiresAt = 0;
  drop(SESSION_KEY);
}

/** True when this device remembers being signed in, token or cookie. */
export function hasRememberedSession(): boolean {
  return storedSession() !== null;
}

// ------------------------------------------------------- social sign-in

const PENDING_OAUTH_KEY = 'bball.oauth.pending';
/** A sign-in the player walked away from is not one to act on much later. */
const PENDING_OAUTH_TTL_MS = 15 * 60 * 1000;

export interface PendingOAuth {
  readonly provider: string;
  /** What the player chose about their guest save before leaving the page. */
  readonly claimGuestProgress: boolean;
  readonly startedAt: number;
}

/**
 * Remember what a social sign-in was for, across the round trip.
 *
 * Going to a provider unloads the page, so anything held in memory is gone by
 * the time the browser comes back. This is deliberately not the security
 * boundary - the server's own flow record is - it is only the player's
 * intent, so that "bring my progress with me" survives the detour instead of
 * having to be asked again afterwards.
 */
export function rememberPendingOAuth(pending: PendingOAuth): void {
  write(PENDING_OAUTH_KEY, pending);
}

/** Read the intent and forget it; it is good for exactly one return trip. */
export function takePendingOAuth(): PendingOAuth | null {
  const value = read<PendingOAuth>(PENDING_OAUTH_KEY);
  drop(PENDING_OAUTH_KEY);
  if (!value || typeof value.provider !== 'string') return null;
  if (Date.now() - value.startedAt > PENDING_OAUTH_TTL_MS) return null;
  return value;
}
