import type { PlayerProfile } from '../profile/types';
import { cloneProgress } from '../profile/progress';
import { createRun, isRunActive, pickBoon, pressureUnlocked } from './run';

/**
 * The three things a player can do to a Gauntlet run outside a match, as
 * pure functions over a profile. The client runs them for its optimistic
 * update and the server runs the very same ones to decide whether to accept
 * them - which is what keeps a queued pick from meaning two different things
 * on the two sides.
 *
 * Each returns the new profile, or null when the action is not allowed.
 */

/** Begin a run at `pressure`. Refused while one is under way, or above what has been unlocked. */
export function startRunOn(
  profile: PlayerProfile,
  seed: string,
  pressure: number,
  now = Date.now()
): PlayerProfile | null {
  const progress = profile.progress;
  if (isRunActive(progress.run)) return null;
  if (!seed || seed.length > 40) return null;
  if (pressure < 0 || pressure > pressureUnlocked(progress.runRecords)) return null;
  const next = cloneProgress(progress);
  next.run = createRun(seed, pressure, now);
  return { ...profile, progress: next };
}

/** Take a boon from the waiting draft. */
export function pickBoonOn(profile: PlayerProfile, id: string): PlayerProfile | null {
  const run = profile.progress.run;
  if (!isRunActive(run)) return null;
  const picked = pickBoon(run, id);
  if (!picked) return null;
  const next = cloneProgress(profile.progress);
  next.run = picked;
  return { ...profile, progress: next };
}

/** Walk away from a run. It counts as played - as far as it got - and never as cleared. */
export function abandonRunOn(profile: PlayerProfile): PlayerProfile | null {
  const run = profile.progress.run;
  if (!isRunActive(run)) return null;
  const next = cloneProgress(profile.progress);
  next.runRecords.runs += 1;
  next.runRecords.bestStage = Math.max(next.runRecords.bestStage, run.stage);
  next.lastRun = { ...run, finished: true, won: false, offer: null };
  next.run = null;
  return { ...profile, progress: next };
}
