import type { BotLevelId, BotProfile } from './types';

/**
 * Difficulty comes from behaviour, not from bending the rules: every bot
 * has a visible travel limit, and every bot can be beaten by placing
 * the ball where it has to travel furthest.
 */
export const BOT_LEVELS: Readonly<Record<BotLevelId, BotProfile>> = {
  rookie: {
    id: 'rookie',
    name: 'Rookie',
    blurb: 'Slow to react, guesses bounces',
    rank: 1,
    xpFactor: 0.7,
    reaction: 0.34,
    prediction: 0.3,
    aimError: 95,
    speed: 600,
    deadzone: 24,
    consistency: 0.62,
    recovery: 0.5,
    placement: 0.3,
    pressure: 0.35,
    assist: 0
  },
  amateur: {
    id: 'amateur',
    name: 'Amateur',
    blurb: 'Reads easy angles and arms charged returns',
    rank: 2,
    xpFactor: 1.5,
    reaction: 0.24,
    prediction: 0.6,
    aimError: 65,
    speed: 830,
    deadzone: 15,
    consistency: 0.78,
    recovery: 0.7,
    placement: 0.5,
    pressure: 0.6,
    assist: 0
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    blurb: 'Plans placements and saves a dash for exposed gaps',
    rank: 3,
    xpFactor: 2.5,
    reaction: 0.17,
    prediction: 0.86,
    aimError: 45,
    speed: 1080,
    deadzone: 12,
    consistency: 0.9,
    recovery: 0.85,
    placement: 0.75,
    pressure: 0.82,
    assist: 0
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    blurb: 'Corrects mid-flight and combines attacks with guard timing',
    rank: 4,
    xpFactor: 3.5,
    reaction: 0.125,
    prediction: 0.94,
    aimError: 30,
    speed: 1330,
    deadzone: 9,
    consistency: 0.96,
    recovery: 0.94,
    placement: 0.9,
    pressure: 0.93,
    assist: 0
  },
  legend: {
    id: 'legend',
    name: 'Legend',
    blurb: 'Plans reversals, reads hazards and coordinates four skills',
    rank: 5,
    xpFactor: 5.0,
    reaction: 0.095,
    prediction: 0.98,
    aimError: 24,
    speed: 1550,
    deadzone: 6,
    consistency: 0.98,
    recovery: 0.98,
    placement: 0.97,
    pressure: 0.98,
    assist: 0
  },
  wall: {
    id: 'wall',
    name: 'The Wall',
    blurb: 'Endless sparring partner',
    rank: 3,
    xpFactor: 1,
    reaction: 0.1,
    prediction: 0.95,
    aimError: 26,
    speed: 1240,
    deadzone: 4,
    consistency: 0.95,
    recovery: 0.95,
    placement: 0.3,
    pressure: 0.95,
    assist: 0.8
  }
};

/** The bots a player can pick, weakest first. */
export const SELECTABLE_BOTS: readonly BotProfile[] = [
  BOT_LEVELS.rookie,
  BOT_LEVELS.amateur,
  BOT_LEVELS.pro,
  BOT_LEVELS.elite,
  BOT_LEVELS.legend
];

export const DEFAULT_BOT: BotLevelId = 'amateur';

export function botProfile(id: BotLevelId): BotProfile {
  return BOT_LEVELS[id] ?? BOT_LEVELS[DEFAULT_BOT];
}

export function isBotLevelId(value: unknown): value is BotLevelId {
  return typeof value === 'string' && value in BOT_LEVELS;
}
