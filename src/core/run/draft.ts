import { withBoons, type ResolvedLoadout } from '../talents/effects';
import type { AbilityId, TalentEffects } from '../talents/types';
import type { BoonDef, BoonRanks } from './boons';

/**
 * Which drafted boons would actually do something for this build.
 *
 * A boon is worth offering when one more rank of it changes a resolved
 * number - after the shared talent caps - that the build can use. Most of the
 * expansion boons tune a skill or a mechanic the player may not have at all:
 * a guard window without Perfect Guard, a strike cooldown without Power
 * Strike, shield recovery with no shield. Those are left out of the draft
 * rather than offered as dead slots, and a relic is judged only by what it
 * gives, never by its drawback.
 *
 * Pure, and fed the same build on the client and the server, so both roll
 * the same draft.
 */

type Live = (effects: TalentEffects, build: ResolvedLoadout) => boolean;

const has = (build: ResolvedLoadout, id: AbilityId) => build.equipped.includes(id);
const skills = (build: ResolvedLoadout) => build.equipped.filter(Boolean).length;
const shielded = (e: TalentEffects) => !e.unsaved && e.shieldCharges > 0;
const saves = (e: TalentEffects, build: ResolvedLoadout) =>
  !e.unsaved &&
  (e.shieldCharges > 0 || e.adrenalineEvery > 0 || (has(build, 'aegis') && e.aegisSaves > 0));
const blinks = (e: TalentEffects, build: ResolvedLoadout) =>
  has(build, 'dash') && e.blinkSeconds > 0;
/** Something that leaves a return charged. */
const charges = (e: TalentEffects, build: ResolvedLoadout) =>
  e.momentumEvery > 0 ||
  e.hotHand > 0 ||
  has(build, 'power-strike') ||
  blinks(e, build) ||
  (has(build, 'overload') && e.overloadHits > 0) ||
  (e.counterPace > 0 && saves(e, build));
/** Something that lands a critical return. */
const crits = (e: TalentEffects, build: ResolvedLoadout) =>
  e.critChance > 0 ||
  e.edgePressure > 0 ||
  (has(build, 'overload') && e.overloadHits > 0) ||
  (e.hotHandCrit && e.hotHand > 0) ||
  (e.blinkCrit && blinks(e, build)) ||
  (e.chargedCrits && charges(e, build));
const guard: Live = (_, build) => has(build, 'perfect-guard');
const dash: Live = (_, build) => has(build, 'dash');
const strike: Live = (_, build) => has(build, 'power-strike');
const anySkill: Live = (_, build) => skills(build) > 0;
const afterglow: Live = (e, build) => skills(build) > 0 && e.afterglowLength > 0;

/** Effects that only matter with a skill or mechanic; every other change always counts. */
const LIVE: Partial<Record<keyof TalentEffects, Live>> = {
  guardWindow: guard,
  guardReach: guard,
  guardCooldown: guard,
  parryTempo: guard,
  guardGrantsShield: (e, build) => has(build, 'perfect-guard') && shielded(e),
  dashDistance: dash,
  dashCooldown: dash,
  dashSeconds: dash,
  blinkSeconds: dash,
  blinkRefund: blinks,
  blinkCrit: blinks,
  dashSlow: blinks,
  powerStrikeSpeed: strike,
  powerStrikeWindow: strike,
  powerStrikeCooldown: strike,
  powerStrikeHits: strike,
  critGrowth: crits,
  critHeft: crits,
  chargedCrits: charges,
  hotHandCrit: (e) => e.hotHand > 0,
  shieldTempo: shielded,
  shieldRecharge: shielded,
  shieldSaveSpeed: shielded,
  counterPace: saves,
  driveKeep: (e) => e.comboLength > 0 || e.adrenalineEvery > 0,
  flowRecharge: (e, build) => skills(build) > 0 && (e.flowAngle > 0 || has(build, 'zenith')),
  castTempo: (_, build) => skills(build) >= 2,
  afterglowLength: anySkill,
  afterglowSeconds: afterglow,
  afterglowTempo: afterglow,
  recharge: anySkill,
  tempo: anySkill,
  cooldownMul: anySkill,
  // A drawback flag is never the reason to take a boon.
  unsaved: () => false
};

/** A predicate over boons for one build holding `owned`; resolves the build once. */
export function usefulFor(build: ResolvedLoadout, owned: BoonRanks): (boon: BoonDef) => boolean {
  const before = withBoons(build, owned).effects;
  return (boon) => {
    // Match-wide boons - a longer paddle, a shorter opponent, a slower serve -
    // change every encounter whatever the build.
    if (!boon.effects) return true;
    const after = withBoons(build, { ...owned, [boon.id]: (owned[boon.id] ?? 0) + 1 }).effects;
    for (const key of Object.keys(after) as (keyof TalentEffects)[]) {
      if (after[key] === before[key]) continue;
      const live = LIVE[key];
      if (!live || live(after, build)) return true;
    }
    return false;
  };
}
