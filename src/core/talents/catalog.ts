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

/** Percentage, rounded for display. `pct(0.035)` -> "3.5%". */
function pct(value: number): string {
  const n = value * 100;
  return `${Math.round(n * 10) / 10}%`;
}

export const TALENT_BRANCHES: readonly Branch[] = [
  { id: 'power', name: 'Power', blurb: 'Push the ball harder than it wants to go', hue: 14 },
  { id: 'control', name: 'Control', blurb: 'Be where the ball is going, sooner', hue: 192 },
  { id: 'defense', name: 'Defense', blurb: 'Survive the rallies that should beat you', hue: 268 },
  { id: 'momentum', name: 'Momentum', blurb: 'Turn a good streak into a better one', hue: 44 },
  { id: 'utility', name: 'Mastery', blurb: 'Bend the rest of the build to your shape', hue: 150 }
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
    minLevel: 1,
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
    minLevel: 3,
    requires: [{ talent: 'power-strike', rank: 1 }],
    rankText: (rank) =>
      `+${pct(E.overdrive.speed)} Power Strike speed and ${Math.abs(E.overdrive.cooldown)}s off its cooldown (rank ${rank}).`
  },
  {
    id: 'heavy-impact',
    branch: 'power',
    name: 'Heavy Impact',
    blurb: 'Every return accelerates the ball more',
    maxRank: 3,
    costs: [1, 1, 1],
    minLevel: 1,
    requires: [],
    rankText: () => `Your returns add +${pct(E.heavyImpact.growth)} to the ball's speed gain.`
  },
  {
    id: 'critical-strike',
    branch: 'power',
    name: 'Critical Strike',
    blurb: 'Some returns land noticeably heavier',
    maxRank: 3,
    costs: [1, 1, 1],
    minLevel: 5,
    requires: [],
    rankText: () =>
      `+${pct(E.criticalStrike.chance)} chance of a critical return, worth +${pct(E.criticalStrike.growth)} ball speed.`
  },
  {
    id: 'momentum',
    branch: 'power',
    name: 'Momentum',
    blurb: 'Long rallies build extra acceleration',
    maxRank: 3,
    costs: [1, 1, 1],
    minLevel: 3,
    requires: [],
    rankText: () =>
      `Each return in a rally adds +${pct(E.momentum.perReturn)} ball speed, up to +${pct(E.momentum.cap)} more.`
  },

  // ---------------------------------------------------------------- control
  {
    id: 'quick-hands',
    branch: 'control',
    name: 'Quick Hands',
    blurb: 'A faster paddle, all the time',
    maxRank: 5,
    costs: [1, 1, 1, 1, 1],
    minLevel: 1,
    requires: [],
    rankText: () => `+${pct(E.quickHands.paddle)} paddle speed.`
  },
  {
    id: 'swift-recovery',
    branch: 'control',
    name: 'Swift Recovery',
    blurb: 'Peel off the wall without losing the point',
    maxRank: 2,
    costs: [1, 1],
    minLevel: 2,
    requires: [],
    rankText: () =>
      `+${pct(E.swiftRecovery.edgeBoost)} paddle speed for ${E.swiftRecovery.seconds}s after leaving an edge.`
  },
  {
    id: 'precision',
    branch: 'control',
    name: 'Precision',
    blurb: 'Wider deliberate angles, less accidental spin',
    maxRank: 3,
    costs: [1, 1, 1],
    minLevel: 4,
    requires: [],
    rankText: () =>
      `+${pct(E.precision.angle)} usable return angle, ${pct(Math.abs(E.precision.spin))} less unintended spin.`
  },
  {
    id: 'dash',
    branch: 'control',
    name: 'Dash',
    blurb: 'Active: jump the paddle a short distance',
    maxRank: 1,
    costs: [2],
    minLevel: 4,
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
    minLevel: 8,
    requires: [{ talent: 'precision', rank: 1 }],
    ability: 'perfect-guard',
    rankText: (rank) =>
      rank === 1
        ? `Unlocks Perfect Guard: a ${E.perfectGuard.baseWindow}s window. A return inside it is absorbed clean and grants +${pct(E.perfectGuard.basePaddle)} paddle speed for ${E.perfectGuard.seconds}s.`
        : `+${E.perfectGuard.window}s window and +${pct(E.perfectGuard.paddle)} to the guard bonus.`
  },

  // ---------------------------------------------------------------- defense
  {
    id: 'shield',
    branch: 'defense',
    name: 'Shield',
    blurb: 'A miss that should have cost the point, saved',
    maxRank: 2,
    costs: [2, 2],
    minLevel: 6,
    requires: [],
    rankText: () =>
      `+1 shield charge. A charge saves one ball at your line, then recharges over ${E.shield.rechargeSeconds}s.`
  },
  {
    id: 'second-chance',
    branch: 'defense',
    name: 'Second Chance',
    blurb: 'Take a conceded point back while you are behind',
    maxRank: 1,
    costs: [3],
    minLevel: 10,
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
    minLevel: 1,
    requires: [],
    rankText: () => `Pulls ${pct(E.stabilizer.pull)} of a wide edge-hit back towards a clean angle.`
  },
  {
    id: 'resilience',
    branch: 'defense',
    name: 'Resilience',
    blurb: 'The longer the rally, the steadier you get',
    maxRank: 3,
    costs: [1, 1, 1],
    minLevel: 5,
    requires: [{ talent: 'stabilizer', rank: 1 }],
    rankText: () =>
      `+${pct(E.resilience.perFive)} paddle speed per five returns in a rally, up to +${pct(E.resilience.cap)} more.`
  },

  // --------------------------------------------------------------- momentum
  {
    id: 'combo-drive',
    branch: 'momentum',
    name: 'Combo Drive',
    blurb: 'Returns without conceding build a multiplier',
    maxRank: 3,
    costs: [1, 1, 1],
    minLevel: 2,
    requires: [],
    rankText: () =>
      `Each return on your drive is worth +${pct(E.comboDrive.xpPerReturn)} match XP, up to +${pct(E.comboDrive.cap)} more.`
  },
  {
    id: 'adrenaline',
    branch: 'momentum',
    name: 'Adrenaline',
    blurb: 'A drive threshold quickens the paddle',
    maxRank: 3,
    costs: [1, 1, 1],
    minLevel: 6,
    requires: [{ talent: 'combo-drive', rank: 2 }],
    rankText: () =>
      `+${pct(E.adrenaline.paddle)} paddle speed for ${E.adrenaline.seconds}s every ${E.adrenaline.threshold} returns on a drive.`
  },
  {
    id: 'clutch',
    branch: 'momentum',
    name: 'Clutch',
    blurb: 'Sharper when the match is nearly lost',
    maxRank: 2,
    costs: [1, 1],
    minLevel: 7,
    requires: [],
    rankText: () =>
      `+${pct(E.clutch.paddle)} paddle speed while one point - or one life - from losing.`
  },
  {
    id: 'flow-state',
    branch: 'momentum',
    name: 'Flow State',
    blurb: 'Sustained rallies sharpen paddle and cooldowns',
    maxRank: 3,
    costs: [1, 1, 1],
    minLevel: 9,
    requires: [{ talent: 'combo-drive', rank: 1 }],
    rankText: () =>
      `Past ${E.flowState.from} returns, +${pct(E.flowState.paddle)} paddle speed per return (up to +${pct(E.flowState.cap)}) and faster cooldown recovery.`
  },

  // ---------------------------------------------------------------- utility
  {
    id: 'cooldown-mastery',
    branch: 'utility',
    name: 'Cooldown Mastery',
    blurb: 'Every active ability comes back sooner',
    maxRank: 3,
    costs: [1, 1, 1],
    minLevel: 5,
    requires: [],
    rankText: () => `${pct(Math.abs(E.cooldownMastery.cooldown))} off every ability cooldown.`
  },
  {
    id: 'experience-boost',
    branch: 'utility',
    name: 'Experience Boost',
    blurb: 'Meaningful matches are worth a little more',
    maxRank: 3,
    costs: [1, 1, 1],
    minLevel: 3,
    requires: [],
    rankText: () => `+${pct(E.experienceBoost.xp)} XP from ranked matches.`
  },
  {
    id: 'talent-synergy',
    branch: 'utility',
    name: 'Talent Synergy',
    blurb: 'Combinations you already own pay out more',
    maxRank: 2,
    costs: [2, 2],
    minLevel: 12,
    requires: [],
    rankText: () =>
      `+${pct(E.talentSynergy.magnitude)} to every active synergy, and +${pct(E.talentSynergy.paddlePerSynergy)} paddle speed per synergy.`
  },
  {
    id: 'versatility',
    branch: 'utility',
    name: 'Versatility',
    blurb: 'A bonus shaped by whatever you invest in most',
    maxRank: 2,
    costs: [1, 1],
    minLevel: 10,
    requires: [],
    rankText: () => `+${pct(E.versatility.bonus)} to the signature stat of your deepest branch.`
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
