import { BALL_R, PADDLE_INSET, PADDLE_W } from './constants';

/** The ball centre's contact plane; paddle geometry stays fixed during a resize. */
const FACE = PADDLE_INSET + PADDLE_W / 2 + BALL_R;

/**
 * Stretch the space between contact planes, retaining each fixed end zone.
 * A ball awaiting contact stays in front; a ball already missed stays behind.
 */
export function fieldResize(before: number, after: number) {
  const right = before - FACE;
  const scale = (after - 2 * FACE) / (before - 2 * FACE);
  return {
    x: (x: number): number => {
      if (x <= FACE) return x;
      if (x >= right) return x + (after - before);
      return FACE + (x - FACE) * scale;
    },
    velocity: (x: number, vx: number, vy: number): readonly [number, number] => {
      if (x < FACE || x > right || scale === 1) return [vx, vy];
      const speed = Math.hypot(vx, vy);
      if (speed === 0) return [vx, vy];
      const stretched = vx * scale;
      const gain = speed / Math.hypot(stretched, vy);
      return [stretched * gain, vy * gain];
    }
  };
}
