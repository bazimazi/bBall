import { BALL_R, FIELD_H } from './constants';
import { clamp } from './utils/math';
import type { Ball } from './types';
import type { BumperState } from './arena';

/** Shared physical contact; no particles, sound, AI or random decisions. */
export function bounceBumper(
  ball: Ball,
  bumper: Pick<BumperState, 'x' | 'y' | 'r'>,
  maxSpeed: number
): { nx: number; ny: number } | null {
  const dx = ball.x - bumper.x,
    dy = ball.y - bumper.y,
    min = bumper.r + BALL_R;
  const d = Math.hypot(dx, dy);
  if (d >= min || d < 0.001) return null;
  const nx = dx / d,
    ny = dy / d,
    dot = ball.vx * nx + ball.vy * ny;
  if (dot >= 0) return null;
  ball.vx -= 2 * dot * nx;
  ball.vy -= 2 * dot * ny;
  ball.x = bumper.x + nx * (min + 0.5);
  ball.y = clamp(bumper.y + ny * (min + 0.5), BALL_R, FIELD_H - BALL_R);
  ball.speed = Math.min(maxSpeed, ball.speed * 1.035);
  if (Math.abs(ball.vx) < 1) ball.vx = nx >= 0 ? 1 : -1;
  const angle = clamp(Math.atan2(ball.vy, Math.abs(ball.vx)), -1.12, 1.12);
  ball.vx = Math.sign(ball.vx) * Math.cos(angle) * ball.speed;
  ball.vy = Math.sin(angle) * ball.speed;
  return { nx, ny };
}
