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

/** The most paddle speed Flow State can be holding at `rank`, stacks included. */
function flowPeak(rank: number): number {
  return Math.min(rank * E.flowState.cap, rank * E.flowState.paddle * E.flowState.stacks);
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
    blurb: 'Push the ball harder than it wants to go',
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
    crest: 'adrenaline'
  },
  {
    id: 'utility',
    name: 'Mastery',
    blurb: 'Bend the rest of the build to your shape',
    hue: 150,
    crest: 'versatility'
  }
];

export const TALENTS: readonly TalentDef[] = [
  // ------------------------------------------------------------------ power
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
      `Unlocks Power Strike. The next return leaves ${pct(E.powerStrike.speed)} faster. ${E.powerStrike.cooldown}s cooldown.`
  },
  {
    id: 'overdrive',
    branch: 'power',
    name: 'Overdrive',
    blurb: 'Power Strike hits harder and returns sooner',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 3,
    column: 1,
    requires: [{ talent: 'power-strike', rank: 1 }],
    rankText: (rank) =>
      `Power Strike leaves +${pct(rank * E.overdrive.speed)} faster and comes back ${sec(rank * Math.abs(E.overdrive.cooldown))} sooner.`
  },
  {
    id: 'heavy-impact',
    branch: 'power',
    name: 'Heavy Impact',
    blurb: 'Every return accelerates the ball more',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 0,
    column: 0,
    requires: [],
    rankText: (rank) =>
      `Your returns add +${pct(rank * E.heavyImpact.growth)} to the ball's speed gain.`
  },
  {
    id: 'critical-strike',
    branch: 'power',
    name: 'Critical Strike',
    blurb: 'Some returns land noticeably heavier',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 1,
    column: 0,
    requires: [],
    rankText: (rank) =>
      `${pct(Math.min(E.criticalStrike.chanceCap, rank * E.criticalStrike.chance))} chance of a critical return, each worth +${pct(E.criticalStrike.growth + rank * E.criticalStrike.growthPerRank)} ball speed and a wider angle.`
  },
  {
    id: 'momentum',
    branch: 'power',
    name: 'Momentum',
    blurb: 'Long rallies build extra acceleration',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 2,
    column: 0,
    requires: [],
    rankText: (rank) =>
      `Each return in a rally adds +${pct(rank * E.momentum.perReturn)} ball speed, up to +${pct(rank * E.momentum.cap)} more.`
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
    id: 'quick-hands',
    branch: 'control',
    name: 'Quick Hands',
    blurb: 'A faster paddle, all the time',
    maxRank: 5,
    costs: [1, 1, 1, 1, 1],
    tier: 0,
    column: 0,
    requires: [],
    rankText: (rank) => `+${pct(rank * E.quickHands.paddle)} paddle speed, always.`
  },
  {
    id: 'swift-recovery',
    branch: 'control',
    name: 'Swift Recovery',
    blurb: 'Peel off the wall without losing the point',
    maxRank: 2,
    costs: [1, 1],
    tier: 0,
    column: 1,
    requires: [],
    rankText: (rank) =>
      `+${pct(rank * E.swiftRecovery.edgeBoost)} paddle speed for ${sec(rank * E.swiftRecovery.seconds)} after leaving an edge.`
  },
  {
    id: 'precision',
    branch: 'control',
    name: 'Precision',
    blurb: 'Wider deliberate angles, less accidental spin',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 1,
    column: 1,
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
    tier: 2,
    column: 0,
    requires: [{ talent: 'quick-hands', rank: 2 }],
    ability: 'dash',
    rankText: () =>
      `Unlocks Dash: ${E.dash.distance} units towards where you are heading. ${E.dash.cooldown}s cooldown.`
  },
  {
    id: 'perfect-guard',
    branch: 'control',
    name: 'Perfect Guard',
    blurb: 'Active: a timing window that rewards the read',
    maxRank: 3,
    costs: [2, 1, 1],
    tier: 3,
    column: 1,
    requires: [{ talent: 'precision', rank: 1 }],
    ability: 'perfect-guard',
    rankText: (rank) => {
      const window = sec(E.perfectGuard.baseWindow + (rank - 1) * E.perfectGuard.window);
      const paddle = pct(E.perfectGuard.basePaddle + (rank - 1) * E.perfectGuard.paddle);
      const span = sec(E.perfectGuard.seconds + (rank - 1) * E.perfectGuard.secondsStep);
      return rank === 1
        ? `Unlocks Perfect Guard: a ${window} window. A return inside it is absorbed clean and grants +${paddle} paddle speed for ${span}.`
        : `A ${window} window, and a guard grants +${paddle} paddle speed for ${span}.`;
    }
  },
  {
    id: 'slipstream',
    branch: 'control',
    name: 'Slipstream',
    blurb: 'Ultimate: a longer, far faster paddle',
    maxRank: 1,
    costs: [ULTIMATE_COST],
    tier: ULTIMATE_TIER,
    column: 1,
    requires: [{ talent: 'perfect-guard', rank: 1 }],
    ability: 'slipstream',
    rankText: () =>
      `Unlocks Slipstream. For ${E.slipstream.seconds}s your paddle is ${pct(E.slipstream.grow)} longer and up to ${pct(E.slipstream.paddle)} faster, past the speed anything else can reach. ${E.slipstream.cooldown}s cooldown.`
  },

  // ---------------------------------------------------------------- defense
  {
    id: 'shield',
    branch: 'defense',
    name: 'Shield',
    blurb: 'A miss that should have cost the point, saved',
    maxRank: 2,
    costs: [2, 2],
    tier: 1,
    column: 0,
    requires: [],
    rankText: (rank) =>
      `${rank} shield charge${rank === 1 ? '' : 's'}. Each saves one ball at your line, then recharges over ${sec(shieldRecharge(rank))}.`
  },
  {
    id: 'second-chance',
    branch: 'defense',
    name: 'Second Chance',
    blurb: 'Take a conceded point back while you are behind',
    maxRank: 1,
    costs: [3],
    tier: 3,
    column: 0,
    requires: [{ talent: 'shield', rank: 1 }],
    rankText: () =>
      `Once a match, refunds a conceded point - or your last life - while you are not ahead.`
  },
  {
    id: 'stabilizer',
    branch: 'defense',
    name: 'Stabilizer',
    blurb: 'Scrambled returns come off straighter',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 0,
    column: 1,
    requires: [],
    rankText: (rank) =>
      `Pulls ${pct(rank * E.stabilizer.pull)} of a wide edge-hit back towards a clean angle, with ${pct(rank * Math.abs(E.stabilizer.spin))} less spin on it.`
  },
  {
    id: 'resilience',
    branch: 'defense',
    name: 'Resilience',
    blurb: 'The longer the rally, the steadier you get',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 2,
    column: 1,
    requires: [{ talent: 'stabilizer', rank: 1 }],
    rankText: (rank) =>
      `+${pct(rank * E.resilience.perFive)} paddle speed per five returns in a rally, up to +${pct(rank * E.resilience.cap)} more.`
  },
  {
    id: 'aegis',
    branch: 'defense',
    name: 'Aegis',
    blurb: 'Ultimate: nothing gets past you',
    maxRank: 1,
    costs: [ULTIMATE_COST],
    tier: ULTIMATE_TIER,
    column: 0,
    requires: [{ talent: 'second-chance', rank: 1 }],
    ability: 'aegis',
    rankText: () =>
      `Unlocks Aegis. The next ${E.aegis.saves} balls to reach your line are saved for you, within ${E.aegis.seconds}s and without spending a shield charge. ${E.aegis.cooldown}s cooldown.`
  },

  // --------------------------------------------------------------- momentum
  {
    id: 'combo-drive',
    branch: 'momentum',
    name: 'Combo Drive',
    blurb: 'Returns without conceding build a multiplier',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 0,
    column: 1,
    requires: [],
    rankText: (rank) =>
      `Each return on your drive is worth +${pct(rank * E.comboDrive.xpPerReturn)} match XP, up to +${pct(rank * E.comboDrive.cap)} more.`
  },
  {
    id: 'adrenaline',
    branch: 'momentum',
    name: 'Adrenaline',
    blurb: 'A drive threshold quickens the paddle',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 2,
    column: 1,
    requires: [{ talent: 'combo-drive', rank: 2 }],
    rankText: (rank) =>
      `+${pct(Math.min(E.adrenaline.cap, rank * E.adrenaline.paddle))} paddle speed for ${sec(E.adrenaline.seconds + (rank - 1) * E.adrenaline.secondsStep)} every ${E.adrenaline.threshold} returns on a drive.`
  },
  {
    id: 'clutch',
    branch: 'momentum',
    name: 'Clutch',
    blurb: 'Sharper when the match is nearly lost',
    maxRank: 2,
    costs: [1, 1],
    tier: 1,
    column: 0,
    requires: [],
    rankText: (rank) =>
      `+${pct(rank * E.clutch.paddle)} paddle speed, and ${pct(rank * Math.abs(E.clutch.growth))} less ball acceleration, while one point - or one life - from losing.`
  },
  {
    id: 'flow-state',
    branch: 'momentum',
    name: 'Flow State',
    blurb: 'Sustained rallies sharpen paddle and cooldowns',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 3,
    column: 1,
    requires: [{ talent: 'adrenaline', rank: 1 }],
    rankText: (rank) =>
      `Past ${E.flowState.from} returns, each return adds +${pct(rank * E.flowState.paddle)} paddle speed - up to +${pct(flowPeak(rank))} - and recharges abilities up to ${pct(rank * E.flowState.recharge)} faster.`
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
    requires: [{ talent: 'flow-state', rank: 1 }],
    ability: 'zenith',
    rankText: () =>
      `Unlocks Zenith. For ${E.zenith.seconds}s you are in peak form: Flow State runs at full stacks, +${pct(E.zenith.paddle)} paddle speed, abilities recharge ${E.zenith.recharge}x faster, and once a match the first point you would concede is given back. ${E.zenith.cooldown}s cooldown.`
  },

  // ---------------------------------------------------------------- utility
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
    id: 'experience-boost',
    branch: 'utility',
    name: 'Experience Boost',
    blurb: 'Meaningful matches are worth a little more',
    maxRank: 3,
    costs: [1, 1, 1],
    tier: 0,
    column: 0,
    requires: [],
    rankText: (rank) => `+${pct(rank * E.experienceBoost.xp)} XP from ranked matches.`
  },
  {
    id: 'talent-synergy',
    branch: 'utility',
    name: 'Talent Synergy',
    blurb: 'Combinations you already own pay out more',
    maxRank: 2,
    costs: [2, 2],
    tier: 3,
    column: 0,
    requires: [],
    rankText: (rank) =>
      `+${pct(rank * E.talentSynergy.magnitude)} to every active synergy, and +${pct(rank * E.talentSynergy.paddlePerSynergy)} paddle speed per active synergy.`
  },
  {
    id: 'versatility',
    branch: 'utility',
    name: 'Versatility',
    blurb: 'A bonus shaped by whatever you invest in most',
    maxRank: 2,
    costs: [1, 1],
    tier: 1,
    column: 0,
    requires: [],
    rankText: (rank) =>
      `+${pct(rank * E.versatility.bonus)} to the signature stat of your deepest branch.`
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
    requires: [{ talent: 'cooldown-mastery', rank: 3 }],
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
export const BRANCH_COLUMNS = 2;

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
