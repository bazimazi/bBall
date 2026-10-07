import { recipe } from './recipes';
import type { MatchOptions } from './types';

export interface MatchSeries {
  length: 3 | 5;
  games: number;
  you: number;
  foe: number;
}
export function seriesComplete(series: MatchSeries): boolean {
  return Math.max(series.you, series.foe) > series.length / 2;
}
export function advanceSeries(series: MatchSeries, won: boolean): MatchSeries {
  if (seriesComplete(series)) return series;
  return {
    ...series,
    games: series.games + 1,
    you: series.you + Number(won),
    foe: series.foe + Number(!won)
  };
}
export function waveRecipe(options: MatchOptions | undefined, depth: number) {
  return recipe(
    `waves-v2-${options?.arenaId ?? 'open'}`,
    depth,
    Math.min(4, Math.floor(depth / 4))
  );
}
export function endlessRecordKey(options: MatchOptions | undefined): string {
  return options?.waves ? 'waves' : (options?.arenaId ?? 'open');
}
