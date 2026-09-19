import type { GameAudio } from './audio';
import { FIELD_H, PADDLE_H, PADDLE_INSET, SERVE_SPEED, STORAGE_KEYS, TRAIL_MAX } from './constants';
import { ParticleSystem } from './particles';
import type { Ball, FxState, MatchState, Paddle, Side, Vec2, View } from './types';
import { readStored } from './utils/storage';
import { createView } from './view';

/**
 * Every piece of mutable simulation state, in one place. Systems (physics, AI,
 * rendering) are plain functions over a World rather than module globals, so
 * a second instance - a test, or two engines on one page - stays independent.
 */
export interface World {
  readonly view: View;
  readonly player: Paddle;
  readonly bot: Paddle;
  readonly ball: Ball;
  readonly match: MatchState;
  readonly fx: FxState;
  readonly trail: Vec2[];
  readonly particles: ParticleSystem;
  readonly audio: GameAudio;
  /** Effect strength, 1 normally and 0.25 under `prefers-reduced-motion`. */
  motion: number;
  /** Accumulator for trail sampling. */
  trailTick: number;
}

function createPaddle(side: Side): Paddle {
  return {
    side,
    x: 0,
    y: FIELD_H / 2,
    vy: 0,
    target: FIELD_H / 2,
    half: PADDLE_H / 2,
    flash: 0,
    aimed: false,
    wait: 0
  };
}

function createBall(): Ball {
  return {
    x: 0,
    y: FIELD_H / 2,
    px: 0,
    py: FIELD_H / 2,
    vx: 0,
    vy: 0,
    speed: SERVE_SPEED,
    squash: 0,
    squashAngle: 0,
    owner: 'you'
  };
}

function createMatch(): MatchState {
  return {
    status: 'menu',
    resumeTo: 'play',
    serveTimer: 0,
    serveDir: 1,
    rally: 0,
    best: parseInt(readStored(STORAGE_KEYS.best, '0'), 10) || 0,
    bestThisMatch: 0,
    points: 0,
    score: { you: 0, bot: 0 },
    winner: null,
    newBest: false,
    overTimer: 0,
    overShown: false
  };
}

function createFx(): FxState {
  return {
    heat: 0,
    timeScale: 1,
    freeze: 0,
    shake: 0,
    shakeX: 0,
    shakeY: 0,
    flash: 0,
    comboIndex: -1,
    comboLabel: '',
    comboTimer: 0,
    time: 0
  };
}

export function createWorld(audio: GameAudio, motion: number): World {
  return {
    view: createView(),
    player: createPaddle('you'),
    bot: createPaddle('bot'),
    ball: createBall(),
    match: createMatch(),
    fx: createFx(),
    trail: [],
    particles: new ParticleSystem(),
    audio,
    motion,
    trailTick: 0
  };
}

/** Re-point the paddles after the field's length changed. */
export function placePaddles(world: World): void {
  world.player.x = PADDLE_INSET;
  world.bot.x = world.view.w - PADDLE_INSET;
}

export function centrePaddles(world: World): void {
  for (const paddle of [world.player, world.bot]) {
    paddle.y = FIELD_H / 2;
    paddle.target = FIELD_H / 2;
    paddle.vy = 0;
    paddle.aimed = false;
    paddle.wait = 0;
  }
}

export function normaliseBallSpeed(ball: Ball): void {
  const v = Math.hypot(ball.vx, ball.vy);
  if (v > 0.0001) {
    const k = ball.speed / v;
    ball.vx *= k;
    ball.vy *= k;
  }
}

export function centreBall(world: World): void {
  const { ball, view } = world;
  ball.x = view.w / 2;
  ball.y = FIELD_H / 2;
  ball.px = ball.x;
  ball.py = ball.y;
  ball.vx = 0;
  ball.vy = 0;
  ball.squash = 0;
  world.trail.length = 0;
}

export function pushTrail(world: World): void {
  world.trail.push({ x: world.ball.x, y: world.ball.y });
  if (world.trail.length > TRAIL_MAX) world.trail.shift();
}

/** Keep play proportional when the field's length changes. */
export function rescaleField(world: World, k: number): void {
  if (k === 1 || !isFinite(k)) return;
  const { ball } = world;
  ball.x *= k;
  ball.px *= k;
  ball.vx *= k;
  normaliseBallSpeed(ball);
  for (const point of world.trail) point.x *= k;
}

export function addShake(world: World, amount: number): void {
  world.fx.shake = Math.min(18, world.fx.shake + amount * world.motion);
}
