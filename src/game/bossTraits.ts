import { BALANCE } from '../core/balance/config';
import type { BossTraits } from '../core/modes/types';
import { BALL_R, FIELD_H } from './constants';
import { reflectSegment } from './course';
import { hsla } from './palette';
import { rallyCeiling } from './talents';
import { addShake, panAt, type World } from './world';

/**
 * What makes a boss more than a stronger opponent on a harder court.
 *
 * Each trait is one visible rule, authored per boss and sharpened by its
 * phases. They all act on the court or on the boss's own returns - never on
 * the player's paddle, never on what the player can see of the ball:
 *
 *  - Warden: a second, slower paddle guards the boss's half.
 *  - Surge: its returns gather pace once past the centre line.
 *  - Stutter: its returns check up at the centre line, then snap on.
 *  - Mason: it rebuilds a broken brick or deflector every few seconds.
 *  - Gust: each of its returns turns the wind, after the usual warning.
 *  - Lockdown: each of its returns shuts every gate a switch had opened.
 */

export interface WardenState {
  x: number;
  y: number;
  half: number;
  speed: number;
  /** 0..1 glow after it turned a ball back. */
  flash: number;
  /**
   * True once it has turned this return back. One block per player return:
   * otherwise a bumper or rail in front of it could bounce the ball straight
   * back into it, again and again, without the player ever touching it.
   */
  spent: boolean;
}

/** The boss's traits right now: its own, plus every phase it has reached. */
export function activeTraits(world: World): BossTraits {
  const boss = world.rules.boss;
  if (!boss) return NONE;
  let traits: BossTraits = boss.traits ?? NONE;
  for (let i = 0; i < world.arena.phase; i++) {
    const phase = boss.phases[i]?.traits;
    if (phase) traits = { ...traits, ...phase };
  }
  return traits;
}

const NONE: BossTraits = {};

/** Place, move or remove the warden to match the traits in force. */
export function setupWarden(world: World): void {
  const spec = activeTraits(world).warden;
  const arena = world.arena;
  if (!spec) {
    arena.warden = null;
    return;
  }
  const x = world.view.w * spec.x;
  arena.warden = arena.warden
    ? { ...arena.warden, x, half: spec.half, speed: spec.speed }
    : { x, y: FIELD_H / 2, half: spec.half, speed: spec.speed, flash: 0, spent: false };
}

/** Where a straight ball, folded off the walls, crosses `x`. */
function crossing(world: World, x: number): number | null {
  const { ball } = world;
  if (ball.vx <= 0 || ball.x >= x) return null;
  const t = (x - ball.x) / ball.vx + BALANCE.bossTraits.wardenLead;
  const span = FIELD_H - BALL_R * 2;
  let y = ball.y - BALL_R + ball.vy * t;
  y = ((y % (span * 2)) + span * 2) % (span * 2);
  return BALL_R + (y > span ? span * 2 - y : y);
}

function moveWarden(world: World, dt: number): void {
  const warden = world.arena.warden;
  if (!warden) return;
  warden.flash = Math.max(0, warden.flash - dt * 3);
  const { ball, view } = world;
  // It only commits once the ball is past the centre line, so an early,
  // wide return can wrong-foot it; until then it shadows the ball.
  const incoming = world.match.status === 'play' && ball.vx > 0 && ball.x > view.w * 0.5;
  const target = incoming
    ? (crossing(world, warden.x) ?? ball.y)
    : FIELD_H / 2 + (ball.y - FIELD_H / 2) * 0.5;
  const step = warden.speed * dt;
  warden.y += Math.max(-step, Math.min(step, target - warden.y));
  warden.y = Math.max(warden.half, Math.min(FIELD_H - warden.half, warden.y));
}

/**
 * The warden turns a return of the player's back - from the front only, so
 * the boss's own returns pass behind it. Not a return: the rally does not
 * count it, and the ball stays the player's.
 */
