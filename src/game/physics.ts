import { BALANCE } from '../core/balance/config';
import { contactAngle } from '../core/equipment/catalog';
import { returnPace, FLICK_EDGE, FLICK_SPEED } from './returnPace';
import { applyArenaForces, bossReturned, collideArena, playerReturned } from './arena';
import { abilityById } from '../core/talents/abilities';
import { BALL_R, COMBO_STEPS, FIELD_H, PADDLE_W } from './constants';
import { scorePoint } from './match';
import { hsla } from './palette';
import {
  bankBall,
  ballTimeScale,
  slowCrossing,
  plainReturn,
  playerReturn,
  swerveBall,
  tryBastion,
  tryShield,
  type ReturnMods
} from './talents';
import type { Paddle } from './types';
import { clamp } from './utils/math';
import { shrinkPaddle } from './paddle';
import { combatant } from './combatant';
import { REPLAY_HIT_BOT, REPLAY_HIT_YOU, REPLAY_WALL } from './replay';
import {
  addKick,
  addShake,
  ballHue,
  buzz,
  hueOf,
  isHuman,
  panAt,
  pushTrail,
  type World
} from './world';

/**
 * A flick: the ball struck on the paddle's outer part while the paddle is
 * already moving the way that end sends it. It is the one piece of technique
 * every player has from the first match - no talent, no button, just the
 * wrist - and it pays in the only currency that wins points against a
 * composed opponent: a return that is harder to read.
 */
const FLICK_HEFT = 0.12;
/** Contact this far out is an edge save: a beat of slow motion to see it. */
const EDGE_SAVE = 0.88;

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

function onPaddleHit(
  world: World,
  paddle: Paddle,
  contactY: number,
  dir: 1 | -1,
  paddleY: number
): void {
  const { ball, match, fx, tuning } = world;
  const raw = clamp((contactY - paddleY) / paddle.half, -1, 1);

  // Both sides resolve their own build. Attract and couch play use plain returns.
  const talented = match.status !== 'menu' && !world.rules.versus;
  const actor = combatant(world, paddle.side);
  const foe = combatant(world, paddle.side === 'you' ? 'bot' : 'you');
  const mods = talented ? playerReturn(actor, raw) : plainReturn(world, raw);
  const off = mods.off;

  const pace = returnPace(world, paddle, mods, raw);
  ball.speed = pace.speed;
  const human = isHuman(world, paddle.side);
  const pan = panAt(world, paddle.x, contactY);
  const flick = pace.flick;

  if (talented) {
    const E = BALANCE.equipment;
    foe.talents.surge = pace.foeSurge;
    actor.talents.surge = pace.actorSurge;
    const material = paddle.material;
    material.switchesSeen = pace.switches;
    material.stored = pace.stored;
    if (pace.absorbed) material.stats.absorbed++;
    if (pace.released) material.stats.releases++;
    material.switchCharge = false;
    if (Math.abs(raw) <= E.steelBand && !mods.charged && !mods.crit) material.stats.centres++;
    if (Math.abs(paddle.vy) >= FLICK_SPEED) material.stats.moving++;
    if (Math.abs(raw) >= FLICK_EDGE) material.stats.edges++;
  }

  // Angle comes from where the ball struck, nudged by the paddle's own motion.
  const limit = mods.angleLimit;
  const angle = contactAngle(off, ball.speed, paddle.vy, mods.spin, limit);
  ball.vx = Math.cos(angle) * ball.speed * dir;
  ball.vy = Math.sin(angle) * ball.speed;
  ball.owner = paddle.side;
  ball.heft = (talented ? mods.heft : 0) + (flick ? FLICK_HEFT : 0);
  world.talents.swerveDir = 0;
  world.botTalents.swerveDir = 0;
  actor.talents.swerveDir =
    talented && actor.loadout.effects.swerve > 0 ? (ball.vy >= 0 ? 1 : -1) : 0;
  if (paddle.side === 'bot' && match.status !== 'menu') bossReturned(world);
  else playerReturned(world);

  const p = power(world);
  paddle.flash = mods.crit || mods.charged ? 1.35 : 1;
  paddle.hitY = contactY - paddleY;
  ball.squash = 1;
  ball.squashAngle = 0; // compressed along the long axis
  match.rally++;
  if (match.rally === 25 && world.rules.ranked && world.rules.winScore > 0) {
    fx.bannerText = 'Rally pressure';
    fx.bannerSub = 'Both paddles narrow from return 25 · resets next serve';
    fx.bannerHue = 35;
    fx.bannerTimer = 1.9;
  }
  if (match.status !== 'menu') {
    fx.rallyPop = 1;
    world.replay.mark(paddle.side === 'you' ? REPLAY_HIT_YOU : REPLAY_HIT_BOT);
  }
  // Hit-stop grows with the pace the ball carries - a rally that has built
  // up to a scream lands every contact harder than the serve did.
  fx.freeze =
    (0.012 + Math.pow(p, 1.5) * 0.045) * (mods.charged ? 2.2 : flick ? 1.5 : 1) * world.motion;
  addShake(world, (2.6 + p * 4) * (mods.crit || mods.charged ? 1.8 : 1));
  addKick(world, dir * (2 + p * 4) * (isSpecial(mods) || flick ? 1.6 : 1));

  const paddleHue = hueOf(world, paddle.side);
  world.rings.spawn(
    ball.x - dir * BALL_R * 0.4,
    contactY,
    isSpecial(mods) ? 26 : paddleHue,
    BALL_R * (4 + p * 3) * (isSpecial(mods) || flick ? 1.5 : 1),
    0.26 + p * 0.1,
    3 + p * 3
  );
  world.grid.impulse(paddle.x, contactY, 140 + p * 260, 120 + p * 60);

  if (human && match.status !== 'menu') {
    if (flick) {
      if (paddle.side === 'you') match.flicks++;
      world.popups.spawn('FLICK', ball.x, contactY, paddleHue, 22);
      world.audio.flick(pan);
    } else if (Math.abs(raw) >= EDGE_SAVE) {
      world.popups.spawn('EDGE', ball.x, contactY, paddleHue, 18);
      if (fx.edgeCooldown <= 0 && p > 0.35) {
        fx.edgeCooldown = 3.5;
        fx.timeScale = Math.min(fx.timeScale, world.motion > 0.5 ? 0.55 : 1);
      }
    }
  }

  if (human) buzz(world, mods.crit || mods.charged ? 24 : flick ? 16 : 9);

  if (paddle.side === 'you' && match.status !== 'menu') {
    match.hits++;
    // "Melting"-style challenges eat into the paddle with every return.
    if (tuning.shrinkPerHit > 0) shrinkPaddle(world.player, tuning.shrinkPerHit);
    if (mods.guarded) world.audio.guardHit();
    else if (mods.charged || mods.crit) world.audio.impact(mods.charged);
    // The skills that pay off *on contact* rather than on a timer get their
    // own mark at the point of contact: a return is the only moment they
    // ever have, so it is the only moment they are allowed to be loud.
    releaseFx(world, mods, contactY, dir);
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
    world.audio.hit(
      p,
      match.rally,
      pan,
      paddle.equipment.surface === 'rubber' ||
        paddle.equipment.core === 'cork' ||
        paddle.equipment.core === 'memory-gel'
        ? 'soft'
        : paddle.equipment.core === 'springsteel' || paddle.equipment.surface === 'ceramic'
          ? 'firm'
          : 'neutral'
    );
    checkCombo(world);
  }
}

