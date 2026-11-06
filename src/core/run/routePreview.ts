import { actLength, actIndex, actStart, runLength } from './formats';
import { encounterFor, type RunSave } from './run';

/** Resolves the same encounters the server will commit; never consumes RNG or credits. */
export function routePreview(run: RunSave, route: 'safe' | 'risk') {
  const end = Math.min(runLength(run), actStart(run, actIndex(run) + 1));
  const encounters = Array.from(
    { length: Math.max(0, Math.min(actLength(run), end - run.stage)) },
    (_, i) => encounterFor({ ...run, route }, run.stage + i)
  );
  const creditsPerWin = route === 'risk' ? 2 : 1;
  return {
    encounters,
    creditsPerWin,
    creditRoom: Math.max(0, 9 - (run.credits ?? 0)),
    maximumCredits:
      encounters.filter((encounter) => encounter.stage + 1 < runLength(run)).length * creditsPerWin
  };
}
