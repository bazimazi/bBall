/**
 * The HTTP client.
 *
 * Everything the game sends to the server goes through one `request`
 * function, because everything the game sends needs the same four things and
 * getting any of them wrong is invisible until a player loses progress:
 *
 * - **A deadline.** `fetch` has no timeout. A request that hangs on a dying
 *   mobile connection would otherwise keep a sync in flight forever.
 * - **A refresh.** Access tokens are short-lived by design. A 401 triggers
 *   exactly one refresh - shared by every request waiting on it - and the
 *   original request is retried once.
 * - **A retry.** Network failures and 5xx responses are retried with backoff;
 *   4xx responses never are, because the server has already decided.
 * - **An idempotency key.** Every unsafe request carries one, so a retry
 *   after a lost response cannot be mistaken for a second attempt.
 *
 * It throws {@link ApiError} for anything the server refused and
 * {@link NetworkError} for anything that never reached it. The distinction
 * matters: the first is a decision to show the player, the second is a
 * reason to queue and try later.
 */

import type { ApiErrorBody, ErrorCode } from '../../../shared/protocol';
import { HEADER_IDEMPOTENCY, HEADER_PROTOCOL, PROTOCOL_VERSION } from '../../../shared/protocol';

/**
 * Where the API lives.
 *
 * Same-origin by default, which is the deployment that needs no CORS at all;
 * `VITE_API_URL` points a dev build at a server on another port.
 */
const buildEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
export const API_BASE: string = (buildEnv?.VITE_API_URL ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: readonly { path: string; message: string }[] | undefined;
  readonly requestId: string | undefined;
  readonly retryAfter: number | undefined;

  constructor(status: number, body: ApiErrorBody['error']) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.details = body.details ? [...body.details] : undefined;
    this.requestId = body.requestId;
    this.retryAfter = body.retryAfter;
  }
}

/** The request never got an answer. Retryable, and safe to queue. */
export class NetworkError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export function isOffline(error: unknown): boolean {
  return error instanceof NetworkError;
}

export interface TokenProvider {
  /** The current access token, or null when signed out. */
  accessToken(): string | null;
  /** Obtain a fresh access token. Resolves false when the session is gone. */
  refresh(): Promise<boolean>;
  /** Called when the server says the session cannot be recovered. */
  onSignedOut(): void;
}

export interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  /** Send the access token. Off for register, login and config. */
  readonly auth?: boolean;
  /** Sent as Idempotency-Key. Generated for unsafe methods when omitted. */
  readonly idempotencyKey?: string | null;
  readonly timeoutMs?: number;
  /** Attempts on network failure or 5xx. 1 means no retry. */
  readonly attempts?: number;
  readonly signal?: AbortSignal;
  readonly headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_ATTEMPTS = 3;

let tokens: TokenProvider | null = null;

/** Wire the client to whatever is holding the session. Called once, at boot. */
export function setTokenProvider(provider: TokenProvider): void {
  tokens = provider;
}

/**
 * A refresh in flight, shared by everyone who needs it.
 *
 * Without this, five queued requests hitting an expired token at once would
 * fire five refreshes - and since refresh tokens rotate and a reused one
 * revokes the family, four of them would sign the player out.
 */
let refreshing: Promise<boolean> | null = null;

function refreshOnce(): Promise<boolean> {
  if (!tokens) return Promise.resolve(false);
  if (!refreshing) {
    refreshing = tokens.refresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

function newKey(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return random ?? `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function parseError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const error = body?.error;
  if (error && typeof error.code === 'string') return new ApiError(response.status, error);
  return new ApiError(response.status, {
    code: response.status >= 500 ? 'INTERNAL' : 'BAD_REQUEST',
    message: 'Something went wrong. Try again.',
    requestId: ''
  });
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const unsafe = method !== 'GET';
  const attempts = Math.max(1, options.attempts ?? (unsafe ? DEFAULT_ATTEMPTS : 2));

  // Generated once, outside the retry loop: the whole point is that every
  // attempt at this operation carries the same key.
  const idempotencyKey =
    options.idempotencyKey === null ? null : (options.idempotencyKey ?? (unsafe ? newKey() : null));

  let refreshed = false;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort);

    try {
      const headers: Record<string, string> = {
        accept: 'application/json',
        [HEADER_PROTOCOL]: String(PROTOCOL_VERSION),
        ...options.headers
      };
      if (options.body !== undefined) headers['content-type'] = 'application/json';
      if (idempotencyKey) headers[HEADER_IDEMPOTENCY] = idempotencyKey;

      if (options.auth !== false) {
        const token = tokens?.accessToken();
        if (token) headers.authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        // The refresh cookie is httpOnly and same-site; sending credentials is
        // what lets a browser client refresh without holding the token itself.
        credentials: 'include',
        signal: controller.signal,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
      });

      if (response.status === 204) return undefined as T;

      if (response.ok) {
        const text = await response.text();
        return (text.length > 0 ? JSON.parse(text) : undefined) as T;
      }

      const error = await parseError(response);

      // One refresh, one retry. A second 401 after a successful refresh means
      // the session is genuinely gone.
      if (
        (error.code === 'SESSION_EXPIRED' || error.code === 'UNAUTHENTICATED') &&
        options.auth !== false &&
        !refreshed
      ) {
        refreshed = true;
        const ok = await refreshOnce();
        if (ok) {
          attempt -= 1; // the refresh is not one of the retries
          continue;
        }
        tokens?.onSignedOut();
        throw error;
      }

      // The server answered. Only a server-side fault is worth asking twice.
      if (response.status < 500 && response.status !== 429) throw error;
      lastError = error;

      const wait = error.retryAfter ? error.retryAfter * 1000 : 300 * 2 ** attempt;
      if (attempt < attempts - 1) await sleep(Math.min(wait, 8000));
      continue;
    } catch (error) {
      if (error instanceof ApiError) throw error;

      const network = new NetworkError(
        controller.signal.aborted ? 'The server took too long to answer.' : 'No connection.',
        error
      );
      lastError = network;
      if (attempt < attempts - 1) {
        await sleep(300 * 2 ** attempt);
        continue;
      }
      throw network;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  throw lastError instanceof Error ? lastError : new NetworkError('No connection.');
}

/** True when the browser believes there is a network. Advisory only. */
export function browserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}
