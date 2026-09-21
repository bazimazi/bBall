/**
 * Identifier generation.
 *
 * Every public identifier is a v4 UUID: opaque, unguessable and impossible to
 * enumerate. Sort keys use a lexicographically ordered id instead, so an index
 * on the primary key doubles as a time index without a second column.
 */

import { randomBytes, randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

const ENCODING = '0123456789abcdefghjkmnpqrstvwxyz';

/**
 * A 26-character, time-ordered, URL-safe id (ULID layout).
 *
 * Used where rows are read back in creation order - matches, progression
 * events - so "newest first" is a primary-key scan rather than a sort.
 */
export function newSortableId(now = Date.now()): string {
  let time = '';
  let remaining = now;
  for (let i = 9; i >= 0; i--) {
    time = ENCODING[remaining % 32]! + time;
    remaining = Math.floor(remaining / 32);
  }

  const random = randomBytes(16);
  let suffix = '';
  for (let i = 0; i < 16; i++) suffix += ENCODING[random[i]! % 32]!;
  return time + suffix;
}

/** A high-entropy opaque secret, safe in a URL or an HTTP header. */
export function newSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
