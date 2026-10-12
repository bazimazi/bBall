import type { MatchResult } from '../modes/types';
import type { PlayerProfile } from '../profile/types';
import {
  LOOT_ITEMS,
  LOOT_MODES,
  MAX_LOOT,
  emptyLoot,
  type LootBundle,
  type LootMode
} from './catalog';

export interface LootReward {
  items: LootBundle;
  circuitCompleted: boolean;
  discovery: boolean;
  firstClear: boolean;
}
export const emptyLootReward = (): LootReward => ({
  items: emptyLoot(),
  circuitCompleted: false,
  discovery: false,
  firstClear: false
});
/** Guaranteed, bounded drops; never rerolled, lost on defeat, or time-gated. */
export function applyLootReward(
  profile: PlayerProfile,
  result: MatchResult,
  firstClear: boolean,
  newStars: number
): LootReward {
  const reward = emptyLootReward();
  if (
    !result.ranked ||
    result.abandoned ||
    !LOOT_MODES.includes(result.mode as LootMode) ||
    result.seconds < 15 ||
    result.hits < 2
  )
    return reward;
  const mode = result.mode as LootMode,
    state = profile.progress.loot;
  reward.items.shards = 3 + Math.min(6, Math.floor(result.hits / 8)) + (result.won ? 2 : 0);
  if (mode !== 'quick') reward.items.threads = 1 + (result.won || result.objectiveMet ? 1 : 0);
  if ((result.won && result.botRank >= 4) || (mode === 'endless' && (result.waves ?? 0) >= 3))
    reward.items.cores++;
  if (!state.seenModes.includes(mode)) {
    state.seenModes.push(mode);
    reward.discovery = true;
    reward.items.threads += 2;
  }
  if (!state.circuit.includes(mode)) state.circuit.push(mode);
  if (state.circuit.length >= 3) {
    state.circuit = [];
    state.circuits = Math.min(MAX_LOOT, state.circuits + 1);
    reward.circuitCompleted = true;
    reward.items.cores++;
    reward.items.threads += 2;
  }
  reward.firstClear = firstClear;
  if (firstClear) {
    reward.items.shards += 5;
    reward.items.threads += 2;
    if (result.challengeId?.startsWith('resonance-')) {
      reward.items.shards += 7;
      reward.items.cores += 2;
    }
  }
  reward.items.threads += Math.min(3, newStars);
  for (const item of LOOT_ITEMS) {
    const before = state.earned[item];
    state.earned[item] = Math.min(MAX_LOOT, before + reward.items[item]);
    reward.items[item] = state.earned[item] - before;
  }
  return reward;
}
