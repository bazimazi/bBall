import type { BotProfile } from '../core/bots/types';
import type { MatchResult, ModeId } from '../core/modes/types';
import type { AbilityId, TalentId, TalentMatchStats } from '../core/talents/types';

export type Side = 'you' | 'bot';

/**
 * `menu` runs a silent attract-mode rally; `serve` holds the ball at centre.
 */
export type GameStatus = 'menu' | 'serve' | 'play' | 'paused' | 'over';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Paddle {
  readonly side: Side;
  /** Paddle centre, in field units. */
  x: number;
  y: number;
  vy: number;
  target: number;
  half: number;
  /**
   * The half-length this match started with. `half` is always
   * `baseHalf * scale * grow`, recomputed rather than mutated, so a shrinking
   * challenge and a lengthening ultimate can both be in play at once.
   */
  baseHalf: number;
  /** Lasting size change - the "melting" challenge eats into this. */
  scale: number;
  /** Momentary size change. Slipstream is the only thing that moves it. */
  grow: number;
  /** 0..1 hit highlight, decays every step. */
  flash: number;
}

/**
 * One computer player's short-term memory: when it last looked at the ball,
 * what it decided, and whether it misread the bounce. Kept apart from
 * {@link Paddle} so the same paddle can be driven by a person or a bot.
 */
export interface BotBrain {
  profile: BotProfile;
  /** Remaining reaction delay, in seconds. */
  wait: number;
  /** Has it committed to this approach? */
  aimed: boolean;
  /** Looks taken at the incoming ball; better bots correct themselves. */
  reads: number;
  maxReads: number;
  /** True when this approach was misjudged - a believable, human whiff. */
  misread: boolean;
}

export interface Ball {
  x: number;
  y: number;
  /** Position at the start of the current step, used by the swept test. */
  px: number;
  py: number;
  vx: number;
  vy: number;
  speed: number;
  squash: number;
  squashAngle: number;
  /** Who touched it last; tints the glow and the trail. */
  owner: Side;
}

/**
 * Speed and size limits for the current match.
 *
 * Everything here is *difficulty*: the opponent's rank and the mode's
 * modifiers, and nothing else. The player's own capability lives in
 * {@link World.loadout}, so the two can never quietly leak into each other.
 */
export interface Tuning {
  serveSpeed: number;
  maxSpeed: number;
  /** Multiplier applied to the ball's speed on every return. */
  speedPerHit: number;
  /** Serve speed added per point played, capped at ten points in. */
  perPoint: number;
  /** Fraction of the player's paddle lost per return. 0 for most modes. */
  shrinkPerHit: number;
}

/** One equipped active ability's live state. */
export interface AbilitySlot {
  id: AbilityId | null;
  /** Seconds until it can be used again. 0 means ready. */
  cooldown: number;
  /** The full cooldown it is counting down from, for the HUD ring. */
  span: number;
}

/**
 * Everything a build does *during* one match.
 *
 * Reset on every serve-up, never persisted, and owned entirely by the
 * simulation - the UI reads a flattened view of it and nothing else.
 */
export interface TalentRuntime {
  /** Returns since the last conceded point. Feeds Combo Drive family. */
  drive: number;
  bestDrive: number;
  /** Returns within the current rally. Feeds Momentum and Flow State. */
  rallyReturns: number;
  /**
   * Ball speed this build has *added* on top of the plain return, in field
   * units. Most of it bleeds off when the opponent returns the ball, so pace
   * is an attack rather than something the player also has to survive.
   */
  surge: number;

  /** Seconds left on each timed paddle buff. */
  adrenaline: number;
  guard: number;
  strikeRush: number;
  edgeRecovery: number;
  /** Which wall the paddle was last parked against, so it fires once. */
  edgeSide: -1 | 0 | 1;

  /** Shield charges in hand, and the countdown to the next one. */
  shield: number;
  shieldMax: number;
  shieldTimer: number;
  /** Bulwark hands back at most one charge per point. */
  guardShielded: boolean;
  secondChances: number;

  /** Seconds the next return stays charged by Power Strike. */
  strikeArmed: number;
  /** Seconds left on the Perfect Guard window. */
  guardWindow: number;
  /** Seconds left of the dash's visual streak, and where it started. */
  dashFx: number;
  dashFrom: number;

  /** Capstones. Overload counts returns; the rest count down seconds. */
  overload: number;
  slipstream: number;
  aegis: number;
  /** Balls Aegis has left to save inside its window. */
  aegisSaves: number;
  /** Points Zenith may still refund. Per match, not per casting. */
  zenithRefunds: number;
  zenith: number;
  echo: number;

  slots: AbilitySlot[];
  stats: {
    abilitiesUsed: number;
    powerStrikes: number;
    dashes: number;
    perfectGuards: number;
    crits: number;
    shieldSaves: number;
    secondChances: number;
    ultimates: number;
  };
}

