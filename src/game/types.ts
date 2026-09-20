import type { BotProfile } from '../core/bots/types';
import type { MatchResult, ModeId } from '../core/modes/types';

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

/** Speed and size limits for the current match, after mode modifiers. */
export interface Tuning {
  serveSpeed: number;
  maxSpeed: number;
  /** Multiplier applied to the ball's speed on every return. */
  speedPerHit: number;
  /** Fraction of the player's paddle lost per return. 0 for most modes. */
  shrinkPerHit: number;
}

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
  result: MatchResult | null;
  resultId: number;
}
