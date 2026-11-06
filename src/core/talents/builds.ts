import type { PlayerProfile } from '../profile/types';
import { levelOf } from '../progression/levels';
import { TALENTS } from './catalog';
import { buyTalent, cloneTalentSave, createTalentSave, reconcile } from './save';
import { resolveLoadout } from './effects';

/** The same legal level-50 Control build on every Master Daily attempt. */
export function masterCardLoadout() {
  let save = reconcile(createTalentSave(), 50);
  const order = [
    ...TALENTS.filter((t) => t.branch === 'control'),
    ...TALENTS.filter((t) => t.branch !== 'control')
  ];
  for (let pass = 0; pass < 10; pass++)
    for (const talent of order) {
      const next = buyTalent(save, 50, talent.id);
      if (next) save = next;
    }
  return resolveLoadout(save, 50);
}

export function buildSlots(level: number): number {
  return level >= 100 ? 8 : level >= 50 ? 6 : 4;
}
/** What a saved-build request does to its slot. */
export type TalentBuildAction = 'save' | 'load' | 'rename';

/** The name a build is stored under: trimmed, bounded, never blank. */
export function buildName(name: string, slot: number): string {
  return name.trim().slice(0, 32) || `Build ${slot + 1}`;
}

/**
 * Rebuild presets through real purchases, so saved layouts cannot bypass gates.
 *
 * `rename` changes only the label of a build already saved in the slot: its
 * ranks and skills stay exactly as they were saved, and the live build is not
 * touched. A blank name is refused rather than quietly replaced.
 */
export function talentBuildOn(
  profile: PlayerProfile,
  slot: number,
  action: TalentBuildAction,
  name = 'Saved build'
): PlayerProfile | null {
  const level = levelOf(profile.xp);
  if (!Number.isInteger(slot) || slot < 0 || slot >= buildSlots(level)) return null;
  const current = cloneTalentSave(profile.talents);
  if (action === 'rename') {
    const preset = current.presets?.[slot];
    const label = name.trim().slice(0, 32);
    if (!preset || !label) return null;
    current.presets![slot] = { ...preset, name: label };
    return { ...profile, talents: current };
  }
  if (action === 'save') {
    current.presets ??= Array.from({ length: 8 }, () => null);
    current.presets[slot] = {
      name: buildName(name, slot),
      ranks: { ...current.ranks },
      equipped: [...current.equipped]
    };
    return { ...profile, talents: current };
  }
  const preset = current.presets?.[slot];
  if (!preset) return null;
  let next = reconcile(createTalentSave(), level);
  next.licensed = [...(current.licensed ?? [])];
  for (let pass = 0; pass < TALENTS.length; pass++) {
    let bought = false;
    for (const talent of TALENTS)
      if ((next.ranks[talent.id] ?? 0) < (preset.ranks[talent.id] ?? 0)) {
        const purchase = buyTalent(next, level, talent.id);
        if (purchase) {
          next = purchase;
          bought = true;
        }
      }
    if (!bought) break;
  }
  if (
    Object.entries(preset.ranks).some(
      ([id, n]) => (next.ranks[id as keyof typeof next.ranks] ?? 0) !== n
    )
  )
    return null;
  next.equipped = [...preset.equipped];
  next = reconcile(next, level);
  next.stats = { ...current.stats, respecs: current.stats.respecs + 1 };
  next.presets = current.presets!;
  return { ...profile, talents: next };
}