export function collideWarden(world: World): boolean {
  const warden = world.arena.warden;
  const { ball } = world;
  if (
    !warden ||
    warden.spent ||
    world.match.status !== 'play' ||
    ball.vx <= 0 ||
    world.match.rally === 0
  )
    return false;
  if (ball.px > warden.x) return false;
  const velocity = {
    get x() {
      return ball.vx;
    },
    set x(v) {
      ball.vx = v;
    },
    get y() {
      return ball.vy;
    },
    set y(v) {
      ball.vy = v;
    }
  };
  const hit = reflectSegment(
    {
      ax: warden.x,
      ay: warden.y - warden.half,
      bx: warden.x,
      by: warden.y + warden.half,
      rail: -1
    },
    { x: ball.px, y: ball.py },
    ball,
    velocity
  );
  if (!hit) return false;
  warden.flash = 1;
  warden.spent = true;
  ball.heft = 0;
  const hue = world.rules.boss?.hue ?? 0;
  world.rings.spawn(warden.x, ball.y, hue, BALL_R * 5, 0.3, 3);
  world.particles.emit(
    warden.x,
    ball.y,
    12,
    {
      angle: Math.PI,
      spread: 1.6,
      speed: 180,
      life: 0.35,
      size: 2.8,
      color: hsla(hue, 90, 70, 0.85)
    },
    world.motion
  );
  addShake(world, 2);
  world.audio.bumper(0.5, panAt(world, warden.x, ball.y));
  return true;
}

/** Seconds of a checked-up return still to run, and the pace it will leave with. */
export interface StallState {
  left: number;
  speed: number;
}

function setSpeed(world: World, speed: number): void {
  const { ball } = world;
  const k = speed / (ball.speed || 1);
  ball.speed = speed;
  ball.vx *= k;
  ball.vy *= k;
}

/**
 * The boss's return has just crossed the centre line. Stutter holds it back
 * for a beat; Surge (or the snap after a stutter) drives it on. Either way
 * the pace stays inside the match's limits.
 */
function crossCentre(world: World, traits: BossTraits): void {
  const { ball } = world;
  const B = BALANCE.bossTraits;
  const ceiling = Math.min(
    BALANCE.ball.hardMax,
    Math.max(ball.speed, rallyCeiling(world) * B.surgeCeiling)
  );
  const hue = world.rules.boss?.hue ?? 0;
  if (traits.stutter && traits.stutter > 0) {
    world.arena.stall = {
      left: Math.min(0.45, traits.stutter),
      speed: Math.min(ceiling, ball.speed * Math.max(B.stutterSnap, traits.surge ?? 1))
    };
    setSpeed(world, Math.max(BALANCE.ball.hardMin, ball.speed * B.stutterPace));
    world.rings.spawn(ball.x, ball.y, hue, BALL_R * 4, 0.45, 3);
    world.audio.tone(520, 0.08, 'triangle', 0.08, 300, 0, panAt(world, ball.x, ball.y));
    return;
  }
  if (traits.surge && traits.surge > 1) {
    setSpeed(world, Math.min(ceiling, ball.speed * Math.min(1.35, traits.surge)));
    world.rings.spawn(ball.x, ball.y, hue, BALL_R * 5, 0.3, 4, 74);
    world.particles.emit(
      ball.x,
      ball.y,
      14,
      {
        angle: Math.PI,
        spread: 0.8,
        speed: 260,
        life: 0.35,
        size: 3,
        color: hsla(hue, 100, 68, 0.9)
      },
      world.motion
    );
    world.audio.tone(300, 0.09, 'sawtooth', 0.06, 620, 0, panAt(world, ball.x, ball.y));
  }
}

/** A stalled return snaps back to pace when its beat is over. */
function runStall(world: World, dt: number): void {
  const stall = world.arena.stall;
  if (!stall) return;
  if (world.ball.owner !== 'bot' || world.match.status !== 'play') {
    world.arena.stall = null;
    return;
  }
  stall.left -= dt;
  if (stall.left > 0) return;
  world.arena.stall = null;
  setSpeed(world, Math.max(world.ball.speed, stall.speed));
  world.rings.spawn(
    world.ball.x,
    world.ball.y,
    world.rules.boss?.hue ?? 0,
    BALL_R * 4,
    0.25,
    3,
    74
  );
}

