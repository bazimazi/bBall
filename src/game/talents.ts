import type { AbilityId } from '../core/talents/types';
import { BALANCE } from '../core/balance/config';
import { abilityById } from '../core/talents/abilities';
import { resolveLoadout, type ResolvedLoadout } from '../core/talents/effects';
import { createTalentSave } from '../core/talents/save';
import type { TalentMatchStats } from '../core/talents/types';
import { aegisSaveCast, zenithRefundCast } from './casts';
import { BALL_R, FIELD_H, MAX_BOUNCE_ANGLE } from './constants';
import { growPaddle } from './paddle';
import { equipmentReach, reboundBonus, surfaceResponse } from '../core/equipment/catalog';
import { hsla, sideHue } from './palette';
import type { AbilitySlot, Paddle, TalentRuntime } from './types';
import { clamp } from './utils/math';
import type { World } from './world';

/**
 * The player's build, at runtime.
 *
 * Everything here reads `world.loadout` - a bag of numbers resolved once,
 * outside the simulation - and writes `world.talents`, which lives for
 * exactly one match. The split is deliberate: the engine never looks up a
 * talent by id, so adding a talent is a data change, and the difficulty
 * knobs in `world.tuning` are never touched from this file.
 */

const E = BALANCE.effects;

/** The steepest a Swerve or a Bank Shot may bend a ball: short of vertical. */
const MAX_BEND_ANGLE = 1.1;

/** A build with nothing bought, for the attract demo and the first frame. */
export const DEFAULT_LOADOUT: ResolvedLoadout = resolveLoadout(createTalentSave(), 1);

function emptySlots(): AbilitySlot[] {
  return Array.from({ length: BALANCE.talents.slots.max }, () => ({
    id: null,
    cooldown: 0,
    span: 0,
    lockout: 0,
    castId: 0,
    refreshId: 0
  }));
}

export function createRuntime(): TalentRuntime {
  return {
    tactics: {},
    drive: 0,
    bestDrive: 0,
    rallyReturns: 0,
    surge: 0,
    spareSave: 0,
    primed: 0,
    swerveDir: 0,
    afterglow: 0,
    shield: 0,
    shieldMax: 0,
    shieldTimer: 0,
    guardShielded: false,
    secondChances: 0,
    strikeArmed: 0,
    strikeHits: 0,
    guardWindow: 0,
    dashFx: 0,
    dashFrom: 0,
    blink: 0,
    overload: 0,
    slipstream: 0,
    aegis: 0,
    aegisSaves: 0,
    zenith: 0,
    zenithRefunds: 0,
    echo: 0,
    lastAbility: null,
    slots: emptySlots(),
    stats: {
      abilitiesUsed: 0,
      powerStrikes: 0,
      dashes: 0,
      perfectGuards: 0,
      crits: 0,
      shieldSaves: 0,
      secondChances: 0,
      ultimates: 0
    }
  };
}

/** Wipe the per-match state and re-arm it from the current build. */
export function resetRuntime(world: World): void {
  const runtime = world.talents;
  const { effects, equipped } = world.loadout;
  runtime.tactics = {};

  runtime.drive = 0;
  runtime.bestDrive = 0;
  runtime.rallyReturns = 0;
  runtime.surge = 0;
  runtime.spareSave = 0;
  runtime.primed = 0;
  runtime.swerveDir = 0;
  runtime.afterglow = 0;
  runtime.strikeArmed = 0;
  runtime.strikeHits = 0;
  runtime.guardWindow = 0;
  runtime.dashFx = 0;
  runtime.dashFrom = 0;
  runtime.blink = 0;
  runtime.overload = 0;
  runtime.slipstream = 0;
  runtime.aegis = 0;
  runtime.aegisSaves = 0;
  runtime.zenith = 0;
  runtime.zenithRefunds = BALANCE.effects.zenith.refunds;
  runtime.echo = 0;
  runtime.lastAbility = null;
  runtime.guardShielded = false;

  runtime.shieldMax = effects.shieldCharges;
  runtime.shield = effects.shieldCharges;
  runtime.shieldTimer = 0;
  runtime.secondChances = effects.secondChances;

  for (let i = 0; i < runtime.slots.length; i++) {
    const slot = runtime.slots[i]!;
    slot.id = equipped[i] ?? null;
    slot.cooldown = 0;
    slot.span = 0;
    slot.lockout = 0;
    slot.castId = 0;
    slot.refreshId = 0;
  }

  runtime.stats.abilitiesUsed = 0;
  runtime.stats.powerStrikes = 0;
  runtime.stats.dashes = 0;
  runtime.stats.perfectGuards = 0;
  runtime.stats.crits = 0;
  runtime.stats.shieldSaves = 0;
  runtime.stats.secondChances = 0;
  runtime.stats.ultimates = 0;

  // No resize here: the paddle's base was just reset by `setPaddleBase`, and
  // `updateRuntime` measures the build's length on the very first serve
  // step. Sizing it now would hand the attract demo the player's build,
  // because a return to the menu resets the runtime before it is a menu.
}

