import type { ArenaSpec, BossSpec, MatchModifiers } from './types';
import type { BotLevelId } from '../bots/types';
import { EXPANSION_COURTS } from './expansionCourts';
import { SPARK_COURTS } from './sparkCourts';

/**
 * The bosses of Journey worlds 6 to 30, one per world, each with a signature
 * behaviour that matches its name and its court: a warden paddle to bank
 * round, a wind that turns on every strike, returns that hold their breath at
 * the centre line or gather pace past it, a mason who rebuilds what you break,
 * a lockdown that shuts the gates you opened, a garden of sparks it plays for.
 *
 * Their phases sharpen the signature rather than swap it for another one, and
 * the banner names what changed. Journey caps every phase's brain at Pro; the
 * named tiers below are what the Gauntlet's deeper acts bring.
 */

interface BossDef {
  spec: BossSpec;
  bot: BotLevelId;
  winScore: number;
  modifiers: Partial<MatchModifiers>;
}

function court(id: string): ArenaSpec {
  const found =
    EXPANSION_COURTS.find((c) => c.id === id)?.arena ??
    SPARK_COURTS.find((c) => c.id === id)?.arena;
  if (!found) throw new Error(`Unknown court ${id}`);
  return found;
}

/** The brains a boss opens and finishes with, by how deep into the expansion it stands. */
function tiers(depth: number): readonly [BotLevelId, BotLevelId, BotLevelId] {
  return depth < 6
    ? ['pro', 'elite', 'legend']
    : depth < 12
      ? ['elite', 'legend', 'legend']
      : ['legend', 'legend', 'legend'];
}

function boss(
  depth: number,
  spec: Omit<BossSpec, 'phases'> & {
    phases: readonly [
      Omit<BossSpec['phases'][number], 'at' | 'bot'>,
      Omit<BossSpec['phases'][number], 'at' | 'bot'>
    ];
  },
  modifiers: Partial<MatchModifiers>
): BossDef {
  const [open, mid, last] = tiers(depth);
  return {
    spec: {
      ...spec,
      phases: [
        { at: 2, bot: mid, ...spec.phases[0] },
        { at: 4, bot: last, ...spec.phases[1] }
      ]
    },
    bot: open,
    winScore: 5,
    modifiers
  };
}

const wormholes: ArenaSpec = {
  portals: [
    { a: { x: 0.38, y: 0.22 }, b: { x: 0.38, y: 0.78 }, r: 24 },
    { a: { x: 0.62, y: 0.22 }, b: { x: 0.62, y: 0.78 }, r: 24, hue: 32 }
  ]
};

