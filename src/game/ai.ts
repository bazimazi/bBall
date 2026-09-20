import type { BotProfile } from '../core/bots/types';
import { BALL_R, FIELD_H } from './constants';
import { movePaddle } from './physics';
import type { BotBrain, Paddle } from './types';
import { clamp, lerp } from './utils/math';
import type { World } from './world';

/**
 * Bot behaviour.
 *
 * Every bot plays by exactly the same rules as the player: one paddle, a
 * speed limit lower than the player's, and no knowledge the ball does not
 * give it. Difficulty is entirely a matter of *how it uses that information* -
 * how long it takes to look, how well it reads a bounce, how tidily it moves,
 * and how much of that falls apart when the ball is fast.
 *
 * That also means every bot stays beatable: a return placed wide enough that
 * the paddle cannot physically cross the court in time always scores.
 */

/** How fast the ball is, 0..1, relative to this match's limits. */
function pace(world: World): number {
  const { serveSpeed, maxSpeed } = world.tuning;
  const span = Math.max(1, maxSpeed - serveSpeed);
  return clamp((world.ball.speed - serveSpeed) / span, 0, 1);
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

/** The same crossing, as read by someone who has not seen the wall coming. */
function naiveY(world: World, targetX: number): number {
  const { ball } = world;
  if (Math.abs(ball.vx) < 1) return ball.y;
  const t = (targetX - ball.x) / ball.vx;
  if (t <= 0) return ball.y;
  return clamp(ball.y + ball.vy * t, BALL_R, FIELD_H - BALL_R);
}

/**
 * How much a long rally is telling on the bot.
 *
 * Concentration slips as a rally drags on, and it slips fastest for the bots
 * with the least composure. This is what makes a rally between two strong
 * players end: without it, a bot whose aim error is smaller than its own
 * paddle could never miss, and the point would run forever.
 *
 * The endless-mode wall is exempt - it is a practice partner, not a rival.
 */
function stress(world: World, profile: BotProfile): number {
  if (profile.assist > 0) return 0;
  const long = clamp((world.match.rally - 6) / 16, 0, 3);
  return long * (1 - profile.pressure * 0.7);
}

/** 0 when the ball has just left the far paddle, 1 when it arrives. */
function approach(world: World, paddle: Paddle): number {
  const span = Math.max(1, world.view.w);
  return clamp(1 - Math.abs(paddle.x - world.ball.x) / span, 0, 1);
}

/**
 * Triangular spread - usually close, occasionally badly off, like a person.
 * It widens with ball speed, and a bot with low `pressure` suffers far more
 * from that than a composed one.
 */
function aimError(world: World, brain: BotBrain, fast: number, correcting: boolean): number {
  const p = brain.profile;
  const tired = stress(world, p);
  const spread =
    p.aimError *
    (1 + (1 - p.pressure) * fast * 1.3) *
    (1 + tired) *
    (brain.misread ? 1.7 : 1) *
    // A second look tidies the read up, but a tired bot tidies it up less.
    (correcting ? Math.min(1, 0.45 + tired * 0.18) : 1);
  return (Math.random() + Math.random() - 1) * spread;
}

/** Start the clock on a fresh approach. Fast balls are noticed later. */
function armReaction(world: World, brain: BotBrain, fast: number): void {
  const p = brain.profile;
  brain.wait =
    p.reaction *
    (1 + (1 - p.pressure) * fast * 0.9) *
    (1 + stress(world, p) * 0.25) *
    (0.85 + Math.random() * 0.3);
  brain.aimed = false;
  brain.reads = 0;
  brain.misread = false;
}

/**
 * Commit to a spot on the paddle's line.
 *
 * The read blends a straight-line guess with the true bounce-aware crossing:
 * a weak bot mostly sees the straight line and is fooled by walls, a strong
 * one sees nearly all of the bounce. A second or third look, which only the
 * better bots take, narrows the error rather than removing it.
 */
function decide(
  world: World,
  paddle: Paddle,
  brain: BotBrain,
  fast: number,
  correcting: boolean
): void {
  const p = brain.profile;
  if (!correcting) brain.misread = Math.random() > p.consistency;

  const exact = predictY(world, paddle.x);
  const naive = naiveY(world, paddle.x);
  const quality = clamp(p.prediction * (brain.misread ? 0.3 : 1) + (correcting ? 0.3 : 0), 0, 1);
  const cross = lerp(naive, exact, quality);

  // Offset the paddle so the ball strikes off-centre and the return is placed
  // into whichever half the opponent has left open.
  const foe = paddle.side === 'bot' ? world.player : world.bot;
  const away = foe.y < FIELD_H / 2 ? 1 : -1;
  const place = away * (0.25 + p.placement * 0.6);

  paddle.target = clamp(
    cross - place * paddle.half + aimError(world, brain, fast, correcting),
    paddle.half,
    FIELD_H - paddle.half
  );
  brain.aimed = true;
  brain.reads++;
}

/** Where to wait while the ball is at the other end. */
function restingSpot(world: World, paddle: Paddle, brain: BotBrain): number {
  const centre = FIELD_H / 2;
  const p = brain.profile;
  // A composed bot drifts towards the side the ball is on; a weak one just
  // wanders back to the middle, late.
  const anticipated = centre + (world.ball.y - centre) * 0.3;
  return clamp(lerp(centre, anticipated, p.recovery), paddle.half, FIELD_H - paddle.half);
}

/**
 * Move towards the committed target, ignoring corrections smaller than the
 * bot's deadzone. That slack is what makes a weak bot look fidgety and a
 * strong one look settled - and it is why no bot ends up welded to the ball.
 */
function travel(paddle: Paddle, brain: BotBrain, dt: number, speed: number): void {
  const wanted = paddle.target;
  if (Math.abs(wanted - paddle.y) < brain.profile.deadzone) paddle.target = paddle.y;
  movePaddle(paddle, dt, speed);
  paddle.target = wanted;
}

/** Drive one paddle under computer control. Used by the bot and attract mode. */
export function driveAi(world: World, paddle: Paddle, brain: BotBrain, dt: number): void {
  const { ball, match } = world;
  const p = brain.profile;
  const incoming = paddle.side === 'bot' ? ball.vx > 0 : ball.vx < 0;
  const fast = pace(world);

  if (!incoming || match.status === 'serve') {
    // Recovery: reset the read and slide back to a useful waiting spot.
    if (brain.aimed || brain.reads > 0) armReaction(world, brain, fast);
    const rest = restingSpot(world, paddle, brain);
    paddle.target = lerp(paddle.target, rest, Math.min(1, dt * (1.1 + p.recovery * 2.6)));
    travel(paddle, brain, dt, p.speed * (0.5 + 0.45 * p.recovery));
    return;
  }

  brain.wait -= dt;
  if (brain.wait <= 0) {
    const progress = approach(world, paddle);
    if (!brain.aimed) {
      decide(world, paddle, brain, fast, false);
    } else if (brain.reads < brain.maxReads && progress > 0.45 + brain.reads * 0.18) {
      decide(world, paddle, brain, fast, true);
    }

    // Endless mode only: the wall keeps the rally alive with a little extra
    // reach once the ball is nearly on it. Competitive bots have assist 0.
    if (p.assist > 0 && progress > 0.7) {
      paddle.target = lerp(
        paddle.target,
        predictY(world, paddle.x),
        Math.min(1, dt * 8 * p.assist)
      );
    }
  }

  travel(paddle, brain, dt, p.speed);
}
