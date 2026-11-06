import { resolveLoadout, type ResolvedLoadout } from '../core/talents/effects';
import { buyTalent, createTalentSave, reconcile } from '../core/talents/save';
import type { TalentId } from '../core/talents/types';
import type { BotProfile } from '../core/bots/types';
import { opponentPlan } from '../core/bots/builds';
import type { Side } from './types';
import type { World } from './world';

const views = new WeakMap<World, World>();

/** A side-specific view of the same match, without copying live physics. */
export function combatant(world: World, side: Side): World {
  if (side === 'you') return world;
  let view = views.get(world);
  if (!view) {
    view = Object.create(world) as World;
    Object.defineProperties(view, {
      player: { get: () => world.bot },
      bot: { get: () => world.player },
      loadout: { get: () => world.botLoadout },
      talents: { get: () => world.botTalents }
    });
    views.set(world, view);
  }
  return view;
}

/**
 * The passive half of an opponent's build: `points` spent down its school's
 * plan through the ordinary purchase rules, so every tier gate and
 * prerequisite holds exactly as it does for the player.
 */
function opponentPassives(profile: BotProfile, points: number): Partial<Record<TalentId, number>> {
  if (points <= 0) return {};
  let save = reconcile(createTalentSave(), points + 1);
  const plan = opponentPlan(profile);
  for (let pass = 0; pass < 6; pass++)
    for (const id of plan) {
      const next = buyTalent(save, points + 1, id);
      if (next) save = next;
    }
  return save.ranks;
}

export function opponentLoadout(profile: BotProfile, points = 0): ResolvedLoadout {
  const save = createTalentSave();
  save.ranks = { ...opponentPassives(profile, points) };
  if (profile.id !== 'wall') {
    if (profile.rank >= 2) {
      save.ranks['power-strike'] = 1;
      save.equipped[0] = 'power-strike';
    }
    if (profile.rank >= 3) {
      save.ranks.dash = 1;
      save.equipped[1] = 'dash';
    }
    if (profile.rank >= 4) {
      save.ranks['perfect-guard'] = 1;
      save.equipped[2] = 'perfect-guard';
    }
    // A Legend school plays its own idea with three skills; only the
    // schoolless Legend and the Opportunist carry an ultimate as well.
    if (profile.rank >= 5 && (!profile.personality || profile.personality === 'opportunist')) {
      save.ranks.overload = 1;
      save.equipped[3] = 'overload';
    }
  }
  if (profile.personality === 'banker')
    save.ranks['bank-shot'] = Math.max(2, save.ranks['bank-shot'] ?? 0);
  if (profile.personality === 'curver') save.ranks.swerve = Math.max(1, save.ranks.swerve ?? 0);
  if (profile.personality === 'anchor')
    save.ranks['long-reach'] = Math.max(1, save.ranks['long-reach'] ?? 0);
  if (profile.personality === 'aggressor')
    save.ranks['heavy-impact'] = Math.max(1, save.ranks['heavy-impact'] ?? 0);
  const loadout = resolveLoadout(save, 50);
  return { ...loadout, paddleSpeed: profile.speed };
}
