import { BALANCE, abilitySlotsForLevel } from '../balance/config';
import { isAbilityId } from './abilities';
import { TALENTS, costOfRank, isTalentId, talentById } from './catalog';
import {
  type AbilityId,
  type TalentDef,
  type TalentId,
  type TalentSave,
  type TalentStats
} from './types';

/**
 * The saved build, and every pure operation on it.
 *
 * Nothing here touches storage or React. `points` is written into the save so
 * the UI has it without a walk of the tree, but {@link reconcile} always
 * recomputes it from level and spend - so a stale save, a catalogue change or
 * a hand-edited localStorage entry all converge on the same honest number.
 */

export function createTalentStats(): TalentStats {
  return {
    pointsEarned: 0,
    respecs: 0,
    abilitiesUsed: 0,
    powerStrikes: 0,
    dashes: 0,
    perfectGuards: 0,
    crits: 0,
    shieldSaves: 0,
    secondChances: 0,
    bestDrive: 0
  };
}

export function createTalentSave(): TalentSave {
  return {
    points: 0,
    ranks: {},
    equipped: Array.from({ length: BALANCE.talents.slots.max }, () => null),
    stats: createTalentStats()
  };
}

export function cloneTalentSave(save: TalentSave): TalentSave {
  return {
    points: save.points,
    ranks: { ...save.ranks },
    equipped: [...save.equipped],
    stats: { ...save.stats }
  };
}

/** Talent points the player has been granted by reaching `level`. */
export function earnedPoints(level: number): number {
  return Math.max(0, Math.round(level) - 1) * BALANCE.talents.pointsPerLevel;
}

export function rankOf(save: TalentSave, id: TalentId): number {
  return Math.max(0, save.ranks[id] ?? 0);
}

/** Points sunk into the current build. */
export function spentPoints(save: TalentSave): number {
  let total = 0;
  for (const talent of TALENTS) {
    const rank = Math.min(talent.maxRank, rankOf(save, talent.id));
    for (let i = 0; i < rank; i++) total += talent.costs[i] ?? 0;
  }
  return total;
}

function requirementsMet(save: TalentSave, talent: TalentDef): boolean {
  return talent.requires.every((need) => rankOf(save, need.talent) >= need.rank);
}

/**
 * Bring a save back in line with the catalogue and the player's level.
 *
 * Ranks whose prerequisites no longer hold are dropped (a catalogue change
 * can do that, nothing else), equipped abilities the build does not own are
 * cleared, and `points` is recomputed. Always safe to run.
 */
export function reconcile(save: TalentSave, level: number): TalentSave {
  const next = cloneTalentSave(save);

  // Drop ranks above a talent's cap, or for talents that no longer exist.
  for (const id of Object.keys(next.ranks) as TalentId[]) {
    const talent = talentById(id);
    if (!talent) {
      delete next.ranks[id];
      continue;
    }
    const rank = Math.min(talent.maxRank, Math.max(0, Math.floor(next.ranks[id] ?? 0)));
    if (rank <= 0) delete next.ranks[id];
    else next.ranks[id] = rank;
  }

  // Prerequisites can fail in a chain, so settle before moving on.
  for (let pass = 0; pass < TALENTS.length; pass++) {
    let changed = false;
    for (const talent of TALENTS) {
      if (rankOf(next, talent.id) === 0) continue;
      if (requirementsMet(next, talent)) continue;
      delete next.ranks[talent.id];
      changed = true;
    }
    if (!changed) break;
  }

  const slots = BALANCE.talents.slots.max;
  const owned = new Set<AbilityId>();
  for (const talent of TALENTS) {
    if (talent.ability && rankOf(next, talent.id) > 0) owned.add(talent.ability);
  }

  const equipped: (AbilityId | null)[] = [];
  const seen = new Set<AbilityId>();
  for (let i = 0; i < slots; i++) {
    const id = next.equipped[i] ?? null;
    // An ability may only be slotted once, and only if the build owns it.
    if (id && owned.has(id) && !seen.has(id) && i < abilitySlotsForLevel(level)) {
      seen.add(id);
      equipped.push(id);
    } else {
      equipped.push(null);
    }
  }
  next.equipped = equipped;

  const earned = earnedPoints(level);
  next.points = Math.max(0, earned - spentPoints(next));
  next.stats = { ...next.stats, pointsEarned: earned };
  return next;
}

/** Why a talent cannot be bought right now, or null when it can. */
export type TalentBlock =
  | { kind: 'maxed' }
  | { kind: 'level'; level: number }
  | { kind: 'requires'; talent: TalentDef; rank: number }
  | { kind: 'points'; need: number };

export interface TalentState {
  readonly talent: TalentDef;
  readonly rank: number;
  readonly maxed: boolean;
  /** Cost of the next rank. 0 when maxed. */
  readonly cost: number;
  /** True when the prerequisites and level gate are satisfied. */
  readonly unlocked: boolean;
  readonly canBuy: boolean;
  readonly block: TalentBlock | null;
}

