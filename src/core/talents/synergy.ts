import type { AbilityId, TalentEffects, TalentId, TalentRequirement } from './types';

/**
 * Synergies: what happens when two ideas are invested in together.
 *
 * They are deliberately additive rather than gating - every build works on
 * its own, and a synergy is a reward for committing rather than a box that
 * has to be ticked. `Talent Synergy` scales `magnitude`, so the utility
 * branch pays off for players who like this part of the game.
 */
export interface SynergyDef {
  readonly id: string;
  readonly name: string;
  /** One line naming the playstyle it produces. */
  readonly blurb: string;
  readonly requires: readonly TalentRequirement[];
  /** Also needs at least this many equipped abilities. */
  readonly minEquipped?: number;
  /** Mutates the resolved bag. `magnitude` is 1 plus Talent Synergy. */
  apply(effects: TalentEffects, magnitude: number): void;
}

export const SYNERGIES: readonly SynergyDef[] = [
  {
    id: 'blitz',
    name: 'Blitz',
    blurb: 'Power Strike + Momentum · hit first, hit fastest',
    requires: [
      { talent: 'power-strike', rank: 1 },
      { talent: 'momentum', rank: 2 }
    ],
    apply: (effects, magnitude) => {
      effects.powerStrikePaddle += 0.08 * magnitude;
      effects.powerStrikePaddleSeconds = 3;
      effects.momentumCap += 0.03 * magnitude;
    }
  },
  {
    id: 'glider',
    name: 'Glider',
    blurb: 'Quick Hands + Dash · never out of position',
    requires: [
      { talent: 'quick-hands', rank: 3 },
      { talent: 'dash', rank: 1 }
    ],
    apply: (effects, magnitude) => {
      effects.dashDistance *= 1 + 0.25 * magnitude;
      effects.dashCooldown *= 1 - 0.15 * magnitude;
    }
  },
  {
    id: 'bulwark',
    name: 'Bulwark',
    blurb: 'Perfect Guard + Stabilizer · the wall that reads',
    requires: [
      { talent: 'perfect-guard', rank: 1 },
      { talent: 'stabilizer', rank: 2 }
    ],
    apply: (effects, magnitude) => {
      effects.guardGrantsShield = true;
      effects.stabilise += 0.1 * magnitude;
    }
  },
  {
    id: 'surge',
    name: 'Surge',
    blurb: 'Combo Drive + Adrenaline · ride the streak',
    requires: [
      { talent: 'combo-drive', rank: 2 },
      { talent: 'adrenaline', rank: 1 }
    ],
    apply: (effects, magnitude) => {
      effects.adrenalineSeconds *= 1 + 0.5 * magnitude;
      effects.adrenalineAt = Math.max(4, Math.round(effects.adrenalineAt - 2 * magnitude));
    }
  },
  {
    id: 'conduit',
    name: 'Conduit',
    blurb: 'Cooldown Mastery + two abilities · always something ready',
    requires: [{ talent: 'cooldown-mastery', rank: 2 }],
    minEquipped: 2,
    apply: (effects, magnitude) => {
      effects.cooldownMul *= 1 - 0.1 * magnitude;
      effects.flowRecharge += 0.15 * magnitude;
    }
  }
];

function rankOf(ranks: Partial<Record<TalentId, number>>, id: TalentId): number {
  return ranks[id] ?? 0;
}

/** Which synergies a build currently satisfies, in catalogue order. */
export function activeSynergies(
  ranks: Partial<Record<TalentId, number>>,
  equipped: readonly (AbilityId | null)[]
): readonly SynergyDef[] {
  const abilities = equipped.filter((id): id is AbilityId => id !== null).length;
  return SYNERGIES.filter((synergy) => {
    if ((synergy.minEquipped ?? 0) > abilities) return false;
    return synergy.requires.every((need) => rankOf(ranks, need.talent) >= need.rank);
  });
}

export function synergyById(id: string): SynergyDef | undefined {
  return SYNERGIES.find((synergy) => synergy.id === id);
}
