import type { PlayerProfile } from '../profile/types';
import { cloneProgress } from '../profile/progress';
import { advanceRun, createRun, draftFor, isRunActive, pickBoon, pressureUnlocked } from './run';
import { boonById } from './boons';
import { atBoundary, type RunFormat } from './formats';
export type RunAction =
  | 'continue'
  | 'bank'
  | 'safe'
  | 'risk'
  | 'repair'
  | 'commit'
  | 'restart'
  | 'reroll'
  | `recycle:${string}`
  | `upgrade:${string}`;

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
  now = Date.now(),
  format?: RunFormat
): PlayerProfile | null {
  const progress = profile.progress;
  if (isRunActive(progress.run)) return null;
  if (!seed || seed.length > 40) return null;
  if (
    !Number.isInteger(pressure) ||
    pressure < 0 ||
    pressure > pressureUnlocked(progress.runRecords)
  )
    return null;
  const next = cloneProgress(progress);
  next.run = createRun(seed, pressure, now, format);
  next.run.equipment = { version: 1, kit: { ...profile.progress.workshop.equipped } };
  return { ...profile, progress: next };
}

export function runActionOn(profile: PlayerProfile, action: RunAction): PlayerProfile | null {
  const next = cloneProgress(profile.progress);
  const run = next.run;
  if (action === 'continue') {
    const last = next.lastRun;
    if (
      isRunActive(run) ||
      !last?.won ||
      !last.finished ||
      last.version !== 2 ||
      last.format === 'endless'
    )
      return null;
    next.run = {
      ...last,
      format: 'endless',
      actOffset: last.stage % 6,
      finished: false,
      won: false,
      offer: null
    };
    return { ...profile, progress: next };
  }
  if (!isRunActive(run) || run.version !== 2) return null;
  const boundary = atBoundary(run);
  if (action === 'commit') {
    if (run.offer || run.attempt) return null;
    run.attempt = { stage: run.stage };
  } else if (action === 'restart') {
    if (!run.attempt || run.attempt.stage !== run.stage) return null;
    const lost = advanceRun(run, false, 0, 0).save;
    if (lost.finished) {
      next.runRecords.runs++;
      next.runRecords.bestStage = Math.max(next.runRecords.bestStage, lost.stage);
      next.lastRun = lost;
      next.run = null;
    } else next.run = lost;
  } else if (run.attempt) return null;
  else if (action === 'reroll') {
    if (!run.offer || (run.credits ?? 0) < 2 || run.offer.every((id) => id === 'repair-credit'))
      return null;
    run.credits = (run.credits ?? 0) - 2;
    run.draftRoll = (run.draftRoll ?? 0) + 1;
    run.offer = draftFor(run, run.stage - 1);
  } else if (action.startsWith('recycle:') || action.startsWith('upgrade:')) {
    if (!boundary || run.offer) return null;
    const id = action.slice(action.indexOf(':') + 1),
      boon = boonById(id),
      rank = run.boons[id] ?? 0;
    if (!boon || rank <= 0) return null;
    if (action.startsWith('recycle:')) {
      if (boon.family !== 'relic') return null;
      delete run.boons[id];
      run.credits = Math.min(9, (run.credits ?? 0) + 2);
    } else {
      if (
        boon.instant ||
        boon.family === 'relic' ||
        boon.family === 'duo' ||
        rank >= boon.maxRank ||
        (run.credits ?? 0) < 2
      )
        return null;
      run.boons[id] = rank + 1;
      run.credits = (run.credits ?? 0) - 2;
    }
  } else if (action === 'bank') {
    if (!boundary || run.offer || run.stage === 0 || run.format !== 'endless') return null;
    next.runRecords.runs++;
    next.runRecords.bestStage = Math.max(next.runRecords.bestStage, run.stage);
    next.lastRun = { ...run, finished: true, won: true, offer: null };
    next.run = null;
  } else if (action === 'repair') {
    if (!boundary || run.offer || (run.credits ?? 0) < 3 || run.hearts >= 5) return null;
    run.credits = (run.credits ?? 0) - 3;
    run.hearts++;
  } else if (action === 'safe' || action === 'risk') {
    if (!boundary || run.offer) return null;
    run.route = action;
  } else return null;
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
