import { BALANCE } from '../balance/config';
import type { MatchModifiers } from '../modes/types';
import type { TalentEffects } from '../talents/types';

/**
 * Boons: the Gauntlet's power, drafted one of three after every match won,
 * and gone when the run ends.
 *
 * Each boon is either a nudge to the player's build - read through the same
 * resolved bag, and capped by the same caps, as the talent tree - or a nudge
 * to the match itself. Neither kind can leave the ranges the game is tested
 * against: a run can make a build feel wild, never broken.
 *
 * Three *duo* boons only appear once both of their parents are owned deep
 * enough. They are the moment a run stops being a pile of numbers and turns
 * into an idea - the reason to take the second rank of something.
 */

export type BoonFamily = 'power' | 'control' | 'defense' | 'tempo' | 'duo';

export interface BoonDef {
  readonly id: string;
  readonly name: string;
  /** What one rank does, in a line. */
  readonly blurb: string;
  readonly family: BoonFamily;
  readonly maxRank: number;
  /** A duo boon's parents and the rank each must reach. */
  readonly requires?: readonly (readonly [string, number])[];
  /** Applied once per rank owned. */
  effects?(effects: TalentEffects, rank: number): void;
  modifiers?(modifiers: MatchModifiers, rank: number): void;
  /** Spent the moment it is picked: never held, never ranked. */
  readonly instant?: boolean;
}

const E = BALANCE.effects;

export const BOONS: readonly BoonDef[] = [
  {
    id: 'reach',
    name: 'Long Paddle',
    blurb: 'Your paddle is 7% longer',
    family: 'control',
    maxRank: 3,
    modifiers: (m, rank) => {
      m.playerPaddleScale *= 1 + 0.07 * rank;
    }
  },
  {
    id: 'heavy',
    name: 'Heavy Ball',
    blurb: 'Your returns are harder to read',
    family: 'power',
    maxRank: 3,
    effects: (e, rank) => {
      e.heft += 0.1 * rank;
    }
  },
  {
    id: 'angles',
    name: 'Wide Angles',
    blurb: 'Returns leave at steeper angles',
    family: 'control',
    maxRank: 2,
    effects: (e, rank) => {
      e.angleMul *= 1 + 0.06 * rank;
    }
  },
  {
    id: 'bend',
    name: 'Curveball',
    blurb: 'Your returns bend late in their flight',
    family: 'power',
    maxRank: 3,
    effects: (e, rank) => {
      e.swerve += 60 * rank;
    }
  },
  {
    id: 'sight',
    name: 'Second Sight',
    blurb: 'See where the ball will reach your line',
    family: 'control',
    maxRank: 2,
    effects: (e, rank) => {
      e.foresight = Math.max(e.foresight, rank);
    }
  },
  {
    id: 'crit',
    name: 'Keen Edge',
    blurb: '+7% chance of a critical return',
    family: 'power',
    maxRank: 3,
    effects: (e, rank) => {
      e.critChance += 0.07 * rank;
    }
  },
  {
    id: 'shield',
    name: 'Guard Wall',
    blurb: 'A shield charge that saves a ball at your line',
    family: 'defense',
    maxRank: 2,
    effects: (e, rank) => {
      if (e.shieldCharges <= 0) e.shieldRecharge = E.shield.rechargeSeconds;
      e.shieldCharges += rank;
    }
  },
  {
    id: 'bank',
    name: 'Bank Shot',
    blurb: 'Balls leave a wall bounce steeper',
    family: 'control',
    maxRank: 2,
    effects: (e, rank) => {
      e.bankShot += 0.06 * rank;
    }
  },
  {
    id: 'shrink',
    name: 'Shrink Ray',
    blurb: "The opponent's paddle is 7% shorter",
    family: 'tempo',
    maxRank: 3,
    modifiers: (m, rank) => {
      m.botPaddleScale *= 1 - 0.07 * rank;
    }
  },
  {
    id: 'calm',
    name: 'Calm Serve',
    blurb: 'Every point starts 6% slower',
    family: 'tempo',
    maxRank: 2,
    modifiers: (m, rank) => {
      m.serveSpeedScale *= 1 - 0.06 * rank;
    }
  },
  {
    id: 'hot',
    name: 'Hot Hand',
    blurb: 'After a point won, your next return leaves charged',
    family: 'tempo',
    maxRank: 2,
    effects: (e, rank) => {
      e.hotHand = Math.max(e.hotHand, rank);
    }
  },
  {
    id: 'heart',
    name: 'Second Wind',
    blurb: 'Gain a heart',
    family: 'defense',
    maxRank: 1,
    instant: true
  },
  // -- duos
  {
    id: 'comet',
    name: 'Comet',
    blurb: 'Every fifth return of a rally leaves charged, and bends twice as hard',
    family: 'duo',
    maxRank: 1,
    requires: [
      ['bend', 2],
      ['heavy', 2]
    ],
    effects: (e) => {
      e.swerve += 120;
      e.momentumEvery = e.momentumEvery > 0 ? Math.min(e.momentumEvery, 5) : 5;
    }
  },
  {
    id: 'citadel',
    name: 'Citadel',
    blurb: 'Your corners are walled, and shields return far sooner',
    family: 'duo',
    maxRank: 1,
    requires: [
      ['reach', 2],
      ['shield', 1]
    ],
    effects: (e) => {
      e.bastion += 40;
      e.shieldRecharge *= 0.6;
    }
  },
  {
    id: 'executioner',
    name: 'Executioner',
    blurb: 'Every charged return is also critical',
    family: 'duo',
    maxRank: 1,
    requires: [
      ['crit', 2],
      ['hot', 1]
    ],
    effects: (e) => {
      e.chargedCrits = true;
      e.critChance += 0.05;
    }
  }
];

const BY_ID = new Map(BOONS.map((boon) => [boon.id, boon]));

export function boonById(id: string): BoonDef | undefined {
  return BY_ID.get(id);
}

export function isBoonId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}

/** Boon id -> rank owned. */
export type BoonRanks = Record<string, number>;

/** Fold every owned boon into a build's effects. The caller caps afterwards. */
export function applyBoonEffects(effects: TalentEffects, boons: BoonRanks): void {
  for (const [id, rank] of Object.entries(boons)) {
    const boon = boonById(id);
    if (!boon?.effects || rank <= 0) continue;
    boon.effects(effects, Math.min(rank, boon.maxRank));
  }
}

/** Fold every owned boon into a match's modifiers. */
export function applyBoonModifiers(modifiers: MatchModifiers, boons: BoonRanks): void {
  for (const [id, rank] of Object.entries(boons)) {
    const boon = boonById(id);
    if (!boon?.modifiers || rank <= 0) continue;
    boon.modifiers(modifiers, Math.min(rank, boon.maxRank));
  }
}

/** Could this boon be offered to a run holding `boons`? */
export function boonAvailable(boon: BoonDef, boons: BoonRanks): boolean {
  if ((boons[boon.id] ?? 0) >= boon.maxRank && !boon.instant) return false;
  if (boon.requires) {
    return boon.requires.every(([id, rank]) => (boons[id] ?? 0) >= rank);
  }
  return true;
}
