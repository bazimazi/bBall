import type { BotLevelId } from '../bots/types';
import type { MatchModifiers, MatchObjective } from './types';

/**
 * A challenge is one short match with a twist and a single, stated goal. No
 * configuration, no sub-menus: tap it and play.
 */
export interface Challenge {
  readonly id: string;
  readonly name: string;
  /** One line describing the twist. */
  readonly blurb: string;
  readonly bot: BotLevelId;
  readonly winScore: number;
  readonly objective: MatchObjective;
  readonly modifiers: Partial<MatchModifiers>;
  readonly xp: number;
}

export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'needle',
    name: 'Needle',
    blurb: 'Your paddle is two thirds the size',
    bot: 'amateur',
    winScore: 3,
    objective: { id: 'win', label: 'Win the match', value: 0 },
    modifiers: { playerPaddleScale: 0.66 },
    xp: 120
  },
  {
    id: 'overdrive',
    name: 'Overdrive',
    blurb: 'The ball starts fast and keeps climbing',
    bot: 'pro',
    winScore: 3,
    objective: { id: 'win', label: 'Win the match', value: 0 },
    modifiers: { serveSpeedScale: 1.35, speedPerHitScale: 1.5, maxSpeedScale: 1.2 },
    xp: 150
  },
  {
    id: 'long-rally',
    name: 'Marathon',
    blurb: 'One rally, twenty-five returns',
    bot: 'pro',
    winScore: 3,
    objective: { id: 'rally', label: 'Reach a 25 rally', value: 25 },
    modifiers: { speedPerHitScale: 0.7 },
    xp: 140
  },
  {
    id: 'melting',
    name: 'Melting',
    blurb: 'Your paddle shrinks with every return',
    bot: 'amateur',
    winScore: 3,
    objective: { id: 'win', label: 'Win the match', value: 0 },
    modifiers: { shrinkPerHit: 0.022 },
    xp: 150
  },
  {
    id: 'comeback',
    name: 'Two Down',
    blurb: 'You start the match trailing 0-2',
    bot: 'pro',
    winScore: 3,
    objective: { id: 'win', label: 'Win the match', value: 0 },
    modifiers: { startScore: { you: 0, bot: 2 } },
    xp: 170
  },
  {
    id: 'flawless',
    name: 'Flawless',
    blurb: 'Beat the Elite without conceding',
    bot: 'elite',
    winScore: 3,
    objective: { id: 'shutout', label: 'Win 3-0', value: 0 },
    modifiers: {},
    xp: 220
  }
];

const BY_ID = new Map(CHALLENGES.map((item) => [item.id, item]));

export function challengeById(id: string): Challenge | undefined {
  return BY_ID.get(id);
}
