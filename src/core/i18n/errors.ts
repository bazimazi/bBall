import type { ErrorCode } from '../../../shared/protocol';
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
