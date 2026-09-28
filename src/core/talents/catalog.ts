import { BALANCE } from '../balance/config';
import { BRANCHES, type Branch, type BranchId, type TalentDef, type TalentId } from './types';

/**
 * The talent tree, as data.
 *
 * Five short branches rather than one sprawling grid: every entry has a job,
 * and a player can read a whole branch without scrolling twice. Adding a
 * talent means adding an object here and one field in `effects.ts` - never a
 * branch inside the simulation.
 */

const E = BALANCE.effects;

/**
 * Capstones sit on the same row in every branch, cost the same, and never
 * have a second rank. Keeping that uniform is what lets a player read "the
 * bottom of a tree" as a single idea rather than five special cases.
 */
export const ULTIMATE_TIER = 4;
export const ULTIMATE_COST = 4;

/** Percentage, rounded for display. `pct(0.035)` -> "3.5%". */
function pct(value: number): string {
  const n = value * 100;
  return `${Math.round(n * 10) / 10}%`;
}

/** Seconds, rounded for display. `sec(0.375)` -> "0.38s". */
function sec(value: number): string {
  return `${Math.round(value * 100) / 100}s`;
}

/** What one shield charge takes to come back at `rank`, floored as `effects.ts` floors it. */
function shieldRecharge(rank: number): number {
  return Math.max(
    E.shield.minRecharge,
    E.shield.rechargeSeconds + Math.max(0, rank - 1) * E.shield.rechargeStep
  );
}

/** "every 4th", "every 6th": how the rhythm talents name their beat. */
function nth(n: number): string {
  const tail =
    n % 10 === 1 && n !== 11
      ? 'st'
      : n % 10 === 2 && n !== 12
        ? 'nd'
        : n % 10 === 3 && n !== 13
          ? 'rd'
          : 'th';
  return `${n}${tail}`;
}

/**
 * Every `rankText` below describes the *total* a talent is worth at `rank`,
 * not what that one point adds.
 *
 * The screen shows two of these side by side - "Now" for the rank owned and
 * "Rank n+1" for the next one - so a player weighing a point compares two
 * totals. Printing the per-rank step in both lines is what made a rank-3
 * talent read exactly like a rank-1 one.
 */

export const TALENT_BRANCHES: readonly Branch[] = [
  {
    id: 'power',
    name: 'Power',
    blurb: 'Put the ball where they cannot follow',
    hue: 14,
    crest: 'power-strike'
  },
  {
    id: 'control',
    name: 'Control',
    blurb: 'Be where the ball is going, sooner',
    hue: 192,
    crest: 'precision'
  },
  {
    id: 'defense',
    name: 'Defense',
    blurb: 'Survive the rallies that should beat you',
    hue: 268,
    crest: 'shield'
  },
  {
    id: 'momentum',
    name: 'Momentum',
    blurb: 'Turn a good streak into a better one',
    hue: 44,
    crest: 'combo-drive'
  },
  {
    id: 'utility',
    name: 'Mastery',
    blurb: 'More skills, sooner, and more of them at once',
    hue: 150,
    crest: 'tempo'
  }
];

/*
 * Every branch is a three-wide grid with its ultimate in the middle of the
 * bottom row. A prerequisite always sits straight above what it opens, or one
 * column across, and the cells an arrow runs down are left empty - so no
 * arrow ever passes behind a tile it has nothing to do with.
 */
