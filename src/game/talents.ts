import { BALANCE } from '../core/balance/config';
import { resolveLoadout, type ResolvedLoadout } from '../core/talents/effects';
import { createTalentSave } from '../core/talents/save';
import type { TalentMatchStats } from '../core/talents/types';
import { BALL_R, FIELD_H, MAX_BOUNCE_ANGLE } from './constants';
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

/** A build with nothing bought, for the attract demo and the first frame. */
export const DEFAULT_LOADOUT: ResolvedLoadout = resolveLoadout(createTalentSave(), 1);

function emptySlots(): AbilitySlot[] {
  return Array.from({ length: BALANCE.talents.slots.max }, () => ({
    id: null,
    cooldown: 0,
    span: 0
  }));
}

export function createRuntime(): TalentRuntime {
  return {
    drive: 0,
    bestDrive: 0,
    rallyReturns: 0,
    surge: 0,
    adrenaline: 0,
    guard: 0,
    strikeRush: 0,
    edgeRecovery: 0,
    edgeSide: 0,
    shield: 0,
    shieldMax: 0,
    shieldTimer: 0,
    guardShielded: false,
    secondChances: 0,
    strikeArmed: 0,
    guardWindow: 0,
    dashFx: 0,
    dashFrom: 0,
    slots: emptySlots(),
    stats: {
      abilitiesUsed: 0,
      powerStrikes: 0,
      dashes: 0,
      perfectGuards: 0,
      crits: 0,
      shieldSaves: 0,
      secondChances: 0
    }
  };
}

/** Wipe the per-match state and re-arm it from the current build. */
export function resetRuntime(world: World): void {
  const runtime = world.talents;
  const { effects, equipped } = world.loadout;

  runtime.drive = 0;
  runtime.bestDrive = 0;
  runtime.rallyReturns = 0;
  runtime.surge = 0;
  runtime.adrenaline = 0;
  runtime.guard = 0;
  runtime.strikeRush = 0;
  runtime.edgeRecovery = 0;
  runtime.edgeSide = 0;
  runtime.strikeArmed = 0;
  runtime.guardWindow = 0;
  runtime.dashFx = 0;
  runtime.dashFrom = 0;
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
  }

  runtime.stats.abilitiesUsed = 0;
  runtime.stats.powerStrikes = 0;
  runtime.stats.dashes = 0;
  runtime.stats.perfectGuards = 0;
  runtime.stats.crits = 0;
  runtime.stats.shieldSaves = 0;
  runtime.stats.secondChances = 0;
}

/** A new rally is about to start. */
export function resetRally(world: World): void {
  world.talents.rallyReturns = 0;
  world.talents.surge = 0;
  world.talents.guardShielded = false;
}

/** The player conceded. The drive is over; the match state is not. */
export function resetDrive(world: World): void {
  const runtime = world.talents;
  runtime.bestDrive = Math.max(runtime.bestDrive, runtime.drive);
  runtime.drive = 0;
  runtime.rallyReturns = 0;
  runtime.surge = 0;
  runtime.adrenaline = 0;
  runtime.strikeRush = 0;
  runtime.guard = 0;
}

/** True when a single point - or a single life - would end the match. */
function inClutch(world: World): boolean {
  const { match } = world;
  if (match.maxLives > 0) return match.lives <= 1;
  return match.winScore > 0 && match.score.bot >= match.winScore - 1;
}

/** How deep into Flow State the current rally is, 0..1. */
function flowProgress(world: World): number {
  const { effects } = world.loadout;
  if (effects.flowPaddle <= 0) return 0;
  return clamp((world.talents.rallyReturns - effects.flowFrom) / 10, 0, 1);
}

/**
 * The player's paddle speed right now.
 *
 * Level sets the floor, the build multiplies it, and the in-match buffs add
 * on top. Nothing in this function can see the opponent or the ball's speed:
 * a harder match never quietly hands the player a faster paddle.
 */
