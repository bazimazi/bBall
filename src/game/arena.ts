import { botProfile } from '../core/bots/levels';
import type { ArenaSpec, BossPhase, BumperSpec } from '../core/modes/types';
import { BALL_R, FIELD_H } from './constants';
import { setPaddleBase } from './paddle';
import { hsla } from './palette';
import type { Side, Vec2 } from './types';
import { clamp } from './utils/math';
import { addShake, normaliseBallSpeed, setBrainProfile, type World } from './world';

/**
 * The court as a rule: bumpers, wind, a gravity well and brick walls, plus
 * the phases a boss moves through.
 *
 * Everything here is described by the match's {@link ArenaSpec} and lives for
 * one match. None of it knows which mode asked for it - a campaign stage, a
 * boss, a daily and a run all build their courts from the same parts.
 *
 * Two rules keep every hazard fair:
 *
 *  - The ball's *speed* is never touched by a force. Wind and gravity bend
 *    its path; a bumper adds a little pace, the way a paddle does. The
 *    difficulty contract - the ball is exactly as fast as the opponent's rank
 *    and the mode make it - holds on every court.
 *  - No hazard may stall the ball. Whatever bends it is clamped short of
 *    vertical, so a rally always makes progress towards one of the goals.
 */

export interface BumperState {
  x: number;
  y: number;
  r: number;
  /** 0..1 glow after a hit. */
  flash: number;
  readonly spec: BumperSpec;
}

export interface BrickState {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  /** Whose goal this brick shields. */
  side: Side;
  flash: number;
  alive: boolean;
}

export interface ArenaState {
  spec: ArenaSpec | null;
  /** Multiplier on every hazard; a boss's phases raise it. */
  intensity: number;
  time: number;
  bumpers: BumperState[];
  windDir: 1 | -1;
  /** Seconds to the next change of wind. */
  windTimer: number;
  bricks: BrickState[];
  /** Index of the boss phase reached; 0 before the first. */
  phase: number;
  /** Late bend on the opponent's returns, units/s². 0 for most matches. */
  bossSwerve: number;
  bossSwerveDir: -1 | 0 | 1;
}

/** Steepest a hazard may turn the ball: short of vertical, so it never stalls. */
const MAX_ARENA_ANGLE = 1.12;
/** Pace a bumper adds, as a return does. */
const BUMPER_PACE = 1.035;
/** Where the brick walls stand, as a fraction of the court's length. */
const WALL_AT = 0.26;
const BRICK_W = 16;
const BRICK_GAP = 7;
/** Seconds of warning before the wind turns. */
export const WIND_WARNING = 0.8;
/** How far across the court a boss's bend starts, from its own end. */
const BOSS_SWERVE_FROM = 0.6;

export function createArena(): ArenaState {
  return {
    spec: null,
    intensity: 1,
    time: 0,
    bumpers: [],
    windDir: 1,
    windTimer: 0,
    bricks: [],
    phase: 0,
    bossSwerve: 0,
    bossSwerveDir: 0
  };
}

/** True when something in this court bends the ball in flight. */
export function arenaCurves(world: World): boolean {
  const spec = world.arena.spec;
  return !!spec && (!!spec.wind || !!spec.well);
}

/** Build the court for the match about to start. */
export function setupArena(world: World): void {
  const arena = world.arena;
  const spec = world.rules.modifiers.arena ?? null;
  arena.spec = spec;
  arena.intensity = 1;
  arena.time = 0;
  arena.phase = 0;
  arena.bossSwerve = world.rules.boss?.swerve ?? 0;
  arena.bossSwerveDir = 0;
  arena.windDir = Math.random() < 0.5 ? 1 : -1;
  arena.windTimer = spec?.wind?.period ?? 0;
  arena.bumpers = (spec?.bumpers ?? []).map((bumper) => ({
    x: 0,
    y: 0,
    r: bumper.r,
    flash: 0,
    spec: bumper
  }));
  placeBumpers(world);
  buildBricks(world);
}

/** Lay the brick walls out afresh - every match, and every serve if they regrow. */
export function buildBricks(world: World): void {
  const arena = world.arena;
  const spec = arena.spec?.bricks;
  arena.bricks = [];
  if (!spec) return;
  const rows = Math.max(2, spec.rows);
  const h = (FIELD_H - BRICK_GAP * (rows + 1)) / rows;
  const hp = spec.armored ? 2 : 1;
  const walls: Side[] = spec.sides === 'both' ? ['you', 'bot'] : [spec.sides];
  for (const side of walls) {
    const cx = side === 'you' ? world.view.w * WALL_AT : world.view.w * (1 - WALL_AT);
    for (let i = 0; i < rows; i++) {
      arena.bricks.push({
        x: cx - BRICK_W / 2,
        y: BRICK_GAP + i * (h + BRICK_GAP),
        w: BRICK_W,
        h,
        hp,
        maxHp: hp,
        side,
        flash: 0,
        alive: true
      });
    }
  }
}

