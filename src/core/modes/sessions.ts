import { recipe } from './recipes';
import { NEUTRAL_MODIFIERS, type MatchModifiers, type MatchOptions } from './types';

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
/** A wave owns its penalties; nothing from a previous court carries forward. */
export function waveModifiers(options: MatchOptions | undefined, depth: number): MatchModifiers {
  return {
    ...NEUTRAL_MODIFIERS,
    ...waveRecipe(options, depth).modifiers,
    // Lives and a steady rally acceleration replace the recipe's score rules.
    startScore: { you: 0, bot: 0 },
    maxSpeedScale: 1.5,
    speedPerHitScale: 1.35
  };
}
export function endlessRecordKey(options: MatchOptions | undefined): string {
  return options?.waves ? 'waves' : (options?.arenaId ?? 'open');
}
