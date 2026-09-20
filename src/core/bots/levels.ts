import type { BotLevelId, BotProfile } from './types';

/**
 * Difficulty comes from behaviour, not from bending the rules: every bot
 * moves slower than the player can, and every bot can be beaten by placing
 * the ball where it has to travel furthest.
 */
export const BOT_LEVELS: Readonly<Record<BotLevelId, BotProfile>> = {
  rookie: {
    id: 'rookie',
    name: 'Rookie',
    blurb: 'Slow to react, guesses bounces',
    rank: 1,
    xpFactor: 0.7,
    reaction: 0.4,
    prediction: 0.18,
    aimError: 110,
    speed: 500,
    deadzone: 24,
    consistency: 0.5,
    recovery: 0.3,
    placement: 0.15,
    pressure: 0.22,
    assist: 0
  },
  amateur: {
    id: 'amateur',
    name: 'Amateur',
    blurb: 'Reads the easy angles',
    rank: 2,
    xpFactor: 0.9,
    reaction: 0.28,
    prediction: 0.48,
    aimError: 78,
    speed: 680,
    deadzone: 15,
    consistency: 0.68,
    recovery: 0.55,
    placement: 0.4,
    pressure: 0.45,
    assist: 0
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    blurb: 'Tracks bounces, places returns',
    rank: 3,
    xpFactor: 1.15,
    reaction: 0.22,
    prediction: 0.7,
    aimError: 58,
    speed: 800,
    deadzone: 12,
    consistency: 0.78,
    recovery: 0.72,
    placement: 0.55,
    pressure: 0.62,
    assist: 0
  },
  elite: {
    id: 'elite',
    name: 'Elite',
    blurb: 'Corrects mid-flight, punishes gaps',
    rank: 4,
    xpFactor: 1.4,
    reaction: 0.19,
    prediction: 0.78,
    aimError: 58,
    speed: 860,
    deadzone: 9,
    consistency: 0.82,
    recovery: 0.84,
    placement: 0.7,
    pressure: 0.7,
    assist: 0
  },
  legend: {
    id: 'legend',
    name: 'Legend',
    blurb: 'Rarely fooled, holds up at speed',
    rank: 5,
    xpFactor: 1.75,
    reaction: 0.15,
    prediction: 0.88,
    aimError: 48,
    speed: 950,
    deadzone: 6,
    consistency: 0.88,
    recovery: 0.93,
    placement: 0.82,
    pressure: 0.82,
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
