import { BALANCE } from '../core/balance/config';
import type { SparkKind } from '../core/modes/types';
import { BALL_R, FIELD_H } from './constants';
import { combatant } from './combatant';
import { courseSegments } from './course';
import { resizePaddle } from './paddle';
import { hsla } from './palette';
import { rallyCeiling } from './talents';
import type { Paddle, Side } from './types';
import { addShake, buzz, panAt, type World } from './world';

/**
 * Sparks: pickups floating in midfield.
 *
 * The ball collects a spark it passes through, and the side that touched the
 * ball last gets the effect. That one rule is the whole design: aiming a
 * return through a spark is an attack, and a careless return gifts it to the
 * opponent - the bot plays by exactly the same rule. Every effect is a court
 * effect, never a talent, so none of them is counted as a skill or a save.
 *
 * Spark positions come from the match's gameplay random stream, so a seeded
 * match places them the same way every time. Nothing here touches the ball's
 * path; only a Fire return changes its pace, within the usual limits.
 */

/** Each kind's colour, shared by the orb, its pickup word and its effect on the paddle. */
export const SPARK_HUES: Readonly<Record<SparkKind, number>> = {
  wide: 158,
  fire: 24,
  ward: 205,
  hex: 300
};

/** The word that rises off a pickup. Translated where it is drawn. */
export const SPARK_WORDS: Readonly<Record<SparkKind, string>> = {
  wide: 'WIDE',
  fire: 'FIRE',
  ward: 'WARD',
  hex: 'HEX'
};

export interface SparkOrb {
  kind: SparkKind;
  x: number;
  y: number;
  /**
   * Where it stands along the court, as a fraction of its length, so a
   * resize or rotation keeps it in midfield. Absent on hand-placed orbs,
   * which keep their x.
   */
  fx?: number;
  /** Seconds since it appeared; drives the spawn pop and the idle pulse. */
  age: number;
}

/** What one side is holding from the sparks it collected. */
export interface SparkHold {
  /** Seconds of Wide left. */
  wide: number;
  /** Seconds of Hex left on this side's paddle - the opponent put it there. */
  hex: number;
  /** 1 while the next return will leave charged. */
  fire: number;
  /** 1 while a ward stands on this side's goal line. */
  ward: number;
}

export interface SparkState {
  orbs: SparkOrb[];
  /** Seconds of live play until the next spark may appear. */
  timer: number;
  hold: Record<Side, SparkHold>;
  /** 0..1 flash along a goal line after its ward turned a ball. */
  wardFlash: Record<Side, number>;
}

function emptyHold(): SparkHold {
  return { wide: 0, hex: 0, fire: 0, ward: 0 };
}

export function createSparks(): SparkState {
  return {
    orbs: [],
    timer: 0,
    hold: { you: emptyHold(), bot: emptyHold() },
    wardFlash: { you: 0, bot: 0 }
  };
}

/** A new match: nothing held, nothing on court, the first spark a little way in. */
export function resetSparks(world: World): void {
  const sparks = world.arena.sparks;
  sparks.orbs.length = 0;
  sparks.hold.you = emptyHold();
  sparks.hold.bot = emptyHold();
  sparks.wardFlash.you = 0;
  sparks.wardFlash.bot = 0;
  sparks.timer = BALANCE.sparks.firstDelay;
  world.player.boost = 1;
  world.bot.boost = 1;
  resizePaddle(world.player);
  resizePaddle(world.bot);
}

/**
 * The court changed under a live match - a boss phase. Held effects carry on;
 * orbs from the old court go if the new one has no sparks.
 */
export function courtChanged(world: World): void {
  const sparks = world.arena.sparks;
  if (!world.arena.spec?.sparks) sparks.orbs.length = 0;
  sparks.timer = Math.min(sparks.timer, BALANCE.sparks.firstDelay);
}

const other = (side: Side): Side => (side === 'you' ? 'bot' : 'you');

function paddleOf(world: World, side: Side): Paddle {
  return side === 'you' ? world.player : world.bot;
}

/** Is a candidate spot clear of everything else in the court, and of the ball? */
function clearSpot(world: World, x: number, y: number): boolean {
  const { arena, ball, view } = world;
  const room = BALANCE.sparks.radius + 26;
  if (Math.hypot(ball.x - x, ball.y - y) < 90) return false;
  for (const orb of arena.sparks.orbs)
    if (Math.hypot(orb.x - x, orb.y - y) < room * 2) return false;
  for (const bumper of arena.bumpers)
    if (Math.hypot(bumper.x - x, bumper.y - y) < bumper.r + room) return false;
  for (const portal of arena.portals)
    if (
      Math.hypot(portal.ax - x, portal.ay - y) < portal.r + room ||
      Math.hypot(portal.bx - x, portal.by - y) < portal.r + room
    )
      return false;
  for (const s of arena.spec?.switches ?? [])
    if (Math.hypot(s.x * view.w - x, s.y * FIELD_H - y) < s.r + room) return false;
  for (const g of arena.spec?.gates ?? []) if (Math.abs(g.x * view.w - x) < room) return false;
  for (const brick of arena.bricks)
    if (brick.alive && Math.abs(brick.x - x) < room + brick.w && Math.abs(brick.y - y) < room)
      return false;
  for (const seg of courseSegments(arena.spec, view.w, arena.time, arena.course)) {
    const dx = seg.bx - seg.ax;
    const dy = seg.by - seg.ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - seg.ax) * dx + (y - seg.ay) * dy) / len2));
    if (Math.hypot(seg.ax + dx * t - x, seg.ay + dy * t - y) < room) return false;
  }
  const warden = arena.warden;
  if (warden && Math.abs(warden.x - x) < room) return false;
  return true;
}

