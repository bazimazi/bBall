import { BALL_R } from './constants';
import { hsla } from './palette';
import type { Side } from './types';
import { ballHue, hueOf, pushTrail, type World } from './world';

/**
 * The replay of the point that decided the match.
 *
 * While a point is played the recorder keeps the last few seconds of it - the
 * ball, both paddles and the moments the ball was struck - in a fixed ring of
 * typed arrays, sampled at sixty a second. When the match ends on that point,
 * the tail of the recording is played back in slow motion before the result
 * card, with the game's own renderer drawing it: the replay *is* the court,
 * wound back, rather than a video of it.
 *
 * Presentation only. Nothing here is read by physics, and the match is already
 * over by the time a frame is written back into the world.
 */

/** Frames kept, at sixty a second: five seconds, far more than is ever shown. */
const CAPACITY = 300;
/** Record one frame every this many simulation steps (120 Hz / 2 = 60 Hz). */
const EVERY = 2;
/** Frames shown when no return is on tape - a serve that was never touched. */
const SHOWN = 90;
/** The most the replay will show, however long the last return's flight. */
const MAX_SHOWN = 150;
/** Frames of lead-in before the last return. */
const LEAD = 22;
/** The shortest recording worth replaying. */
const MIN_FRAMES = 40;
/**
 * Playback speed: slow around the two moments that matter - the last return
 * and the ball going past - and brisker through the flight between them.
 */
const SLOW = 0.32;
const FAST = 0.9;
/** Seconds of the slow-motion point held before the tape winds back. */
export const REPLAY_DELAY = 0.95;

/** Something that happened on a frame, for the playback to mark. */
export const REPLAY_HIT_YOU = 1;
export const REPLAY_HIT_BOT = 2;
export const REPLAY_WALL = 4;

export class ReplayRecorder {
  private readonly bx = new Float32Array(CAPACITY);
  private readonly by = new Float32Array(CAPACITY);
  private readonly bvx = new Float32Array(CAPACITY);
  private readonly bvy = new Float32Array(CAPACITY);
  private readonly squash = new Float32Array(CAPACITY);
  private readonly squashAngle = new Float32Array(CAPACITY);
  private readonly owner = new Uint8Array(CAPACITY);
  private readonly heat = new Float32Array(CAPACITY);
  private readonly py = new Float32Array(CAPACITY);
  private readonly ph = new Float32Array(CAPACITY);
  private readonly pf = new Float32Array(CAPACITY);
  private readonly oy = new Float32Array(CAPACITY);
  private readonly oh = new Float32Array(CAPACITY);
  private readonly of = new Float32Array(CAPACITY);
  private readonly events = new Uint8Array(CAPACITY);

  /** Frames recorded this point; the newest is at `(head - 1) mod CAPACITY`. */
  private count = 0;
  private head = 0;
  private tick = 0;
  private pendingEvents = 0;

  /** Playback: seconds until it starts, whether it is running, and where it is. */
  pending = 0;
  active = false;
  private cursor = 0;
  private from = 0;
  private to = 0;
  private lastFrame = -1;
  /** The frame of the last return on tape, or -1 when there was none. */
  private key = -1;

  /** A new point: forget the last one. */
  reset(): void {
    this.count = 0;
    this.head = 0;
    this.tick = 0;
    this.pendingEvents = 0;
  }

  /** Stop any playback and forget everything - a new match, or back to the menu. */
  clear(): void {
    this.reset();
    this.pending = 0;
    this.active = false;
  }

  /** Mark something on the next frame taken. */
  mark(event: number): void {
    this.pendingEvents |= event;
  }

  /** One simulation step of a live point. Keeps every second step. */
  record(world: World): void {
    this.tick++;
    if (this.tick % EVERY !== 0) return;
    const { ball, player, bot, fx } = world;
    const i = this.head;
    this.bx[i] = ball.x;
    this.by[i] = ball.y;
    this.bvx[i] = ball.vx;
    this.bvy[i] = ball.vy;
    this.squash[i] = ball.squash;
    this.squashAngle[i] = ball.squashAngle;
    this.owner[i] = ball.owner === 'you' ? 0 : 1;
    this.heat[i] = fx.heat;
    this.py[i] = player.y;
    this.ph[i] = player.half;
    this.pf[i] = player.flash;
    this.oy[i] = bot.y;
    this.oh[i] = bot.half;
    this.of[i] = bot.flash;
    this.events[i] = this.pendingEvents;
    this.pendingEvents = 0;
    this.head = (this.head + 1) % CAPACITY;
    this.count = Math.min(CAPACITY, this.count + 1);
  }

  /** Is there enough of this point on tape to be worth showing? */
  get worthShowing(): boolean {
    return this.count >= MIN_FRAMES;
  }

