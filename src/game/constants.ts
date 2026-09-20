/**
 * Tuning constants for the simulation.
 *
 * Every length is expressed in "field units": the simulation always runs in a
 * landscape field whose short axis is exactly {@link FIELD_H} units, so the
 * game plays identically on every device.
 */

/** Field units across the short axis. Constant on every screen. */
export const FIELD_H = 600;
/** The field never gets squarer than this... */
export const MIN_ASPECT = 1.25;
/** ...nor longer, so wide screens stay fair. */
export const MAX_ASPECT = 2.15;

export const BALL_R = 11;
export const PADDLE_W = 16;
export const PADDLE_H = 108;
/** Challenge modifiers may shrink a paddle, but never past this fraction. */
export const MIN_PADDLE_SCALE = 0.42;
/** Paddle centre distance from the field edge. */
export const PADDLE_INSET = 46;
/** Field units per second. */
export const PADDLE_MAX_SPEED = 1550;
export const KEY_SPEED = 1080;

export const SERVE_SPEED = 470;
/** Serve speed grows a little every point... */
export const SPEED_PER_POINT = 17;
/** ...and a little more on every rally hit. */
export const SPEED_PER_HIT = 1.045;
export const MAX_SPEED = 1180;
/** Radians off the long axis (~53 degrees). */
export const MAX_BOUNCE_ANGLE = 0.92;
export const SPIN_INFLUENCE = 0.26;

/** Seconds the ball hovers at centre before launch. */
export const SERVE_DELAY = 0.8;
export const FIXED_DT = 1 / 120;
export const MAX_FRAME_DT = 0.25;
/** Safety valve: never run more than this many physics steps per frame. */
export const MAX_STEPS_PER_FRAME = 40;

export const COMBO_STEPS = [
  { at: 5, label: 'NICE' },
  { at: 10, label: 'HEATING UP' },
  { at: 16, label: 'ON FIRE' },
  { at: 24, label: 'UNREAL' }
] as const;

export const TRAIL_MAX = 20;
export const PARTICLE_MAX = 320;

export const STORAGE_KEYS = {
  muted: 'bball.muted'
} as const;
