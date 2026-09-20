import { FIELD_H, MAX_PADDLE_SCALE, MIN_PADDLE_SCALE, PADDLE_H } from './constants';
import type { Paddle } from './types';
import { clamp } from './utils/math';

/**
 * How long a paddle is.
 *
 * Its own module because three layers need it - the world builds paddles, the
 * physics shrinks them, and the talent runtime stretches them - and routing
 * that through `world.ts` would make those three import each other in a ring.
 *
 * `half` is always derived from its parts rather than edited in place, so a
 * challenge that eats the paddle away and a capstone that lengthens it can be
 * in play at the same time without either losing track of the other.
 */

export function resizePaddle(paddle: Paddle): void {
  const floor = (PADDLE_H / 2) * MIN_PADDLE_SCALE;
  const ceiling = (PADDLE_H / 2) * MAX_PADDLE_SCALE;
  paddle.half = clamp(paddle.baseHalf * paddle.scale * paddle.grow, floor, ceiling);
  // A paddle that just grew can overhang a wall; pull its centre back in.
  paddle.y = clamp(paddle.y, paddle.half, FIELD_H - paddle.half);
  paddle.target = clamp(paddle.target, paddle.half, FIELD_H - paddle.half);
}

/** Set the length this match starts at, and clear anything layered on top. */
export function setPaddleBase(paddle: Paddle, scale: number): void {
  paddle.baseHalf = (PADDLE_H / 2) * scale;
  paddle.scale = 1;
  paddle.grow = 1;
  resizePaddle(paddle);
}

/** Shrink a paddle a notch, never below a playable minimum. */
export function shrinkPaddle(paddle: Paddle, fraction: number): void {
  paddle.scale = Math.max(0.05, paddle.scale * (1 - fraction));
  resizePaddle(paddle);
}

/** Lengthen a paddle by a fraction, or back to normal with 0. */
export function growPaddle(paddle: Paddle, fraction: number): void {
  const grow = 1 + Math.max(0, fraction);
  if (paddle.grow === grow) return;
  paddle.grow = grow;
  resizePaddle(paddle);
}
