import type { GameEngine } from '../game/engine';

// Diagnostics are requested explicitly. Ordinary play installs no recorder.
type ExperienceMeta = ImportMeta & { readonly env?: { readonly VITE_EXPERIENCE_CAPTURE?: string } };
export const experienceEnabled =
  (import.meta as ExperienceMeta).env?.VITE_EXPERIENCE_CAPTURE === '1' ||
  (typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('experience') === '1');

export interface MenuLoad {
  page: string;
  startedAtMs: number;
  durationMs: number;
  outcome: 'loaded' | 'failed';
}

const menuLoads: MenuLoad[] = [];
const listeners = new Set<(engine: GameEngine | null) => void>();
let engine: GameEngine | null = null;
let engineStartedAtMs: number | null = null;

export function experienceEngine(instance: GameEngine | null): void {
  if (!experienceEnabled) return;
  engine = instance;
  if (instance && engineStartedAtMs === null) engineStartedAtMs = performance.now();
  for (const listener of listeners) listener(instance);
}

export function watchExperienceEngine(listener: (engine: GameEngine | null) => void): () => void {
  listeners.add(listener);
  listener(engine);
  return () => listeners.delete(listener);
}

export function experienceBoot() {
  return { engineStartedAtMs, menuLoads: menuLoads.map((entry) => ({ ...entry })) };
}

/** Import duration includes fetching/evaluation, not the subsequent UI paint. */
export async function loadMenu<T>(page: string, load: () => Promise<T>): Promise<T> {
  if (!experienceEnabled) return load();
  const startedAtMs = performance.now();
  let outcome: MenuLoad['outcome'] = 'failed';
  try {
    const result = await load();
    outcome = 'loaded';
    return result;
  } finally {
    if (menuLoads.length < 64)
      menuLoads.push({ page, startedAtMs, durationMs: performance.now() - startedAtMs, outcome });
  }
}