/** One ability, flattened for the HUD. */
export interface AbilityView {
  readonly id: AbilityId;
  readonly name: string;
  /** The talent behind it; the HUD draws its icon. */
  readonly talent: TalentId;
  readonly ready: boolean;
  /** 0 when just used, 1 when ready. Quantised, so React re-renders rarely. */
  readonly progress: number;
  /** True while the ability's own effect is running. */
  readonly active: boolean;
  /** A branch capstone. The HUD frames these differently. */
  readonly ultimate: boolean;
  /** The skill's identity colour. Shared with the aura on the paddle. */
  readonly hue: number;
  /** Whole seconds of cooldown left. 0 when ready, so the HUD can print it. */
  readonly cooldownLeft: number;
  /** Seconds of the effect still running, and the window it started with.
   *  Both 0 for a skill whose effect is counted in uses rather than time. */
  readonly remain: number;
  readonly duration: number;
  /** Uses left of the effect, and the number it started with. Both 0 for a
   *  skill that is purely timed. */
  readonly charges: number;
  readonly maxCharges: number;
}

export type { TalentMatchStats };

export interface MatchState {
  status: GameStatus;
  /** Which status a resume returns to. */
  resumeTo: Extract<GameStatus, 'play' | 'serve'>;
  mode: ModeId;
  /** Short title for the HUD and result card. */
  label: string;
  serveTimer: number;
  serveDir: 1 | -1;
  rally: number;
  bestThisMatch: number;
  /** Points played this match; drives serve speed. */
  points: number;
  /** Returns the player has hit this match. */
  hits: number;
  /** Seconds of active play, for stats and the result card. */
  elapsed: number;
  score: Record<Side, number>;
  /** Points needed to win. 0 in modes that never end on score. */
  winScore: number;
  /** Largest deficit the player has faced this match; drives "comeback". */
  deficit: number;
  /** Misses left. 0 when the mode does not use lives. */
  lives: number;
  maxLives: number;
  winner: Side | null;
  /** Delay before the result is published. */
  overTimer: number;
  overShown: boolean;
  /** The finished match, published once when it ends. */
  result: MatchResult | null;
  /** Increments with every published result, so the UI can react exactly once. */
  resultId: number;
}

/** Presentation-only state: camera, colour heat and banners. */
export interface FxState {
  heat: number;
  timeScale: number;
  freeze: number;
  shake: number;
  shakeX: number;
  shakeY: number;
  flash: number;
  /**
   * The colour of the screen flash, or -1 for the plain white one.
   *
   * A capstone flashes the whole viewport in its own hue - that, more than
   * anything else on screen, is what makes an ultimate read as an ultimate
   * even when the player's eyes are on the ball.
   */
  flashHue: number;
  comboIndex: number;
  comboLabel: string;
  comboTimer: number;
  /** A capstone's name, banner countdown and hue. Ultimates only. */
  castLabel: string;
  castTimer: number;
  castHue: number;
  /**
   * Bumped once per capstone cast.
   *
   * The React chrome keys its own page-wide flare off this, because the HUD
   * and the ability bar sit above the canvas and would otherwise be the only
   * two things on screen an ultimate left untouched.
   */
  castId: number;
  /** Seconds left of the viewport-wide wave, and where it started from. */
  burst: number;
  burstX: number;
  burstY: number;
  /** 0..1 camera zoom impulse. A capstone is the only thing that sets it. */
  punch: number;
  /** Clock the repeating skill flourishes beat against, and their last beat. */
  pulseTick: number;
  echoTick: number;
  emberTick: number;
  /** Seconds of simulated time since load; drives idle pulses. */
  time: number;
}

/** Field size plus the transform that maps field space onto the screen. */
export interface View {
  /** Field units. */
  w: number;
  h: number;
  /** Court centre, in CSS pixels. */
  cx: number;
  cy: number;
  scale: number;
  rotated: boolean;
  dpr: number;
  /** Viewport, in CSS pixels. */
  vw: number;
  vh: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  drag: number;
  color: string;
  alive: boolean;
}

/**
 * One paddle afterimage.
 *
 * Sampled only while a movement skill is running, so a paddle that is merely
 * being steered never smears - the trail *is* the skill.
 */
export interface Ghost {
  y: number;
  half: number;
  age: number;
  alive: boolean;
}

export interface EmitOptions {
  /** Emission direction in radians; omitted means a full circle. */
  angle?: number;
  spread?: number;
  speed: number;
  life: number;
  size: number;
  color: string;
  drag?: number;
}

/** The slice of engine state the React layer renders. */
export interface GameSnapshot {
  status: GameStatus;
  mode: ModeId;
  label: string;
  scoreYou: number;
  scoreBot: number;
  winScore: number;
  bestThisMatch: number;
  lives: number;
  maxLives: number;
  winner: Side | null;
  muted: boolean;
  /** True while the in-game pause button should be offered. */
  canPause: boolean;
  /** The objective line for challenge and cup matches, if any. */
  objective: string | null;
  /**
   * The equipped abilities. The array is rebuilt only when what it shows
   * changes, so the HUD re-renders on state changes rather than per frame.
   */
  abilities: readonly AbilityView[];
  /**
   * The capstone cue, flattened into scalars.
   *
   * Scalars rather than an object because the snapshot is diffed field by
   * field: a fresh object every frame would re-render the whole chrome sixty
   * times a second for a value that changes twice a match.
   */
  ultimateCastId: number;
  ultimateHue: number;
  /** True while some capstone's effect is still running. */
  ultimateActive: boolean;
  result: MatchResult | null;
  resultId: number;
}