/** Mason: bring back one broken brick of its own wall, or else one broken deflector. */
function rebuild(world: World): void {
  const arena = world.arena;
  const hue = world.rules.boss?.hue ?? 0;
  const brick = arena.bricks
    .filter((b) => !b.alive && b.side === 'bot')
    .sort((a, b) => Math.abs(a.y - FIELD_H / 2) - Math.abs(b.y - FIELD_H / 2))[0];
  if (brick && !(Math.abs(world.ball.x - brick.x) < 40 && Math.abs(world.ball.y - brick.y) < 40)) {
    brick.alive = true;
    brick.hp = brick.maxHp;
    brick.flash = 1;
    world.rings.spawn(brick.x, brick.y, hue, 34, 0.4, 3);
    world.audio.tone(660, 0.06, 'square', 0.05, 880, 0, panAt(world, brick.x, brick.y));
    return;
  }
  const rails = arena.spec?.rails ?? [];
  for (const [i, rail] of rails.entries()) {
    if (!rail.hp || arena.course.rails[i] !== 0) continue;
    arena.course.rails[i] = rail.hp;
    const x = ((rail.ax + rail.bx) / 2) * world.view.w;
    const y = ((rail.ay + rail.by) / 2) * FIELD_H;
    world.rings.spawn(x, y, hue, 46, 0.45, 3);
    world.audio.tone(660, 0.06, 'square', 0.05, 880, 0, panAt(world, x, y));
    return;
  }
}

/** Every step of a boss match: the warden moves, a stalled return runs out, the mason works. */
export function updateBossTraits(world: World, dt: number): void {
  if (!world.rules.boss) return;
  const status = world.match.status;
  if (status !== 'play' && status !== 'serve') return;
  moveWarden(world, dt);
  if (status !== 'play') return;
  runStall(world, dt);
  const mason = activeTraits(world).mason;
  if (mason && mason > 0) {
    world.arena.masonTimer -= dt;
    if (world.arena.masonTimer <= 0) {
      world.arena.masonTimer = mason;
      rebuild(world);
    }
  }
}

/** After the ball moved this step: has a boss return just crossed the centre line? */
export function bossFlight(world: World): void {
  const arena = world.arena;
  if (!arena.bossFlight || world.ball.owner !== 'bot' || world.match.status !== 'play') return;
  const centre = world.view.w / 2;
  if (world.ball.vx < 0 && world.ball.px >= centre && world.ball.x < centre) {
    arena.bossFlight = false;
    crossCentre(world, activeTraits(world));
  }
}

/** The boss just returned the ball: arm its return's flight, turn the wind, shut the gates. */
export function bossStruck(world: World): void {
  const arena = world.arena;
  if (!world.rules.boss) return;
  const traits = activeTraits(world);
  arena.bossFlight = !!(traits.surge || traits.stutter);
  arena.stall = null;
  if (traits.gust && arena.spec?.wind && arena.windTimer > 0.85) arena.windTimer = 0.8;
  if (traits.lockdown) {
    const hue = world.rules.boss.hue;
    for (const [i, g] of (arena.spec?.gates ?? []).entries()) {
      if ((arena.course.openUntil[i] ?? 0) <= arena.time) continue;
      arena.course.openUntil[i] = arena.time;
      world.rings.spawn(g.x * world.view.w, g.center * FIELD_H, hue, 60, 0.4, 3);
    }
  }
}

/** The player returned it: whatever the boss's last return was carrying is spent. */
export function bossAnswered(world: World): void {
  world.arena.bossFlight = false;
  world.arena.stall = null;
  if (world.arena.warden) world.arena.warden.spent = false;
}

/** A new point: the warden is ready again. */
export function bossServe(world: World): void {
  if (world.arena.warden) world.arena.warden.spent = false;
  world.arena.stall = null;
  world.arena.bossFlight = false;
}