  /** The slot of the `n`-th oldest frame still held. */
  private slot(n: number): number {
    const oldest = (this.head - this.count + CAPACITY) % CAPACITY;
    return (oldest + n) % CAPACITY;
  }

  /** Queue the playback to start after the slow-motion beat of the final point. */
  schedule(): void {
    this.pending = REPLAY_DELAY;
    this.active = false;
  }

  /** Wind the tape back and start playing. */
  begin(world: World): void {
    this.pending = 0;
    this.active = true;
    this.to = this.count - 1;
    // Start just before the last time the ball was struck: the return that
    // decided it, then its whole flight to the line.
    this.key = -1;
    for (let n = this.count - 1; n >= 0; n--) {
      if (this.events[this.slot(n)]! & (REPLAY_HIT_YOU | REPLAY_HIT_BOT)) {
        this.key = n;
        break;
      }
    }
    this.from =
      this.key >= 0
        ? Math.max(0, this.key - LEAD, this.count - MAX_SHOWN)
        : Math.max(0, this.count - SHOWN);
    this.cursor = this.from;
    this.lastFrame = this.from - 1;
    world.trail.length = 0;
    world.particles.clear();
    world.rings.clear();
    world.audio.rewind();
  }

  /** How far through the playback, 0..1, for the renderer's overlay. */
  get progress(): number {
    if (!this.active) return 0;
    return Math.min(1, (this.cursor - this.from) / Math.max(1, this.to - this.from));
  }

  /**
   * Advance the playback by `dt` real seconds and write the frame under the
   * cursor into the world. Returns true on the step the tape runs out.
   */
  play(world: World, dt: number): boolean {
    if (!this.active) return false;
    this.cursor += dt * 60 * this.speedAt(this.cursor);
    if (this.cursor >= this.to) {
      this.write(world, this.to, this.to, 0);
      this.active = false;
      return true;
    }
    const a = Math.floor(this.cursor);
    const b = Math.min(this.to, a + 1);
    this.write(world, a, b, this.cursor - a);

    // Once per recorded frame: the comet gets a point - spaced as it was
    // live, however slowly the tape runs - and any event passed is marked.
    if (a !== this.lastFrame) {
      pushTrail(world);
      for (let n = this.lastFrame + 1; n <= a; n++) this.replayEvent(world, this.slot(n));
      this.lastFrame = a;
    }
    return false;
  }

  /** The playback rate at `cursor`: slowest at the return and at the line. */
  private speedAt(cursor: number): number {
    let speed = FAST;
    if (this.key >= 0) {
      const near = Math.abs(cursor - this.key);
      if (near < 26) speed = SLOW + (FAST - SLOW) * Math.max(0, (near - 10) / 16);
    }
    const toEnd = this.to - cursor;
    if (toEnd < 40) speed = Math.min(speed, SLOW + (FAST - SLOW) * Math.max(0, (toEnd - 12) / 28));
    return speed;
  }

  private write(world: World, na: number, nb: number, t: number): void {
    const a = this.slot(na);
    const b = this.slot(nb);
    const mix = (array: Float32Array) => array[a]! + (array[b]! - array[a]!) * t;
    const { ball, player, bot, fx } = world;
    ball.x = mix(this.bx);
    ball.y = mix(this.by);
    ball.vx = mix(this.bvx);
    ball.vy = mix(this.bvy);
    ball.squash = mix(this.squash);
    ball.squashAngle = this.squashAngle[a]!;
    ball.owner = this.owner[a] === 0 ? 'you' : 'bot';
    fx.heat = mix(this.heat);
    player.y = mix(this.py);
    player.half = mix(this.ph);
    player.flash = mix(this.pf);
    bot.y = mix(this.oy);
    bot.half = mix(this.oh);
    bot.flash = mix(this.of);
  }

  /** A struck ball in the replay gets its ring again, so the moment reads. */
  private replayEvent(world: World, i: number): void {
    const event = this.events[i]!;
    if (event === 0) return;
    const x = this.bx[i]!;
    const y = this.by[i]!;
    if (event & (REPLAY_HIT_YOU | REPLAY_HIT_BOT)) {
      const side: Side = event & REPLAY_HIT_YOU ? 'you' : 'bot';
      const paddle = side === 'you' ? world.player : world.bot;
      const hue = hueOf(world, side);
      world.rings.spawn(paddle.x, y, hue, BALL_R * 6, 0.5, 5);
      world.particles.emit(
        x,
        y,
        14,
        {
          angle: side === 'you' ? 0 : Math.PI,
          spread: 1.4,
          speed: 220,
          life: 0.6,
          size: 3.4,
          color: hsla(hue, 100, 70, 0.9)
        },
        world.motion
      );
    }
    if (event & REPLAY_WALL) {
      world.rings.spawn(x, y, ballHue(world), BALL_R * 3.5, 0.4, 3);
    }
  }
}