/** A new rally is about to start. */
export function resetRally(world: World): void {
  world.talents.lastAbility = null;
  world.talents.rallyReturns = 0;
  world.talents.surge = 0;
  world.talents.guardShielded = false;
  world.talents.swerveDir = 0;
}

/**
 * The player conceded. The rally's counters are over; the match is not.
 *
 * The drive survives in part with Unbroken, and in full while Zenith is
 * running - holding the streak through a dropped point is the whole reason
 * that capstone exists.
 */
export function resetDrive(world: World): void {
  const runtime = world.talents;
  const { effects } = world.loadout;
  runtime.bestDrive = Math.max(runtime.bestDrive, runtime.drive);
  if (runtime.zenith <= 0) runtime.drive = Math.floor(runtime.drive * effects.driveKeep);
  runtime.rallyReturns = 0;
  runtime.surge = 0;
  runtime.primed = 0;
}

/** The player won the point. Hot Hand arms the first returns of the next one. */
export function wonPoint(world: World): void {
  const { hotHand } = world.loadout.effects;
  if (hotHand > 0) world.talents.primed = Math.max(world.talents.primed, hotHand);
}

/** True when a single point - or a single life - would end the match. */
function inClutch(world: World): boolean {
  const { match } = world;
  if (match.maxLives > 0) return match.lives <= 1;
  return (
    match.winScore > 0 &&
    match.score[world.player.side === 'you' ? 'bot' : 'you'] >= match.winScore - 1
  );
}

/**
 * How many stacks of Flow State are up.
 *
 * Zenith pins this at the top for its window - being instantly in peak form,
 * and staying there through a dropped point, is what that capstone buys.
 */
function flowStacks(world: World): number {
  const { effects } = world.loadout;
  const max = BALANCE.effects.flowState.stacks;
  if (world.talents.zenith > 0) return max;
  return clamp(world.talents.rallyReturns - effects.flowFrom, 0, max);
}

/** The same thing as 0..1, for cooldown recovery. */
function flowProgress(world: World): number {
  if (world.loadout.effects.flowAngle <= 0 && world.talents.zenith <= 0) return 0;
  return flowStacks(world) / BALANCE.effects.flowState.stacks;
}

/**
 * The player's paddle speed right now.
 *
 * Level sets it and nothing in the build multiplies it: the paddle is
 * already faster than the court is tall, so a talent that only added speed
 * was a talent that did nothing. Slipstream is the exception, because a
 * paddle half again as long has to still feel light.
 */
export function playerPaddleSpeed(world: World): number {
  const { effects, paddleSpeed } = world.loadout;
  if (world.talents.slipstream > 0) {
    return Math.min(BALANCE.paddle.burst, paddleSpeed * (1 + effects.slipstreamPaddle));
  }
  return paddleSpeed;
}

/** Keyboard travel, derived from whatever the paddle can do right now. */
export function playerKeySpeed(world: World): number {
  return playerPaddleSpeed(world) * BALANCE.paddle.keyboardShare;
}

