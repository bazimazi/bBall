import type { GoalView } from '../../game/types';

/** How each goal state reads, in the pause menu's list and the in-match goals button. */
export const GOAL_STATUS: Readonly<Record<GoalView['state'], string>> = {
  active: 'In progress',
  reached: 'Target reached · win to earn',
  missed: 'Missed this match',
  earned: 'Star earned'
};
