/**
 * Versioned, validated localStorage access.
 *
 * Every record is wrapped in an envelope so the schema can move on without
 * breaking a save that was written months ago:
 *
 * ```json
 * { "v": 2, "data": { ... } }
 * ```
 *
 * Reads never throw. Anything unparseable, out of date beyond repair, or
 * failing validation falls back to a fresh record, and the bad payload is
 * parked under a `.broken` key so it can be inspected rather than silently
 * lost.
 */

export interface StoreSpec<T> {
  /** localStorage key. */
  readonly key: string;
  /** Current schema version. Bump whenever {@link migrate} needs to run. */
  readonly version: number;
  /** Build a brand new record. Must never throw. */
  create(): T;
  /**
   * Bring a payload written by `from` up one version. Called repeatedly until
   * the payload reaches the current version.
   */
  migrate(data: unknown, from: number): unknown;
  /**
   * Coerce an unknown payload into a valid record, or return `null` when it is
   * beyond saving. Implementations should repair what they can - a missing
   * field is not a reason to wipe a player's history.
   */
  validate(data: unknown): T | null;
}

export interface LoadResult<T> {
  readonly value: T;
  /** True when nothing usable was stored - i.e. this is a first run. */
  readonly fresh: boolean;
  /** True when stored data existed but had to be repaired or discarded. */
  readonly recovered: boolean;
}

interface Envelope {
  v: number;
  data: unknown;
}

// Keep only the latest failed write per record. Retrying persistence must not
// repeat a match, spend talent points again or resurrect an older offline queue.
const failedWrites = new Map<string, () => string>();
const unreadableKeys = new Set<string>();
const protectedKeys = new Set<string>();
const listeners = new Set<() => void>();

export type LocalSaveState = 'saved' | 'unsaved' | 'restore';

function snapshot(): LocalSaveState {
  if (failedWrites.size === 0) return 'saved';
  for (const key of failedWrites.keys()) if (protectedKeys.has(key)) return 'restore';
  return 'unsaved';
}

function publish(previous: LocalSaveState): void {
  if (previous === snapshot()) return;
  for (const listener of listeners) listener();
}

function tryWrite(key: string, encode: () => string): boolean {
  const store = available();
  if (!store) return false;
  try {
    // A fresh fallback created after a blocked read must not replace an older
    // record when storage returns. Reopening loads that record in a new session.
    if (unreadableKeys.has(key)) {
      if (store.getItem(key) !== null) {
        protectedKeys.add(key);
        return false;
      }
      unreadableKeys.delete(key);
      protectedKeys.delete(key);
    }
    store.setItem(key, encode());
    return true;
  } catch {
    return false;
  }
}

/** Device persistence only: successful cloud sync is a separate status. */
export const localSaveStatus = {
  getSnapshot: snapshot,

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Try the current records again without replaying their domain operations. */
  retry(): boolean {
    const previous = snapshot();
    for (const [key, encode] of failedWrites) {
      if (tryWrite(key, encode)) failedWrites.delete(key);
    }
    publish(previous);
    return failedWrites.size === 0;
  }
};

function available(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // private mode, or storage blocked by policy
  }
}

function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    typeof (value as Envelope).v === 'number'
  );
}

function park(store: Storage, key: string, raw: string): void {
  try {
    store.setItem(`${key}.broken`, raw.slice(0, 4000));
  } catch {
    /* best effort only */
  }
}

export function loadRecord<T>(spec: StoreSpec<T>): LoadResult<T> {
  const store = available();
  const fresh = { value: spec.create(), fresh: true, recovered: false } as const;
  if (!store) {
    unreadableKeys.add(spec.key);
    return fresh;
  }

  let raw: string | null;
  try {
    raw = store.getItem(spec.key);
  } catch {
    unreadableKeys.add(spec.key);
    return fresh;
  }
  if (raw === null) return fresh;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    park(store, spec.key, raw);
    return { value: spec.create(), fresh: true, recovered: true };
  }

  let version = 0;
  let data: unknown = parsed;
  if (isEnvelope(parsed)) {
    version = parsed.v;
    data = parsed.data;
  }

  let recovered = version !== spec.version;
  try {
    // Step the payload forward one version at a time. A version from the
    // future is left alone - validate() decides whether it is still usable.
    let guard = 0;
    while (version < spec.version && guard++ < 64) {
      data = spec.migrate(data, version);
      version++;
    }
  } catch {
    park(store, spec.key, raw);
    return { value: spec.create(), fresh: true, recovered: true };
  }

  let value: T | null;
  try {
    value = spec.validate(data);
  } catch {
    value = null;
  }

  if (!value) {
    park(store, spec.key, raw);
    return { value: spec.create(), fresh: true, recovered: true };
  }

  // Validation may have repaired fields; treat that as a recovery so the
  // caller can re-save in the canonical shape.
  recovered = recovered || JSON.stringify(value) !== JSON.stringify(data);
  return { value, fresh: false, recovered };
}

export function saveRecord<T>(spec: StoreSpec<T>, value: T): boolean {
  const previous = snapshot();
  const encode = () => JSON.stringify({ v: spec.version, data: value } satisfies Envelope);
  const saved = tryWrite(spec.key, encode);
  if (saved) failedWrites.delete(spec.key);
  else failedWrites.set(spec.key, encode);
  publish(previous);
  return saved;
}

export function clearRecord<T>(spec: StoreSpec<T>): void {
  const previous = snapshot();
  // Forgetting an account's cache must also cancel an unsaved cache write.
  failedWrites.delete(spec.key);
  unreadableKeys.delete(spec.key);
  protectedKeys.delete(spec.key);
  publish(previous);
  const store = available();
  if (!store) return;
  try {
    store.removeItem(spec.key);
  } catch {
    /* best effort only */
  }
}