/**
 * How much longer than its base the player's paddle is right now.
 *
 * Length is what saves points, so it is what the build buys: always-on from
 * Long Reach, earned from a drive, lent by Clutch or a skill just used. The
 * everyday sources share one ceiling; an ultimate may go past it, up to the
 * paddle's own hard limit in `resizePaddle`.
 */
export function playerLength(world: World): number {
  const { effects } = world.loadout;
  const runtime = world.talents;
  const { talents } = BALANCE;

  let length = clamp(
    effects.length + boostLength(world) + equipmentReach(world.player.equipment),
    talents.minLength,
    talents.maxLength
  );
  // Clutch is a last stand rather than an everyday source, so like an
  // ultimate it may go past the everyday ceiling.
  if (effects.clutchLength > 0 && inClutch(world)) length += effects.clutchLength;
  if (runtime.slipstream > 0) length += effects.slipstreamGrow;
  if (runtime.zenith > 0) length += effects.zenithGrow;
  return (1 + length) * (1 - rallyPressure(world)) - 1;
}

/** A declared long-rally rule, symmetric and reset on every serve. */
export function rallyPressure(world: World): number {
  if (!world.rules.ranked || world.rules.winScore <= 0 || world.match.status === 'menu') return 0;
  return Math.min(0.4, Math.max(0, world.match.rally - 24) * 0.02);
}

/** The everyday part of the paddle's length that comes and goes: a drive, a skill's afterglow. */
function boostLength(world: World): number {
  const { effects } = world.loadout;
  const runtime = world.talents;
  let length = 0;
  if (effects.comboLength > 0) {
    const steps = Math.min(effects.comboSteps, Math.floor(runtime.drive / effects.comboEvery));
    length += steps * effects.comboLength;
  }
  if (runtime.afterglow > 0) length += effects.afterglowLength;
  return length;
}

/**
 * Advance every timer the build owns.
 *
 * Cooldowns run faster while the player is in flow, which is the whole point
 * of the talent - but `BALANCE.talents.minCooldownMul` already floored the
 * cooldowns themselves, and every slot keeps a real-time lockout, so the two
 * together still cannot produce an ability that is permanently available.
 */
export function updateRuntime(world: World, dt: number): void {
  const runtime = world.talents;
  const { effects } = world.loadout;
  for (const id of Object.keys(runtime.tactics) as AbilityId[])
    runtime.tactics[id] = Math.max(0, (runtime.tactics[id] ?? 0) - dt);

  runtime.strikeArmed = Math.max(0, runtime.strikeArmed - dt);
  if (runtime.strikeArmed <= 0) runtime.strikeHits = 0;
  runtime.guardWindow = Math.max(0, runtime.guardWindow - dt);
  runtime.dashFx = Math.max(0, runtime.dashFx - dt);
  runtime.blink = Math.max(0, runtime.blink - dt);
  runtime.afterglow = Math.max(0, runtime.afterglow - dt);

  runtime.aegis = Math.max(0, runtime.aegis - dt);
  runtime.zenith = Math.max(0, runtime.zenith - dt);
  runtime.echo = Math.max(0, runtime.echo - dt);
  runtime.slipstream = Math.max(0, runtime.slipstream - dt);

  // Every length source can change from one step to the next - a drive
  // ticking over, a skill's glow fading - so the paddle is re-measured here
  // rather than whenever one of them happens to move.
  growPaddle(world.player, playerLength(world));

  // Zenith and Echo both hurry cooldowns along; they never stack, and the
  // capstone cooldown floor in `effects.ts` still bounds what that can mean.
  const hurry = Math.max(
    runtime.zenith > 0 ? effects.zenithRecharge : 1,
    runtime.echo > 0 ? effects.echoRecharge : 1
  );
  const recovery = dt * hurry * (1 + effects.recharge + effects.flowRecharge * flowProgress(world));
  for (const slot of runtime.slots) {
    if (slot.cooldown > 0) slot.cooldown = Math.max(0, slot.cooldown - recovery);
    if (slot.lockout > 0) slot.lockout = Math.max(0, slot.lockout - dt);
  }

  if (runtime.shieldMax > 0 && runtime.shield < runtime.shieldMax) {
    runtime.shieldTimer -= dt;
    if (runtime.shieldTimer <= 0) {
      runtime.shield++;
      runtime.shieldTimer = effects.shieldRecharge;
    }
  }
}