function spawn(world: World): void {
  const spec = world.arena.spec?.sparks;
  if (!spec || spec.kinds.length === 0) return;
  const { view } = world;
  const random = world.random;
  const kind = spec.kinds[Math.floor(random() * spec.kinds.length) % spec.kinds.length]!;
  // Midfield only: a spark should be a target for either side's return,
  // never something sitting in front of one paddle.
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = view.w * (0.36 + random() * 0.28);
    const y = FIELD_H * (0.14 + random() * 0.72);
    if (!clearSpot(world, x, y)) continue;
    world.arena.sparks.orbs.push({ kind, x, y, fx: x / view.w, age: 0 });
    world.rings.spawn(x, y, SPARK_HUES[kind], BALANCE.sparks.radius * 2.6, 0.45, 3);
    return;
  }
}

/** The court changed length: every orb keeps its place along it. */
export function rescaleSparks(world: World): void {
  for (const orb of world.arena.sparks.orbs)
    if (orb.fx !== undefined) orb.x = orb.fx * world.view.w;
}

/** Timers, spawning and the paddle lengths sparks are holding. Every step. */
export function updateSparks(world: World, dt: number): void {
  const sparks = world.arena.sparks;
  const status = world.match.status;
  for (const orb of sparks.orbs) orb.age += dt;
  sparks.wardFlash.you = Math.max(0, sparks.wardFlash.you - dt * 2.5);
  sparks.wardFlash.bot = Math.max(0, sparks.wardFlash.bot - dt * 2.5);
  if (status === 'play' || status === 'serve') {
    for (const side of ['you', 'bot'] as const) {
      const hold = sparks.hold[side];
      hold.wide = Math.max(0, hold.wide - dt);
      hold.hex = Math.max(0, hold.hex - dt);
    }
  }
  const spec = world.arena.spec?.sparks;
  if (spec && status === 'play' && sparks.orbs.length < Math.max(1, Math.min(2, spec.max ?? 1))) {
    sparks.timer -= dt;
    if (sparks.timer <= 0) {
      sparks.timer = spec.every;
      spawn(world);
    }
  }
  for (const side of ['you', 'bot'] as const) {
    const hold = sparks.hold[side];
    const boost =
      (hold.wide > 0 ? BALANCE.sparks.wideScale : 1) * (hold.hex > 0 ? BALANCE.sparks.hexScale : 1);
    const paddle = paddleOf(world, side);
    if ((paddle.boost ?? 1) !== boost) {
      paddle.boost = boost;
      resizePaddle(paddle);
    }
  }
}

/** Hand `kind` to `side`. A side that cannot be saved (Reckless) takes a Fire instead of a Ward. */
function grant(world: World, side: Side, kind: SparkKind): SparkKind {
  const hold = world.arena.sparks.hold;
  const loadout = side === 'you' ? world.loadout : world.botLoadout;
  const given = kind === 'ward' && loadout.effects.unsaved ? 'fire' : kind;
  if (given === 'wide') hold[side].wide = BALANCE.sparks.wideTime;
  else if (given === 'hex') hold[other(side)].hex = BALANCE.sparks.hexTime;
  else if (given === 'fire') hold[side].fire = 1;
  else hold[side].ward = 1;
  return given;
}

/** Did the ball just pass through a spark? Called once per step, after the court's own contacts. */
export function collectSparks(world: World): void {
  const sparks = world.arena.sparks;
  if (sparks.orbs.length === 0 || world.match.status !== 'play') return;
  const { ball } = world;
  const reach = BALANCE.sparks.radius + BALL_R;
  for (let i = sparks.orbs.length - 1; i >= 0; i--) {
    const orb = sparks.orbs[i]!;
    // A spark still popping in cannot be taken: it must be seen first.
    if (orb.age < 0.3) continue;
    if (Math.hypot(ball.x - orb.x, ball.y - orb.y) > reach) continue;
    sparks.orbs.splice(i, 1);
    const side = ball.owner;
    const kind = grant(world, side, orb.kind);
    world.arena.course.events[side].sparks++;
    const hue = SPARK_HUES[kind];
    world.popups.spawn(SPARK_WORDS[kind], orb.x, orb.y, hue, 22);
    world.rings.spawn(orb.x, orb.y, hue, BALANCE.sparks.radius * 4.2, 0.4, 4, 74);
    world.particles.emit(
      orb.x,
      orb.y,
      22,
      { speed: 240, life: 0.55, size: 3.2, color: hsla(hue, 100, 70, 0.9) },
      world.motion
    );
    world.grid.impulse(orb.x, orb.y, 220, 160);
    addShake(world, 2.5);
    world.audio.spark(kind, panAt(world, orb.x, orb.y));
    if (side === 'you' || world.rules.versus) buzz(world, 12);
    if (sparks.timer <= 0) sparks.timer = world.arena.spec?.sparks?.every ?? 0;
  }
}

