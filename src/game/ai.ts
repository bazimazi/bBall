import { forecast } from './trajectory';
import { previewReturn } from './talents';
import { contactAngle } from '../core/equipment/catalog';
import { returnPace } from './returnPace';
import { fireAbility } from './abilities';
import { combatant } from './combatant';
import type { BotProfile } from '../core/bots/types';
import { arenaNonLinear, brickAt, wallFor } from './arena';
import { BALL_R, FIELD_H } from './constants';
import { movePaddle } from './physics';
import type { BotBrain, Paddle, Vec2 } from './types';
import { clamp, lerp } from './utils/math';
import type { World } from './world';

/**
 * Bot behaviour.
 *
 * Every bot plays by exactly the same rules as the player: one paddle, a
 * visible travel limit, and no knowledge the ball does not
 * give it. Difficulty is entirely a matter of *how it uses that information* -
 * how long it takes to look, how well it reads a bounce, how tidily it moves,
 * and how much of that falls apart when the ball is fast.
 *
 * That also means every bot stays beatable: a return placed wide enough that
 * the paddle cannot physically cross the court in time always scores.
 */

/**
 * How fast the ball is relative to this match's limits: 0 at the serve, 1 at
 * the top speed - and past 1 for a ball driven *over* the top speed, which
 * only a Power build can do. A ball faster than anything the match normally
 * throws is harder to handle than one merely at the limit; without that,
 * pace past the ceiling was pace nobody noticed.
 */
function pace(world: World): number {
  const { serveSpeed, maxSpeed } = world.tuning;
  const span = Math.max(1, maxSpeed - serveSpeed);
  return clamp((world.ball.speed - serveSpeed) / span, 0, OVER_PACE);
}

/** How much harder than "at the limit" an over-the-limit ball may get. */
const OVER_PACE = 1.5;

/** Forecasts use the shared physical geometry and copied hazard state. */
const simulate = forecast;

const simCount = { n: 0 };

/** Where the ball will cross a given x, accounting for wall bounces. */
export function predictY(world: World, targetX: number): number {
  const { ball } = world;
  if (Math.abs(ball.vx) < 1) return ball.y;
  if (arenaNonLinear(world)) {
    if ((targetX - ball.x) * ball.vx <= 0) return ball.y;
    return simulate(world, targetX);
  }
  const t = (targetX - ball.x) / ball.vx;
  if (t <= 0) return ball.y;

  const span = FIELD_H - BALL_R * 2;
  let m = (ball.y + ball.vy * t - BALL_R) % (span * 2);
  if (m < 0) m += span * 2;
  if (m > span) m = span * 2 - m;
  return m + BALL_R;
}

/**
 * The ball's path to a given x, as the corners it will turn: its position
 * now, every wall it will bounce off, and where it crosses `targetX`.
 * Written into `out` (reused, so the renderer never allocates); returns the
 * number of points, 0 when the ball is not heading that way.
 *
 * The same straight-line-and-mirror model as {@link predictY}, so a path
 * drawn from this ends exactly where a dash or a bot would aim.
 */
export function tracePath(world: World, targetX: number, out: Vec2[]): number {
  const { ball } = world;
  if (Math.abs(ball.vx) < 1) return 0;
  let t = (targetX - ball.x) / ball.vx;
  if (t <= 0) return 0;
  if (arenaNonLinear(world)) {
    simulate(world, targetX, out, simCount);
    return simCount.n;
  }

  const top = BALL_R;
  const bottom = FIELD_H - BALL_R;
  let x = ball.x;
  let y = ball.y;
  let vy = ball.vy;
  let n = 0;
  const put = (px: number, py: number) => {
    const point = out[n] ?? (out[n] = { x: 0, y: 0 });
    point.x = px;
    point.y = py;
    n++;
  };

  put(x, y);
  // A ball can only bounce so many times on the way across; the cap is a
  // guard against a pathological near-vertical ball, not a real limit.
  for (let bounce = 0; bounce < 12; bounce++) {
    const wall = vy > 0 ? bottom : vy < 0 ? top : Number.NaN;
    const hit = Number.isNaN(wall) ? Infinity : (wall - y) / vy;
    if (hit >= t) break;
    x += ball.vx * hit;
    y = wall;
    vy = -vy;
    t -= hit;
    put(x, y);
  }
  put(targetX, clamp(y + vy * t, top, bottom));
  return n;
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
  const long = clamp((world.match.rally - 10) / 24, 0, profile.rank >= 4 ? 0.35 : 1.2);
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
    // A heavy return is harder to read than its speed alone would make it.
    (1 + Math.min(0.8, world.ball.heft)) *
    // A second look tidies the read up, but a tired bot tidies it up less.
    (correcting ? Math.min(1, 0.65 + tired * 0.18) : 1);
  return (world.random() + world.random() - 1) * spread;
}

/** Start the clock on a fresh approach. Fast balls are noticed later. */
function armReaction(world: World, brain: BotBrain, fast: number): void {
  const p = brain.profile;
  brain.wait =
    p.reaction *
    (1 + (1 - p.pressure) * fast * 0.9) *
    (1 + stress(world, p) * 0.25) *
    (0.85 + world.random() * 0.3);
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
  if (!correcting) brain.misread = world.random() > p.consistency;

  const exact = predictY(world, paddle.x);
  const naive = naiveY(world, paddle.x);
  const quality = clamp(p.prediction * (brain.misread ? 0.3 : 1) + (correcting ? 0.3 : 0), 0, 1);
  const cross = lerp(naive, exact, quality);

  // Offset the paddle so the ball strikes off-centre and the return is placed
  // into whichever half the opponent has left open.
  const foe = paddle.side === 'bot' ? world.player : world.bot;
  const away = foe.y < FIELD_H / 2 ? 1 : -1;
  const place =
    p.rank >= 3 && p.assist === 0
      ? chooseShot(world, paddle, brain, cross)
      : away * (0.25 + p.placement * 0.6);

  paddle.target = clamp(
    cross - place * paddle.half + aimError(world, brain, fast, correcting),
    paddle.half,
    FIELD_H - paddle.half
  );
  brain.aimed = true;
  brain.reads++;
  brain.wait = p.reaction * 0.7;
  if (paddle.side === 'bot' && world.match.status === 'play' && p.assist === 0)
    chooseSkill(world, brain, cross);
}

