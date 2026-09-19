import { BALL_R, FIELD_H, MAX_SPEED, SERVE_SPEED } from './constants';
import { movePaddle } from './physics';
import type { Paddle } from './types';
import { clamp, lerp } from './utils/math';
import type { World } from './world';

/**
 * Bot skill ramps over the match, with a light rubber band for tension.
 *
 * It is deliberately capped well below perfect: if the bot's aim error ever
 * fell inside its own paddle it could never miss, and two flawless players
 * produce a rally that never ends and a match that never finishes.
 */
export function botSkill(world: World): number {
  const { match } = world;
  if (match.status === 'menu') return 0.62;
  const progress = clamp(match.points / 8, 0, 1);
  const chase = clamp((match.score.you - match.score.bot) * 0.05, -0.05, 0.1);
  return clamp(0.3 + progress * 0.4 + chase, 0.25, 0.8);
}

/** Where the ball will cross a given x, accounting for wall bounces. */
export function predictY(world: World, targetX: number): number {
  const { ball } = world;
  if (Math.abs(ball.vx) < 1) return ball.y;
  const t = (targetX - ball.x) / ball.vx;
  if (t <= 0) return ball.y;

  const span = FIELD_H - BALL_R * 2;
  let m = (ball.y + ball.vy * t - BALL_R) % (span * 2);
  if (m < 0) m += span * 2;
  if (m > span) m = span * 2 - m;
  return m + BALL_R;
}

/**
 * Triangular spread - usually close, occasionally badly off, like a person.
 *
 * It widens as the ball speeds up so a long rally gets harder for the bot too,
 * which is what stops high-level rallies from running on forever.
 */
function aimError(world: World, skill: number): number {
  const fast = clamp((world.ball.speed - SERVE_SPEED) / (MAX_SPEED - SERVE_SPEED), 0, 1);
  const spread = lerp(104, 72, clamp((skill - 0.3) / 0.5, 0, 1)) * (0.8 + 0.75 * fast);
  return (Math.random() + Math.random() - 1) * spread;
}

/** Drive one paddle under computer control. Used by the bot and attract mode. */
export function driveAi(world: World, paddle: Paddle, dt: number, skill: number): void {
  const { ball, match } = world;
  const incoming = paddle.side === 'bot' ? ball.vx > 0 : ball.vx < 0;

  if (incoming && match.status !== 'serve') {
    if (!paddle.aimed) {
      paddle.wait -= dt;
      if (paddle.wait <= 0) {
        // Offset the paddle so the ball strikes off-centre and the return is
        // placed into whichever half the opponent has left open.
        const foe = paddle.side === 'bot' ? world.player : world.bot;
        const away = foe.y < FIELD_H / 2 ? 1 : -1;
        const place = away * (0.3 + skill * 0.55);
        const cross = predictY(world, paddle.x);
        paddle.target = clamp(
          cross - place * paddle.half + aimError(world, skill),
          paddle.half,
          FIELD_H - paddle.half
        );
        paddle.aimed = true;
      }
    }
  } else {
    // Drift back towards the middle while the ball is away.
    paddle.aimed = false;
    paddle.wait = 0.24 - skill * 0.17;
    paddle.target = lerp(paddle.target, FIELD_H / 2, Math.min(1, dt * 1.6));
  }

  movePaddle(paddle, dt, 520 + skill * 420);
}
