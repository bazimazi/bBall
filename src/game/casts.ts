import { abilityById } from '../core/talents/abilities';
import type { AbilityId } from '../core/talents/types';
import { FIELD_H } from './constants';
import { hsla } from './palette';
import type { Ghost } from './types';
import type { World } from './world';

/**
 * One-shot skill animations.
 *
 * A talent's *state* lives in `TalentRuntime` and says what the skill is
 * doing; a cast says what it looked like doing it. They are kept apart on
 * purpose: the simulation must not care how long a flare takes to fade, and
 * a flare must never be able to change a rally.
 *
 * Every entry is drawn by `render/abilityFx.ts`, which switches on `kind` -
 * so giving a skill an animation of its own is a case there and a `spawn`
 * here, and nothing else.
 */

export type CastKind =
  | AbilityId
  /** A charged or critical return connecting. */
  | 'strike-impact'
  /** A return landing inside the Perfect Guard window. */
  | 'guard-parry'
  /** Aegis catching a ball at the line. */
  | 'aegis-save'
  /** Zenith handing a conceded point back. */
  | 'zenith-refund'
  /** One beat of Echo's rhythm, while its window runs. */
  | 'echo-pulse'
  /** The court-wide ring every capstone opens with. */
  | 'shockwave';

export interface Cast {
  kind: CastKind;
  hue: number;
  /** Where it happened, in field units. */
  x: number;
  y: number;
  age: number;
  life: number;
  /** Kind-specific magnitude: a radius, a travel distance, a length. */
  size: number;
  /** Kind-specific direction or angle. */
  dir: number;
  /** Fades the whole effect out under `prefers-reduced-motion`. */
  strength: number;
  alive: boolean;
}

export interface CastOptions {
  x: number;
  y: number;
  hue: number;
  life?: number;
  size?: number;
  dir?: number;
}

const CAST_MAX = 28;
const GHOST_MAX = 10;
/** Seconds an afterimage survives, and how often one is taken. */
const GHOST_LIFE = 0.3;
const GHOST_STEP = 0.028;
/** Field units the paddle must have covered since the last one. */
const GHOST_MIN_TRAVEL = 7;

/**
 * A fixed ring of casts. Like the particle pool, nothing is allocated after
 * construction - a forty-minute endless run never touches the collector.
 */
export class CastSystem {
  readonly items: Cast[] = Array.from({ length: CAST_MAX }, () => ({
    kind: 'shockwave' as CastKind,
    hue: 0,
    x: 0,
    y: 0,
    age: 0,
    life: 0,
    size: 0,
    dir: 0,
    strength: 1,
    alive: false
  }));

  private head = 0;

  spawn(kind: CastKind, options: CastOptions, strength = 1): void {
    const cast = this.items[this.head]!;
    this.head = (this.head + 1) % CAST_MAX;
    cast.kind = kind;
    cast.hue = options.hue;
    cast.x = options.x;
    cast.y = options.y;
    cast.age = 0;
    cast.life = options.life ?? 0.6;
    cast.size = options.size ?? 60;
    cast.dir = options.dir ?? 0;
    cast.strength = strength;
    cast.alive = true;
  }

  update(dt: number): void {
    for (const cast of this.items) {
      if (!cast.alive) continue;
      cast.age += dt;
      if (cast.age >= cast.life) cast.alive = false;
    }
  }

  clear(): void {
    for (const cast of this.items) cast.alive = false;
  }
}

/**
 * The paddle's afterimages.
 *
 * Sampled only while Dash or Slipstream is running: a smear that appeared
 * whenever the player moved quickly would say nothing, and a smear that only
 * appears under a speed skill says exactly what that skill bought.
 */
export class GhostTrail {
  readonly items: Ghost[] = Array.from({ length: GHOST_MAX }, () => ({
    y: 0,
    half: 0,
    age: 0,
    alive: false
  }));

  private head = 0;
  private tick = 0;
  private lastY = Number.NaN;

  /**
   * Take a sample, at most every `GHOST_STEP` seconds and only once the
   * paddle has actually gone somewhere.
   *
   * Without the distance test a Slipstream spent holding position would stack
   * ten afterimages on one spot - a bright smudge that says the opposite of
   * what the skill is for.
   */
  sample(dt: number, y: number, half: number): void {
    this.tick += dt;
    if (this.tick < GHOST_STEP) return;
    if (Math.abs(y - this.lastY) < GHOST_MIN_TRAVEL) return;
    this.tick = 0;
    this.mark(y, half);
  }

  /** Take one unconditionally - a dash has to record where it left from. */
  mark(y: number, half: number): void {
    const ghost = this.items[this.head]!;
    this.head = (this.head + 1) % GHOST_MAX;
    ghost.y = y;
    ghost.half = half;
    ghost.age = 0;
    ghost.alive = true;
    this.lastY = y;
  }

  update(dt: number): void {
    for (const ghost of this.items) {
      if (!ghost.alive) continue;
      ghost.age += dt;
      if (ghost.age >= GHOST_LIFE) ghost.alive = false;
    }
  }

  /** 1 the instant it was taken, 0 as it dies. */
  static fade(ghost: Ghost): number {
    return 1 - ghost.age / GHOST_LIFE;
  }

  clear(): void {
    for (const ghost of this.items) ghost.alive = false;
    this.tick = 0;
    this.lastY = Number.NaN;
  }
}

// --------------------------------------------------------------- spawning

/** Seconds a capstone's name stays on screen. */
export const ULTIMATE_BANNER = 1.1;