/** Re-seat the walls after the field's length changed. */
export function rescaleArena(world: World): void {
  for (const brick of world.arena.bricks) {
    const cx = brick.side === 'you' ? world.view.w * WALL_AT : world.view.w * (1 - WALL_AT);
    brick.x = cx - BRICK_W / 2;
  }
  placeBumpers(world);
}

function placeBumpers(world: World): void {
  const { arena, view } = world;
  for (const bumper of arena.bumpers) {
    const { spec } = bumper;
    let x = spec.x * view.w;
    let y = spec.y * FIELD_H;
    if (spec.orbit) {
      const a = spec.orbit.phase + arena.time * spec.orbit.speed;
      x += Math.cos(a) * spec.orbit.radius;
      y += Math.sin(a) * spec.orbit.radius;
    }
    bumper.x = x;
    bumper.y = clamp(y, bumper.r, FIELD_H - bumper.r);
  }
}

/** A new serve: the wind keeps blowing, but a regrowing wall stands again. */
export function arenaServe(world: World): void {
  const spec = world.arena.spec;
  if (spec?.bricks?.regrow) buildBricks(world);
  world.arena.bossSwerveDir = 0;
}

/** Move the court on: orbits turn, the wind counts down to its next change. */
export function updateArena(world: World, dt: number): void {
  const arena = world.arena;
  for (const bumper of arena.bumpers) bumper.flash = Math.max(0, bumper.flash - dt * 3);
  for (const brick of arena.bricks) brick.flash = Math.max(0, brick.flash - dt * 4);
  if (!arena.spec) return;
  const live = world.match.status === 'play' || world.match.status === 'serve';
  if (!live) return;

  arena.time += dt * arena.intensity;
  if (arena.bumpers.length > 0) placeBumpers(world);

  const wind = arena.spec.wind;
  if (wind && wind.period > 0 && world.match.status === 'play') {
    arena.windTimer -= dt * arena.intensity;
    if (arena.windTimer <= 0) {
      arena.windDir = arena.windDir > 0 ? -1 : 1;
      arena.windTimer = wind.period;
      world.audio.wall(0.2);
    }
  }
}

/** Keep the ball travelling mostly along the court, and at its own speed. */
function keepPlayable(world: World): void {
  const { ball } = world;
  const dir = ball.vx >= 0 ? 1 : -1;
  const angle = clamp(Math.atan2(ball.vy, Math.abs(ball.vx)), -MAX_ARENA_ANGLE, MAX_ARENA_ANGLE);
  ball.vx = Math.cos(angle) * ball.speed * dir;
  ball.vy = Math.sin(angle) * ball.speed;
}

/** The pull of every force in the court at (x, y), written into `out`. */
export function arenaForce(world: World, x: number, y: number, out: Vec2): Vec2 {
  const { arena } = world;
  const spec = arena.spec;
  out.x = 0;
  out.y = 0;
  if (!spec) return out;
  if (spec.wind) out.y += arena.windDir * spec.wind.strength * arena.intensity;
  if (spec.well) {
    const dx = spec.well.x * world.view.w - x;
    const dy = spec.well.y * FIELD_H - y;
    const d2 = dx * dx + dy * dy;
    const d = Math.sqrt(d2) || 1;
    const pull = (spec.well.strength * arena.intensity * (150 * 150 + 2500)) / (d2 + 2500);
    out.x += (dx / d) * pull;
    out.y += (dy / d) * pull;
  }
  return out;
}

const scratch: Vec2 = { x: 0, y: 0 };

/**
 * One step of the court's forces on a velocity: pushed, then put back to
 * `speed` and clamped short of vertical. Shared by the ball itself and by
 * every read of where it is going, so a prediction bends exactly as the
 * ball will.
 */
