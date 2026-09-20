import { abilityById } from '../core/talents/abilities';
import type { AbilityId } from '../core/talents/types';
import { predictY } from './ai';
import { FIELD_H } from './constants';
import { hsla, sideHue } from './palette';
import { boundTarget } from './talents';
import type { AbilityView } from './types';
import type { World } from './world';

/**
 * Firing the active abilities.
 *
 * Every ability is data in `core/talents/abilities.ts`; this file is the one
 * place that knows what each id *does* to the world. Adding a skill means one
 * catalogue entry and one case below - the HUD, the cooldowns, the equip
 * screen and the persistence all come for free.
 */

/**
 * Where a dash is trying to get to.
 *
 * A dash follows the intent that is already on screen: the position being
 * steered towards, or - when the paddle is sitting still - where the incoming
 * ball is going to cross. `stop` is that destination, and the dash is never
 * allowed past it, so a badly timed press costs a cooldown rather than the
 * point. Without either, it is a plain nudge towards the nearer half.
 */
function dashAim(world: World): { dir: 1 | -1; stop: number | null } {
  const { player, ball } = world;
  const steered = player.target - player.y;
  if (Math.abs(steered) > 6) {
    return { dir: steered > 0 ? 1 : -1, stop: player.target };
  }

  if (ball.vx < 0) {
    const crossing = predictY(world, player.x);
    const gap = crossing - player.y;
    if (Math.abs(gap) > 1) return { dir: gap > 0 ? 1 : -1, stop: crossing };
  }
  return { dir: player.y < FIELD_H / 2 ? 1 : -1, stop: null };
}

function fireDash(world: World): void {
  const { player, talents, loadout } = world;
  const { dir, stop } = dashAim(world);

  let to = player.y + dir * loadout.effects.dashDistance;
  if (stop !== null) to = dir > 0 ? Math.min(to, stop) : Math.max(to, stop);
  to = boundTarget(player, to);

  talents.dashFrom = player.y;
  player.y = to;
  player.target = to;
  player.vy = 0;
  talents.dashFx = loadout.effects.dashSeconds;
  talents.stats.dashes++;

  world.particles.emit(
    player.x,
    player.y - dir * player.half,
    16,
    {
      angle: dir > 0 ? -Math.PI / 2 : Math.PI / 2,
      spread: 1.1,
      speed: 260,
      life: 0.35,
      size: 3,
      color: hsla(sideHue(world.theme, 'you'), 100, 72, 0.85)
    },
    world.motion
  );
  world.audio.dash();
}

function firePowerStrike(world: World): void {
  const { talents, loadout, player } = world;
  talents.strikeArmed = loadout.effects.powerStrikeWindow;
  world.particles.emit(
    player.x,
    player.y,
    18,
    { speed: 210, life: 0.5, size: 3.2, color: hsla(26, 100, 66, 0.9) },
    world.motion
  );
  world.audio.charge();
}

function firePerfectGuard(world: World): void {
  const { talents, loadout } = world;
  // The window opens now and closes on its own. The cooldown starts either
  // way, so mashing it costs the next read rather than buying a second one.
  talents.guardWindow = loadout.effects.guardWindow;
  world.audio.guard();
}

/** A burst of light around the paddle, shared by every capstone. */
function ultimateFlare(world: World, hue: number): void {
  const { player } = world;
  world.particles.emit(
    player.x,
    player.y,
    34,
    { speed: 340, life: 0.7, size: 4.2, color: hsla(hue, 100, 70, 0.95) },
    world.motion
  );
  world.audio.ultimate();
}

function fire(world: World, id: AbilityId): void {
  const { talents, loadout } = world;
  const { effects } = loadout;

  switch (id) {
    case 'power-strike':
      firePowerStrike(world);
      break;
    case 'dash':
      fireDash(world);
      break;
    case 'perfect-guard':
      firePerfectGuard(world);
      break;

    // ----------------------------------------------------------- capstones
    case 'overload':
      talents.overload = effects.overloadHits;
      ultimateFlare(world, 22);
      break;
    case 'slipstream':
      talents.slipstream = effects.slipstreamSeconds;
      ultimateFlare(world, 192);
      break;
    case 'aegis':
      talents.aegis = effects.aegisSeconds;
      talents.aegisSaves = effects.aegisSaves;
      ultimateFlare(world, 268);
      break;
    case 'zenith':
      talents.zenith = effects.zenithSeconds;
      ultimateFlare(world, 44);
      break;
    case 'echo':
      // Clears the *other* slots, never its own - that is what keeps a
      // capstone from ever becoming part of a rotation.
      for (const slot of talents.slots) {
        if (slot.id && slot.id !== 'echo') slot.cooldown = 0;
      }
      talents.echo = effects.echoSeconds;
      ultimateFlare(world, 150);
      break;
  }
}

/**
 * Use the ability in `slot`.
 *
 * Returns false - silently - when the slot is empty, still cooling down, or
 * the match is not in a state where an ability means anything. A dead press
 * never costs the player anything, which matters most during a fast rally.
 */
export function fireAbility(world: World, slot: number): boolean {
  const { status } = world.match;
  if (status !== 'play' && status !== 'serve') return false;

  const entry = world.talents.slots[slot];
  if (!entry?.id || entry.cooldown > 0) return false;

  const def = abilityById(entry.id);
  if (!def) return false;

  const span = def.cooldown(world.loadout.effects);
  entry.cooldown = span;
  entry.span = span;
  world.talents.stats.abilitiesUsed++;
  if (def.ultimate) world.talents.stats.ultimates++;
  fire(world, entry.id);
  return true;
}

/** Cooldown steps published to the HUD. Enough to look smooth, few enough
 *  that React re-renders a handful of times per cooldown rather than 60. */
const STEPS = 24;

/**
 * Flatten the equipped abilities for the UI.
 *
 * `progress` is quantised so the engine can compare two views cheaply and
 * skip the re-render when nothing a player could see has changed.
 */
export function abilityViews(world: World): AbilityView[] {
  const views: AbilityView[] = [];
  for (const slot of world.talents.slots) {
    if (!slot.id) continue;
    const def = abilityById(slot.id);
    if (!def) continue;

    const ready = slot.cooldown <= 0;
    const raw = ready || slot.span <= 0 ? 1 : 1 - slot.cooldown / slot.span;
    views.push({
      id: slot.id,
      name: def.name,
      glyph: def.glyph,
      ready,
      progress: Math.round(raw * STEPS) / STEPS,
      active: activeNow(world, slot.id),
      ultimate: def.ultimate === true
    });
  }
  return views;
}

/** True while the ability's own effect - not its cooldown - is running. */
function activeNow(world: World, id: AbilityId): boolean {
  const runtime = world.talents;
  switch (id) {
    case 'power-strike':
      return runtime.strikeArmed > 0;
    case 'perfect-guard':
      return runtime.guardWindow > 0;
    case 'dash':
      return runtime.dashFx > 0;
    case 'overload':
      return runtime.overload > 0;
    case 'slipstream':
      return runtime.slipstream > 0;
    case 'aegis':
      return runtime.aegis > 0;
    case 'zenith':
      return runtime.zenith > 0;
    case 'echo':
      return runtime.echo > 0;
  }
}
