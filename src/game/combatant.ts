import { resolveLoadout, type ResolvedLoadout } from '../core/talents/effects';
import { createTalentSave } from '../core/talents/save';
import type { BotProfile } from '../core/bots/types';
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

export function opponentLoadout(profile: BotProfile): ResolvedLoadout {
  const save = createTalentSave();
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
    if (profile.rank >= 5) {
      save.ranks.overload = 1;
      save.equipped[3] = 'overload';
    }
    if (profile.rank >= 5 && profile.personality && profile.personality !== 'opportunist') {
      const skill =
        profile.personality === 'banker'
          ? 'anchor'
          : profile.personality === 'curver'
            ? 'redirect'
            : profile.personality === 'disruptor'
              ? 'relay'
              : profile.personality === 'anchor'
                ? 'rebound'
                : 'reserve';
      save.ranks[skill] = 1;
      save.equipped[3] = skill;
    }
  }
  if (profile.personality === 'banker') save.ranks['bank-shot'] = 2;
  if (profile.personality === 'curver') save.ranks.swerve = 2;
  if (profile.personality === 'anchor') save.ranks['long-reach'] = 1;
  if (profile.personality === 'aggressor') save.ranks['heavy-impact'] = 1;
  const loadout = resolveLoadout(save, 50);
  return { ...loadout, paddleSpeed: profile.speed };
}
