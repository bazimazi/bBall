import { botProfile } from '../core/bots/levels';
import { BALANCE, rankScale } from '../core/balance/config';
import { DEFAULT_THEME, type ResolvedTheme } from '../core/cosmetics/theme';
import { quickMatchRules } from '../core/modes/rules';
import type { MatchRules } from '../core/modes/types';
import type { ResolvedLoadout } from '../core/talents/effects';
import type { GameAudio } from './audio';
import { FIELD_H, PADDLE_H, PADDLE_INSET, TRAIL_MAX } from './constants';
import { setPaddleBase } from './paddle';
import { ParticleSystem } from './particles';
import { sideHue, heatHue } from './palette';
import { createRuntime, DEFAULT_LOADOUT } from './talents';
import type {
  Ball,
  BotBrain,
  FxState,
  MatchState,
  Paddle,
  Side,
  TalentRuntime,
  Tuning,
  Vec2,
  View
} from './types';
import { clamp } from './utils/math';
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
  /** The mode being played. Replaced whenever a new match is configured. */
  rules: MatchRules;
  /** Difficulty: speeds and sizes for this match. Never the player's doing. */
  tuning: Tuning;
  /** Progression: the player's resolved build. Never the opponent's doing. */
  loadout: ResolvedLoadout;
  /** What that build is doing right now. Lives for one match. */
  talents: TalentRuntime;
  /** Colours from the player's equipped cosmetics. */
  theme: ResolvedTheme;
  /** The opponent's head. */
  botBrain: BotBrain;
  /** Drives the player's paddle during the attract-mode demo. */
  demoBrain: BotBrain;
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
    baseHalf: PADDLE_H / 2,
    scale: 1,
    grow: 1,
    flash: 0
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
    speed: BALANCE.ball.serve,
    squash: 0,
    squashAngle: 0,
    owner: 'you'
  };
}

export function createBrain(profile: BotBrain['profile']): BotBrain {
  return {
    profile,
    wait: 0,
    aimed: false,
    reads: 0,
    maxReads: 1 + Math.round(profile.prediction * 2),
    misread: false
  };
}

export function setBrainProfile(brain: BotBrain, profile: BotBrain['profile']): void {
  brain.profile = profile;
  brain.maxReads = 1 + Math.round(profile.prediction * 2);
  brain.wait = 0;
  brain.aimed = false;
  brain.reads = 0;
  brain.misread = false;
}

function createMatch(rules: MatchRules): MatchState {
  return {
    status: 'menu',
    resumeTo: 'play',
    mode: rules.mode,
    label: rules.label,
    serveTimer: 0,
    serveDir: 1,
    rally: 0,
    bestThisMatch: 0,
    points: 0,
    hits: 0,
    elapsed: 0,
    score: { you: 0, bot: 0 },
    winScore: rules.winScore,
    deficit: 0,
    lives: rules.lives,
    maxLives: rules.lives,
    winner: null,
    overTimer: 0,
    overShown: false,
    result: null,
    resultId: 0
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

/**
 * Difficulty, resolved.
 *
 * Two inputs and no others: the opponent's rank, and the mode's modifiers.
 * A stronger opponent means a faster ball - never a slower paddle, and never
 * a change to anything the player has earned.
 */
export function tuningFor(rules: MatchRules): Tuning {
  const m = rules.modifiers;
  const { ball } = BALANCE;
  const rank = rankScale(rules.bot.rank);
  const growth = 1 + (ball.growth - 1) * rank.growth * m.speedPerHitScale;

  return {
    serveSpeed: clamp(ball.serve * rank.serve * m.serveSpeedScale, ball.hardMin, ball.hardMax),
    maxSpeed: clamp(ball.max * rank.max * m.maxSpeedScale, ball.hardMin, ball.hardMax),
    speedPerHit: clamp(growth, 1, BALANCE.talents.maxHitGrowth),
    perPoint: ball.perPoint * rank.growth,
    shrinkPerHit: m.shrinkPerHit
  };
}

/** The demo rally behind the menus - never scored, never recorded. */
export function attractRules(): MatchRules {
  return quickMatchRules('pro');
}

export function createWorld(audio: GameAudio, motion: number): World {
  const rules = attractRules();
  return {
    view: createView(),
    player: createPaddle('you'),
    bot: createPaddle('bot'),
    ball: createBall(),
    match: createMatch(rules),
    fx: createFx(),
    trail: [],
    particles: new ParticleSystem(),
    audio,
    rules,
    tuning: tuningFor(rules),
    loadout: DEFAULT_LOADOUT,
    talents: createRuntime(),
    theme: DEFAULT_THEME,
    botBrain: createBrain(rules.bot),
    demoBrain: createBrain(botProfile('amateur')),
    motion,
    trailTick: 0
  };
}

/** Size both paddles for the rules in play. */
export function applyPaddleSizes(world: World): void {
  const { modifiers } = world.rules;
  setPaddleBase(world.player, modifiers.playerPaddleScale);
  setPaddleBase(world.bot, modifiers.botPaddleScale);
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

/** The hue a side is drawn in under the equipped theme. */
export function hueOf(world: World, side: Side): number {
  return sideHue(world.theme, side);
}

/** The ball's hue: its owner's colour, pulled towards hot in a long rally. */
export function ballHue(world: World): number {
  return heatHue(hueOf(world, world.ball.owner), world.fx.heat, world.theme.hotHue);
}
