import { BALANCE } from '../core/balance/config';
import { combatant } from './combatant';
import type { ReturnMods } from './talents';
import type { Paddle } from './types';
import type { World } from './world';
import { clamp } from './utils/math';

export const FLICK_EDGE = 0.55;
export const FLICK_SPEED = 650;
const FLICK_PACE = 1.06;

/** Read-only pace resolution shared by real contacts and outgoing shot inspection. */
export function returnPace(world: World, paddle: Paddle, mods: ReturnMods, raw: number) {
  const actor = combatant(world, paddle.side);
  const foe = combatant(world, paddle.side === 'you' ? 'bot' : 'you');
  const talented = world.match.status !== 'menu' && !world.rules.versus;
  const plain = clamp(
    Math.max(BALANCE.ball.hardMin, world.ball.speed - actor.talents.surge - foe.talents.surge) *
      world.tuning.speedPerHit,
    BALANCE.ball.hardMin,
    Math.min(BALANCE.ball.hardMax, world.tuning.maxSpeed)
  );
  const ceiling = Math.min(BALANCE.ball.hardMax, mods.ceiling);
  let speed = clamp(world.ball.speed * mods.growth, BALANCE.ball.hardMin, ceiling);
  const flick =
    world.match.status !== 'menu' &&
    Math.abs(raw) >= FLICK_EDGE &&
    Math.abs(paddle.vy) >= FLICK_SPEED &&
    Math.sign(paddle.vy) === Math.sign(raw);
  if (flick) speed = Math.min(ceiling, speed * FLICK_PACE);
  if (!talented)
    return {
      speed,
      flick,
      actorSurge: actor.talents.surge,
      foeSurge: foe.talents.surge,
      stored: 0,
      absorbed: false,
      released: false,
      switches: 0
    };
  const incoming = Math.min(Math.max(0, speed - plain), foe.talents.surge * mods.growth);
  const E = BALANCE.equipment;
  const core = paddle.equipment.core;
  const bleed =
    core === 'cork' ? E.corkBleed : core === 'memory-gel' ? E.gelBleed : BALANCE.ball.surgeBleed;
  const given = incoming * bleed;
  speed = Math.max(BALANCE.ball.hardMin, speed - given);
  const foeSurge = incoming - given;
  let actorSurge = Math.max(0, speed - plain - foeSurge);
  const attack = core === 'cork' ? E.corkAttack : core === 'memory-gel' ? E.gelAttack : 1;
  speed -= actorSurge * (1 - attack);
  actorSurge *= attack;
  const switches = world.arena.course.events[paddle.side].switches;
  const charged =
    paddle.material.switchCharge ||
    (paddle.equipment.insert === 'copper' && switches > paddle.material.switchesSeen);
  const release = paddle.material.stored * E.gelRelease + (charged ? plain * E.copperGrowth : 0);
  const released = Math.max(0, Math.min(ceiling - speed, release));
  speed += released;
  actorSurge += released;
  return {
    speed,
    flick,
    actorSurge,
    foeSurge,
    switches,
    stored:
      core === 'memory-gel'
        ? Math.min(E.gelStore, Math.max(0, given - incoming * BALANCE.ball.surgeBleed))
        : 0,
    absorbed: incoming > 0 && bleed > BALANCE.ball.surgeBleed,
    released: released > 0
  };
}