export function talentState(save: TalentSave, level: number, talent: TalentDef): TalentState {
  const rank = rankOf(save, talent.id);
  const maxed = rank >= talent.maxRank;
  const cost = costOfRank(talent, rank);

  let block: TalentBlock | null = null;
  if (maxed) block = { kind: 'maxed' };
  else if (level < talent.minLevel) block = { kind: 'level', level: talent.minLevel };
  else {
    const missing = talent.requires.find((need) => rankOf(save, need.talent) < need.rank);
    const missingTalent = missing ? talentById(missing.talent) : undefined;
    if (missing && missingTalent) {
      block = { kind: 'requires', talent: missingTalent, rank: missing.rank };
    } else if (save.points < cost) {
      block = { kind: 'points', need: cost - save.points };
    }
  }

  const unlocked =
    level >= talent.minLevel &&
    talent.requires.every((need) => rankOf(save, need.talent) >= need.rank);

  return { talent, rank, maxed, cost, unlocked, canBuy: block === null, block };
}

/** Buy one rank. Returns a new save, or null when the purchase is illegal. */
export function buyTalent(save: TalentSave, level: number, id: TalentId): TalentSave | null {
  const talent = talentById(id);
  if (!talent) return null;
  const state = talentState(save, level, talent);
  if (!state.canBuy) return null;

  const next = cloneTalentSave(save);
  next.ranks[id] = state.rank + 1;

  // A first rank that unlocks an ability drops it into a free slot, so the
  // player never buys an active skill and then wonders where it went.
  if (talent.ability && state.rank === 0) {
    const slots = abilitySlotsForLevel(level);
    const free = next.equipped.findIndex((slot, index) => index < slots && slot === null);
    if (free >= 0) next.equipped[free] = talent.ability;
  }

  return reconcile(next, level);
}

/** Refund the whole tree. Free, by design: builds are meant to be tried. */
export function respec(save: TalentSave, level: number): TalentSave {
  const next = createTalentSave();
  next.stats = { ...save.stats, respecs: save.stats.respecs + 1 };
  return reconcile(next, level);
}

/**
 * Put `id` in `slot`, or clear it with `null`. Equipping something already
 * slotted elsewhere moves it rather than duplicating it.
 */
export function equipAbility(
  save: TalentSave,
  level: number,
  slot: number,
  id: AbilityId | null
): TalentSave | null {
  const slots = abilitySlotsForLevel(level);
  if (slot < 0 || slot >= slots) return null;

  const next = cloneTalentSave(save);
  if (id !== null) {
    const owner = TALENTS.find((talent) => talent.ability === id);
    if (!owner || rankOf(next, owner.id) === 0) return null;
    const existing = next.equipped.indexOf(id);
    if (existing >= 0) next.equipped[existing] = next.equipped[slot] ?? null;
  }
  next.equipped[slot] = id;
  return reconcile(next, level);
}

/** Every ability the build owns, whether or not it is equipped. */
export function ownedAbilities(save: TalentSave): AbilityId[] {
  const owned: AbilityId[] = [];
  for (const talent of TALENTS) {
    if (talent.ability && rankOf(save, talent.id) > 0) owned.push(talent.ability);
  }
  return owned;
}

// ------------------------------------------------------------- validation

type Bag = Record<string, unknown>;

function bag(value: unknown): Bag {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Bag) : {};
}

function count(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.round(n));
}

function statsOf(value: unknown): TalentStats {
  const source = bag(value);
  const base = createTalentStats();
  return {
    pointsEarned: count(source.pointsEarned, base.pointsEarned),
    respecs: count(source.respecs, base.respecs),
    abilitiesUsed: count(source.abilitiesUsed, base.abilitiesUsed),
    powerStrikes: count(source.powerStrikes, base.powerStrikes),
    dashes: count(source.dashes, base.dashes),
    perfectGuards: count(source.perfectGuards, base.perfectGuards),
    crits: count(source.crits, base.crits),
    shieldSaves: count(source.shieldSaves, base.shieldSaves),
    secondChances: count(source.secondChances, base.secondChances),
    bestDrive: count(source.bestDrive, base.bestDrive)
  };
}

/**
 * Repair an unknown payload into a usable build.
 *
 * Like the rest of the profile schema this never throws anything away that
 * can be salvaged: an unknown talent id is dropped, a silly rank is clamped,
 * and the point total is recomputed rather than trusted.
 */
export function talentSaveOf(value: unknown, level: number): TalentSave {
  const source = bag(value);
  const save = createTalentSave();

  for (const [id, rank] of Object.entries(bag(source.ranks))) {
    if (!isTalentId(id)) continue;
    const talent = talentById(id);
    if (!talent) continue;
    const owned = Math.min(talent.maxRank, count(rank));
    if (owned > 0) save.ranks[id] = owned;
  }

  const equipped = Array.isArray(source.equipped) ? source.equipped : [];
  for (let i = 0; i < save.equipped.length; i++) {
    const id = equipped[i];
    save.equipped[i] = isAbilityId(id) ? id : null;
  }

  save.stats = statsOf(source.stats);
  return reconcile(save, level);
}
