import { EXPANSION_COURTS } from './expansionCourts';
import { recipe } from './recipes';
import type { BotLevelId } from '../bots/types';
import type { MatchModifiers, MatchObjective } from './types';
import { arenaPreset } from './arenas';

/**
 * A challenge is one short match with a twist and a single, stated goal. No
 * configuration, no sub-menus: tap it and play.
 */
export interface Challenge {
  readonly courtFamily?: string;
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

export const LEGACY_CHALLENGES: readonly Challenge[] = [
  {
    id: 'switchback',
    name: 'Switchback',
    blurb: 'Time your shots through two sliding posts',
    bot: 'amateur',
    winScore: 3,
    objective: { id: 'win', label: 'Win the match', value: 0 },
    modifiers: { arena: arenaPreset('switchback')!.arena },
    xp: 150
  },
  {
    id: 'jetstream',
    name: 'Jetstream',
    blurb: 'Master opposing currents and reach a twelve-return rally',
    bot: 'pro',
    winScore: 3,
    objective: { id: 'rally', label: 'Reach a 12 rally', value: 12 },
    modifiers: { arena: arenaPreset('jetstream')!.arena, speedPerHitScale: 0.8 },
    xp: 160
  },
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    blurb: 'Read the rhythm: violet attracts, amber repels',
    bot: 'pro',
    winScore: 3,
    objective: { id: 'win', label: 'Win the match', value: 0 },
    modifiers: { arena: arenaPreset('heartbeat')!.arena },
    xp: 170
  },
  {
    id: 'storm-gates',
    name: 'Storm Gates',
    blurb: 'Sliding posts and opposing winds. Find a lane before it closes',
    bot: 'pro',
    winScore: 3,
    objective: { id: 'win', label: 'Win the match', value: 0 },
    modifiers: { arena: arenaPreset('storm-gates')!.arena },
    xp: 190
  },
  {
    id: 'rift-tide',
    name: 'Rift Tide',
    blurb: 'A breathing gravity field feeds two linked portals',
    bot: 'pro',
    winScore: 3,
    objective: { id: 'win', label: 'Win the match', value: 0 },
    modifiers: { arena: arenaPreset('rift-tide')!.arena },
    xp: 190
  },
  {
    id: 'storm-forge',
    name: 'Storm Forge',
    blurb: 'Carve a route through bricks and opposing wind lanes',
    bot: 'pro',
    winScore: 3,
    objective: { id: 'quick-win', label: 'Win within 130s', value: 130 },
    modifiers: { arena: arenaPreset('storm-forge')!.arena },
    xp: 200
  },
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
  },
  {
    id: 'wormholes',
    name: 'Wormholes',
    blurb: 'Two pairs of portals carry the ball across the court',
    bot: 'pro',
    winScore: 3,
    objective: { id: 'win', label: 'Win the match', value: 0 },
    modifiers: {
      arena: {
        portals: [
          { a: { x: 0.34, y: 0.22 }, b: { x: 0.34, y: 0.78 }, r: 26 },
          { a: { x: 0.66, y: 0.22 }, b: { x: 0.66, y: 0.78 }, r: 26 }
        ]
      }
    },
    xp: 170
  },
  {
    id: 'blitz',
    name: 'Blitz',
    blurb: 'Beat the Amateur inside seventy seconds',
    bot: 'amateur',
    winScore: 3,
    objective: { id: 'quick-win', label: 'Win within 70s', value: 70 },
    modifiers: { serveSpeedScale: 1.1 },
    xp: 160
  }
];

function routeObjective(
  arena: NonNullable<MatchModifiers['arena']>,
  difficulty: number
): MatchObjective {
  if (arena.switches?.length)
    return {
      id: 'switches',
      label: `Win and trigger ${1 + difficulty} switches`,
      value: 1 + difficulty
    };
  if (arena.rails?.some((r) => r.hp) || arena.bricks) {
    const capacity =
      (arena.rails?.filter((r) => r.hp).length ?? 0) +
      (arena.bricks ? arena.bricks.rows * (arena.bricks.sides === 'both' ? 2 : 1) : 0);
    const value = Math.min(capacity, 1 + difficulty);
    return { id: 'breaks', label: `Win and break ${value} structures`, value };
  }
  if (arena.rails?.length)
    return {
      id: 'banks',
      label: `Win and land ${2 + difficulty} rail banks`,
      value: 2 + difficulty
    };
  if (arena.gates?.length)
    return {
      id: 'gates',
      label: `Win and cross ${2 + difficulty} openings`,
      value: 2 + difficulty
    };
  return { id: 'win', label: 'Win the match', value: 0 };
}
export const CHALLENGES: readonly Challenge[] = [
  ...LEGACY_CHALLENGES,
  ...Array.from({ length: 106 }, (_, i): Challenge => {
    const court = EXPANSION_COURTS[i % 46]!,
      band = Math.floor(i / 27);
    const r = recipe('challenge-v2', i, band + 1);
    return {
      id: `c2-${i + 1}`,
      name: `${court.name} · Trial ${Math.floor(i / 46) + 1}`,
      blurb: `${court.blurb}. ${band >= 2 ? 'Mastery: shorter reach and tougher opposition.' : 'Complete the marked court objective.'}`,
      bot: r.bot,
      winScore: band >= 2 ? 5 : 3,
      modifiers: { ...r.modifiers, arena: court.arena, playerPaddleScale: 1 - band * 0.04 },
      objective: routeObjective(court.arena, band),
      xp: 180 + band * 40
    };
  })
];
export function contractChallenge(index: number): Challenge {
  const r = recipe('contracts-v2', index, Math.min(4, 1 + Math.floor(index / 12)));
  return {
    id: `contract-${index}`,
    courtFamily: r.courtFamily,
    name: `Contract ${index} · ${r.courtName}`,
    blurb: r.blurb,
    bot: r.bot,
    winScore: Math.max(5, r.winScore),
    modifiers: r.modifiers,
    objective: routeObjective(r.modifiers.arena!, Math.min(3, Math.floor(index / 12))),
    xp: 220
  };
}

const BY_ID = new Map(CHALLENGES.map((item) => [item.id, item]));

export function challengeById(id: string): Challenge | undefined {
  const found = BY_ID.get(id);
  if (found) return found;
  const match = /^contract-([1-9][0-9]{0,8})$/.exec(id);
  return match ? contractChallenge(Number(match[1])) : undefined;
}
