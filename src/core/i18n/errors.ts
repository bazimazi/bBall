import type { ErrorCode } from '../../../shared/protocol';
import { ApiError, NetworkError } from '../net/client';
import { settingsStore } from '../settings/store';
import { t } from './index';

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  BAD_REQUEST: 'That request could not be read.',
  VALIDATION_FAILED: 'Some of those values are not valid.',
  UNAUTHENTICATED: 'Sign in to continue.',
  INVALID_CREDENTIALS: 'That email and password do not match.',
  SESSION_EXPIRED: 'Your session has expired. Sign in again.',
  FORBIDDEN: 'You cannot do that.',
  NOT_FOUND: 'Not found.',
  CONFLICT: 'The requested change could not be applied.',
  VERSION_CONFLICT: 'Your progress moved on somewhere else. Reloading it.',
  EMAIL_IN_USE: 'That email is already registered.',
  EMAIL_NOT_VERIFIED: 'Verify your email address to continue.',
  INVALID_TOKEN: 'That link is invalid or has expired.',
  RATE_LIMITED: 'Too many requests. Wait a moment.',
  PAYLOAD_TOO_LARGE: 'That request is too large.',
  REJECTED: 'Not accepted for rewards.',
  INTERNAL: 'Something went wrong. Try again.'
};

/**
 * Why an account request failed, in words that blame the right thing.
 *
 * Three different failures used to read alike: the player's own connection
 * being down, the account server being down or missing (a refused
 * connection, a 502, or a page that is not the API at all), and the server
 * answering "no". Only the first is the player's network, and only a
 * signed-in player has anything waiting to sync - a guest whose sign-in
 * failed is told to try again, never that it "will sync later".
 *
 * Returns English; the screen translates what it renders.
 */
export function accountErrorText(error: unknown, signedIn: boolean): string {
  const after = signedIn
    ? ' Your progress is saved on this device and will sync later.'
    : ' You can keep playing as a guest.';
  if (error instanceof NetworkError) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      return signedIn
        ? 'This device is offline. Your progress is saved here and will sync when you reconnect.'
        : 'This device is offline. Connect to the internet to sign in.' + after;
    if (error.message === 'The server took too long to answer.')
      return 'The account server took too long to answer. Try again in a moment.' + after;
    return 'Could not reach the account server. Try again later.' + after;
  }
  if (error instanceof ApiError) {
    // The fetch wrapper invents an error with no request id when the reply was
    // not the API's own JSON - a proxy's 502, or a page served in its place.
    const notTheApi = !error.requestId;
    if (notTheApi || error.status === 502 || error.status === 503 || error.status === 504)
      return 'The account server is not available right now. Try again later.' + after;
    return apiErrorText(error);
  }
  return 'Something went wrong. Try again.';
}

/** Server validation details can change with its schema and remain in English. */
export function apiErrorText(error: {
  code: ErrorCode;
  message: string;
  details: readonly { message: string }[] | undefined;
}): string {
  if (settingsStore.getSnapshot().language === 'en') {
    const detail = error.details?.[0]?.message;
    return detail ? `${error.message} ${detail}` : error.message;
  }
  const translated = t(error.message);
  return error.code === 'VALIDATION_FAILED' || translated === error.message
    ? t(ERROR_MESSAGES[error.code])
    : translated;
}
