/**
 * Seeded randomness for everything that has to come out the same twice: a
 * daily challenge on two phones, a run's draft on the client and on the
 * server. Never used where the answer may differ - the physics keeps
 * `Math.random`.
 */

/** FNV-1a: a stable 32-bit hash of a string. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: a tiny, good-enough PRNG. Returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A generator seeded from any number of parts. */
export function seeded(...parts: (string | number)[]): () => number {
  return mulberry32(hashString(parts.join('|')));
}

/** One item, chosen by a seeded generator. */
export function pickOne<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length) % items.length]!;
}
