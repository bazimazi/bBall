import type { BotLevelId } from '../bots/types';
import { bossById } from '../modes/bosses';
import { starCount, type StarGoal } from '../modes/stars';
import type { MatchModifiers } from '../modes/types';

/**
 * The Journey: five worlds of six stages, each world built around one idea
 * and closed by a boss.
 *
 * The campaign is the game's tutorial as much as its story. World one
 * teaches the flick; two, bumpers; three, a court that bends the ball; four,
 * walls you have to break; five asks for all of it at once. A stage's two
 * star goals are chosen to make the player *use* that world's idea rather
 * than just survive it.
 *
 * Progress is stars, kept per stage as a bitmask. A stage opens when the one
 * before it is cleared; a world opens when the last world's boss is down and
 * enough stars are banked - about sixty per cent of what was on offer, never
 * all of them, so one stubborn star never walls a player in.
 */

export interface Stage {
  /** `w1-3` style: world and stage, 1-based. */
  readonly id: string;
  readonly world: number;
  /** 0-based position inside the world. */
  readonly index: number;
  readonly name: string;
  readonly blurb: string;
  readonly bot: BotLevelId;
  readonly winScore: number;
  readonly modifiers: Partial<MatchModifiers>;
  /** The second and third stars. The first is always the win. */
  readonly goals: readonly [StarGoal, StarGoal];
  /** A boss stage fights this boss; its brain, court and win score. */
  readonly boss?: string;
}

export interface JourneyWorld {
  readonly id: number;
  readonly name: string;
  /** The one idea the world is built around. */
  readonly theme: string;
  readonly hue: number;
  /** Stars needed, across the whole Journey, to open this world. */
  readonly starsToOpen: number;
  readonly stages: readonly Stage[];
}

/** XP for each star the first time it is earned, by world. */
export function starXp(world: number): number {
  return 35 + world * 15;
}

function stage(
  world: number,
  index: number,
  name: string,
  blurb: string,
  bot: BotLevelId,
  goals: readonly [StarGoal, StarGoal],
  modifiers: Partial<MatchModifiers> = {},
  winScore = 3
): Stage {
  return {
    id: `w${world}-${index + 1}`,
    world,
    index,
    name,
    blurb,
    bot,
    winScore,
    modifiers,
    goals
  };
}

function bossStage(
  world: number,
  index: number,
  boss: string,
  goals: readonly [StarGoal, StarGoal]
): Stage {
  const def = bossById(boss);
  return {
    id: `w${world}-${index + 1}`,
    world,
    index,
    name: def?.spec.name ?? boss,
    blurb: def?.spec.title ?? '',
    bot: def?.bot ?? 'pro',
    winScore: def?.winScore ?? 5,
    modifiers: def?.modifiers ?? {},
    goals,
    boss
  };
}

