/**
 * The error taxonomy.
 *
 * Everything thrown deliberately is an {@link AppError}. It carries a stable
 * wire code, the HTTP status that code maps to, and a message that is written
 * for a player rather than for an operator - anything an operator needs goes
 * in `internal`, which is logged and never serialised.
 *
 * Anything thrown *undeliberately* is turned into INTERNAL by the error
 * handler, with the original kept in the log. That asymmetry is the whole
 * point: a stack trace, a SQL string or an email address must not be able to
 * reach a response body by accident.
 */

import type { ApiErrorDetail, ErrorCode } from '../../../shared/protocol';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  SESSION_EXPIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VERSION_CONFLICT: 409,
  EMAIL_IN_USE: 409,
  EMAIL_NOT_VERIFIED: 403,
  INVALID_TOKEN: 400,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  REJECTED: 422,
  INTERNAL: 500
};

export interface AppErrorOptions {
  readonly details?: readonly ApiErrorDetail[];
  /** Operator-facing context. Logged, never returned. */
  readonly internal?: string;
  readonly retryAfter?: number;
  readonly cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: readonly ApiErrorDetail[] | undefined;
  readonly internal: string | undefined;
  readonly retryAfter: number | undefined;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = options.details;
    this.internal = options.internal;
    this.retryAfter = options.retryAfter;
  }
}

export const badRequest = (message: string, options?: AppErrorOptions) =>
  new AppError('BAD_REQUEST', message, options);

export const validationFailed = (details: readonly ApiErrorDetail[]) =>
  new AppError('VALIDATION_FAILED', 'Some of those values are not valid.', { details });

export const unauthenticated = (internal?: string) =>
  new AppError('UNAUTHENTICATED', 'Sign in to continue.', internal ? { internal } : {});

/**
 * The single answer to every failed sign-in.
 *
 * Wrong password, unknown email, disabled account and deleted account all
 * land here, with the real reason in `internal`, so the endpoint cannot be
 * used to find out which addresses have accounts.
 */
export const invalidCredentials = (internal?: string) =>
  new AppError('INVALID_CREDENTIALS', 'That email and password do not match.', {
    ...(internal ? { internal } : {})
  });

export const sessionExpired = (internal?: string) =>
  new AppError('SESSION_EXPIRED', 'Your session has expired. Sign in again.', {
    ...(internal ? { internal } : {})
  });

export const forbidden = (message = 'You cannot do that.', options?: AppErrorOptions) =>
  new AppError('FORBIDDEN', message, options);

export const notFound = (message = 'Not found.') => new AppError('NOT_FOUND', message);

export const conflict = (message: string, options?: AppErrorOptions) =>
  new AppError('CONFLICT', message, options);

export const versionConflict = (internal?: string) =>
  new AppError('VERSION_CONFLICT', 'Your progress moved on somewhere else. Reloading it.', {
    ...(internal ? { internal } : {})
  });

export const emailInUse = () =>
  new AppError('EMAIL_IN_USE', 'That email is already registered.', {});

export const emailNotVerified = () =>
  new AppError('EMAIL_NOT_VERIFIED', 'Verify your email address to continue.');

export const invalidToken = (internal?: string) =>
  new AppError('INVALID_TOKEN', 'That link is invalid or has expired.', {
    ...(internal ? { internal } : {})
  });

export const rejected = (message: string, options?: AppErrorOptions) =>
  new AppError('REJECTED', message, options);

export const internalError = (internal: string, cause?: unknown) =>
  new AppError('INTERNAL', 'Something went wrong. Try again.', { internal, cause });

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}