export function playerPaddleSpeed(world: World): number {
  const { effects, paddleSpeed } = world.loadout;
  const runtime = world.talents;
  let mul = 1;

  if (runtime.adrenaline > 0) mul += effects.adrenalinePaddle;
  if (runtime.guard > 0) mul += effects.guardPaddle;
  if (runtime.strikeRush > 0) mul += effects.powerStrikePaddle;
  if (runtime.edgeRecovery > 0) mul += effects.edgeBoost;
  if (inClutch(world)) mul += effects.clutchPaddle;

  const rally = runtime.rallyReturns;
  mul += Math.min(effects.resilienceCap, Math.floor(rally / 5) * effects.resiliencePerFive);
  mul += Math.min(effects.flowCap, Math.max(0, rally - effects.flowFrom) * effects.flowPaddle);

  return Math.min(BALANCE.paddle.max, paddleSpeed * mul);
}

/** Keyboard travel, derived from whatever the paddle can do right now. */
export function playerKeySpeed(world: World): number {
  return playerPaddleSpeed(world) * BALANCE.paddle.keyboardShare;
}

/** Notice the paddle peeling off a wall, so Swift Recovery can fire. */
function trackEdges(world: World, dt: number): void {
  const runtime = world.talents;
  const { effects } = world.loadout;
  const paddle = world.player;
  const band = BALANCE.paddle.edgeBand;

  let side: -1 | 0 | 1 = 0;
  if (paddle.y <= paddle.half + band) side = -1;
  else if (paddle.y >= FIELD_H - paddle.half - band) side = 1;

  if (side === 0 && runtime.edgeSide !== 0 && effects.edgeBoost > 0) {
    runtime.edgeRecovery = effects.edgeSeconds;
  }
  runtime.edgeSide = side;
  runtime.edgeRecovery = Math.max(0, runtime.edgeRecovery - dt);
}

/**
 * Advance every timer the build owns.
 *
 * Cooldowns run faster while the player is in flow, which is the whole point
 * of the talent - but `BALANCE.talents.minCooldownMul` already floored the
 * cooldowns themselves, so the two together still cannot produce an ability
 * that is permanently available.
 */
export function updateRuntime(world: World, dt: number): void {
  const runtime = world.talents;
  const { effects } = world.loadout;

  runtime.adrenaline = Math.max(0, runtime.adrenaline - dt);
  runtime.guard = Math.max(0, runtime.guard - dt);
  runtime.strikeRush = Math.max(0, runtime.strikeRush - dt);
  runtime.strikeArmed = Math.max(0, runtime.strikeArmed - dt);
  runtime.guardWindow = Math.max(0, runtime.guardWindow - dt);
  runtime.dashFx = Math.max(0, runtime.dashFx - dt);

  trackEdges(world, dt);

  const recovery = dt * (1 + effects.flowRecharge * flowProgress(world));
  for (const slot of runtime.slots) {
    if (slot.cooldown > 0) slot.cooldown = Math.max(0, slot.cooldown - recovery);
  }

  if (runtime.shieldMax > 0 && runtime.shield < runtime.shieldMax) {
    runtime.shieldTimer -= dt;
    if (runtime.shieldTimer <= 0) {
      runtime.shield++;
      runtime.shieldTimer = effects.shieldRecharge;
    }
  }
}

// ------------------------------------------------------------------ returns

/** How a single return is modified. Built fresh for every contact. */
export interface ReturnMods {
  /** Contact offset after Stabilizer and Perfect Guard have had their say. */
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
    guarded: false
  };
}

/**
 * The player's return, with the build folded in.
 *
 * Also the point at which the momentum counters tick, because "a successful
 * return" is exactly what they count. Passive growth is capped first, then a
 * charged strike is added on top of the cap - an active ability is allowed to
 * beat the passive ceiling, but never the hard one.
 */
