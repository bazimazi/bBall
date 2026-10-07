import { TALENTS } from '../src/core/talents/catalog';
import { buyTalent, createTalentSave, reconcile, ownedAbilities } from '../src/core/talents/save';
import { resolveLoadout } from '../src/core/talents/effects';
import { fireAbility } from '../src/game/abilities';
import type { BranchId } from '../src/core/talents/types';
import type { World } from '../src/game/world';
import { FIELD_H } from '../src/game/constants';

/** Purchases use the real gates and point budget; no fabricated maxed tree. */
export function benchmarkBuild(branch: BranchId, level: number) {
  let save = reconcile(createTalentSave(), level);
  const order = [
    ...TALENTS.filter((t) => t.branch === branch),
    ...TALENTS.filter((t) => t.branch !== branch)
  ];
  for (let pass = 0; pass < 10; pass++)
    for (const talent of order) {
      const next = buyTalent(save, level, talent.id);
      if (next) save = next;
    }
  const owned = ownedAbilities(save);
  save.equipped = Array.from({ length: 4 }, (_, i) => owned[i] ?? null);
  save = reconcile(save, level);
  return resolveLoadout(save, level);
}
/** Deliberately different play habits; never inspect the opponent's next input. */
const decisions = new WeakMap<World, { planned: number; applied: number }>();
export function benchmarkSkills(world: World, policy: 'balanced' | 'rush' | 'edge' | 'late') {
  if (world.match.status !== 'play') return;
  let choice = decisions.get(world);
  if (!choice) {
    choice = { planned: world.player.target, applied: world.player.target };
    decisions.set(world, choice);
  }
  if (world.player.target !== choice.applied) choice.planned = world.player.target;
  const time =
    world.ball.vx < 0
      ? Math.abs(world.ball.x - world.player.x) / Math.max(1, Math.abs(world.ball.vx))
      : Infinity;
  if (policy === 'edge' && time < 1)
    world.player.target = Math.max(
      world.player.half,
      Math.min(
        FIELD_H - world.player.half,
        choice.planned + (world.ball.vy >= 0 ? -1 : 1) * world.player.half * 0.3
      )
    );
  if (policy === 'late') world.player.target = time > 0.28 ? world.player.y : choice.planned;
  choice.applied = world.player.target;
  for (const [slot, entry] of world.talents.slots.entries()) {
    if (!entry.id) continue;
    const emergency = time < 0.3,
      attack = time < 0.7 && time > 0.12;
    if (
      policy === 'rush' ||
      (entry.id === 'dash'
        ? emergency && Math.abs(world.player.target - world.player.y) > world.player.half
        : entry.id === 'perfect-guard'
          ? time < world.loadout.effects.guardWindow
          : ['overload', 'slipstream', 'aegis', 'zenith', 'echo'].includes(entry.id)
            ? world.match.rally > 5 && attack
            : attack)
    )
      fireAbility(world, slot);
  }
}
