import { BALANCE } from '../core/balance/config';
import { abilityById, type AbilityDef } from '../core/talents/abilities';
import type { AbilityId } from '../core/talents/types';
import { predictY } from './ai';
import { laneRush, ultimateCast } from './casts';
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

function fireDash(world: World, hue: number): void {
  const { player, talents, loadout } = world;
  const { dir, stop } = dashAim(world);

  let to = player.y + dir * loadout.effects.dashDistance;
  if (stop !== null) to = dir > 0 ? Math.min(to, stop) : Math.max(to, stop);
  to = boundTarget(player, to);

  const from = player.y;
  talents.dashFrom = from;
  player.y = to;
  player.target = to;
  player.vy = 0;
  talents.dashFx = loadout.effects.dashSeconds;
  talents.stats.dashes++;
  // The first afterimage has to be taken at the *old* position: by the next
  // step the paddle is already at the far end of the streak.
  world.ghosts.mark(from, player.half);

  // A ripple at each end of the jump - one where the paddle left, one where
  // it arrived. Between them the renderer draws the corridor itself, which
  // is the only motion a teleport has to show for itself.
  world.casts.spawn('dash', { x: player.x, y: from, hue, life: 0.4, size: 44 }, world.motion);
  world.casts.spawn('dash', { x: player.x, y: to, hue, life: 0.5, size: 30 }, world.motion);

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

function firePowerStrike(world: World, hue: number): void {
  const { talents, loadout, player } = world;
  talents.strikeArmed = loadout.effects.powerStrikeWindow;

  // Arcs collapsing onto the paddle rather than flying off it: the charge is
  // being taken *on*, which is what tells a held buff from a spent one.
  world.casts.spawn(
    'power-strike',
    { x: player.x, y: player.y, hue, life: 0.55, size: 74 },
    world.motion
  );
  world.particles.emit(
    player.x,
    player.y,
    18,
    { speed: 210, life: 0.5, size: 3.2, color: hsla(hue, 100, 66, 0.9) },
    world.motion
  );
  world.audio.charge();
}

function firePerfectGuard(world: World, hue: number): void {
  const { talents, loadout, player } = world;
  // The window opens now and closes on its own. The cooldown starts either
  // way, so mashing it costs the next read rather than buying a second one.
  talents.guardWindow = loadout.effects.guardWindow;
  // One bloom outwards as it opens. From here the aura's ring walks back in
  // as the window drains, so the timing is a shape rather than a number.
  world.casts.spawn(
    'perfect-guard',
    { x: player.x, y: player.y, hue, life: 0.4, size: 58 },
    world.motion
  );
  world.audio.guard();
}

/**
 * The burst of light every capstone opens with.
 *
 * On top of the skill's own animation, and deliberately identical for all
 * five: a court-wide ring, a beat of hit-stop, the viewport washed in the
 * skill's own colour, and its name under the centre circle. Nothing else in
 * the game may have any of those four, so "a capstone went off, and it was
 * that one" reads even to a player whose eyes never left the ball.
 */
function ultimateFlare(world: World, id: AbilityId, hue: number, name: string): void {
  const { player } = world;
  ultimateCast(world, id, hue, name);
  world.particles.emit(
    player.x,
    player.y,
    34,
    { speed: 340, life: 0.7, size: 4.2, color: hsla(hue, 100, 70, 0.95) },
    world.motion
  );
  world.audio.ultimate(id);
}

function fire(world: World, def: AbilityDef): void {
  const { talents, loadout } = world;
  const { effects } = loadout;
  const { id, hue, name } = def;

  switch (id) {
    case 'power-strike':
      firePowerStrike(world, hue);
      break;
    case 'dash':
      fireDash(world, hue);
      break;
    case 'perfect-guard':
      firePerfectGuard(world, hue);
      break;

    // ----------------------------------------------------------- capstones
    case 'overload':
      talents.overload = effects.overloadHits;
      ultimateFlare(world, id, hue, name);
      break;
    case 'slipstream':
      talents.slipstream = effects.slipstreamSeconds;
      ultimateFlare(world, id, hue, name);
      // Streaks the whole length of the lane, on top of the shared flare:
      // the paddle did not merely get quicker, the court got shorter.
      laneRush(world, hue);
      break;
    case 'aegis':
      talents.aegis = effects.aegisSeconds;
      talents.aegisSaves = effects.aegisSaves;
      ultimateFlare(world, id, hue, name);
      break;
    case 'zenith':
      talents.zenith = effects.zenithSeconds;
      ultimateFlare(world, id, hue, name);
      break;
    case 'echo':
      // Clears the *other* slots, never its own - that is what keeps a
      // capstone from ever becoming part of a rotation.
      for (const slot of talents.slots) {
        if (slot.id && slot.id !== 'echo') slot.cooldown = 0;
      }
      talents.echo = effects.echoSeconds;
      ultimateFlare(world, id, hue, name);
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
  fire(world, def);
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
    const live = liveEffect(world, slot.id);
    views.push({
      id: slot.id,
      name: def.name,
      talent: def.talent,
      ready,
      progress: Math.round(raw * STEPS) / STEPS,
      active: live.active,
      ultimate: def.ultimate === true,
      hue: def.hue,
      cooldownLeft: ready ? 0 : Math.ceil(slot.cooldown),
      remain: live.remain,
      duration: live.duration,
      charges: live.charges,
      maxCharges: live.maxCharges
    });
  }
  return views;
}

/**
 * What an ability's own effect - not its cooldown - is currently doing.
 *
 * A skill runs on a clock (`remain` of `duration`), on a number of uses
 * (`charges` of `maxCharges`), or on both; whichever it uses, the HUD reads
 * it from here and never from the runtime directly.
 */
export interface LiveEffect {
  /** True while the effect is doing something. */
  active: boolean;
  remain: number;
  duration: number;
  charges: number;
  maxCharges: number;
}

const IDLE: LiveEffect = { active: false, remain: 0, duration: 0, charges: 0, maxCharges: 0 };

function timed(remain: number, duration: number): LiveEffect {
  return { active: remain > 0, remain, duration, charges: 0, maxCharges: 0 };
}

export function liveEffect(world: World, id: AbilityId): LiveEffect {
  const runtime = world.talents;
  const { effects } = world.loadout;

  switch (id) {
    case 'power-strike':
      return timed(runtime.strikeArmed, effects.powerStrikeWindow);
    case 'perfect-guard':
      return timed(runtime.guardWindow, effects.guardWindow);
    case 'dash':
      return timed(runtime.dashFx, effects.dashSeconds);

    // Counted rather than timed: it lasts exactly as long as the returns do.
    case 'overload':
      return {
        active: runtime.overload > 0,
        remain: 0,
        duration: 0,
        charges: runtime.overload,
        maxCharges: effects.overloadHits
      };
    case 'slipstream':
      return timed(runtime.slipstream, effects.slipstreamSeconds);
    // Both at once - a window, and the saves left inside it. Spending the
    // last save ends it early, so the HUD must not keep claiming it is up.
    case 'aegis':
      return {
        active: runtime.aegis > 0 && runtime.aegisSaves > 0,
        remain: runtime.aegis,
        duration: effects.aegisSeconds,
        charges: runtime.aegisSaves,
        maxCharges: effects.aegisSaves
      };
    // The refunds are per match, so they are worth showing even between
    // castings - but they never decide whether Zenith itself is running.
    case 'zenith':
      return {
        active: runtime.zenith > 0,
        remain: runtime.zenith,
        duration: effects.zenithSeconds,
        charges: runtime.zenithRefunds,
        maxCharges: BALANCE.effects.zenith.refunds
      };
    case 'echo':
      return timed(runtime.echo, effects.echoSeconds);
    default:
      return IDLE;
  }
}