export function bend(world: World, x: number, y: number, v: Vec2, speed: number, dt: number): void {
  arenaForce(world, x, y, scratch);
  v.x += scratch.x * dt;
  v.y += scratch.y * dt;
  // Never let a force turn the ball back on itself.
  if (Math.abs(v.x) < speed * 0.3) v.x = (v.x >= 0 ? 1 : -1) * speed * 0.3;
  const dir = v.x >= 0 ? 1 : -1;
  const angle = clamp(Math.atan2(v.y, Math.abs(v.x)), -MAX_ARENA_ANGLE, MAX_ARENA_ANGLE);
  v.x = Math.cos(angle) * speed * dir;
  v.y = Math.sin(angle) * speed;
}

const velocity: Vec2 = { x: 0, y: 0 };

/**
 * Bend the ball's path by the court's forces for one step. Its speed is put
 * back exactly afterwards: a force turns the ball, it never slows it.
 */
export function applyArenaForces(world: World, travel: number): void {
  const { arena, ball } = world;
  if (world.match.status !== 'play') return;

  if (arena.bossSwerve > 0 && arena.bossSwerveDir !== 0 && ball.vx < 0) {
    if (ball.x < world.view.w * (1 - BOSS_SWERVE_FROM)) {
      ball.vy += arena.bossSwerveDir * arena.bossSwerve * travel;
      keepPlayable(world);
    }
  }

  if (!arenaCurves(world)) return;
  velocity.x = ball.vx;
  velocity.y = ball.vy;
  bend(world, ball.x, ball.y, velocity, ball.speed, travel);
  ball.vx = velocity.x;
  ball.vy = velocity.y;
}

/** The boss just returned the ball: arm its late bend, the way the ball left. */
export function bossReturned(world: World): void {
  const arena = world.arena;
  arena.bossSwerveDir = arena.bossSwerve > 0 ? (world.ball.vy >= 0 ? 1 : -1) : 0;
}

/** The player touched it last: the boss's bend is spent. */
export function playerReturned(world: World): void {
  world.arena.bossSwerveDir = 0;
}

/**
 * Tell the opponent to look again. A ball that just changed course off
 * something in the court is a new read, not the one it committed to.
 */
function rethink(world: World): void {
  const brain = world.botBrain;
  brain.aimed = false;
  brain.reads = 0;
  brain.misread = false;
  brain.wait = brain.profile.reaction * 0.6;
}

/** Bounce the ball off every bumper and brick it is touching. */
export function collideArena(world: World): void {
  const { arena } = world;
  if (!arena.spec) return;
  for (const bumper of arena.bumpers) collideBumper(world, bumper);
  if (arena.bricks.length > 0) collideBricks(world);
}

function collideBumper(world: World, bumper: BumperState): void {
  const { ball } = world;
  const dx = ball.x - bumper.x;
  const dy = ball.y - bumper.y;
  const min = bumper.r + BALL_R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2);
  if (d < 0.001) return;
  const nx = dx / d;
  const ny = dy / d;
  const dot = ball.vx * nx + ball.vy * ny;
  // Only a ball travelling into the bumper bounces. One already on its way
  // out - a serve from a centre post, or a bounce resolved last step - is
  // left alone, or it would be struck again on every step until it escaped.
  if (dot >= 0) return;
  ball.vx -= 2 * dot * nx;
  ball.vy -= 2 * dot * ny;
  ball.x = bumper.x + nx * (min + 0.5);
  ball.y = clamp(bumper.y + ny * (min + 0.5), BALL_R, FIELD_H - BALL_R);
  ball.speed = Math.min(world.tuning.maxSpeed, ball.speed * BUMPER_PACE);
  if (Math.abs(ball.vx) < 1) ball.vx = nx >= 0 ? 1 : -1;
  normaliseBallSpeed(ball);
  keepPlayable(world);
  ball.squash = 0.9;
  ball.squashAngle = Math.atan2(ny, nx);

  bumper.flash = 1;
  const hue = bumperHue(world);
  const x = bumper.x + nx * bumper.r;
  const y = bumper.y + ny * bumper.r;
  world.rings.spawn(bumper.x, bumper.y, hue, bumper.r * 2.4, 0.4, 5, 76);
  world.grid.impulse(x, y, 260, 120);
  world.particles.emit(
    x,
    y,
    12,
    {
      angle: Math.atan2(ny, nx),
      spread: 1.6,
      speed: 260,
      life: 0.4,
      size: 3,
      color: hsla(hue, 100, 72, 0.9)
    },
    world.motion
  );
  addShake(world, 3);
  world.audio.bumper(0.5);
  rethink(world);
}

