import type { BotProfile } from '../core/bots/types';
import type { MatchResult, ModeId } from '../core/modes/types';
import type { AbilityId, TalentMatchStats } from '../core/talents/types';

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
  /** The half-length this match started with; `half` may shrink from it. */
  baseHalf: number;
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

  slots: AbilitySlot[];
  stats: {
    abilitiesUsed: number;
    powerStrikes: number;
    dashes: number;
    perfectGuards: number;
    crits: number;
    shieldSaves: number;
    secondChances: number;
  };
}

/** One ability, flattened for the HUD. */
export interface AbilityView {
  readonly id: AbilityId;
  readonly name: string;
  readonly glyph: string;
  readonly ready: boolean;
  /** 0 when just used, 1 when ready. Quantised, so React re-renders rarely. */
  readonly progress: number;
  /** True while the ability's own effect is running. */
  readonly active: boolean;
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
  comboIndex: number;
  comboLabel: string;
  comboTimer: number;
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
  result: MatchResult | null;
  resultId: number;
}
