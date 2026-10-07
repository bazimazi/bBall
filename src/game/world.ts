import { botProfile } from '../core/bots/levels';
import { NEUTRAL_KIT, materialRuntime } from '../core/equipment/types';
import { BALANCE, rankScale } from '../core/balance/config';
import { DEFAULT_THEME, type ResolvedTheme } from '../core/cosmetics/theme';
import { quickMatchRules } from '../core/modes/rules';
import type { MatchRules } from '../core/modes/types';
import type { ResolvedLoadout } from '../core/talents/effects';
import type { GameAudio } from './audio';
import { createArena, type ArenaState } from './arena';
import { CastSystem, GhostTrail } from './casts';
import { ConfettiSystem, CourtGrid, OrbSystem, PopupSystem, RingSystem } from './effects';
import { FIELD_H, PADDLE_H, PADDLE_INSET, TRAIL_MAX } from './constants';
import { setPaddleBase } from './paddle';
import { ParticleSystem } from './particles';
import { ReplayRecorder } from './replay';
import { fieldResize } from './resize';
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
  TutorialState,
  Vec2,
  View
} from './types';
import { clamp } from './utils/math';
import { createView, toScreenX } from './view';

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
  /** One-shot skill animations. Presentation only - never read by physics. */
  readonly casts: CastSystem;
  /** The player paddle's afterimages, while a movement skill is running. */
  readonly ghosts: GhostTrail;
  /** Shockwaves left by hits, walls and goals. Presentation only. */
  readonly rings: RingSystem;
  /** Words that rise off a special return. Presentation only. */
  readonly popups: PopupSystem;
  /** The winning point's confetti, in screen space. Presentation only. */
  readonly confetti: ConfettiSystem;
  /** The court floor's rippling lattice. Presentation only. */
  readonly grid: CourtGrid;
  /** Points flying home to their score pips. Presentation only. */
  readonly orbs: OrbSystem;
  /** The last seconds of the point in play, for the match's closing replay. */
  readonly replay: ReplayRecorder;
  /** Bumpers, walls, wind and a boss's phase: the court as a rule. */
  readonly arena: ArenaState;
  readonly audio: GameAudio;
  /** The mode being played. Replaced whenever a new match is configured. */
  rules: MatchRules;
  /** Difficulty: speeds and sizes for this match. Never the player's doing. */
  tuning: Tuning;
  /**
   * Progression: the build this match is played with. Never the opponent's
   * doing. Usually {@link baseLoadout}; a Gauntlet match folds the run's
   * boons in, and a versus match plays with no build at all.
   */
  loadout: ResolvedLoadout;
  /** The player's own resolved build, as React last handed it over. */
  baseLoadout: ResolvedLoadout;
  /** What that build is doing right now. Lives for one match. */
  talents: TalentRuntime;
  botLoadout: ResolvedLoadout;
  botTalents: TalentRuntime;
  /** Gameplay decisions use their own stream; particles never consume it. */
  random: () => number;
  /** Colours from the player's equipped cosmetics. */
  theme: ResolvedTheme;
  /** The opponent's head. */
  botBrain: BotBrain;
  /** Drives the player's paddle during the attract-mode demo. */
  demoBrain: BotBrain;
  /** Effect strength, 1 normally and 0.25 for the game's Calm effects setting. */
  motion: number;
  /**
   * How far the camera may move - shake, kick and punch - from the player's
   * own setting. Applied where the camera is placed rather than where a
   * shake is raised, so nothing that raises one has to know it exists.
   */
  camera: number;
  /** Replay the point that decided the match before the result card. */
  replays: boolean;
  /** Start each point automatically, or wait for an explicit tap / key. */
  autoServe: boolean;
  tutorial: TutorialState | null;
  /** The player's name, for the card a match opens on. */
  playerName: string;
  /** Accumulator for trail sampling. */
  trailTick: number;
}