function collideBricks(world: World): void {
  const { ball, arena } = world;
  for (const brick of arena.bricks) {
    if (!brick.alive) continue;
    const nx = clamp(ball.x, brick.x, brick.x + brick.w);
    const ny = clamp(ball.y, brick.y, brick.y + brick.h);
    const dx = ball.x - nx;
    const dy = ball.y - ny;
    if (dx * dx + dy * dy >= BALL_R * BALL_R) continue;

    // Which face was struck decides which way the ball goes back.
    const fromSide = Math.abs(dx) >= Math.abs(dy);
    if (fromSide) {
      const out = ball.x < brick.x + brick.w / 2 ? -1 : 1;
      ball.vx = Math.abs(ball.vx) * out;
      ball.x = (out < 0 ? brick.x : brick.x + brick.w) + out * (BALL_R + 0.5);
    } else {
      const out = ball.y < brick.y + brick.h / 2 ? -1 : 1;
      ball.vy = Math.abs(ball.vy) * out;
      ball.y = clamp(
        (out < 0 ? brick.y : brick.y + brick.h) + out * (BALL_R + 0.5),
        BALL_R,
        FIELD_H - BALL_R
      );
    }
    keepPlayable(world);

    brick.hp--;
    brick.flash = 1;
    const hue = world.theme[brick.side === 'you' ? 'youHue' : 'botHue'];
    const cx = brick.x + brick.w / 2;
    const cy = brick.y + brick.h / 2;
    if (brick.hp <= 0) {
      brick.alive = false;
      world.particles.emit(
        cx,
        cy,
        22,
        { speed: 300, life: 0.55, size: 3.4, color: hsla(hue, 90, 70, 0.95) },
        world.motion
      );
      world.rings.spawn(cx, cy, hue, brick.h * 0.9, 0.35, 5);
      world.audio.brick();
      addShake(world, 4);
    } else {
      world.audio.wall(0.6);
      addShake(world, 2);
    }
    world.grid.impulse(cx, ball.y, 300, 130);
    rethink(world);
    return; // one brick per step is plenty; the next step catches the rest
  }
}

/** The x of the wall guarding `side`, or null when it has none standing. */
export function wallFor(world: World, side: Side): number | null {
  const spec = world.arena.spec?.bricks;
  if (!spec) return null;
  if (spec.sides !== 'both' && spec.sides !== side) return null;
  return side === 'you' ? world.view.w * WALL_AT : world.view.w * (1 - WALL_AT);
}

/** Is there a standing brick on `side`'s wall at height `y`? */
export function brickAt(world: World, side: Side, y: number): boolean {
  for (const brick of world.arena.bricks) {
    if (!brick.alive || brick.side !== side) continue;
    if (y >= brick.y - BALL_R && y <= brick.y + brick.h + BALL_R) return true;
  }
  return false;
}

/** The hue bumpers glow in: the boss's own, or a neutral violet. */
export function bumperHue(world: World): number {
  return world.rules.boss?.hue ?? 268;
}

// ------------------------------------------------------------------ bosses

/**
 * The player just scored: has the boss been pushed into its next phase?
 * Each phase can hand it a sharper brain, a different paddle and a harder
 * court - and it says so, with a banner and a beat of its own.
 */
export function checkBossPhase(world: World): void {
  const boss = world.rules.boss;
  if (!boss) return;
  const arena = world.arena;
  const score = world.match.score.you;
  let next: BossPhase | null = null;
  let index = arena.phase;
  for (let i = arena.phase; i < boss.phases.length; i++) {
    const phase = boss.phases[i]!;
    if (score >= phase.at) {
      next = phase;
      index = i + 1;
    }
  }
  if (!next) return;
  arena.phase = index;
  if (next.bot) setBrainProfile(world.botBrain, botProfile(next.bot));
  if (next.botPaddleScale !== undefined) setPaddleBase(world.bot, next.botPaddleScale);
  if (next.intensity !== undefined) arena.intensity = next.intensity;
  if (next.swerve !== undefined) arena.bossSwerve = next.swerve;

  const { fx } = world;
  fx.bannerText = next.label;
  fx.bannerSub = boss.name;
  fx.bannerHue = boss.hue;
  fx.bannerTimer = BANNER_TIME;
  fx.flash = Math.max(fx.flash, 0.4 * world.motion);
  fx.flashHue = boss.hue;
  world.rings.spawn(world.bot.x, world.bot.y, boss.hue, world.view.w * 0.6, 0.8, 10, 74);
  world.grid.impulse(world.bot.x, world.bot.y, 700, 260);
  addShake(world, 8);
  world.audio.phase();
}

/** Seconds a banner - boss intro, phase, stage name - stays up. */
export const BANNER_TIME = 1.9;