/** Tempo: a return winds every cooldown back a notch - an ultimate by half as much. */
export function applyTempo(world: World, bonus = 0): void {
  const { effects } = world.loadout;
  const tempo = effects.tempo + bonus + (world.talents.afterglow > 0 ? effects.afterglowTempo : 0);
  if (tempo <= 0) return;
  for (const slot of world.talents.slots) {
    if (!slot.id || slot.cooldown <= 0) continue;
    const share = abilityById(slot.id)?.ultimate ? 0.5 : 1;
    slot.cooldown = Math.max(0, slot.cooldown - tempo * share);
  }
}

// ------------------------------------------------------------------ returns

/** How a single return is modified. Built fresh for every contact. */
export interface ReturnMods {
  /** Contact offset after the build has had its say. */
  readonly off: number;
  /** Multiplier on the ball's speed for this return. */
  readonly growth: number;
  /** Ceiling for this return. Never above `BALANCE.ball.hardMax`. */
  readonly ceiling: number;
  /** Multiplier on how much paddle motion drags the ball off line. */
  readonly spin: number;
  readonly angleLimit: number;
  readonly crit: boolean;
  readonly charged: boolean;
  readonly guarded: boolean;
  /** An Overload return: its pace stays on the ball rather than bleeding. */
  readonly overloaded: boolean;
  /** How much harder than its speed says the return is to read. */
  readonly heft: number;
}

/** The plain return: what every contact did before talents existed. */
export function plainReturn(world: World, off: number): ReturnMods {
  return {
    off,
    growth: world.tuning.speedPerHit,
    ceiling: world.tuning.maxSpeed,
    spin: 1,
    angleLimit: MAX_BOUNCE_ANGLE,
    crit: false,
    charged: false,
    guarded: false,
    overloaded: false,
    heft: 0
  };
}

/**
 * Push a contact offset out to at least `min` of the paddle's half-length.
 *
 * The side is the one the player was already leaning towards; a dead-centre
 * contact goes away from the opponent. `stretch` widens whatever was
 * already wide on top of the floor.
 */
function corner(world: World, off: number, min: number, stretch: number): number {
  const side = off !== 0 ? Math.sign(off) : world.bot.y < FIELD_H / 2 ? 1 : -1;
  return side * Math.min(1, Math.max(Math.abs(off) * (1 + stretch), min));
}

/**
 * The player's return, with the build folded in.
 *
 * Also the point at which the drive counters tick, because "a successful
 * return" is exactly what they count. Passive growth is capped first, then a
 * charged strike is added on top of the cap - an active ability is allowed to
 * beat the passive ceiling, but never the hard one.
 */
