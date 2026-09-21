/**
 * Schema parsing at the HTTP boundary.
 *
 * One helper, used by every route, so a validation failure always produces
 * the same body shape and the same status - and so no route can accidentally
 * hand a service an unparsed payload.
 */

import type { ZodType } from 'zod';

import type { ApiErrorDetail } from '../../../shared/protocol';
import { validationFailed } from '../domain/errors';

export function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value ?? {});
  if (result.success) return result.data;

  const details: ApiErrorDetail[] = result.error.issues.slice(0, 20).map((issue) => ({
    path: issue.path.join('.') || '(body)',
    message: issue.message
  }));
  throw validationFailed(details);
}
