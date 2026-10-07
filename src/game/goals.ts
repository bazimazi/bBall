import { starGoalLabel, starGoalMet } from '../core/modes/stars';
import type { GoalView } from './types';
import type { World } from './world';

export const NO_GOALS: readonly GoalView[] = [];

/** Display evidence at the same resolution and with the same rules as results. */
export function goalViews(world: World): readonly GoalView[] {
  const { match, rules } = world;
  if (!rules.goals) return NO_GOALS;
  const finished = match.status === 'over';
  const evidence = {
    won: match.winner === 'you',
    scoreYou: match.score.you,
    scoreBot: match.score.bot,
    bestRally: Math.max(match.bestThisMatch, match.rally),
    flicks: match.flicks,
    seconds: Math.round(match.elapsed),
    hits: match.hits,
    court: world.arena.course.events.you
  };
  return [
    {
      id: 'win',
      label: 'Win the match',
      progress: `${match.score.you}/${match.winScore} points`,
      state: finished ? (evidence.won ? 'earned' : 'missed') : 'active'
    },
    ...rules.goals.map((goal): GoalView => {
      let progress = '';
      let reached = false;
      let missed = false;
      switch (goal.id) {
        case 'banks':
        case 'switches':
        case 'breaks':
        case 'gates':
          progress = `${evidence.court[goal.id]}/${goal.value}`;
          reached = evidence.court[goal.id] >= goal.value;
          break;
        case 'rally':
          progress = `Rally ${evidence.bestRally}/${goal.value}`;
          reached = evidence.bestRally >= goal.value;
          break;
        case 'flicks':
          progress = `Flicks ${evidence.flicks}/${goal.value}`;
          reached = evidence.flicks >= goal.value;
          break;
        case 'returns':
          progress = `Returns ${evidence.hits}/${goal.value}`;
          reached = evidence.hits >= goal.value;
          break;
        case 'margin':
          progress = `Lead ${evidence.scoreYou - evidence.scoreBot}/${goal.value}`;
          // A lead can be lost, so it is never a secured target during play.
          missed = match.winScore - evidence.scoreBot < goal.value;
          break;
        case 'shutout':
          progress = `${evidence.scoreBot} conceded`;
          missed = evidence.scoreBot > 0;
          break;
        case 'fast':
          progress = `${evidence.seconds}/${goal.value}s`;
          missed = evidence.seconds > goal.value;
          break;
      }
      return {
        id: goal.id,
        label: starGoalLabel(goal),
        progress,
        state: finished
          ? starGoalMet(goal, evidence)
            ? 'earned'
            : 'missed'
          : missed
            ? 'missed'
            : reached
              ? 'reached'
              : 'active'
      };
    })
  ];
}