export function playerReturn(world: World, offset: number): ReturnMods {
  const runtime = world.talents;
  const { effects } = world.loadout;
  const { tuning } = world;

  // Contact offset is measured as a fraction of the paddle's length, so a
  // paddle the build has lengthened would quietly flatten every return -
  // more reach bought with worse placement. Scaling by the stretch keeps the
  // angle a given contact produces exactly where it was.
  const response = surfaceResponse(
    world.player.equipment,
    clamp(offset * world.player.grow, -1, 1),
    offset
  );
  const rawOff = response.off;

  runtime.drive++;
  runtime.rallyReturns++;
  runtime.bestDrive = Math.max(runtime.bestDrive, runtime.drive);
  applyTempo(world, runtime.guardWindow > 0 ? effects.parryTempo : 0);
  if (runtime.shield < runtime.shieldMax && effects.shieldTempo > 0) {
    runtime.shieldTimer = Math.max(0, runtime.shieldTimer - effects.shieldTempo);
  }

  if (effects.adrenalineEvery > 0 && runtime.drive % effects.adrenalineEvery === 0) {
    runtime.spareSave = 1;
  }

  // A return inside the guard window is a parry - and a parry goes back as a
  // counter. It used to be absorbed flat instead, which made reading the
  // ball well a way to hand the opponent an easy one.
  const guarded = runtime.guardWindow > 0;
  if (guarded) {
    runtime.guardWindow = 0;
    runtime.stats.perfectGuards++;
    if (effects.guardGrantsShield && !runtime.guardShielded && runtime.shieldMax > 0) {
      runtime.guardShielded = true;
      runtime.shield = Math.min(runtime.shieldMax, runtime.shield + 1);
    }
  }

  // Overload spends one of its charged returns here rather than on a timer,
  // so it is never wasted while the ball is at the far end of the court.
  const overloaded = runtime.overload > 0;
  if (overloaded) runtime.overload--;

  // Only a charge that Power Strike itself put there counts as one of its
  // uses: the server holds `powerStrikes` to the casts the match reported,
  // and a free charge from Momentum or Hot Hand is not a cast.
  const struck = !overloaded && runtime.strikeArmed > 0 && runtime.strikeHits > 0;
  if (struck) {
    runtime.strikeHits--;
    if (runtime.strikeHits <= 0) runtime.strikeArmed = 0;
    runtime.stats.powerStrikes++;
  }

  const rhythm = effects.momentumEvery > 0 && runtime.rallyReturns % effects.momentumEvery === 0;
  const primed = runtime.primed > 0;
  if (primed) runtime.primed--;
  // Blink Strike: the return a dash just rescued goes straight back on the attack.
  const blinked = runtime.blink > 0;
  runtime.blink = 0;

  // Use the actual paddle edge, not the angle compensated for a longer paddle:
  // more reach must not turn safe centre contacts into free edge criticals.
  const edged = effects.edgePressure > 0 && Math.abs(offset) >= effects.edgePressure;
  const charged = overloaded || struck || guarded || rhythm || primed || blinked || edged;
  const crit =
    edged ||
    overloaded ||
    (primed && effects.hotHandCrit) ||
    (blinked && effects.blinkCrit) ||
    (charged && effects.chargedCrits) ||
    (effects.critChance > 0 && world.random() < effects.critChance);
  if (crit) runtime.stats.crits++;

  // Passive sources, capped together.
  let growth = tuning.speedPerHit;
  // Reserve rewards waiting three seconds before spending its one return.
  if ((runtime.tactics.reserve ?? 0) > 0 && (runtime.tactics.reserve ?? 0) <= 5) {
    growth += 0.12;
    runtime.tactics.reserve = 0;
  }
  if ((runtime.tactics.breach ?? 0) > 0) growth -= 0.05;
  if ((runtime.tactics.rebound ?? 0) > 0) {
    applyTempo(world, 1);
    runtime.tactics.rebound = 0;
  }
  if (inClutch(world)) growth += effects.clutchGrowth;
  growth += reboundBonus(world.player.equipment, offset, charged || crit || guarded);
  if (world.player.equipment.insert === 'copper' && growth > tuning.speedPerHit)
    growth = tuning.speedPerHit + (growth - tuning.speedPerHit) * BALANCE.equipment.copperPassive;
  growth = Math.min(growth, BALANCE.talents.maxHitGrowth);

  // A heavy return may outrun the match's top speed by exactly what made it
  // heavy - a crit its own bonus, a charge its own - and never the hard cap.
  let lift = 0;
  if (crit) lift += effects.critGrowth;
  if (charged) lift += effects.powerStrikeSpeed;
  growth += lift;
  const ceiling = tuning.maxSpeed * (1 + lift);

  let heft = effects.heft + flowStacks(world) * effects.flowHeft;
  if (charged) heft += E.powerStrike.heft;
  if (crit) heft += effects.critHeft;

  // Where the ball goes matters more than how fast it gets there: every
  // heavy return is also a wide one, and the heavier it is the wider.
  let off = rawOff;
  if ((runtime.tactics.redirect ?? 0) > 0) {
    off = corner(world, off, 0.72, 0);
    runtime.tactics.redirect = 0;
  }
  if (overloaded) off = corner(world, off, E.overload.minAngle, E.overload.angle);
  else if (crit) off = corner(world, off, E.criticalStrike.minAngle, E.criticalStrike.angle);
  else if (charged) off = corner(world, off, E.powerStrike.minAngle, E.powerStrike.stretch);

  return {
    off,
    growth: Math.max(0.5, growth),
    ceiling: Math.min(BALANCE.ball.hardMax, ceiling),
    spin: Math.min(BALANCE.equipment.overallSpinMax, effects.spinMul * response.grip),
    angleLimit: Math.min(
      1.15,
      MAX_BOUNCE_ANGLE * (effects.angleMul + flowStacks(world) * effects.flowAngle)
    ),
    crit,
    charged,
    guarded,
    overloaded,
    heft
  };
}