function chooseShot(world: World, paddle: Paddle, brain: BotBrain, cross: number): number {
  const foe = paddle.side === 'bot' ? world.player : world.bot;
  const p = brain.profile;
  const personality = p.personality ?? 'opportunist';
  const direction = paddle.side === 'bot' ? -1 : 1;
  let best = 0,
    score = -Infinity;
  for (const offset of [-0.86, -0.5, 0, 0.5, 0.86]) {
    const response = previewReturn(combatant(world, paddle.side), offset);
    const speed = returnPace(world, paddle, response, offset).speed;
    const angle = contactAngle(response.off, speed, paddle.vy, response.spin, response.angleLimit);
    const vx = direction * Math.cos(angle) * speed,
      vy = Math.sin(angle) * speed;
    const projected: World = {
      ...world,
      ball: {
        ...world.ball,
        x: paddle.x + direction * (BALL_R + 8),
        y: cross,
        speed,
        vx,
        vy,
        owner: paddle.side
      },
      talents: {
        ...world.talents,
        swerveDir:
          paddle.side === 'you' && world.loadout.effects.swerve > 0 ? (vy >= 0 ? 1 : -1) : 0
      },
      botTalents: {
        ...world.botTalents,
        swerveDir:
          paddle.side === 'bot' && world.botLoadout.effects.swerve > 0 ? (vy >= 0 ? 1 : -1) : 0
      }
    };
    const landing = predictY(projected, foe.x);
    const time = Math.abs(foe.x - paddle.x) / Math.max(1, Math.abs(vx));
    const observed = brain.previousFoeY ?? foe.y;
    const anticipated = clamp(foe.y + (foe.y - observed) * 0.4, foe.half, FIELD_H - foe.half);
    let value = Math.abs(landing - anticipated) / Math.max(0.2, time) + (world.random() - 0.5) * 60;
    // A sequence of opposite placements stretches recovery; anchoring favors safer contacts.
    if (p.rank >= 4 && Math.sign(offset) !== Math.sign(brain.shot ?? 0)) value += 45;
    if (personality === 'anchor') value -= Math.abs(offset) * 65;
    if (personality === 'aggressor') value += Math.abs(offset) * 55;
    if (personality === 'banker')
      value +=
        Math.abs(Math.sin(angle) * world.view.w + cross - FIELD_H / 2) > FIELD_H / 2 ? 100 : -50;
    if (personality === 'curver') value += Math.abs(offset) < 0.6 ? 80 : -30;
    if (personality === 'disruptor' && Math.sign(offset) === Math.sign(foe.vy)) value += 70;
    if (value > score) {
      score = value;
      best = offset;
    }
  }
  brain.previousFoeY = foe.y;
  brain.shot = best;
  return best * p.placement;
}

function chooseSkill(world: World, brain: BotBrain, cross: number): void {
  const actor = combatant(world, 'bot');
  const time = Math.abs(world.bot.x - world.ball.x) / Math.max(1, Math.abs(world.ball.vx));
  const gap = Math.abs(cross - world.bot.y) - world.bot.half;
  for (const [slot, entry] of actor.talents.slots.entries()) {
    if (!entry.id || entry.cooldown > 0 || entry.lockout > 0) continue;
    const defend =
      entry.id === 'dash' &&
      gap > brain.profile.speed * Math.max(0, time - brain.profile.reaction) &&
      time < 0.4 &&
      gap < actor.loadout.effects.dashDistance;
    const guard =
      entry.id === 'perfect-guard' &&
      time < actor.loadout.effects.guardWindow &&
      gap < actor.loadout.effects.guardReach;
    const charge =
      entry.id === 'power-strike' && time < 0.65 && time > 0.12 && actor.talents.strikeHits === 0;
    const burst = entry.id === 'overload' && time < 0.7 && world.match.rally > 4;
    const tactic =
      (entry.id === 'redirect' && time < 0.7 && time > 0.12) ||
      (entry.id === 'anchor' && !!world.arena.spec?.rails?.length && time < 0.7) ||
      (entry.id === 'relay' && !!world.arena.spec?.switches?.length && time < 0.7) ||
      (entry.id === 'rebound' && time < 0.5 && gap < world.bot.half) ||
      (entry.id === 'reserve' &&
        world.match.rally > 0 &&
        time > 0.4 &&
        (actor.talents.tactics.reserve ?? 0) <= 0);
    if (defend || guard || charge || burst || tactic) {
      fireAbility(actor, slot);
      break;
    }
  }
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
  let incoming = paddle.side === 'bot' ? ball.vx > 0 : ball.vx < 0;
  // A ball about to bounce off this side's own brick wall is not coming.
  if (incoming) {
    const wall = wallFor(world, paddle.side);
    const before = wall !== null && (paddle.side === 'bot' ? ball.x < wall : ball.x > wall);
    if (before && brickAt(world, paddle.side, predictY(world, wall))) incoming = false;
  }
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
