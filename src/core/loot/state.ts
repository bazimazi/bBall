import {
  LOOT_ITEMS,
  LOOT_MODES,
  MAX_LOOT,
  RESEARCH,
  emptyLoot,
  type LootBundle,
  type LootMode,
  type ResearchId
} from './catalog';
import type { AbilityId } from '../talents/types';

export interface LootState {
  version: 1;
  /** Lifetime earned resources. Balance is derived from permanent unlock costs. */
  earned: LootBundle;
  unlocked: ResearchId[];
  seenModes: LootMode[];
  circuit: LootMode[];
  circuits: number;
  /** Pinned saved-build indices. A match freezes their builds at its start. */
  specializations: (number | null)[];
}
export const createLoot = (): LootState => ({
  version: 1,
  earned: emptyLoot(),
  unlocked: [],
  seenModes: [],
  circuit: [],
  circuits: 0,
  specializations: [null, null, null]
});
export const hasResearch = (state: LootState, id: ResearchId) => state.unlocked.includes(id);
export const specializationSlots = (state: LootState) =>
  hasResearch(state, 'triple-spec') ? 3 : hasResearch(state, 'dual-spec') ? 2 : 0;
export const licensedAbilities = (state: LootState): AbilityId[] =>
  RESEARCH.filter((entry) => entry.ability && hasResearch(state, entry.id)).map(
    (entry) => entry.ability!
  );
export function lootBalance(state: LootState): LootBundle {
  const balance = { ...state.earned };
  for (const entry of RESEARCH)
    if (hasResearch(state, entry.id))
      for (const item of LOOT_ITEMS) balance[item] -= entry.cost[item];
  return balance;
}
export const cloneLoot = (state: LootState): LootState => ({
  ...state,
  earned: { ...state.earned },
  unlocked: [...state.unlocked],
  seenModes: [...state.seenModes],
  circuit: [...state.circuit],
  specializations: [...state.specializations]
});
const bag = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
export function lootOf(value: unknown): LootState {
  const source = bag(value),
    state = createLoot();
  for (const item of LOOT_ITEMS) {
    const n = bag(source.earned)[item];
    state.earned[item] =
      typeof n === 'number' && Number.isFinite(n)
        ? Math.max(0, Math.min(MAX_LOOT, Math.floor(n)))
        : 0;
  }
  const requested = new Set(Array.isArray(source.unlocked) ? source.unlocked : []);
  // Catalogue order is topological. Repair overspent saves without a negative wallet.
  for (const entry of RESEARCH) {
    const balance = lootBalance(state);
    if (
      requested.has(entry.id) &&
      entry.requires.every((id) => hasResearch(state, id)) &&
      LOOT_ITEMS.every((item) => balance[item] >= entry.cost[item])
    )
      state.unlocked.push(entry.id);
  }
  for (const key of ['seenModes', 'circuit'] as const)
    state[key] = [...new Set(Array.isArray(source[key]) ? source[key] : [])]
      .filter((mode): mode is LootMode => LOOT_MODES.includes(mode as LootMode))
      .slice(0, key === 'circuit' ? 2 : LOOT_MODES.length);
  state.circuits =
    typeof source.circuits === 'number' && Number.isFinite(source.circuits)
      ? Math.max(0, Math.min(MAX_LOOT, Math.floor(source.circuits)))
      : 0;
  const pinned = Array.isArray(source.specializations) ? source.specializations : [];
  const seen = new Set<number>();
  state.specializations = Array.from({ length: 3 }, (_, i) => {
    const n = pinned[i];
    if (i >= specializationSlots(state) || !Number.isInteger(n) || n < 0 || n >= 8 || seen.has(n))
      return null;
    seen.add(n);
    return n as number;
  });
  return state;
}
