/**
 * The offline queue.
 *
 * Everything a signed-in player does that changes their save is written here
 * before it is attempted, and removed only once the server has confirmed it.
 * A closed tab, a dead battery or a tunnel therefore costs nothing: the queue
 * is in localStorage, and the next session drains it.
 *
 * Three properties make that safe:
 *
 * - **Every entry has a client-generated id.** The server records applied ids,
 *   so replaying the queue after a lost response applies nothing twice.
 * - **Entries are ordered and stay ordered.** Buying a talent and then
 *   equipping the ability it unlocked only works in that order.
 * - **The queue is bounded.** A player who stays offline for a month is far
 *   more likely to be a bug than a person; past the cap the *oldest* entries
 *   are dropped rather than the newest, because a stale menu preference
 *   matters less than the match just finished.
 */

import type { SyncOp } from '../../../shared/protocol';
import { MAX_SYNC_OPS } from '../../../shared/protocol';
import { loadRecord, saveRecord, type StoreSpec } from '../storage/localStore';

export const OUTBOX_KEY = 'bball.outbox';
const OUTBOX_VERSION = 1;

/** Entries kept before the oldest start being discarded. */
export const OUTBOX_CAPACITY = 300;

export interface OutboxRecord {
  ops: SyncOp[];
  /** Set when the queue had to drop entries, so the UI can say so once. */
  dropped: number;
}

function create(): OutboxRecord {
  return { ops: [], dropped: 0 };
}

/**
 * Repair rather than reject.
 *
 * An entry the current build does not recognise is dropped and the rest are
 * kept - losing one queued preference is better than losing the six matches
 * queued behind it.
 */
function validate(data: unknown): OutboxRecord | null {
  if (typeof data !== 'object' || data === null) return null;
  const source = data as { ops?: unknown; dropped?: unknown };
  const ops: SyncOp[] = [];
  if (Array.isArray(source.ops)) {
    for (const entry of source.ops) {
      if (typeof entry !== 'object' || entry === null) continue;
      const op = entry as SyncOp;
      if (typeof op.kind !== 'string' || typeof op.opId !== 'string') continue;
      if (typeof op.payload !== 'object' || op.payload === null) continue;
      ops.push(op);
    }
  }
  const dropped = typeof source.dropped === 'number' && source.dropped > 0 ? source.dropped : 0;
  return { ops: ops.slice(-OUTBOX_CAPACITY), dropped };
}

const SPEC: StoreSpec<OutboxRecord> = {
  key: OUTBOX_KEY,
  version: OUTBOX_VERSION,
  create,
  migrate: (data) => data,
  validate
};

let cache: OutboxRecord | null = null;

function state(): OutboxRecord {
  if (!cache) cache = loadRecord(SPEC).value;
  return cache;
}

function persist(): void {
  if (cache) saveRecord(SPEC, cache);
}

export function queued(): readonly SyncOp[] {
  return state().ops;
}

export function pendingCount(): number {
  return state().ops.length;
}

export function droppedCount(): number {
  return state().dropped;
}

export function enqueue(op: SyncOp): void {
  const record = state();
  // A repeated op id is the same intent arriving twice; keep the newer body.
  const existing = record.ops.findIndex((item) => item.opId === op.opId);
  if (existing >= 0) record.ops[existing] = op;
  else record.ops.push(op);

  if (record.ops.length > OUTBOX_CAPACITY) {
    const overflow = record.ops.length - OUTBOX_CAPACITY;
    record.ops.splice(0, overflow);
    record.dropped += overflow;
  }
  persist();
}

/** The next batch to send, in order, capped at what one push may carry. */
export function nextBatch(): readonly SyncOp[] {
  return state().ops.slice(0, MAX_SYNC_OPS);
}

/** Remove entries the server has resolved, whether applied or refused. */
export function resolve(opIds: readonly string[]): void {
  if (opIds.length === 0) return;
  const done = new Set(opIds);
  const record = state();
  record.ops = record.ops.filter((op) => !done.has(op.opId));
  persist();
}

export function acknowledgeDropped(): void {
  const record = state();
  if (record.dropped === 0) return;
  record.dropped = 0;
  persist();
}

/** Empty the queue. Used on sign-out, where the queue belongs to nobody. */
export function clearOutbox(): void {
  cache = create();
  persist();
}

/** Test seam: forget the in-memory copy and re-read from storage. */
export function resetOutboxCache(): void {
  cache = null;
}
