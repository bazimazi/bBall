import type { BotLevelId } from '../bots/types';
import type { BossSpec, MatchModifiers } from './types';

/**
 * The bosses.
 *
 * A boss is an ordinary bot brain wearing three things a normal opponent
 * never has: a court of its own, a trait, and phases. The phases are the
 * point - every boss changes when the player is winning, so the second half
 * of the fight asks a different question from the first, and the banner says
 * so out loud.
 *
 * Every trait is built from the same fair parts as the rest of the game: a
 * longer paddle, a sharper brain, a court that bends the ball. None of them
 * slows the player's paddle, and none of them hides the ball.
 */
export interface BossDef {
  readonly spec: BossSpec;
  /** The brain it opens the fight with. */
  readonly bot: BotLevelId;
  readonly winScore: number;
  readonly modifiers: Partial<MatchModifiers>;
}

export const BOSSES: readonly BossDef[] = [
  {
    spec: {
      id: 'colossus',
      name: 'Colossus',
      title: 'A paddle half again as long',
      hue: 28,
      phases: [
        { at: 2, label: 'It wakes up', bot: 'pro', botPaddleScale: 1.3 },
        { at: 4, label: 'Last stand', botPaddleScale: 1.15 }
      ]
    },
    bot: 'amateur',
    winScore: 5,
    modifiers: { botPaddleScale: 1.4 }
  },
  {
    spec: {
      id: 'orbiter',
      name: 'Orbiter',
      title: 'Bumpers wheel round the centre',
      hue: 268,
      phases: [
        { at: 2, label: 'The orbit quickens', intensity: 1.5 },
        { at: 4, label: 'Full spin', intensity: 2, bot: 'elite' }
      ]
    },
    bot: 'pro',
    winScore: 5,
    modifiers: {
      arena: {
        bumpers: [
          { x: 0.5, y: 0.5, r: 24, orbit: { radius: 125, speed: 0.9, phase: 0 } },
          { x: 0.5, y: 0.5, r: 24, orbit: { radius: 125, speed: 0.9, phase: (Math.PI * 2) / 3 } },
          { x: 0.5, y: 0.5, r: 24, orbit: { radius: 125, speed: 0.9, phase: (Math.PI * 4) / 3 } }
        ]
      }
    }
  },
  {
    spec: {
      id: 'tempest',
      name: 'Tempest',
      title: 'The wind turns without warning - almost',
      hue: 195,
      phases: [
        { at: 2, label: 'Gale', intensity: 1.35 },
        { at: 4, label: 'Eye of the storm', intensity: 1.7, bot: 'elite' }
      ]
    },
    bot: 'pro',
    winScore: 5,
    modifiers: { arena: { wind: { strength: 360, period: 4.5 } } }
  },
  {
    spec: {
      id: 'bastion',
      name: 'Bastion',
      title: 'Break the wall, then break the keeper',
      hue: 12,
      phases: [
        { at: 2, label: 'The keeper tightens', bot: 'elite' },
        { at: 4, label: 'All or nothing', bot: 'legend' }
      ]
    },
    bot: 'pro',
    winScore: 5,
    modifiers: { arena: { bricks: { rows: 7, sides: 'bot', armored: true } } }
  },
  {
    spec: {
      id: 'singularity',
      name: 'Singularity',
      title: 'Everything falls towards the middle',
      hue: 250,
      phases: [
        { at: 2, label: 'The pull deepens', intensity: 1.35 },
        { at: 4, label: 'Event horizon', intensity: 1.65, bot: 'elite' }
      ]
    },
    bot: 'pro',
    winScore: 5,
    modifiers: { arena: { well: { x: 0.5, y: 0.5, strength: 600 } } }
  },
  {
    spec: {
      id: 'trickster',
      name: 'Trickster',
      title: 'Its returns bend after you read them',
      hue: 318,
      swerve: 170,
      phases: [
        { at: 2, label: 'Sharper breaks', swerve: 240, bot: 'elite' },
        { at: 4, label: 'Nothing flies straight', swerve: 300 }
      ]
    },
    bot: 'pro',
    winScore: 5,
    modifiers: {}
  },
  {
    spec: {
      id: 'apex',
      name: 'Apex',
      title: 'Every lesson, all at once',
      hue: 48,
      swerve: 160,
      phases: [
        { at: 2, label: 'Ascendant', intensity: 1.3, bot: 'legend' },
        { at: 4, label: 'Apex', intensity: 1.6, swerve: 280 }
      ]
    },
    bot: 'elite',
    winScore: 5,
    modifiers: {
      arena: {
        bumpers: [
          { x: 0.5, y: 0.5, r: 22, orbit: { radius: 150, speed: 0.8, phase: 0 } },
          { x: 0.5, y: 0.5, r: 22, orbit: { radius: 150, speed: 0.8, phase: Math.PI } }
        ],
        well: { x: 0.5, y: 0.5, strength: 300 }
      }
    }
  }
];

const BY_ID = new Map(BOSSES.map((boss) => [boss.spec.id, boss]));

export function bossById(id: string): BossDef | undefined {
  return BY_ID.get(id);
}

export function isBossId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}