export const TALENTS: readonly TalentDef[] = [
  // ------------------------------------------------------------------ power
  {
    id: 'heavy-impact',
    branch: 'power',
    name: 'Heavy Impact',
    blurb: 'Every return is harder to read',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 0,
    column: 0,
    requires: [],
    rankText: (rank) =>
      `Your returns land heavy: the opponent misjudges where they will arrive by ${pct(rank * E.heavyImpact.heft)} more. Charged and critical returns are heavier still.`
  },
  {
    id: 'power-strike',
    branch: 'power',
    name: 'Power Strike',
    blurb: 'Active: charge the next return',
    maxRank: 1,
    costs: [2],
    tier: 0,
    column: 1,
    requires: [],
    ability: 'power-strike',
    rankText: () =>
      `Unlocks Power Strike. Your next return leaves ${pct(E.powerStrike.speed)} faster and is driven wide of centre. ${E.powerStrike.cooldown}s cooldown.`
  },
  {
    id: 'critical-strike',
    branch: 'power',
    name: 'Critical Strike',
    blurb: 'Some returns are driven into the corner',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 0,
    column: 2,
    requires: [],
    rankText: (rank) =>
      `${pct(Math.min(E.criticalStrike.chanceCap, rank * E.criticalStrike.chance))} chance of a critical return: +${pct(E.criticalStrike.growth + rank * E.criticalStrike.growthPerRank)} ball speed, driven into a corner.`
  },
  {
    id: 'bank-shot',
    branch: 'power',
    name: 'Bank Shot',
    blurb: 'Off the wall, and steeper than it should be',
    maxRank: 2,
    costs: [1, 1],
    tier: 1,
    column: 0,
    requires: [],
    rankText: (rank) =>
      `Your returns leave a wall ${pct(rank * E.bankShot.angle)} steeper, so a banked shot lands further from the opponent than it looked like it would.`
  },
  {
    id: 'overdrive',
    branch: 'power',
    name: 'Overdrive',
    blurb: 'Power Strike hits harder, sooner - and twice',
    maxRank: 2,
    costs: [1, 1],
    tier: 1,
    column: 1,
    requires: [{ talent: 'power-strike', rank: 1 }],
    rankText: (rank) =>
      `Power Strike leaves +${pct(rank * E.overdrive.speed)} faster and comes back ${sec(rank * Math.abs(E.overdrive.cooldown))} sooner${rank >= 2 ? ', and charges two returns in a row' : ''}.`
  },
  {
    id: 'momentum',
    branch: 'power',
    name: 'Momentum',
    blurb: 'A long rally charges your returns for free',
    maxRank: 2,
    costs: [1, 1],
    tier: 2,
    column: 0,
    requires: [],
    rankText: (rank) =>
      `Every ${nth(E.momentum.start - rank * E.momentum.step)} return you make in a rally leaves charged, exactly as if Power Strike had been used - no skill, no cooldown.`
  },
  {
    id: 'reckless',
    branch: 'power',
    name: 'Reckless',
    blurb: 'Keystone: all offence, and nothing saves you',
    maxRank: 1,
    costs: [2],
    tier: 2,
    column: 2,
    requires: [],
    rankText: () =>
      `+${pct(E.reckless.chance)} critical chance, and every critical return hits ${pct(E.reckless.growth)} harder and lands twice as heavy - but nothing can save you: Shield, Bastion, Adrenaline, Aegis, Second Chance and Zenith's refund all stand down.`
  },
  {
    id: 'overload',
    branch: 'power',
    name: 'Overload',
    blurb: 'Ultimate: a run of unanswerable returns',
    maxRank: 1,
    costs: [ULTIMATE_COST],
    tier: ULTIMATE_TIER,
    column: 1,
    requires: [{ talent: 'overdrive', rank: 1 }],
    ability: 'overload',
    rankText: () =>
      `Unlocks Overload. Your next ${E.overload.hits} returns are charged *and* critical, stacking every source of pace you own onto ${E.overload.hits} consecutive hits and driving each one into a corner. ${E.overload.cooldown}s cooldown.`
  },

  // ---------------------------------------------------------------- control
  {
    id: 'long-reach',
    branch: 'control',
    name: 'Long Reach',
    blurb: 'A longer paddle, all the time',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 0,
    column: 0,
    requires: [],
    rankText: (rank) => `Your paddle is ${pct(rank * E.longReach.length)} longer.`
  },
  {
    id: 'foresight',
    branch: 'control',
    name: 'Foresight',
    blurb: 'See where the ball will arrive',
    maxRank: 2,
    costs: [2, 2],
    tier: 0,
    column: 1,
    requires: [],
    rankText: (rank) =>
      rank >= 2
        ? `From the moment the opponent strikes it, the ball's whole path to your line is drawn - wall bounces included - with its landing marked.`
        : `Once the ball crosses into your half, a marker shows exactly where it will reach your line.`
  },
  {
    id: 'precision',
    branch: 'control',
    name: 'Precision',
    blurb: 'Wider deliberate angles, less accidental spin',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 0,
    column: 2,
    requires: [],
    rankText: (rank) =>
      `+${pct(rank * E.precision.angle)} usable return angle, ${pct(rank * Math.abs(E.precision.spin))} less unintended spin.`
  },
  {
    id: 'dash',
    branch: 'control',
    name: 'Dash',
    blurb: 'Active: jump the paddle a short distance',
    maxRank: 1,
    costs: [2],
    tier: 1,
    column: 0,
    requires: [{ talent: 'long-reach', rank: 1 }],
    ability: 'dash',
    rankText: () =>
      `Unlocks Dash: ${E.dash.distance} units towards where you are heading - or, standing still, towards where the ball will arrive. ${E.dash.cooldown}s cooldown.`
  },
  {
    id: 'swerve',
    branch: 'control',
    name: 'Swerve',
    blurb: 'Your returns break late',
    maxRank: 2,
    costs: [1, 1],
    tier: 1,
    column: 2,
    requires: [{ talent: 'precision', rank: 1 }],
    rankText: (rank) =>
      `In the last stretch of their flight your returns break further the way they left your paddle${rank >= 2 ? ', twice as hard' : ''} - after the opponent has already read them.`
  },
  {
    id: 'blink-strike',
    branch: 'control',
    name: 'Blink Strike',
    blurb: 'The ball a dash saves goes back on the attack',
    maxRank: 2,
    costs: [1, 1],
    tier: 2,
    column: 0,
    requires: [{ talent: 'dash', rank: 1 }],
    rankText: (rank) =>
      `A return within ${sec(E.blinkStrike.seconds)} of a dash leaves charged${rank >= 2 ? ' and critical' : ''}, and Dash comes back ${sec(rank * Math.abs(E.blinkStrike.cooldown))} sooner.`
  },
  {
    id: 'perfect-guard',
    branch: 'control',
    name: 'Perfect Guard',
    blurb: 'Active: time it, and nothing gets by',
    maxRank: 3,
    costs: [2, 1, 1],
    tier: 2,
    column: 1,
    requires: [{ talent: 'foresight', rank: 1 }],
    ability: 'perfect-guard',
    rankText: (rank) => {
      const window = sec(E.perfectGuard.baseWindow + (rank - 1) * E.perfectGuard.window);
      const reach = E.perfectGuard.baseReach + (rank - 1) * E.perfectGuard.reach;
      const cooldown = E.perfectGuard.cooldown + (rank - 1) * E.perfectGuard.cooldownStep;
      return `${rank === 1 ? 'Unlocks Perfect Guard: a' : 'A'} ${window} window. A ball arriving inside it is parried - returned charged, even if it would have cleared your paddle by up to ${reach} units. ${cooldown}s cooldown.`;
    }
  },
  {
    id: 'slipstream',
    branch: 'control',
    name: 'Slipstream',
    blurb: 'Ultimate: a far longer, lighter paddle',
    maxRank: 1,
    costs: [ULTIMATE_COST],
    tier: ULTIMATE_TIER,
    column: 1,
    requires: [{ talent: 'perfect-guard', rank: 1 }],
    ability: 'slipstream',
    rankText: () =>
      `Unlocks Slipstream. For ${E.slipstream.seconds}s your paddle is ${pct(E.slipstream.grow)} longer - past the length anything else can reach - and ${pct(E.slipstream.paddle)} faster. ${E.slipstream.cooldown}s cooldown.`
  },

  // ---------------------------------------------------------------- defense
  {
    id: 'bastion',
    branch: 'defense',
    name: 'Bastion',
    blurb: 'The corners of your line are walled',
    maxRank: 2,
    costs: [1, 1],
    tier: 0,
    column: 0,
    requires: [],
    rankText: (rank) =>
      `A ball reaching your line within ${rank * E.bastion.reach} units of either wall is turned back - every time, for free.`
  },
  {
    id: 'shield',
    branch: 'defense',
    name: 'Shield',
    blurb: 'A miss that should have cost the point, saved',
    maxRank: 2,
    costs: [2, 2],
    tier: 0,
    column: 1,
    requires: [],
    rankText: (rank) =>
      `${rank} shield charge${rank === 1 ? '' : 's'}. Each saves one ball at your line, then recharges over ${sec(shieldRecharge(rank))}.`
  },
  {
    id: 'clutch',
    branch: 'defense',
    name: 'Clutch',
    blurb: 'Bigger, and slower to beat, when nearly lost',
    maxRank: 2,
    costs: [1, 1],
    tier: 0,
    column: 2,
    requires: [],
    rankText: (rank) =>
      `While one point - or one life - from losing, your paddle is ${pct(rank * E.clutch.length)} longer, the ball crosses your half ${pct(rank * E.clutch.slow)} slower, and your returns add ${pct(rank * Math.abs(E.clutch.growth))} less pace.`
  },
  {
    id: 'fortify',
    branch: 'defense',
    name: 'Fortify',
    blurb: 'Shield charges come back sooner',
    maxRank: 2,
    costs: [1, 1],
    tier: 1,
    column: 0,
    requires: [{ talent: 'shield', rank: 1 }],
    rankText: (rank) =>
      `Shield charges take ${pct(rank * E.fortify.recharge)} less time to come back.`
  },
  {
    id: 'counterstrike',
    branch: 'defense',
    name: 'Counterstrike',
    blurb: 'A save goes back as an attack',
    maxRank: 1,
    costs: [2],
    tier: 1,
    column: 1,
    requires: [{ talent: 'shield', rank: 1 }],
    rankText: () =>
      `Every ball you save - by Shield, Aegis or Adrenaline - goes back as a winner: driven into a corner, ${pct(E.counterstrike.pace)} faster than it came and far harder to read. Your next return leaves charged, too.`
  },
  {
    id: 'second-chance',
    branch: 'defense',
    name: 'Second Chance',
    blurb: 'Take a conceded point back while you are behind',
    maxRank: 1,
    costs: [2],
    tier: 2,
    column: 2,
    requires: [{ talent: 'clutch', rank: 1 }],
    rankText: () =>
      `Once a match, refunds a conceded point - or your last life - while you are not ahead.`
  },
  {
    id: 'aegis',
    branch: 'defense',
    name: 'Aegis',
    blurb: 'Ultimate: nothing gets past you',
    maxRank: 1,
    costs: [ULTIMATE_COST],
    tier: ULTIMATE_TIER,
    column: 1,
    requires: [{ talent: 'counterstrike', rank: 1 }],
    ability: 'aegis',
    rankText: () =>
      `Unlocks Aegis. The next ${E.aegis.saves} balls to reach your line are saved for you, within ${E.aegis.seconds}s and without spending a shield charge. ${E.aegis.cooldown}s cooldown.`
  },

  // --------------------------------------------------------------- momentum
  {
    id: 'hot-hand',
    branch: 'momentum',
    name: 'Hot Hand',
    blurb: 'Win a point, open the next rally charged',
    maxRank: 2,
    costs: [1, 1],
    tier: 0,
    column: 0,
    requires: [],
    rankText: (rank) =>
      `After you win a point, your first ${E.hotHand.returns + (rank - 1) * E.hotHand.step} returns of the next rally leave charged${rank >= 2 ? ' and critical' : ''}.`
  },
  {
    id: 'combo-drive',
    branch: 'momentum',
    name: 'Combo Drive',
    blurb: 'Your paddle grows while you keep scoring',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 0,
    column: 1,
    requires: [],
    rankText: (rank) =>
      `Every ${E.comboDrive.every} returns on your drive, your paddle grows ${pct(rank * E.comboDrive.length)} - up to ${pct(rank * E.comboDrive.length * E.comboDrive.steps)} - until you concede.`
  },
  {
    id: 'adrenaline',
    branch: 'momentum',
    name: 'Adrenaline',
    blurb: 'A long drive banks a save',
    maxRank: 2,
    costs: [1, 1],
    tier: 1,
    column: 1,
    requires: [{ talent: 'combo-drive', rank: 1 }],
    rankText: (rank) =>
      `Every ${E.adrenaline.start - rank * E.adrenaline.step} returns on your drive bank a spare save, one at a time. It catches the next ball that beats you.`
  },
  {
    id: 'flow-state',
    branch: 'momentum',
    name: 'Flow State',
    blurb: 'The longer the rally, the harder you are to read',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 1,
    column: 2,
    requires: [],
    rankText: (rank) =>
      `Past ${E.flowState.from} returns in a rally, each return makes your returns ${pct(rank * E.flowState.heft)} harder to read and ${pct(rank * E.flowState.angle)} wider - up to ${pct(rank * E.flowState.heft * E.flowState.stacks)} and ${pct(rank * E.flowState.angle * E.flowState.stacks)} - and recharges skills up to ${pct(rank * E.flowState.recharge)} faster.`
  },
  {
    id: 'unbroken',
    branch: 'momentum',
    name: 'Unbroken',
    blurb: 'A dropped point only dents your drive',
    maxRank: 1,
    costs: [2],
    tier: 2,
    column: 1,
    requires: [{ talent: 'adrenaline', rank: 1 }],
    rankText: () =>
      `Conceding a point keeps ${pct(E.unbroken.keep)} of your drive instead of ending it.`
  },
  {
    id: 'zenith',
    branch: 'momentum',
    name: 'Zenith',
    blurb: 'Ultimate: a streak that cannot be broken',
    maxRank: 1,
    costs: [ULTIMATE_COST],
    tier: ULTIMATE_TIER,
    column: 1,
    requires: [{ talent: 'unbroken', rank: 1 }],
    ability: 'zenith',
    rankText: () =>
      `Unlocks Zenith. For ${E.zenith.seconds}s you are in peak form: Flow State at full stacks, your paddle ${pct(E.zenith.grow)} longer, skills recharging ${E.zenith.recharge}x faster and a drive that cannot break - and once a match, the first point you would concede is given back. ${E.zenith.cooldown}s cooldown.`
  },

  // ---------------------------------------------------------------- utility
  {
    id: 'tempo',
    branch: 'utility',
    name: 'Tempo',
    blurb: 'Every return winds your skills back',
    maxRank: 2,
    costs: [1, 1],
    tier: 0,
    column: 0,
    requires: [],
    rankText: (rank) =>
      `Every return you make takes ${sec(rank * E.tempo.perReturn)} off every skill cooldown - half that off an ultimate.`
  },
  {
    id: 'cooldown-mastery',
    branch: 'utility',
    name: 'Cooldown Mastery',
    blurb: 'Every active ability comes back sooner',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 0,
    column: 1,
    requires: [],
    rankText: (rank) =>
      `${pct(rank * Math.abs(E.cooldownMastery.cooldown))} off every ability cooldown.`
  },
  {
    id: 'afterglow',
    branch: 'utility',
    name: 'Afterglow',
    blurb: 'Using a skill lengthens the paddle',
    maxRank: 2,
    costs: [1, 1],
    tier: 0,
    column: 2,
    requires: [],
    rankText: (rank) =>
      `Using any skill makes your paddle ${pct(rank * E.afterglow.length)} longer for ${sec(E.afterglow.seconds)}.`
  },
  {
    id: 'versatility',
    branch: 'utility',
    name: 'Versatility',
    blurb: 'One more skill slot',
    maxRank: 1,
    costs: [2],
    tier: 1,
    column: 0,
    requires: [],
    rankText: () =>
      `+${E.versatility.slots} skill slot on top of the ones your level has opened, up to ${BALANCE.talents.slots.max}.`
  },
  {
    id: 'talent-synergy',
    branch: 'utility',
    name: 'Talent Synergy',
    blurb: 'Combinations you already own pay out more',
    maxRank: 2,
    costs: [1, 1],
    tier: 1,
    column: 2,
    requires: [],
    rankText: (rank) =>
      `+${pct(rank * E.talentSynergy.magnitude)} to every active synergy, and ${pct(rank * E.talentSynergy.lengthPerSynergy)} more paddle length per active synergy.`
  },
  {
    id: 'echo',
    branch: 'utility',
    name: 'Echo',
    blurb: 'Ultimate: every other skill, ready again',
    maxRank: 1,
    costs: [ULTIMATE_COST],
    tier: ULTIMATE_TIER,
    column: 1,
    requires: [{ talent: 'cooldown-mastery', rank: 2 }],
    ability: 'echo',
    rankText: () =>
      `Unlocks Echo. Instantly clears the cooldown of your other equipped skills, then recharges them ${E.echo.recharge}x faster for ${E.echo.seconds}s. ${E.echo.cooldown}s cooldown.`
  }
];