function isSpecial(mods: ReturnMods): boolean {
  return mods.charged || mods.crit;
}

/**
 * What a return looks like when a skill was spent on it.
 *
 * Overload is drawn in its own red and at twice the reach of a plain charged
 * strike - it is the capstone spending one of its four, and each of those
 * four should feel like the ultimate it came from rather than like a Power
 * Strike that happened to be free.
 */
function releaseFx(world: World, mods: ReturnMods, contactY: number, dir: 1 | -1): void {
  const { ball, motion } = world;
  const angle = Math.atan2(ball.vy, ball.vx);
  const x = ball.x + dir * BALL_R;

  if (mods.overloaded) {
    const hue = abilityById('overload')?.hue ?? 0;
    world.casts.spawn(
      'strike-impact',
      { x, y: contactY, hue, life: 0.5, size: 78, dir: angle },
      motion
    );
    addShake(world, 5);
  } else if (mods.charged) {
    const hue = abilityById('power-strike')?.hue ?? 28;
    world.casts.spawn(
      'strike-impact',
      { x, y: contactY, hue, life: 0.4, size: 46, dir: angle },
      motion
    );
  }

  if (mods.guarded) {
    const hue = abilityById('perfect-guard')?.hue ?? 104;
    world.casts.spawn('guard-parry', { x, y: contactY, hue, life: 0.42, size: 54 }, motion);
    // The read deserves a beat of its own - the same hit-stop a charged
    // return gets, for the opposite reason.
    world.fx.freeze = Math.max(world.fx.freeze, 0.05 * motion);
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
 * Follow each straight segment to its next wall or paddle face. Reflecting
 * the final position first would test a chord through a wall bounce, and
 * could invent a save or discard the wall bounce after an edge return.
 * Paddle motion is interpolated to the instant the ball reaches its face.
 * The clock slowdown is rechecked after a return: only incoming travel is
 * slowed, so the player's outgoing return keeps its full pace.
 */
function advanceBall(world: World, dt: number): void {
  const { ball } = world;
  let remaining = dt;
  let missed: Paddle | null = null;
  // At shipped speeds a fixed step sees at most a paddle and a wall. The
  // bound also protects callers from malformed velocities or huge timesteps.
  for (let contact = 0; contact < 8 && remaining > 1e-9; contact++) {
    const clock = world.match.status === 'menu' ? 1 : ballTimeScale(world);
    const vx = ball.vx * clock;
    const vy = ball.vy * clock;
    const dir = vx < 0 ? 1 : -1;
    const paddle = dir > 0 ? world.player : world.bot;
    const face = paddle.x + dir * (PADDLE_W / 2 + BALL_R);
    const ahead = dir > 0 ? ball.x >= face : ball.x <= face;
    const paddleTime = ahead && paddle !== missed && vx !== 0 ? (face - ball.x) / vx : Infinity;
    const wall = vy < 0 ? BALL_R : FIELD_H - BALL_R;
    const wallTime = vy !== 0 ? Math.max(0, (wall - ball.y) / vy) : Infinity;
    const time = Math.min(remaining, paddleTime, wallTime);
    ball.x += vx * time;
    ball.y += vy * time;
    remaining -= time;

    if (wallTime <= paddleTime && wallTime <= time) {
      ball.y = wall;
      ball.vy = -ball.vy;
      onWallBounce(world);
    } else if (paddleTime <= time) {
      const centre = paddle.y - paddle.vy * remaining;
      const actor = combatant(world, paddle.side);
      const parry =
        actor.talents.guardWindow > 0 && world.match.status !== 'menu'
          ? actor.loadout.effects.guardReach
          : 0;
      const reach = paddle.half + BALL_R * 0.55 + parry;
      if (ball.y > centre - reach && ball.y < centre + reach) {
        ball.x = face;
        onPaddleHit(world, paddle, ball.y, dir, centre);
      } else {
        missed = paddle;
      }
    } else {
      break;
    }
  }
}

function onWallBounce(world: World): void {
  const { ball, match } = world;
  const p = power(world);
  ball.squash = 0.8;
  ball.squashAngle = Math.PI / 2; // compressed against the wall
  addShake(world, 1.6 + p * 2.4);
  const wallY = ball.vy > 0 ? 0 : FIELD_H;
  world.rings.spawn(ball.x, wallY, ballHue(world), BALL_R * (2.6 + p * 2), 0.22, 2.4);
  world.grid.impulse(ball.x, wallY, 90 + p * 150, 110);
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
  if (match.status !== 'menu') {
    world.replay.mark(REPLAY_WALL);
    world.audio.wall(p, panAt(world, ball.x, ball.y));
    bankBall(combatant(world, ball.owner));
  }
}

export function stepBall(world: World, dt: number): void {
  const { ball, view } = world;
  const live = world.match.status !== 'menu';
  if (live) {
    swerveBall(world, dt);
    swerveBall(combatant(world, 'bot'), dt);
  }
  // Clutch runs the ball's clock slow in the player's half. Its speed is
  // untouched, so the pace it carries back out is exactly the pace it had.
  const travel = live ? dt * ballTimeScale(world) : dt;
  if (live) applyArenaForces(world, travel);
  ball.px = ball.x;
  ball.py = ball.y;
  advanceBall(world, dt);

  // The moment the ball enters a slowed half, it says so.
  if (live && ball.vx < 0 && ball.px >= view.w / 2 && ball.x < view.w / 2) slowCrossing(world);

  // Bumpers and brick walls stand between the paddles.
  if (live) collideArena(world);

  // A contact can nudge the ball past a wall; pull it back without reflecting,
  // so the real bounce still plays next step.
  ball.y = clamp(ball.y, BALL_R, FIELD_H - BALL_R);

  // ...but either paddle can also slide sideways into a ball moving away from
  // it, so both get an overlap rescue once the ball is known to be in bounds.
  resolveOverlap(world, world.player);
  resolveOverlap(world, world.bot);

  // A Shield charge catches the ball at the player's line, before the point
  // is ever awarded - so a save keeps the rally alive rather than undoing it.
  // Bastion guards the corners for free, so it answers before a charge is spent.
  if (ball.vx < 0 && ball.x <= BALL_R && !tryBastion(world)) tryShield(world);

  world.trailTick += dt;
  if (world.trailTick >= 1 / 90) {
    world.trailTick = 0;
    pushTrail(world);
  }

  if (ball.x < -BALL_R * 3) scorePoint(world, 'bot');
  else if (ball.x > view.w + BALL_R * 3) scorePoint(world, 'you');
}