function createPaddle(side: Side): Paddle {
  return {
    equipment: { ...NEUTRAL_KIT },
    material: materialRuntime(),
    side,
    x: 0,
    y: FIELD_H / 2,
    vy: 0,
    target: FIELD_H / 2,
    half: PADDLE_H / 2,
    baseHalf: PADDLE_H / 2,
    scale: 1,
    grow: 1,
    flash: 0,
    hitY: 0
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
    owner: 'you',
    heft: 0
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
  brain.shot = 0;
  delete brain.previousFoeY;
}

function createMatch(rules: MatchRules): MatchState {
  return {
    waveDepth: 0,
    waveHits: 0,
    status: 'menu',
    resumeTo: 'play',
    resumeTimer: 0,
    mode: rules.mode,
    label: rules.label,
    serveTimer: 0,
    serveRequested: false,
    serveDir: 1,
    rally: 0,
    bestThisMatch: 0,
    points: 0,
    hits: 0,
    flicks: 0,
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
    flashHue: -1,
    comboIndex: -1,
    comboLabel: '',
    comboTimer: 0,
    castLabel: '',
    castTimer: 0,
    castHue: 0,
    castId: 0,
    kick: 0,
    shakeRot: 0,
    goalFlash: 0,
    goalSide: 'you',
    pipPopYou: 0,
    pipPopBot: 0,
    edgeCooldown: 0,
    bannerText: '',
    bannerSub: '',
    bannerHue: 0,
    bannerTimer: 0,
    burst: 0,
    burstX: 0,
    burstY: 0,
    punch: 0,
    pulseTick: 0,
    echoTick: 0,
    emberTick: 0,
    time: 0,
    rallyPop: 0,
    vsTimer: 0,
    vsLeft: '',
    vsRight: '',
    vsSub: '',
    celebrated: false,
    endFade: 0,
    flameTick: 0,
    gatherTick: 0,
    buzz: 0
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
    casts: new CastSystem(),
    ghosts: new GhostTrail(),
    rings: new RingSystem(),
    popups: new PopupSystem(),
    confetti: new ConfettiSystem(),
    grid: new CourtGrid(),
    orbs: new OrbSystem(),
    replay: new ReplayRecorder(),
    arena: createArena(),
    audio,
    rules,
    tuning: tuningFor(rules),
    loadout: DEFAULT_LOADOUT,
    baseLoadout: DEFAULT_LOADOUT,
    talents: createRuntime(),
    botLoadout: DEFAULT_LOADOUT,
    botTalents: createRuntime(),
    random: () => Math.random(),
    theme: DEFAULT_THEME,
    botBrain: createBrain(rules.bot),
    demoBrain: createBrain(botProfile('amateur')),
    motion,
    camera: 1,
    replays: true,
    autoServe: true,
    tutorial: null,
    playerName: 'You',
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
  if (k === 1 || !isFinite(k) || k <= 0) return;
  const before = world.view.w / k;
  const resize = fieldResize(before, world.view.w);
  const { ball } = world;
  [ball.vx, ball.vy] = resize.velocity(ball.x, ball.vx, ball.vy);
  ball.x = resize.x(ball.x);
  ball.px = resize.x(ball.px);
  normaliseBallSpeed(ball);
  for (const point of world.trail) point.x = resize.x(point.x);
  world.replay.resize(before, world.view.w);
}

/** Ask the device for a buzz of `ms`, merged with anything already asked for this frame. */
export function buzz(world: World, ms: number): void {
  if (world.match.status === 'menu') return;
  world.fx.buzz = Math.max(world.fx.buzz, ms);
}

export function addShake(world: World, amount: number): void {
  world.fx.shake = Math.min(18, world.fx.shake + amount * world.motion);
}

/**
 * A short shove of the camera along the field's long axis - the direction
 * the ball just went. Shake says something happened; the kick says which way.
 */
export function addKick(world: World, amount: number): void {
  const kick = world.fx.kick + amount * world.motion;
  world.fx.kick = Math.max(-14, Math.min(14, kick));
}

/**
 * Is a person holding this paddle? The player's always, outside the attract
 * demo - and in a versus match the other one too.
 */
export function isHuman(world: World, side: Side): boolean {
  if (world.match.status === 'menu') return false;
  return side === 'you' || world.rules.versus === true;
}

/**
 * Where a field point sits across the *screen*, -1 at the left edge to 1 at
 * the right, for stereo panning. Screen rather than field, because on an
 * upright phone the court's long axis runs top to bottom, and a return from
 * the far paddle comes from above rather than from one side.
 */
export function panAt(world: World, x: number, y: number): number {
  const { view } = world;
  if (view.vw <= 0) return 0;
  return clamp((toScreenX(view, x, y) / view.vw) * 2 - 1, -1, 1);
}

/** The hue a side is drawn in under the equipped theme. */
export function hueOf(world: World, side: Side): number {
  return sideHue(world.theme, side);
}

/** The ball's hue: its owner's colour, pulled towards hot in a long rally. */
export function ballHue(world: World): number {
  return heatHue(hueOf(world, world.ball.owner), world.fx.heat, world.theme.hotHue);
}
