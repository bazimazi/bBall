import { BALANCE } from '../core/balance/config';
import { BALL_R, COMBO_STEPS, FIELD_H, PADDLE_W, SPIN_INFLUENCE } from './constants';
import { scorePoint } from './match';
import { hsla } from './palette';
import { plainReturn, playerReturn, tryShield } from './talents';
import type { Paddle } from './types';
import { clamp } from './utils/math';
import { shrinkPaddle } from './paddle';
import { addShake, ballHue, hueOf, pushTrail, type World } from './world';

/** How hard the ball is currently travelling, on a 0..1 scale. */
function power(world: World): number {
  const { serveSpeed, maxSpeed } = world.tuning;
  return clamp((world.ball.speed - serveSpeed) / Math.max(1, maxSpeed - serveSpeed), 0, 1);
}

export function movePaddle(paddle: Paddle, dt: number, speed: number): void {
  const previous = paddle.y;
  const max = speed * dt;
  const dy = clamp(paddle.target - paddle.y, -max, max);
  paddle.y = clamp(paddle.y + dy, paddle.half, FIELD_H - paddle.half);
  paddle.vy = (paddle.y - previous) / dt;
}

function checkCombo(world: World): void {
  const { match, fx } = world;
  for (let i = COMBO_STEPS.length - 1; i >= 0; i--) {
    const step = COMBO_STEPS[i]!;
    if (match.rally >= step.at && i > fx.comboIndex) {
      fx.comboIndex = i;
      fx.comboLabel = step.label;
      fx.comboTimer = 1.3;
      addShake(world, 4 + i);
      world.audio.combo(i);
      world.particles.emit(
        world.ball.x,
        world.ball.y,
        26,
        { speed: 260, life: 0.6, size: 3, color: hsla(ballHue(world), 100, 68, 0.9) },
        world.motion
      );
      break;
    }
  }
}

function onPaddleHit(world: World, paddle: Paddle, contactY: number, dir: 1 | -1): void {
  const { ball, match, fx, tuning } = world;
  const raw = clamp((contactY - paddle.y) / paddle.half, -1, 1);

  // The player's returns go through their build; the bot's never do. Attract
  // mode plays the plain game, so the demo behind the menus is always the
  // game as it ships rather than as the player has shaped it.
  const talented = paddle.side === 'you' && match.status !== 'menu';
  const mods = talented ? playerReturn(world, raw) : plainReturn(world, raw);
  const off = mods.off;

  const before = ball.speed;
  ball.speed = clamp(
    before * mods.growth,
    BALANCE.ball.hardMin,
    Math.min(BALANCE.ball.hardMax, mods.ceiling)
  );

  if (talented) {
    // Book the pace this build added over a plain return, so the opponent
    // can hand most of it back on the way through.
    const plain = clamp(
      before * tuning.speedPerHit,
      BALANCE.ball.hardMin,
      Math.min(BALANCE.ball.hardMax, tuning.maxSpeed)
    );
    world.talents.surge = Math.max(0, world.talents.surge + (ball.speed - plain));
  } else if (paddle.side === 'bot' && match.status !== 'menu' && world.talents.surge > 0) {
    const given = world.talents.surge * BALANCE.ball.surgeBleed;
    ball.speed = Math.max(BALANCE.ball.hardMin, ball.speed - given);
    world.talents.surge -= given;
  }

  // Angle comes from where the ball struck, nudged by the paddle's own motion.
  const limit = mods.angleLimit;
  const vy = Math.sin(off * limit) * ball.speed + paddle.vy * SPIN_INFLUENCE * mods.spin;
  const wanted = Math.atan2(vy, Math.abs(Math.cos(off * limit) * ball.speed));
  const angle = clamp(wanted, -limit, limit);
  ball.vx = Math.cos(angle) * ball.speed * dir;
  ball.vy = Math.sin(angle) * ball.speed;
  ball.owner = paddle.side;

  const p = power(world);
  paddle.flash = mods.crit || mods.charged ? 1.35 : 1;
  ball.squash = 1;
  ball.squashAngle = 0; // compressed along the long axis
  match.rally++;
  fx.freeze = (0.012 + p * 0.03) * (mods.charged ? 2.2 : 1) * world.motion;
  addShake(world, (2.6 + p * 4) * (mods.crit || mods.charged ? 1.8 : 1));

  if (paddle.side === 'you' && match.status !== 'menu') {
    match.hits++;
    // "Melting"-style challenges eat into the paddle with every return.
    if (tuning.shrinkPerHit > 0) shrinkPaddle(paddle, tuning.shrinkPerHit);
    if (mods.charged || mods.crit) world.audio.impact(mods.charged);
    else if (mods.guarded) world.audio.guardHit();
  }

  // A charged or critical return reads instantly: more sparks, hotter hue.
  const special = mods.charged || mods.crit;
  const hue = mods.charged ? 26 : mods.crit ? 48 : hueOf(world, paddle.side);
  world.particles.emit(
    ball.x + dir * BALL_R,
    contactY,
    (12 + p * 10) * (special ? 2.4 : 1),
    {
      angle: dir > 0 ? 0 : Math.PI,
      spread: 1.5,
      speed: (150 + p * 250) * (special ? 1.5 : 1),
      life: 0.4,
      size: special ? 4.4 : 3.4,
      color: hsla(hue, 100, 66, 0.9)
    },
    world.motion
  );

  if (mods.guarded) {
    world.particles.emit(
      paddle.x,
      contactY,
      20,
      { speed: 200, life: 0.5, size: 2.8, color: hsla(hueOf(world, 'you'), 30, 92, 0.9) },
      world.motion
    );
  }

  // The attract demo plays silently and never raises a combo banner.
  if (match.status !== 'menu') {
    world.audio.hit(p);
    checkCombo(world);
  }
}