/** Inspect a return without spending live charges, touching counters or drawing gameplay randomness. */
export function previewReturn(world: World, offset: number): ReturnMods {
  const ghost = Object.create(world) as World;
  const runtime = world.talents;
  Object.defineProperties(ghost, {
    player: {
      value: {
        ...world.player,
        material: { ...world.player.material, stats: { ...world.player.material.stats } }
      }
    },
    talents: {
      value: {
        ...runtime,
        stats: { ...runtime.stats },
        tactics: { ...runtime.tactics },
        slots: runtime.slots.map((s) => ({ ...s }))
      }
    },
    random: { value: () => 1 }
  });
  return playerReturn(ghost, offset);
}

// ------------------------------------------------------------ ball in flight

/** Re-point the ball's velocity at `angle` off the long axis, keeping its speed and direction of travel. */
function aim(world: World, angle: number): void {
  const { ball } = world;
  const dir = ball.vx >= 0 ? 1 : -1;
  ball.vx = Math.cos(angle) * ball.speed * dir;
  ball.vy = Math.sin(angle) * ball.speed;
}

/**
 * Swerve: the player's return bends in the last stretch of its flight.
 *
 * Late on purpose. By then the opponent has taken its looks and committed,
 * so the break lands after the read rather than before it. Bending earlier
 * and softer only beat the bots that never look twice.
 */
export function swerveBall(world: World, dt: number): void {
  const { ball, talents: runtime } = world;
  const accel = world.loadout.effects.swerve;
  if (accel <= 0 || runtime.swerveDir === 0 || ball.owner !== world.player.side) return;
  const outgoing =
    world.player.side === 'you'
      ? ball.vx > 0 && ball.x >= world.view.w * E.swerve.from
      : ball.vx < 0 && ball.x <= world.view.w * (1 - E.swerve.from);
  if (!outgoing) return;

  const vy = ball.vy + runtime.swerveDir * accel * dt;
  const angle = clamp(Math.atan2(vy, Math.abs(ball.vx)), -MAX_BEND_ANGLE, MAX_BEND_ANGLE);
  aim(world, angle);
}

/**
 * The ball just hit a wall: a player's return comes off it steeper with Bank
 * Shot. A swerve keeps its own direction through the bounce, the way spin
 * does - flipping it with every wall steepened the ball into a zigzag that
 * measured at more than forty points of win rate on its own.
 */
export function bankBall(world: World): void {
  const { ball } = world;
  if (ball.owner !== world.player.side) return;

  const bank = world.loadout.effects.bankShot;
  if (bank <= 0) return;
  const angle = Math.atan2(ball.vy, Math.abs(ball.vx));
  aim(world, clamp(angle * (1 + bank), -MAX_BEND_ANGLE, MAX_BEND_ANGLE));
}

/**
 * How fast the ball's clock runs right now. Clutch and Time Slip lend time
 * only while the ball is in the player's half and heading for their line.
 * They share the strongest slowdown instead of stacking.
 *
 * Time, not pace. Taking pace off the ball measured as a loss: the player's
 * own return is built from whatever speed arrives, so a slower ball in meant
 * a slower ball out, and the opponent got the time back.
 */