/** The court-wide ring, the tinted flash and the banner a capstone opens with. */
export function ultimateCast(world: World, kind: CastKind, hue: number, name: string): void {
  const { fx, player, view, motion } = world;

  world.casts.spawn(
    'shockwave',
    { x: player.x, y: player.y, hue, life: 0.75, size: view.w * 0.9 },
    motion
  );
  world.casts.spawn(kind, { x: player.x, y: player.y, hue, life: 0.9, size: 150 }, motion);

  // The three things that make a capstone impossible to miss, and the three
  // that everything else in the game is deliberately denied: the whole screen
  // takes the skill's colour, play stops for a beat, and it says its name.
  fx.flash = Math.max(fx.flash, 0.55 * motion);
  fx.flashHue = hue;
  fx.freeze = Math.max(fx.freeze, 0.07 * motion);
  fx.timeScale = motion > 0.5 ? 0.45 : 1;
  fx.castLabel = name;
  fx.castHue = hue;
  fx.castTimer = ULTIMATE_BANNER;
}

/**
 * Aegis catching a ball at the line. Returns the hue it drew in, so the
 * caller's own particles match the barrier that just fired.
 *
 * The camera kick is written here rather than through `world.addShake`
 * because a save is raised from the talent runtime, and the runtime must not
 * end up importing the world it is a part of.
 */
export function aegisSaveCast(world: World, y: number): number {
  const hue = abilityById('aegis')?.hue ?? 288;
  world.casts.spawn('aegis-save', { x: 0, y, hue, life: 0.6, size: 90 }, world.motion);
  world.fx.shake = Math.min(18, world.fx.shake + 5 * world.motion);
  return hue;
}

/**
 * Zenith handing a conceded point back.
 *
 * Drawn at the centre of the court rather than on the paddle: the thing being
 * undone is the point, and the point belongs to the whole field.
 */
export function zenithRefundCast(world: World): void {
  const hue = abilityById('zenith')?.hue ?? 58;
  world.casts.spawn(
    'zenith-refund',
    { x: world.view.w / 2, y: FIELD_H / 2, hue, life: 0.8, size: 200 },
    world.motion
  );
  world.fx.flash = Math.max(world.fx.flash, 0.45 * world.motion);
  world.fx.flashHue = hue;
}

/** Wipe every skill animation. A new match never inherits the last one's. */
export function clearAbilityFx(world: World): void {
  const { fx } = world;
  world.casts.clear();
  world.ghosts.clear();
  fx.flashHue = -1;
  fx.castLabel = '';
  fx.castTimer = 0;
  fx.pulseTick = 0;
  fx.echoTick = 0;
  fx.emberTick = 0;
}

// ----------------------------------------------------------- live effects

/** Seconds between Echo's rings, and between an ember from a hot capstone. */
const ECHO_BEAT = 0.5;
const EMBER_BEAT = 0.09;

/**
 * Advance every skill animation, and top up the ones that breathe.
 *
 * Called from the simulation next to the particles - including during a
 * hit-stop, at the same quarter speed, so a capstone's flare stretches out
 * with the freeze it caused rather than running on through it.
 */
export function updateAbilityFx(world: World, dt: number): void {
  const { talents: runtime, player, fx, motion } = world;
  world.casts.update(dt);
  world.ghosts.update(dt);

  if (world.match.status === 'menu') return;

  // Dash and Slipstream are the two skills that buy movement, so they are the
  // two that leave a trail behind the paddle.
  if (runtime.dashFx > 0 || runtime.slipstream > 0) {
    world.ghosts.sample(dt, player.y, player.half);
  }

  fx.pulseTick += dt;

  if (runtime.echo > 0 && fx.echoTick + ECHO_BEAT <= fx.pulseTick) {
    fx.echoTick = fx.pulseTick;
    world.casts.spawn(
      'echo-pulse',
      { x: player.x, y: player.y, hue: ECHO_HUE, life: 0.85, size: 190 },
      motion
    );
  }

  // Overload and Zenith are held states rather than moments, so they keep
  // shedding a little of themselves for as long as they are up.
  if (fx.emberTick + EMBER_BEAT <= fx.pulseTick) {
    fx.emberTick = fx.pulseTick;
    if (runtime.overload > 0) emberBurst(world, OVERLOAD_HUE, 1, 0.5);
    if (runtime.zenith > 0) emberBurst(world, ZENITH_HUE, -1, 0.45);
  }
}

/** Read once from the catalogue, so a re-coloured skill re-colours its FX. */
const OVERLOAD_HUE = abilityById('overload')?.hue ?? 0;
const ZENITH_HUE = abilityById('zenith')?.hue ?? 58;
const ECHO_HUE = abilityById('echo')?.hue ?? 152;

/** A single mote leaving the paddle: down for Overload, up for Zenith. */
function emberBurst(world: World, hue: number, sign: 1 | -1, speed: number): void {
  const { player, particles, motion } = world;
  particles.emit(
    player.x + (Math.random() - 0.5) * 18,
    player.y + (Math.random() - 0.5) * player.half * 2,
    2,
    {
      angle: sign > 0 ? Math.PI / 2 : -Math.PI / 2,
      spread: 0.7,
      speed: 90 * speed,
      life: 0.7,
      size: 2.4,
      color: hsla(hue, 100, 70, 0.8),
      drag: 0.97
    },
    motion
  );
}

/** A vertical streak of light down the player's lane, for Slipstream. */
export function laneRush(world: World, hue: number): void {
  const { player, particles, motion } = world;
  for (let i = 0; i < 6; i++) {
    const y = (FIELD_H / 6) * (i + 0.5);
    particles.emit(
      player.x + 18,
      y,
      3,
      {
        angle: y < player.y ? -Math.PI / 2 : Math.PI / 2,
        spread: 0.35,
        speed: 420,
        life: 0.45,
        size: 2.6,
        color: hsla(hue, 100, 74, 0.85),
        drag: 0.9
      },
      motion
    );
  }
}