const BY_ID = new Map<string, TalentDef>(TALENTS.map((talent) => [talent.id, talent]));
const BY_BRANCH = new Map<BranchId, TalentDef[]>(
  BRANCHES.map((id) => [id, TALENTS.filter((talent) => talent.branch === id)])
);

export function talentById(id: string): TalentDef | undefined {
  return BY_ID.get(id);
}

export function isTalentId(value: unknown): value is TalentId {
  return typeof value === 'string' && BY_ID.has(value);
}

export function talentsOfBranch(branch: BranchId): readonly TalentDef[] {
  return BY_BRANCH.get(branch) ?? [];
}

export function branchById(id: BranchId): Branch {
  return TALENT_BRANCHES.find((branch) => branch.id === id) ?? TALENT_BRANCHES[0]!;
}

/** What the next rank of a talent costs. 0 once it is maxed. */
export function costOfRank(talent: TalentDef, rank: number): number {
  if (rank >= talent.maxRank) return 0;
  return talent.costs[rank] ?? talent.costs[talent.costs.length - 1] ?? 1;
}

/** Everything a fully invested tree would cost. Used by the UI's progress. */
export const TOTAL_TALENT_COST = TALENTS.reduce(
  (sum, talent) => sum + talent.costs.slice(0, talent.maxRank).reduce((a, b) => a + b, 0),
  0
);

