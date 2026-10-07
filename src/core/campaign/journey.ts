import type { Personality } from '../modes/recipes';
import type { BotLevelId } from '../bots/types';
import { bossById } from '../modes/bosses';
import { arenaPreset } from '../modes/arenas';
import { starCount, type StarGoal } from '../modes/stars';
import type { MatchModifiers } from '../modes/types';
import { EXPANSION_WORLDS, frontierStage } from './expansion';

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
  readonly courtFamily?: string;
  readonly personality?: Personality;
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
  readonly prerequisites?: readonly string[];
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

export const LEGACY_JOURNEY: readonly JourneyWorld[] = [
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
        'Switchback',
        'Time your shots through two sliding posts',
        'pro',
        [
          { id: 'flicks', value: 4 },
          { id: 'shutout', value: 0 }
        ],
        {
          arena: {
            ...arenaPreset('switchback')!.arena
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
        'Heartbeat',
        'Violet pulls in, amber pushes out. Read the rhythm',
        'pro',
        [
          { id: 'margin', value: 2 },
          { id: 'fast', value: 120 }
        ],
        { arena: arenaPreset('heartbeat')!.arena }
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
        'Storm Forge',
        'Opposing wind lanes, and walls to break through them',
        'elite',
        [
          { id: 'fast', value: 130 },
          { id: 'flicks', value: 5 }
        ],
        { arena: arenaPreset('storm-forge')!.arena }
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

export const JOURNEY: readonly JourneyWorld[] = [...LEGACY_JOURNEY, ...EXPANSION_WORLDS];
export const LEGACY_STAGES = LEGACY_JOURNEY.flatMap((world) => world.stages);
export const STAGES: readonly Stage[] = JOURNEY.flatMap((world) => world.stages);
const BY_ID = new Map(STAGES.map((item) => [item.id, item]));

export function stageById(id: string): Stage | undefined {
  const variant = /^(veteran|ascendant)-(w\d+-\d+)$/.exec(id);
  if (variant) {
    const base = BY_ID.get(variant[2]!);
    if (!base) return undefined;
    const harder = variant[1] === 'ascendant';
    return {
      ...base,
      id,
      name: `${harder ? 'Ascendant' : 'Veteran'} · ${base.name}`,
      bot:
        harder || base.bot === 'legend'
          ? 'legend'
          : base.bot === 'rookie' || base.bot === 'amateur'
            ? 'pro'
            : 'elite',
      modifiers: {
        ...base.modifiers,
        serveSpeedScale: (base.modifiers.serveSpeedScale ?? 1) * (harder ? 1.12 : 1.05),
        playerPaddleScale: (base.modifiers.playerPaddleScale ?? 1) * (harder ? 0.85 : 0.95)
      }
    };
  }
  const fixed = BY_ID.get(id);
  if (fixed) return fixed;
  const match = /^f2-([1-9]\d{0,8})-([1-9]|1\d|20)$/.exec(id);
  return match ? frontierStage(Number(match[1]), Number(match[2]) - 1) : undefined;
}

export function worldById(id: number): JourneyWorld | undefined {
  if (Number.isInteger(id) && id > 30 && id <= 1_000_000_029) {
    const sector = id - 30;
    return {
      id,
      name: `Frontier ${sector}`,
      theme: 'Journey Beyond',
      hue: (sector * 31) % 360,
      starsToOpen: 0,
      stages: Array.from({ length: 20 }, (_, i) => frontierStage(sector, i))
    };
  }
  return JOURNEY.find((world) => world.id === id);
}

/** Every star a Journey can hold. */
export const TOTAL_STARS = STAGES.length * 3;

/** Stage id -> star mask. The whole of a player's Journey progress. */
export type JourneyProgress = Record<string, number>;

export function totalStars(progress: JourneyProgress): number {
  let total = 0;
  for (const item of STAGES) total += starCount(progress[item.id] ?? 0);
  return total;
}

export function starsInWorld(progress: JourneyProgress, world: JourneyWorld): number {
  let total = 0;
  for (const item of world.stages) total += starCount(progress[item.id] ?? 0);
  return total;
}

export function isCleared(progress: JourneyProgress, id: string): boolean {
  const match = /^f2-(\d+)-(\d+)$/.exec(id);
  if (match && Number(match[1]) <= (progress['frontier-v2'] ?? 0)) return true;
  return ((progress[id] ?? 0) & 1) === 1;
}

/** Has the world's boss - its last stage - been beaten? */
export function worldCleared(progress: JourneyProgress, world: JourneyWorld): boolean {
  const last = world.stages[world.stages.length - 1];
  return !!last && isCleared(progress, last.id);
}

export function worldOpen(progress: JourneyProgress, world: JourneyWorld): boolean {
  if (world.id === 1) return true;
  if (world.id > 30)
    return (
      isCleared(progress, 'w5-6') &&
      (world.id === 31 || isCleared(progress, `f2-${world.id - 31}-20`))
    );
  const previous = worldById(world.id - 1);
  if (previous && !worldCleared(progress, previous)) return false;
  return totalStars(progress) >= world.starsToOpen;
}

/** May this stage be played? Its world must be open and the stage before it cleared. */
export function stageOpen(progress: JourneyProgress, item: Stage): boolean {
  if (/^(veteran|ascendant)-/.test(item.id))
    return isCleared(progress, item.id.replace(/^(veteran|ascendant)-/, ''));
  const world = worldById(item.world);
  if (!world || !worldOpen(progress, world)) return false;
  if (item.prerequisites) return item.prerequisites.every((id) => isCleared(progress, id));
  if (item.index === 0) return true;
  const before = world.stages[item.index - 1];
  return !!before && isCleared(progress, before.id);
}

/** The stage a player should be pointed at next: the first open, uncleared one. */
export function nextStage(progress: JourneyProgress): Stage | null {
  for (const item of STAGES) {
    if (stageOpen(progress, item) && !isCleared(progress, item.id)) return item;
  }
  if (isCleared(progress, 'w5-6')) return nextFrontierStage(progress);
  return null;
}

export function nextFrontierStage(progress: JourneyProgress): Stage {
  let sector = (progress['frontier-v2'] ?? 0) + 1;
  while (isCleared(progress, `f2-${sector}-20`)) sector++;
  for (let i = 0; i < 20; i++) {
    const stage = frontierStage(sector, i);
    if (!isCleared(progress, stage.id)) return stage;
  }
  return frontierStage(sector + 1, 0);
}

export function isStageId(value: unknown): value is string {
  return typeof value === 'string' && !!stageById(value);
}

/** Result-card continuation for catalog stages, mastery variants and Frontier. */
export function nextAfter(progress: JourneyProgress, played: Stage): Stage | null {
  if (played.id.startsWith('f2-')) return nextFrontierStage(progress);
  const prefix = /^(veteran|ascendant)-/.exec(played.id)?.[0] ?? '';
  const baseId = played.id.slice(prefix.length);
  const index = STAGES.findIndex((s) => s.id === baseId);
  for (const base of STAGES.slice(index + 1)) {
    const next = prefix ? stageById(`${prefix}${base.id}`) : base;
    if (next && stageOpen(progress, next) && !isCleared(progress, next.id)) return next;
  }
  return isCleared(progress, 'w5-6') ? nextFrontierStage(progress) : null;
}
