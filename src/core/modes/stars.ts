import type { MatchResult } from './types';

/**
 * Star goals: the stretch targets a stage - or a daily - sets on top of
 * simply winning.
 *
 * The first star is always the win. The other two are goals like these,
 * picked per stage to teach something: win by a margin, keep a clean sheet,
 * hold a long rally, land flicks, be quick. Every one is checked from the
 * finished match alone, so the client, the server and the result card all
 * agree without any of them trusting the others.
 */
export type StarGoalId =
  | 'margin'
  | 'shutout'
  | 'rally'
  | 'flicks'
  | 'fast'
  | 'returns'
  | 'banks'
  | 'switches'
  | 'breaks'
  | 'gates';

export interface StarGoal {
  readonly id: StarGoalId;
  readonly value: number;
}

/** "an 8-hit rally", "a 12-hit rally": the article a spoken number takes. */
function article(value: number): string {
  return String(value).startsWith('8') || value === 11 || value === 18 ? 'an' : 'a';
}

export function starGoalLabel(goal: StarGoal): string {
  switch (goal.id) {
    case 'margin':
      return `Win by ${goal.value} or more`;
    case 'shutout':
      return 'Win without conceding';
    case 'rally':
      return `Reach ${article(goal.value)} ${goal.value}-hit rally`;
    case 'flicks':
      return `Land ${goal.value} flick${goal.value === 1 ? '' : 's'}`;
    case 'fast':
      return `Win inside ${goal.value} seconds`;
    case 'returns':
      return `Make ${goal.value} returns`;
    case 'banks':
      return `Land ${goal.value} rail banks`;
    case 'switches':
      return `Trigger ${goal.value} switches`;
    case 'breaks':
      return `Break ${goal.value} structures`;
    case 'gates':
      return `Cross ${goal.value} gate openings`;
  }
}

type Evidence = Pick<
  MatchResult,
  'won' | 'scoreYou' | 'scoreBot' | 'bestRally' | 'flicks' | 'seconds' | 'hits' | 'court'
>;

/** Did the match meet this goal? Goals only count in a match that was won. */
export function starGoalMet(goal: StarGoal, result: Evidence): boolean {
  if (!result.won) return false;
  switch (goal.id) {
    case 'margin':
      return result.scoreYou - result.scoreBot >= goal.value;
    case 'shutout':
      return result.scoreBot === 0;
    case 'rally':
      return result.bestRally >= goal.value;
    case 'flicks':
      return result.flicks >= goal.value;
    case 'fast':
      return result.seconds <= goal.value;
    case 'returns':
      return result.hits >= goal.value;
    case 'banks':
    case 'switches':
    case 'breaks':
    case 'gates':
      return (result.court?.[goal.id] ?? 0) >= goal.value;
  }
}

/**
 * The stars a match earned, as a bitmask: bit 0 the win, bits 1 and 2 the
 * two goals. A mask rather than a count, because the third star can be
 * earned on a day the second one was not.
 */
export function starsEarned(goals: readonly [StarGoal, StarGoal], result: Evidence): number {
  if (!result.won) return 0;
  let mask = 1;
  if (starGoalMet(goals[0], result)) mask |= 2;
  if (starGoalMet(goals[1], result)) mask |= 4;
  return mask;
}

/** How many stars a mask holds. */
export function starCount(mask: number): number {
  return (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
}