export function ballTimeScale(world: World): number {
  const { effects } = world.loadout;
  const slow = Math.max(
    inClutch(world) ? effects.clutchSlow : 0,
    world.talents.blink > 0 ? effects.dashSlow : 0
  );
  const { ball } = world;
  if (slow <= 0 || ball.vx >= 0 || ball.x > world.view.w / 2) return 1;
  return 1 - slow;
}

/** The ripple a slowed ball makes as it crosses into the player's half. */
export function slowCrossing(world: World): void {
  if (ballTimeScale(world) >= 1) return;
  const { ball } = world;
  world.particles.emit(
    ball.x,
    ball.y,
    10,
    { speed: 120, life: 0.35, size: 2.4, color: hsla(sideHue(world.theme, 'you'), 60, 80, 0.7) },
    world.motion
  );
}

// ------------------------------------------------------------------ defence

/**
 * Catch a ball that has crossed the player's line.
 *
 * Returns true when a save was spent and the ball is back in play. Aegis is
 * spent first, then a save Adrenaline banked, then a Shield charge - the
 * one that recharges is the one worth keeping. The ball keeps a little less
 * speed than it arrived with, so a save is a reprieve rather than a free
 * winner - unless Counterstrike turns it into one.
 */
export function tryShield(world: World): boolean {
  const runtime = world.talents;
  if (world.match.status !== 'play') return false;
  const aegis = runtime.aegis > 0 && runtime.aegisSaves > 0;
  const spare = !aegis && runtime.spareSave > 0;
  if (!aegis && !spare && runtime.shield <= 0) return false;

  const { ball } = world;
  const { effects } = world.loadout;
  if (aegis) {
    runtime.aegisSaves--;
  } else if (spare) {
    runtime.spareSave = 0;
  } else {
    const wasFull = runtime.shield === runtime.shieldMax;
    runtime.shield--;
    if (wasFull) runtime.shieldTimer = effects.shieldRecharge;
  }
  runtime.stats.shieldSaves++;
  // A save is not a return, so it adds nothing to the drive - but the point
  // was not lost either, so it does not end it.
  runtime.bestDrive = Math.max(runtime.bestDrive, runtime.drive);

  ball.x = BALL_R;
  ball.px = ball.x;
  ball.vx = Math.abs(ball.vx);
  ball.owner = 'you';
  ball.squash = 0.9;
  ball.squashAngle = 0;
  ball.heft = 0;
  runtime.swerveDir = 0;

  if (effects.counterPace > 0) {
    // Counterstrike: out of the save and straight into the far corner.
    const before = ball.speed;
    ball.speed = Math.min(BALANCE.ball.hardMax, ball.speed * (1 + effects.counterPace));
    runtime.surge += ball.speed - before;
    const side = world.bot.y < FIELD_H / 2 ? 1 : -1;
    aim(world, side * E.counterstrike.minAngle * MAX_BOUNCE_ANGLE);
    ball.heft = E.counterstrike.heft;
    // ...and the player's next return goes back charged, too.
    runtime.primed = Math.max(runtime.primed, 1);
  } else {
    ball.speed = Math.max(BALANCE.ball.hardMin, ball.speed * effects.shieldSaveSpeed);
    aim(world, Math.atan2(ball.vy, ball.vx));
  }

  // A Shield charge is the player's own colour; an Aegis save is Aegis's,
  // and lights the whole barrier rather than one point on it. The two are
  // never mistaken for each other, which matters when both are equipped.
  const hue = aegis ? aegisSaveCast(world, ball.y) : sideHue(world.theme, 'you');
  world.particles.emit(
    0,
    ball.y,
    26,
    { angle: 0, spread: 1.7, speed: 320, life: 0.55, size: 3.6, color: hsla(hue, 100, 72, 0.95) },
    world.motion
  );
  world.audio.shield();
  return true;
}