/** Every branch grid is this many columns wide. */
export const BRANCH_COLUMNS = 3;

/** True for a branch's capstone - the bottom row, and only ever one rank. */
export function isUltimate(talent: TalentDef): boolean {
  return talent.tier === ULTIMATE_TIER;
}

/** Rows in a branch's grid. */
export function tiersOfBranch(branch: BranchId): number {
  return talentsOfBranch(branch).reduce((deepest, talent) => Math.max(deepest, talent.tier), 0) + 1;
}

/** Points that must sit in a branch before `tier` opens. */
export function tierRequirement(tier: number): number {
  return Math.max(0, tier) * BALANCE.talents.pointsPerTier;
}

/** Everything a single branch would cost to fill. */
export function branchCost(branch: BranchId): number {
  return talentsOfBranch(branch).reduce(
    (sum, talent) => sum + talent.costs.slice(0, talent.maxRank).reduce((a, b) => a + b, 0),
    0
  );
}

/**
 * The arrows a branch draws: one per direct prerequisite, but only when both
 * ends live in the same branch. The grid explains the rest on its own.
 */
export interface TalentLink {
  readonly from: TalentDef;
  readonly to: TalentDef;
}

export function linksOfBranch(branch: BranchId): readonly TalentLink[] {
  const links: TalentLink[] = [];
  for (const talent of talentsOfBranch(branch)) {
    for (const need of talent.requires) {
      const from = talentById(need.talent);
      if (from && from.branch === branch) links.push({ from, to: talent });
    }
  }
  return links;
}