export function playerReturn(world: World, rawOff: number): ReturnMods {
  const runtime = world.talents;
  const { effects } = world.loadout;
  const { tuning } = world;

  runtime.drive++;
  runtime.rallyReturns++;
  runtime.bestDrive = Math.max(runtime.bestDrive, runtime.drive);

  if (effects.adrenalinePaddle > 0 && runtime.drive % effects.adrenalineAt === 0) {
    runtime.adrenaline = effects.adrenalineSeconds;
  }

  const guarded = runtime.guardWindow > 0;
  if (guarded) {
    runtime.guardWindow = 0;
    runtime.guard = effects.guardSeconds;
    runtime.stats.perfectGuards++;
    if (effects.guardGrantsShield && !runtime.guardShielded && runtime.shieldMax > 0) {
      runtime.guardShielded = true;
      runtime.shield = Math.min(runtime.shieldMax, runtime.shield + 1);
    }
  }

  const charged = runtime.strikeArmed > 0;
  if (charged) {
    runtime.strikeArmed = 0;
    runtime.stats.powerStrikes++;
    if (effects.powerStrikePaddle > 0) runtime.strikeRush = effects.powerStrikePaddleSeconds;
  }

  const crit = !guarded && effects.critChance > 0 && Math.random() < effects.critChance;
  if (crit) runtime.stats.crits++;

  // Passive sources, capped together.
  let growth = tuning.speedPerHit + effects.hitGrowth;
  growth += Math.min(effects.momentumCap, runtime.rallyReturns * effects.momentumPerReturn);
  if (inClutch(world)) growth += effects.clutchGrowth;
  if (crit) growth += effects.critGrowth;
  growth = Math.min(growth, BALANCE.talents.maxHitGrowth);

  let ceiling = tuning.maxSpeed;
  if (guarded) {
    // A read return is absorbed rather than accelerated - that is the trade.
    growth = 1;
  } else if (charged) {
    growth += effects.powerStrikeSpeed;
    ceiling = tuning.maxSpeed * (1 + effects.powerStrikeSpeed);
  }

  // Stabilizer only touches the wide, scrambled end of the paddle, where a
  // contact is an accident rather than a placement.
  const magnitude = Math.abs(rawOff);
  const wide = clamp((magnitude - 0.6) / 0.4, 0, 1);
  let off = rawOff * (1 - effects.stabilise * wide);
  if (guarded) off *= 0.5;
  // A heavy return also leaves at a wider angle. Speed on its own barely
  // troubles a composed opponent; speed sent somewhere awkward does.
  if (crit || charged) off = clamp(off * (1 + E.criticalStrike.angle), -1, 1);

  return {
    off,
    growth: Math.max(0.5, growth),
    ceiling: Math.min(BALANCE.ball.hardMax, ceiling),
    spin: guarded ? 0 : effects.spinMul,
    angleLimit: Math.min(1.15, MAX_BOUNCE_ANGLE * effects.angleMul),
    crit,
    charged,
    guarded
  };
}

// ------------------------------------------------------------------ defence

/**
 * Catch a ball that has crossed the player's line.
 *
 * Returns true when a shield charge was spent and the ball is back in play.
 * The ball keeps a little less speed than it arrived with, so a save is a
 * reprieve rather than a free winner.
 */
export function tryShield(world: World): boolean {
  const runtime = world.talents;
  if (runtime.shield <= 0 || world.match.status !== 'play') return false;

  const { ball } = world;
  const { effects } = world.loadout;
  runtime.shield--;
  runtime.shieldTimer = effects.shieldRecharge;
  runtime.stats.shieldSaves++;
  // A save is not a return: the drive - and everything riding on it - stops.
  runtime.bestDrive = Math.max(runtime.bestDrive, runtime.drive);
  runtime.drive = 0;

  ball.x = BALL_R;
  ball.px = ball.x;
  ball.speed = Math.max(BALANCE.ball.hardMin, ball.speed * effects.shieldSaveSpeed);
  ball.vx = Math.abs(ball.vx);
  ball.owner = 'you';
  ball.squash = 0.9;
  ball.squashAngle = 0;

  const hue = sideHue(world.theme, 'you');
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
    bestDrive: Math.max(runtime.bestDrive, runtime.drive)
  };
}

/** True while any paddle buff is running - the renderer tints the paddle. */
export function paddleBuffed(runtime: TalentRuntime): boolean {
  return (
    runtime.adrenaline > 0 ||
    runtime.guard > 0 ||
    runtime.strikeRush > 0 ||
    runtime.edgeRecovery > 0
  );
}

/** Clamp a paddle's target inside the court. Shared with the dash. */
export function boundTarget(paddle: Paddle, value: number): number {
  return clamp(value, paddle.half, FIELD_H - paddle.half);
}
