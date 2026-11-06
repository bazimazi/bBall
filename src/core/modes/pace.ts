import { BALANCE } from '../balance/config';
import { tierById } from '../tournament/bracket';
import type { MatchModifiers } from './types';

/**
 * Content pace: how much faster the ball is in the later content than the
 * opponent's rank alone makes it.
 *
 * Difficulty makes the ball harder to handle, and bot brains stop at the top
 * of the ladder. A developed build outclassed them by about level 25 - on the
 * first try, through most of the Journey - so from there the ball itself keeps
 * getting quicker: a faster serve, a higher ceiling and a steeper climb per
 * return. Pace costs a person far more than it costs a bot, whose read barely
 * notices it, which is exactly the gap this closes.
 *
 * Every value is a multiplier of 1 or more; the ball's hard ceiling still holds.
 */
const P = BALANCE.pace;

function bounded(value: number): number {
  return Math.min(P.max, Math.max(1, value));
}

/** A Journey stage: plain through the first five worlds, then world by world, then by Frontier sector. */
export function journeyPace(world: number, frontierSector = 0): number {
  if (frontierSector > 0) return bounded(P.frontier + frontierSector * P.frontierStep);
  if (world <= 5) return 1;
  return bounded(1 + (world - 5) * P.journeyStep);
}

/** A Gauntlet encounter: its act and the run's Pressure. */
export function runPace(act: number, pressure: number): number {
  return bounded(1 + act * P.runAct + pressure * P.runPressure);
}

/** A cup, from the level it opens at. Bronze to Gold stay plain. */
export function cupPace(tier: number): number {
  return bounded(1 + Math.max(0, tierById(tier).minLevel - P.cupFrom) * P.cupLevel);
}

/** Quick Match contracts. */
export function contractPace(contract: 'master' | 'mythic' | undefined): number {
  return contract === 'mythic' ? P.mythic : contract === 'master' ? P.master : 1;
}

/** Fold a pace into a match's modifiers: serve, ceiling and per-return growth together. */
export function withPace(modifiers: MatchModifiers, pace: number): MatchModifiers {
  if (pace <= 1) return modifiers;
  return {
    ...modifiers,
    serveSpeedScale: modifiers.serveSpeedScale * pace,
    maxSpeedScale: modifiers.maxSpeedScale * pace,
    speedPerHitScale: modifiers.speedPerHitScale * pace
  };
}
