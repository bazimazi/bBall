import { starGoalMet, type StarGoal } from './stars';
import type { MatchResult } from './types';

export interface MatchCoaching {
  readonly id:
    | 'first-return'
    | 'challenge-rally'
    | 'challenge-time'
    | 'challenge-shutout'
    | 'endless-rally'
    | 'star-needs-win'
    | 'placement'
    | 'mix-placement';
  readonly title: string;
  /** Facts from this finished match, distinct from the suggested experiment. */
  readonly evidence: string;
  readonly tip: string;
  readonly help: 'lesson' | 'guide';
}

function count(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`;
}

const CENTRE_TIP = 'Try centre returns first to keep the ball in play before aiming for corners.';
const PLACEMENT_TIP =
  'Try the outer part of your paddle for an angled return. Once comfortable, move that way at contact to try a flick.';
const MIX_TIP =
  'Try mixing centre and angled returns. Between shots, move toward the middle of your lane to leave room in both directions.';

/**
 * One optional next step, using recorded outcomes rather than guessing why a
 * miss happened. No timing, accuracy or unused-skill claims: the result has
 * no evidence for them. This never changes match rules or progression.
 */
export function coachingFor(
  result: MatchResult,
  goals: readonly StarGoal[] = []
): MatchCoaching | null {
  if (
    result.abandoned ||
    result.mode === 'versus' ||
    (result.mode === 'challenge' ? result.objectiveMet : result.won)
  )
    return null;

  // Challenges can be won without clearing their objective, or cleared
  // without winning. Explain the actual goal before offering general advice.
  const objective = result.mode === 'challenge' ? result.objective : null;
  if (objective?.id === 'rally')
    return {
      id: 'challenge-rally',
      title: 'Keep one rally going',
      evidence: `Your best rally was ${result.bestRally} hits; the target was ${objective.value}.`,
      tip: `${CENTRE_TIP} This challenge counts hits by both paddles in one rally; a win is not required.`,
      help: 'guide'
    };
  if (objective?.id === 'quick-win' && result.won)
    return {
      id: 'challenge-time',
      title: 'Try a shorter route to the win',
      evidence: `You won in ${count(result.seconds, 'second')}; the limit was ${count(objective.value, 'second')}.`,
      tip: 'Try angled returns to end rallies sooner. You can launch a serve when ready instead of waiting for its automatic countdown.',
      help: 'guide'
    };
  if (objective?.id === 'shutout' && result.won)
    return {
      id: 'challenge-shutout',
      title: 'Protect the next point',
      evidence: `You won but conceded ${count(result.scoreBot, 'point')}; this challenge requires none.`,
      tip: 'On the next attempt, focus on meeting each incoming ball before trying a sharper return.',
      help: 'guide'
    };

  if (result.hits === 0)
    return {
      id: 'first-return',
      title: 'Start with one return',
      evidence: 'No paddle returns were recorded in this match.',
      tip: 'Move into the ball’s path and try one centre return. The lesson gives you a slower shot and safe retries.',
      help: 'lesson'
    };

  if (result.mode === 'endless')
    return {
      id: 'endless-rally',
      title: 'Build the next rally',
      evidence: `Your longest rally was ${result.bestRally} hits, with ${count(result.hits, 'return')} across the run.`,
      tip: `${CENTRE_TIP} Aim to keep your next rally going one hit longer.`,
      help: 'guide'
    };

  const reached = goals.find(
    (goal) =>
      (goal.id === 'rally' || goal.id === 'flicks' || goal.id === 'returns') &&
      starGoalMet(goal, { ...result, won: true })
  );
  if (reached) {
    const evidence =
      reached.id === 'rally'
        ? `Your best rally was ${result.bestRally} hits; the target was ${reached.value}.`
        : reached.id === 'flicks'
          ? `You landed ${count(result.flicks, 'flick')}; the target was ${reached.value}.`
          : `You made ${count(result.hits, 'return')}; the target was ${reached.value}.`;
    return {
      id: 'star-needs-win',
      title: 'Pair the target with a win',
      evidence,
      tip: `That star requires the target and a win in the same match. ${result.flicks === 0 ? PLACEMENT_TIP : MIX_TIP}`,
      help: 'guide'
    };
  }

  if (result.flicks === 0)
    return {
      id: 'placement',
      title: 'Try a placed return',
      evidence: `You made ${count(result.hits, 'return')}; no flicks were recorded.`,
      tip: PLACEMENT_TIP,
      help: 'guide'
    };

  return {
    id: 'mix-placement',
    title: 'Mix your placement',
    evidence: `You landed ${count(result.flicks, 'flick')} and your longest rally was ${result.bestRally} hits.`,
    tip: MIX_TIP,
    help: 'guide'
  };
}