export const SIGNATURE_BOSSES: readonly BossDef[] = [
  boss(
    0,
    {
      id: 'curator',
      name: 'Curator',
      title: 'Keeps a garden of sparks. Take them before it does',
      hue: 158,
      phases: [
        {
          label: 'The garden blooms',
          arena: {
            bumpers: [{ x: 0.5, y: 0.5, r: 22 }],
            sparks: { kinds: ['wide', 'fire', 'ward'], every: 4, max: 2 }
          }
        },
        {
          label: 'Last bloom',
          arena: {
            bumpers: [
              { x: 0.5, y: 0.28, r: 22 },
              { x: 0.5, y: 0.72, r: 22 }
            ],
            sparks: { kinds: ['wide', 'fire', 'ward', 'hex'], every: 4, max: 2 }
          }
        }
      ]
    },
    { arena: court('spark-garden') }
  ),
  boss(
    1,
    {
      id: 'railwarden',
      name: 'Railwarden',
      title: 'A warden walks its half. Bank the ball round it',
      hue: 38,
      traits: { warden: { x: 0.7, half: 30, speed: 210 } },
      phases: [
        {
          label: 'The warden quickens',
          arena: court('bankworks-1'),
          traits: { warden: { x: 0.7, half: 32, speed: 250 } }
        },
        {
          label: 'Two rails, one warden',
          arena: court('bankworks-3'),
          traits: { warden: { x: 0.7, half: 32, speed: 290 } }
        }
      ]
    },
    { arena: court('rail-slalom-1') }
  ),
  boss(
    2,
    {
      id: 'stormcaller',
      name: 'Stormcaller',
      title: 'Every return it strikes turns the wind',
      hue: 195,
      traits: { gust: true },
      phases: [
        { label: 'The gale answers', arena: court('crosswind-lock-3'), intensity: 1.1 },
        { label: 'Eye of the gale', intensity: 1.2, traits: { surge: 1.08 } }
      ]
    },
    { arena: court('crosswind-lock-1') }
  ),
  boss(
    3,
    {
      id: 'pulsekeeper',
      name: 'Pulsekeeper',
      title: 'Its returns hold their breath at the centre line',
      hue: 280,
      traits: { stutter: 0.22 },
      phases: [
        { label: 'A longer breath', arena: court('phase-crossing-2'), traits: { stutter: 0.32 } },
        { label: 'Hold, then rush', traits: { stutter: 0.38, surge: 1.15 } }
      ]
    },
    { arena: court('phase-crossing-1') }
  ),
  boss(
    5,
    {
      id: 'switchmaster',
      name: 'Switchmaster',
      title: 'Every return it strikes shuts the gates you opened',
      hue: 120,
      traits: { lockdown: true },
      phases: [
        { label: 'Signal change', arena: court('switchyard-2') },
        {
          label: 'Full lockdown',
          arena: court('switchyard-4'),
          traits: { stutter: 0.2 },
          intensity: 1.2
        }
      ]
    },
    { arena: court('switchyard-1') }
  ),
  boss(
    6,
    {
      id: 'breacher',
      name: 'Breacher',
      title: 'Rebuilds its own wall while it batters yours',
      hue: 12,
      traits: { mason: 7 },
      phases: [
        { label: 'Masons at work', traits: { mason: 5 } },
        { label: 'Battering ram', traits: { mason: 4, surge: 1.18 } }
      ]
    },
    { arena: court('siege-relay-1') }
  ),
  boss(
    7,
    {
      id: 'firebrand',
      name: 'Firebrand',
      title: 'Its returns catch fire past the centre line',
      hue: 24,
      traits: { surge: 1.12 },
      phases: [
        {
          label: 'Kindling',
          arena: { ...court('charge-circuit-2'), sparks: { kinds: ['fire'], every: 5 } },
          traits: { surge: 1.18 }
        },
        { label: 'Wildfire', traits: { surge: 1.25 }, intensity: 1.2 }
      ]
    },
    { arena: { ...court('charge-circuit-1'), sparks: { kinds: ['fire'], every: 6 } } }
  ),
  boss(
    8,
    {
      id: 'banker',
      name: 'Banker',
      title: 'Banks every return off the wall, with interest',
      hue: 48,
      swerve: 90,
      phases: [
        { label: 'Interest', arena: court('bankworks-3'), swerve: 140, traits: { surge: 1.1 } },
        {
          label: 'Compound interest',
          arena: court('bankworks-4'),
          swerve: 180,
          traits: { surge: 1.16 }
        }
      ]
    },
    { arena: court('bankworks-2') }
  ),
  boss(
    10,
    {
      id: 'anchorite',
      name: 'Anchorite',
      title: 'A stone paddle behind a stone warden: find the gap between them',
      hue: 30,
      traits: { warden: { x: 0.72, half: 38, speed: 200 } },
      phases: [
        {
          label: 'The stone shifts',
          traits: { warden: { x: 0.72, half: 38, speed: 240 } },
          botPaddleScale: 1.15
        },
        {
          label: 'Bedrock',
          traits: { warden: { x: 0.72, half: 42, speed: 260 } },
          botPaddleScale: 1.1
        }
      ]
    },
    { arena: { bumpers: [{ x: 0.42, y: 0.5, r: 20 }] }, botPaddleScale: 1.1 }
  ),
  boss(
    11,
    {
      id: 'forgemaster',
      name: 'Forgemaster',
      title: 'Hammers every return, and reforges its wall between blows',
      hue: 18,
      traits: { surge: 1.12, mason: 6 },
      phases: [
        { label: 'Hot iron', traits: { surge: 1.18, mason: 5 } },
        {
          label: 'The anvil',
          arena: { bricks: { rows: 5, sides: 'bot', armored: true } },
          traits: { surge: 1.24, mason: 5 }
        }
      ]
    },
    { arena: { bricks: { rows: 4, sides: 'bot' } } }
  ),
  boss(
    12,
    {
      id: 'cyclone',
      name: 'Cyclone',
      title: 'Its returns bend twice: round the well, then on their own',
      hue: 205,
      swerve: 140,
      phases: [
        { label: 'Spin up', swerve: 200, intensity: 1.15 },
        { label: 'Vortex', swerve: 250, intensity: 1.3, traits: { stutter: 0.2 } }
      ]
    },
    { arena: { well: { x: 0.5, y: 0.5, strength: 260, pulsePeriod: 8 } } }
  ),
  boss(
    13,
    {
      id: 'disruptor',
      name: 'Disruptor',
      title: 'Changes pace and line in the same breath',
      hue: 300,
      swerve: 80,
      traits: { stutter: 0.2, lockdown: true },
      phases: [
        { label: 'Static', swerve: 140 },
        { label: 'Overload', traits: { stutter: 0.3, surge: 1.15 } }
      ]
    },
    { arena: court('switchyard-3') }
  ),
  boss(
    15,
    {
      id: 'riftkeeper',
      name: 'Riftkeeper',
      title: 'Its warden blocks the straight road. The rifts go round it',
      hue: 186,
      traits: { warden: { x: 0.74, half: 36, speed: 280 } },
      phases: [
        { label: 'The far mouth', traits: { warden: { x: 0.74, half: 36, speed: 330 } } },
        { label: 'Rift storm', traits: { stutter: 0.22 } }
      ]
    },
    { arena: wormholes }
  ),
  boss(
    16,
    {
      id: 'ruinlord',
      name: 'Ruinlord',
      title: 'Break a deflector and it lays it again',
      hue: 52,
      traits: { mason: 6 },
      phases: [
        { label: 'The ruins rise', arena: court('deflector-ruins-3'), traits: { mason: 5 } },
        { label: 'Monument', arena: court('pulse-forge-1'), traits: { mason: 4 } }
      ]
    },
    { arena: court('deflector-ruins-1') }
  ),
  boss(
    17,
    {
      id: 'squall',
      name: 'Squall',
      title: 'A gust on every strike, and a ball that gathers in it',
      hue: 210,
      traits: { gust: true, surge: 1.1 },
      phases: [
        { label: 'Squall line', intensity: 1.15, traits: { surge: 1.16 } },
        { label: 'Downburst', intensity: 1.3, traits: { surge: 1.22 } }
      ]
    },
    {
      arena: {
        wind: { strength: 240, period: 7, shear: true },
        zones: [
          { x: 0.32, y: 0.14, w: 0.12, h: 0.18, scale: 1.08 },
          { x: 0.56, y: 0.68, w: 0.12, h: 0.18, scale: 1.08 }
        ]
      }
    }
  ),
  boss(
    18,
    {
      id: 'fracture',
      name: 'Fracture',
      title: 'The court breaks into a new shape at every phase',
      hue: 330,
      // Its returns crack forward past the centre line from the first serve.
      traits: { surge: 1.08 },
      phases: [
        { label: 'First fracture', arena: court('phase-crossing-3'), traits: { stutter: 0.25 } },
        { label: 'Shattered', arena: court('siege-relay-2'), traits: { surge: 1.18, mason: 6 } }
      ]
    },
    { arena: court('deflector-ruins-2') }
  ),
  boss(
    19,
    {
      id: 'twins',
      name: 'The Twins',
      title: 'Two paddles, one goal: thread the ball between them',
      hue: 340,
      traits: { warden: { x: 0.66, half: 38, speed: 330 } },
      phases: [
        { label: 'In step', traits: { warden: { x: 0.66, half: 38, speed: 380 } } },
        { label: 'As one', traits: { warden: { x: 0.66, half: 42, speed: 380 }, surge: 1.12 } }
      ]
    },
    { arena: court('rift-bank-1') }
  ),
  boss(
    20,
    {
      id: 'conductor',
      name: 'Conductor',
      title: 'A hold, then a rush: it conducts the tempo',
      hue: 260,
      traits: { stutter: 0.25, surge: 1.15 },
      phases: [
        { label: 'Accelerando', traits: { stutter: 0.32, surge: 1.2 } },
        { label: 'Fortissimo', traits: { stutter: 0.36, surge: 1.26 }, intensity: 1.2 }
      ]
    },
    { arena: court('storm-circuit-1') }
  ),
  boss(
    21,
    {
      id: 'alchemist',
      name: 'Alchemist',
      title: 'A crucible of sparks, and a ball that runs hotter for it',
      hue: 96,
      traits: { surge: 1.1 },
      phases: [
        { label: 'Transmute', arena: court('ember-forge'), traits: { surge: 1.16 } },
        {
          label: 'The last element',
          arena: {
            ...court('spark-circuit'),
            sparks: { kinds: ['wide', 'fire', 'ward', 'hex'], every: 3, max: 2 }
          },
          intensity: 1.2
        }
      ]
    },
    { arena: court('spark-circuit') }
  ),
  boss(
    22,
    {
      id: 'mirage',
      name: 'Mirage',
      title: 'Opens a lane, then shuts it on you',
      hue: 175,
      traits: { lockdown: true, stutter: 0.2 },
      phases: [
        { label: 'Shimmer', intensity: 1.15, traits: { stutter: 0.28 } },
        { label: 'Vanishing point', traits: { surge: 1.15 } }
      ]
    },
    {
      arena: {
        gates: [
          { x: 0.42, center: 0.5, gap: 0.3, period: 7, amplitude: 0.2 },
          { x: 0.6, center: 0.5, gap: 0.3, period: 6, amplitude: 0.2 }
        ],
        switches: [
          { x: 0.5, y: 0.2, r: 18, gate: 0 },
          { x: 0.5, y: 0.8, r: 18, gate: 1 }
        ]
      }
    }
  ),
  boss(
    23,
    {
      id: 'regent',
      name: 'Regent',
      title: 'Its warden holds the lane while its gates shut behind you',
      hue: 44,
      traits: { warden: { x: 0.74, half: 34, speed: 280 }, lockdown: true },
      phases: [
        { label: 'Decree', traits: { warden: { x: 0.74, half: 34, speed: 330 } } },
        { label: 'Dominion', traits: { surge: 1.15 } }
      ]
    },
    { arena: court('switchyard-1') }
  ),
  boss(
    24,
    {
      id: 'sovereign',
      name: 'Sovereign',
      title: 'Every trait you have beaten, under one crown',
      hue: 50,
      traits: { warden: { x: 0.72, half: 34, speed: 260 } },
      phases: [
        {
          label: 'The court bows',
          arena: court('crosswind-lock-4'),
          traits: { gust: true, stutter: 0.25 }
        },
        {
          label: 'Long live the Sovereign',
          traits: { warden: { x: 0.72, half: 34, speed: 320 }, surge: 1.2 },
          intensity: 1.2,
          swerve: 120
        }
      ]
    },
    {
      arena: {
        bumpers: [
          { x: 0.5, y: 0.5, r: 20, orbit: { radius: 130, speed: 0.8, phase: 0 } },
          { x: 0.5, y: 0.5, r: 20, orbit: { radius: 130, speed: 0.8, phase: Math.PI } }
        ],
        sparks: { kinds: ['wide', 'fire', 'ward', 'hex'], every: 5 }
      }
    }
  )
];