export const JOURNEY: readonly JourneyWorld[] = [
  {
    id: 1,
    name: 'First Light',
    theme: 'The flick',
    hue: 171,
    starsToOpen: 0,
    stages: [
      stage(1, 0, 'Warm-up', 'Find your feet against a gentle opponent', 'rookie', [
        { id: 'margin', value: 2 },
        { id: 'rally', value: 8 }
      ]),
      stage(1, 1, 'The Flick', "Strike with the paddle's end while moving that way", 'rookie', [
        { id: 'flicks', value: 2 },
        { id: 'flicks', value: 5 }
      ]),
      stage(
        1,
        2,
        'Long Game',
        'A slower ball, and a patient opponent',
        'amateur',
        [
          { id: 'rally', value: 12 },
          { id: 'rally', value: 20 }
        ],
        { speedPerHitScale: 0.75 }
      ),
      stage(
        1,
        3,
        'Needle',
        'Your paddle is four fifths the length',
        'amateur',
        [
          { id: 'margin', value: 2 },
          { id: 'shutout', value: 0 }
        ],
        { playerPaddleScale: 0.8 }
      ),
      stage(
        1,
        4,
        'Quick Draw',
        'A quicker serve. Finish it fast',
        'amateur',
        [
          { id: 'fast', value: 80 },
          { id: 'flicks', value: 3 }
        ],
        { serveSpeedScale: 1.12 }
      ),
      bossStage(1, 5, 'colossus', [
        { id: 'margin', value: 2 },
        { id: 'flicks', value: 4 }
      ])
    ]
  },
  {
    id: 2,
    name: 'Bumper Alley',
    theme: 'Bumpers',
    hue: 268,
    starsToOpen: 10,
    stages: [
      stage(
        2,
        0,
        'Pinball',
        'A bumper stands on the centre spot',
        'amateur',
        [
          { id: 'margin', value: 2 },
          { id: 'rally', value: 10 }
        ],
        { arena: { bumpers: [{ x: 0.5, y: 0.5, r: 34 }] } }
      ),
      stage(
        2,
        1,
        'Twin Posts',
        'Two bumpers split the middle',
        'amateur',
        [
          { id: 'flicks', value: 3 },
          { id: 'shutout', value: 0 }
        ],
        {
          arena: {
            bumpers: [
              { x: 0.5, y: 0.3, r: 28 },
              { x: 0.5, y: 0.7, r: 28 }
            ]
          }
        }
      ),
      stage(
        2,
        2,
        'Slalom',
        'Three bumpers, staggered down the court',
        'pro',
        [
          { id: 'margin', value: 2 },
          { id: 'rally', value: 12 }
        ],
        {
          arena: {
            bumpers: [
              { x: 0.38, y: 0.26, r: 24 },
              { x: 0.5, y: 0.5, r: 24 },
              { x: 0.62, y: 0.74, r: 24 }
            ]
          }
        }
      ),
      stage(
        2,
        3,
        'Carousel',
        'Two bumpers circle the centre',
        'pro',
        [
          { id: 'fast', value: 110 },
          { id: 'margin', value: 3 }
        ],
        {
          arena: {
            bumpers: [
              { x: 0.5, y: 0.5, r: 24, orbit: { radius: 110, speed: 1.1, phase: 0 } },
              { x: 0.5, y: 0.5, r: 24, orbit: { radius: 110, speed: 1.1, phase: Math.PI } }
            ]
          }
        }
      ),
      stage(
        2,
        4,
        'Crowded House',
        'Four bumpers and nowhere to hide',
        'pro',
        [
          { id: 'flicks', value: 4 },
          { id: 'shutout', value: 0 }
        ],
        {
          arena: {
            bumpers: [
              { x: 0.4, y: 0.3, r: 22 },
              { x: 0.6, y: 0.3, r: 22 },
              { x: 0.4, y: 0.7, r: 22 },
              { x: 0.6, y: 0.7, r: 22 }
            ]
          }
        }
      ),
      bossStage(2, 5, 'orbiter', [
        { id: 'margin', value: 2 },
        { id: 'rally', value: 14 }
      ])
    ]
  },
  {
    id: 3,
    name: 'Stormfront',
    theme: 'A court that bends the ball',
    hue: 195,
    starsToOpen: 22,
    stages: [
      stage(
        3,
        0,
        'Breeze',
        'A steady wind across the court',
        'amateur',
        [
          { id: 'margin', value: 2 },
          { id: 'flicks', value: 3 }
        ],
        { arena: { wind: { strength: 250, period: 0 } } }
      ),
      stage(
        3,
        1,
        'Gusts',
        'The wind turns every five seconds',
        'pro',
        [
          { id: 'rally', value: 12 },
          { id: 'margin', value: 2 }
        ],
        { arena: { wind: { strength: 360, period: 5 } } }
      ),
      stage(
        3,
        2,
        'Pull',
        'A gravity well sits on the centre spot',
        'pro',
        [
          { id: 'margin', value: 2 },
          { id: 'rally', value: 14 }
        ],
        { arena: { well: { x: 0.5, y: 0.5, strength: 420 } } }
      ),
      stage(
        3,
        3,
        'Eye of the Storm',
        'Wind, and a bumper in the middle of it',
        'pro',
        [
          { id: 'flicks', value: 4 },
          { id: 'shutout', value: 0 }
        ],
        { arena: { wind: { strength: 300, period: 6 }, bumpers: [{ x: 0.5, y: 0.5, r: 26 }] } }
      ),
      stage(
        3,
        4,
        'Undertow',
        'A deeper pull, and nothing flies straight for long',
        'pro',
        [
          { id: 'margin', value: 2 },
          { id: 'fast', value: 120 }
        ],
        { arena: { well: { x: 0.5, y: 0.5, strength: 600 } } }
      ),
      bossStage(3, 5, 'tempest', [
        { id: 'margin', value: 2 },
        { id: 'flicks', value: 5 }
      ])
    ]
  },
  {
    id: 4,
    name: 'The Forge',
    theme: 'Walls you have to break',
    hue: 12,
    starsToOpen: 34,
    stages: [
      stage(
        4,
        0,
        'Brickwork',
        'A brick wall guards each goal',
        'amateur',
        [
          { id: 'margin', value: 2 },
          { id: 'returns', value: 30 }
        ],
        { arena: { bricks: { rows: 6, sides: 'both' } } }
      ),
      stage(
        4,
        1,
        'Siege',
        'Only their goal is walled. Break in',
        'pro',
        [
          { id: 'fast', value: 120 },
          { id: 'shutout', value: 0 }
        ],
        { arena: { bricks: { rows: 8, sides: 'bot' } } }
      ),
      stage(
        4,
        2,
        'Bulwark',
        'Armoured walls - every brick takes two',
        'pro',
        [
          { id: 'margin', value: 2 },
          { id: 'rally', value: 16 }
        ],
        { arena: { bricks: { rows: 6, sides: 'both', armored: true } } }
      ),
      stage(
        4,
        3,
        'Rebuild',
        'The walls stand again at every serve',
        'pro',
        [
          { id: 'flicks', value: 4 },
          { id: 'margin', value: 2 }
        ],
        { arena: { bricks: { rows: 5, sides: 'both', regrow: true } } }
      ),
      stage(
        4,
        4,
        'Fortress Pinball',
        'Walls, and a bumper between them',
        'elite',
        [
          { id: 'margin', value: 2 },
          { id: 'shutout', value: 0 }
        ],
        { arena: { bricks: { rows: 5, sides: 'both' }, bumpers: [{ x: 0.5, y: 0.5, r: 30 }] } }
      ),
      bossStage(4, 5, 'bastion', [
        { id: 'margin', value: 2 },
        { id: 'fast', value: 150 }
      ])
    ]
  },
  {
    id: 5,
    name: 'Apex',
    theme: 'All of it, at once',
    hue: 48,
    starsToOpen: 46,
    stages: [
      stage(
        5,
        0,
        'Gravity Slalom',
        'A well, and bumpers either side of it',
        'elite',
        [
          { id: 'margin', value: 2 },
          { id: 'flicks', value: 4 }
        ],
        {
          arena: {
            well: { x: 0.5, y: 0.5, strength: 380 },
            bumpers: [
              { x: 0.36, y: 0.5, r: 22 },
              { x: 0.64, y: 0.5, r: 22 }
            ]
          }
        }
      ),
      bossStage(5, 1, 'singularity', [
        { id: 'margin', value: 2 },
        { id: 'rally', value: 12 }
      ]),
      stage(
        5,
        2,
        'Crosswind Siege',
        'Wind, and walls to break through it',
        'elite',
        [
          { id: 'fast', value: 130 },
          { id: 'flicks', value: 5 }
        ],
        { arena: { wind: { strength: 300, period: 5 }, bricks: { rows: 6, sides: 'both' } } }
      ),
      bossStage(5, 3, 'trickster', [
        { id: 'margin', value: 2 },
        { id: 'shutout', value: 0 }
      ]),
      stage(
        5,
        4,
        'Gauntlet of Legends',
        'The Legend, on its own court, at full pace',
        'legend',
        [
          { id: 'margin', value: 2 },
          { id: 'rally', value: 16 }
        ],
        {
          arena: {
            bumpers: [
              { x: 0.5, y: 0.5, r: 22, orbit: { radius: 130, speed: 1, phase: 0 } },
              { x: 0.5, y: 0.5, r: 22, orbit: { radius: 130, speed: 1, phase: Math.PI } }
            ]
          }
        },
        5
      ),
      bossStage(5, 5, 'apex', [
        { id: 'margin', value: 2 },
        { id: 'flicks', value: 6 }
      ])
    ]
  }
];