/** Circle-vs-rectangle rescue so the ball can never end up inside a paddle. */
function resolveOverlap(world: World, paddle: Paddle): void {
  const { ball } = world;
  const left = paddle.x - PADDLE_W / 2;
  const right = paddle.x + PADDLE_W / 2;
  const top = paddle.y - paddle.half;
  const bottom = paddle.y + paddle.half;
  const nx = clamp(ball.x, left, right);
  const ny = clamp(ball.y, top, bottom);
  const dx = ball.x - nx;
  const dy = ball.y - ny;
  if (dx * dx + dy * dy >= BALL_R * BALL_R) return;

  // Solve for the y that puts the ball exactly BALL_R from the paddle, keeping
  // x fixed - a plain scaled push leaves corner contacts still overlapping.
  const separation = Math.sqrt(Math.max(0, BALL_R * BALL_R - dx * dx)) + 0.01;
  const newY = ny + Math.sign(dy) * separation;

  // Prefer shoving the ball off the paddle's end, but only when that leaves it
  // inside the walls - otherwise eject sideways so it can never be re-trapped.
  if (Math.abs(dy) > Math.abs(dx) && newY >= BALL_R && newY <= FIELD_H - BALL_R) {
    ball.y = newY;
    ball.vy = Math.abs(ball.vy) * Math.sign(dy);
  } else {
    const sx = dx !== 0 ? Math.sign(dx) : paddle.side === 'you' ? 1 : -1;
    ball.x = (sx > 0 ? right : left) + sx * BALL_R;
    ball.vx = Math.abs(ball.vx) * sx;
  }
}

/**
 * Swept paddle test: the ball is checked against the paddle face along its
 * path rather than at its final position, so it cannot tunnel through at
 * speed. `dir` is the direction the ball leaves in - +1 for the left paddle,
 * -1 for the right one.
 */
function sweepPaddle(world: World, paddle: Paddle, dir: 1 | -1, dt: number): void {
  const { ball } = world;
  const face = dir > 0 ? paddle.x + PADDLE_W / 2 + BALL_R : paddle.x - PADDLE_W / 2 - BALL_R;
  const crossed = dir > 0 ? ball.px >= face && ball.x <= face : ball.px <= face && ball.x >= face;
  if (!crossed) return;

  const span = ball.px - ball.x;
  const t = Math.abs(span) < 0.0001 ? 0 : (ball.px - face) / span;
  const contactY = ball.py + (ball.y - ball.py) * t;
  const reach = paddle.half + BALL_R * 0.55;
  if (contactY <= paddle.y - reach || contactY >= paddle.y + reach) return;

  onPaddleHit(world, paddle, contactY, dir);
  const rest = (1 - clamp(t, 0, 1)) * dt;
  ball.x = face + ball.vx * rest;
  ball.y = contactY + ball.vy * rest;
}

function onWallBounce(world: World): void {
  const { ball, match } = world;
  const p = power(world);
  ball.squash = 0.8;
  ball.squashAngle = Math.PI / 2; // compressed against the wall
  addShake(world, 1.6 + p * 2.4);
  world.particles.emit(
    ball.x,
    ball.y,
    6 + p * 6,
    {
      angle: ball.vy > 0 ? Math.PI / 2 : -Math.PI / 2,
      spread: 1.9,
      speed: 100 + p * 170,
      life: 0.34,
      size: 2.8,
      color: hsla(ballHue(world), 90, 70, 0.7)
    },
    world.motion
  );
  if (match.status !== 'menu') world.audio.wall(p);
}

export function stepBall(world: World, dt: number): void {
  const { ball, view } = world;
  ball.px = ball.x;
  ball.py = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.y - BALL_R < 0) {
    ball.y = BALL_R + (BALL_R - ball.y);
    ball.vy = Math.abs(ball.vy);
    onWallBounce(world);
  } else if (ball.y + BALL_R > FIELD_H) {
    ball.y = FIELD_H - BALL_R - (ball.y + BALL_R - FIELD_H);
    ball.vy = -Math.abs(ball.vy);
    onWallBounce(world);
  }
  ball.y = clamp(ball.y, BALL_R, FIELD_H - BALL_R);

  // Swept test only against the paddle the ball is heading for...
  if (ball.vx < 0) sweepPaddle(world, world.player, 1, dt);
  else sweepPaddle(world, world.bot, -1, dt);

  // A contact can nudge the ball past a wall; pull it back without reflecting,
  // so the real bounce still plays next step.
  ball.y = clamp(ball.y, BALL_R, FIELD_H - BALL_R);

  // ...but either paddle can also slide sideways into a ball moving away from
  // it, so both get an overlap rescue once the ball is known to be in bounds.
  resolveOverlap(world, world.player);
  resolveOverlap(world, world.bot);

  // A Shield charge catches the ball at the player's line, before the point
  // is ever awarded - so a save keeps the rally alive rather than undoing it.
  if (ball.vx < 0 && ball.x <= BALL_R) tryShield(world);

  world.trailTick += dt;
  if (world.trailTick >= 1 / 90) {
    world.trailTick = 0;
    pushTrail(world);
  }

  if (ball.x < -BALL_R * 3) scorePoint(world, 'bot');
  else if (ball.x > view.w + BALL_R * 3) scorePoint(world, 'you');
}