/**
 * Bastion: a ball reaching the player's line close to a wall is turned back.
 *
 * Free and unlimited, but only in the corners - which is exactly where a
 * ball that has been banked off a wall arrives, and exactly where a paddle
 * sent the wrong way is furthest from. Not a save: it spends nothing, feeds
 * nothing, and Counterstrike does not answer it.
 */
export function tryBastion(world: World): boolean {
  const reach = world.loadout.effects.bastion;
  if (reach <= 0 || world.match.status !== 'play') return false;
  const { ball } = world;
  if (ball.y > reach + BALL_R && ball.y < FIELD_H - reach - BALL_R) return false;

  ball.x = BALL_R;
  ball.px = ball.x;
  ball.vx = Math.abs(ball.vx);
  ball.speed = Math.max(BALANCE.ball.hardMin, ball.speed * world.loadout.effects.shieldSaveSpeed);
  aim(world, Math.atan2(ball.vy, ball.vx));
  ball.owner = 'you';
  ball.heft = 0;
  ball.squash = 0.9;
  ball.squashAngle = 0;
  world.talents.swerveDir = 0;

  world.particles.emit(
    0,
    ball.y,
    16,
    {
      angle: 0,
      spread: 1.4,
      speed: 240,
      life: 0.45,
      size: 3,
      color: hsla(sideHue(world.theme, 'you'), 70, 82, 0.9)
    },
    world.motion
  );
  world.audio.wall(0.6);
  return true;
}

/**
 * Zenith taking a conceded point back.
 *
 * Once per *match*, and only inside a Zenith window - "the streak cannot be
 * broken" has to hold the scoreboard and not merely the counter, but a
 * re-castable refund is a different talent entirely. Checked before Second
 * Chance, because a Zenith window expires and a Second Chance keeps.
 */
export function tryZenith(world: World): boolean {
  const runtime = world.talents;
  if (runtime.zenith <= 0 || runtime.zenithRefunds <= 0 || world.loadout.effects.unsaved) {
    return false;
  }
  runtime.zenithRefunds--;
  zenithRefundCast(world);
  world.audio.secondChance();
  return true;
}

/**
 * Give a conceded point back. Returns true when a use was spent.
 *
 * Only while the player is losing ground: a refund banked from in front is a
 * free point, which is exactly the kind of talent that would flatten the
 * game. Used from behind it is what the name says - a second chance.
 */
export function trySecondChance(world: World): boolean {
  const runtime = world.talents;
  const { match } = world;
  if (runtime.secondChances <= 0) return false;

  const losing = match.maxLives > 0 ? match.lives <= 1 : match.score.bot >= match.score.you;
  if (!losing) return false;

  runtime.secondChances--;
  runtime.stats.secondChances++;
  world.audio.secondChance();
  return true;
}

/** Everything the build did this match, for the result and the profile. */
export function matchStats(world: World): TalentMatchStats {
  const runtime = world.talents;
  return {
    abilitiesUsed: runtime.stats.abilitiesUsed,
    powerStrikes: runtime.stats.powerStrikes,
    dashes: runtime.stats.dashes,
    perfectGuards: runtime.stats.perfectGuards,
    crits: runtime.stats.crits,
    shieldSaves: runtime.stats.shieldSaves,
    secondChances: runtime.stats.secondChances,
    ultimates: runtime.stats.ultimates,
    bestDrive: Math.max(runtime.bestDrive, runtime.drive)
  };
}

/**
 * True while something the player earned mid-match is holding the paddle
 * longer - the renderer rings it. Long Reach is always there, so it is
 * never worth a ring; a drive, Clutch or a skill's afterglow is news.
 */
export function paddleBuffed(world: World): boolean {
  if (world.match.status === 'menu') return false;
  return boostLength(world) > 0 || (world.loadout.effects.clutchLength > 0 && inClutch(world));
}

/** Clamp a paddle's target inside the court. Shared with the dash. */
export function boundTarget(paddle: Paddle, value: number): number {
  return clamp(value, paddle.half, FIELD_H - paddle.half);
}