/**
 * How much a planned return is worth for the sparks on its way: a straight
 * read, folded off the walls, of whether it passes through one. Bots that
 * plan their placement weigh it against how hard the return is to reach;
 * hazards are ignored here, so a bent court can still spoil the plan.
 */
export function sparkValue(world: World, x: number, y: number, vx: number, vy: number): number {
  const orbs = world.arena.sparks.orbs;
  if (orbs.length === 0 || vx === 0) return 0;
  const reach = BALANCE.sparks.radius + BALL_R;
  const span = FIELD_H - BALL_R * 2;
  let value = 0;
  for (const orb of orbs) {
    const t = (orb.x - x) / vx;
    if (t <= 0) continue;
    let at = y - BALL_R + vy * t;
    at = ((at % (span * 2)) + span * 2) % (span * 2);
    at = BALL_R + (at > span ? span * 2 - at : at);
    if (Math.abs(at - orb.y) < reach) value += 110;
  }
  return value;
}

/**
 * A return just left `side`'s paddle. A held Fire charges it: quicker, a
 * little past the match's top speed but never past the hard limit, and
 * heavier to read. The added pace is surge, so most of it bleeds off when
 * the opponent returns the ball - the same contract every attack keeps.
 */
export function fireReturn(world: World, side: Side, x: number, y: number): boolean {
  const hold = world.arena.sparks.hold[side];
  if (hold.fire <= 0) return false;
  hold.fire = 0;
  const { ball } = world;
  const before = ball.speed;
  const ceiling = Math.min(
    BALANCE.ball.hardMax,
    Math.max(before, rallyCeiling(world) * BALANCE.sparks.fireCeiling)
  );
  ball.speed = Math.min(ceiling, before * BALANCE.sparks.firePace);
  const k = ball.speed / (before || 1);
  ball.vx *= k;
  ball.vy *= k;
  ball.heft += BALANCE.sparks.fireHeft;
  if (world.match.status !== 'menu' && !world.rules.versus)
    combatant(world, side).talents.surge += ball.speed - before;
  const hue = SPARK_HUES.fire;
  world.casts.spawn(
    'strike-impact',
    { x, y, hue, life: 0.4, size: 50, dir: Math.atan2(ball.vy, ball.vx) },
    world.motion
  );
  world.popups.spawn('FIRE', x, y, hue, 20);
  world.audio.impact(true);
  addShake(world, 3);
  return true;
}

/**
 * The ball is about to cross `side`'s goal line: a held Ward turns it back.
 * Called after the build's own saves, so a ward is spent only when nothing
 * else would have caught the ball.
 */
export function tryWard(world: World, side: Side): boolean {
  if (world.match.status !== 'play') return false;
  const sparks = world.arena.sparks;
  const hold = sparks.hold[side];
  if (hold.ward <= 0) return false;
  hold.ward = 0;
  const { ball, view } = world;
  const toward = side === 'you' ? 1 : -1;
  ball.x = side === 'you' ? BALL_R : view.w - BALL_R;
  ball.px = ball.x;
  ball.vx = Math.abs(ball.vx) * toward;
  ball.owner = side;
  ball.squash = 0.9;
  ball.squashAngle = 0;
  ball.heft = 0;
  world.talents.swerveDir = 0;
  world.botTalents.swerveDir = 0;
  world.arena.bossSwerveDir = 0;
  if (side === 'you') {
    // The opponent must read the ball afresh: it was never coming back.
    const brain = world.botBrain;
    brain.aimed = false;
    brain.reads = 0;
    brain.misread = false;
    brain.wait = brain.profile.reaction * 0.6;
  }
  sparks.wardFlash[side] = 1;
  const hue = SPARK_HUES.ward;
  world.popups.spawn('WARD', ball.x + toward * 40, ball.y, hue, 22);
  world.rings.spawn(ball.x, ball.y, hue, BALL_R * 6, 0.4, 4, 74);
  world.particles.emit(
    ball.x,
    ball.y,
    24,
    {
      angle: toward > 0 ? 0 : Math.PI,
      spread: 2.2,
      speed: 230,
      life: 0.5,
      size: 3,
      color: hsla(hue, 100, 72, 0.9)
    },
    world.motion
  );
  addShake(world, 4);
  world.audio.shield();
  if (side === 'you' || world.rules.versus) buzz(world, 18);
  return true;
}