export const STAGES: readonly Stage[] = JOURNEY.flatMap((world) => world.stages);
const BY_ID = new Map(STAGES.map((item) => [item.id, item]));

export function stageById(id: string): Stage | undefined {
  return BY_ID.get(id);
}

export function worldById(id: number): JourneyWorld | undefined {
  return JOURNEY.find((world) => world.id === id);
}

/** Every star a Journey can hold. */
export const TOTAL_STARS = STAGES.length * 3;

/** Stage id -> star mask. The whole of a player's Journey progress. */
export type JourneyProgress = Record<string, number>;

export function totalStars(progress: JourneyProgress): number {
  let total = 0;
  for (const mask of Object.values(progress)) total += starCount(mask);
  return total;
}

export function starsInWorld(progress: JourneyProgress, world: JourneyWorld): number {
  let total = 0;
  for (const item of world.stages) total += starCount(progress[item.id] ?? 0);
  return total;
}

export function isCleared(progress: JourneyProgress, id: string): boolean {
  return ((progress[id] ?? 0) & 1) === 1;
}

/** Has the world's boss - its last stage - been beaten? */
export function worldCleared(progress: JourneyProgress, world: JourneyWorld): boolean {
  const last = world.stages[world.stages.length - 1];
  return !!last && isCleared(progress, last.id);
}

export function worldOpen(progress: JourneyProgress, world: JourneyWorld): boolean {
  if (world.id === 1) return true;
  const previous = worldById(world.id - 1);
  if (previous && !worldCleared(progress, previous)) return false;
  return totalStars(progress) >= world.starsToOpen;
}

/** May this stage be played? Its world must be open and the stage before it cleared. */
export function stageOpen(progress: JourneyProgress, item: Stage): boolean {
  const world = worldById(item.world);
  if (!world || !worldOpen(progress, world)) return false;
  if (item.index === 0) return true;
  const before = world.stages[item.index - 1];
  return !!before && isCleared(progress, before.id);
}

/** The stage a player should be pointed at next: the first open, uncleared one. */
export function nextStage(progress: JourneyProgress): Stage | null {
  for (const item of STAGES) {
    if (stageOpen(progress, item) && !isCleared(progress, item.id)) return item;
  }
  return null;
}

export function isStageId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}
