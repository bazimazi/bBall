import type { PlayerProfile } from '../profile/types';
import { levelOf } from '../progression/levels';
import { talentBuildOn, buildSlots } from '../talents/builds';
import { cloneTalentSave, reconcile, refundTalentRank, abilitySlots } from '../talents/save';
import type { TalentId, TalentSave } from '../talents/types';
import { LOOT_ITEMS, researchById, type ResearchId } from './catalog';
import {
  cloneLoot,
  hasResearch,
  licensedAbilities,
  lootBalance,
  specializationSlots
} from './state';

export type LootAction =
  | { type: 'research'; id: ResearchId }
  | { type: 'refund'; talent: TalentId; expectedRank: number }
  | { type: 'pin'; specialization: number; preset: number | null };

export function lootActionOn(profile: PlayerProfile, action: LootAction): PlayerProfile | null {
  const state = cloneLoot(profile.progress.loot),
    level = levelOf(profile.xp);
  let talents = cloneTalentSave(profile.talents);
  if (action.type === 'research') {
    const entry = researchById(action.id),
      balance = lootBalance(state);
    if (
      !entry ||
      hasResearch(state, entry.id) ||
      !entry.requires.every((id) => hasResearch(state, id)) ||
      !LOOT_ITEMS.every((item) => balance[item] >= entry.cost[item])
    )
      return null;
    state.unlocked.push(entry.id);
    talents.licensed = licensedAbilities(state);
    talents = reconcile(talents, level);
    if (entry.ability) {
      const free = talents.equipped.findIndex(
        (id, index) => !id && index < abilitySlots(talents, level)
      );
      if (free >= 0) talents.equipped[free] = entry.ability;
    }
  } else if (action.type === 'refund') {
    if (
      !hasResearch(state, 'precision-refund') ||
      (talents.ranks[action.talent] ?? 0) !== action.expectedRank
    )
      return null;
    const next = refundTalentRank(talents, level, action.talent);
    if (!next) return null;
    talents = next;
  } else {
    if (
      !Number.isInteger(action.specialization) ||
      action.specialization < 0 ||
      action.specialization >= specializationSlots(state)
    )
      return null;
    if (
      action.preset !== null &&
      (!Number.isInteger(action.preset) ||
        action.preset < 0 ||
        action.preset >= buildSlots(level) ||
        !profile.talents.presets?.[action.preset])
    )
      return null;
    if (
      action.preset !== null &&
      state.specializations.some((slot, i) => i !== action.specialization && slot === action.preset)
    )
      return null;
    state.specializations[action.specialization] = action.preset;
  }
  return { ...profile, talents, progress: { ...profile.progress, loot: state } };
}

export interface SpecializationBuild {
  name: string;
  preset: number;
  talents: TalentSave;
}
/** Only legal builds are captured. Editing a preset during play affects the next match. */
export function specializationBuilds(profile: PlayerProfile): SpecializationBuild[] {
  return profile.progress.loot.specializations
    .slice(0, specializationSlots(profile.progress.loot))
    .flatMap((preset) => {
      if (preset === null) return [];
      const loaded = talentBuildOn(profile, preset, 'load');
      return loaded
        ? [{ name: profile.talents.presets![preset]!.name, preset, talents: loaded.talents }]
        : [];
    });
}
