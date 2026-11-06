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
/** The wave from which court recipes stop getting harder. */
const RECIPE_PEAK = 16;

/**
 * A wave owns its penalties; nothing from a previous court carries forward.
 *
 * Past the last recipe band the courts stop getting harder, so the ball does
 * instead: a faster serve and a higher ceiling each wave. Without it a
 * developed build survived at the same pace forever - measured, still alive
 * at wave 35 after fifteen minutes.
 */
export function waveModifiers(options: MatchOptions | undefined, depth: number): MatchModifiers {
  const beyond = Math.max(0, depth - RECIPE_PEAK);
  const recipe = waveRecipe(options, depth).modifiers;
  return {
    ...NEUTRAL_MODIFIERS,
    ...recipe,
    // Lives and a steady rally acceleration replace the recipe's score rules.
    startScore: { you: 0, bot: 0 },
    serveSpeedScale: (recipe.serveSpeedScale ?? 1) * (1 + Math.min(0.5, beyond * 0.03)),
    maxSpeedScale: Math.min(2, 1.5 + beyond * 0.03),
    speedPerHitScale: 1.35
  };
}
export function endlessRecordKey(options: MatchOptions | undefined): string {
  return options?.waves ? 'waves' : (options?.arenaId ?? 'open');
}
