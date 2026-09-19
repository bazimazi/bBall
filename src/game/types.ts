export type Side = 'you' | 'bot';

/**
 * `menu` runs a silent attract-mode rally; `serve` holds the ball at centre.
 */
export type GameStatus = 'menu' | 'serve' | 'play' | 'paused' | 'over';

/** Which overlay card the UI should show, if any. */
export type PanelName = 'start' | 'pause' | 'over' | null;

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
  /** 0..1 hit highlight, decays every step. */
  flash: number;
  /** Bot only: has it committed to this approach? */
  aimed: boolean;
  /** Bot only: remaining reaction delay, in seconds. */
  wait: number;
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

export interface MatchState {
  status: GameStatus;
  /** Which status a resume returns to. */
  resumeTo: Extract<GameStatus, 'play' | 'serve'>;
  serveTimer: number;
  serveDir: 1 | -1;
  rally: number;
  best: number;
  bestThisMatch: number;
  /** Points played this match; drives serve speed and bot skill. */
  points: number;
  score: Record<Side, number>;
  winner: Side | null;
  newBest: boolean;
  /** Delay before the game-over card appears. */
  overTimer: number;
  overShown: boolean;
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
  panel: PanelName;
  scoreYou: number;
  scoreBot: number;
  best: number;
  bestThisMatch: number;
  newBest: boolean;
  winner: Side | null;
  muted: boolean;
  /** True while the in-game pause button should be offered. */
  canPause: boolean;
}
