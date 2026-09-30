import { FIELD_H } from './constants';
import type { Side } from './types';

/**
 * Presentation-only effects that belong to no one skill: the rings a hit
 * leaves behind, the short words that pop off a special return, the confetti
 * of a won match, and the court's own floor grid.
 *
 * Every system here is a fixed pool, allocated once, like the particles - a
 * long rally never reaches the garbage collector - and none of them is ever
 * read by physics. The simulation raises them; `render/` draws them.
 */

// ------------------------------------------------------------------ rings

export interface Ring {
  x: number;
  y: number;
  hue: number;
  /** Lightness of the stroke; the goal ring runs whiter than a wall tap. */
  light: number;
  age: number;
  life: number;
  /** Radius it grows to, in field units. */
  size: number;
  /** Stroke width at birth, in field units. */
  width: number;
  alive: boolean;
}

const RING_MAX = 18;

/** An expanding shockwave, eased out and thinning as it goes. */
export class RingSystem {
  readonly items: Ring[] = Array.from({ length: RING_MAX }, () => ({
    x: 0,
    y: 0,
    hue: 0,
    light: 70,
    age: 0,
    life: 0,
    size: 0,
    width: 0,
    alive: false
  }));

  private head = 0;

  spawn(x: number, y: number, hue: number, size: number, life = 0.32, width = 4, light = 70): void {
    const ring = this.items[this.head]!;
    this.head = (this.head + 1) % RING_MAX;
    ring.x = x;
    ring.y = y;
    ring.hue = hue;
    ring.light = light;
    ring.age = 0;
    ring.life = life;
    ring.size = size;
    ring.width = width;
    ring.alive = true;
  }

  update(dt: number): void {
    for (const ring of this.items) {
      if (!ring.alive) continue;
      ring.age += dt;
      if (ring.age >= ring.life) ring.alive = false;
    }
  }

  clear(): void {
    for (const ring of this.items) ring.alive = false;
  }
}

// ----------------------------------------------------------------- popups

export interface Popup {
  text: string;
  /** Field position it rose from. Drawn upright in screen space. */
  x: number;
  y: number;
  hue: number;
  /** Font size in field units, before the view scale. */
  size: number;
  age: number;
  life: number;
  alive: boolean;
}

const POPUP_MAX = 5;
export const POPUP_LIFE = 0.75;

/**
 * Words that rise off a return: FLICK, EDGE, SAVED. Few at a time on purpose
 * - a popup is a reward, and a screen full of them is noise.
 */
export class PopupSystem {
  readonly items: Popup[] = Array.from({ length: POPUP_MAX }, () => ({
    text: '',
    x: 0,
    y: 0,
    hue: 0,
    size: 20,
    age: 0,
    life: POPUP_LIFE,
    alive: false
  }));

  private head = 0;

  spawn(text: string, x: number, y: number, hue: number, size = 20): void {
    const popup = this.items[this.head]!;
    this.head = (this.head + 1) % POPUP_MAX;
    popup.text = text;
    popup.x = x;
    popup.y = y;
    popup.hue = hue;
    popup.size = size;
    popup.age = 0;
    popup.life = POPUP_LIFE;
    popup.alive = true;
  }

  update(dt: number): void {
    for (const popup of this.items) {
      if (!popup.alive) continue;
      popup.age += dt;
      if (popup.age >= popup.life) popup.alive = false;
    }
  }

  clear(): void {
    for (const popup of this.items) popup.alive = false;
  }
}

// ------------------------------------------------------------ score orbs

export interface Orb {
  side: Side;
  /** Field position it left from and the pip it is flying to. */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  hue: number;
  age: number;
  alive: boolean;
}

const ORB_MAX = 4;
/** Seconds an orb takes to reach its pip. */
export const ORB_LIFE = 0.55;

/**
 * A point, carried home. The moment a point is scored a ball of light leaves
 * the line it went through and arcs back to the scorer's column, and only
 * when it lands does the pip light - so the scoreboard is something that
 * *happens* rather than a number that changes.
 */
export class OrbSystem {
  readonly items: Orb[] = Array.from({ length: ORB_MAX }, () => ({
    side: 'you' as Side,
    fromX: 0,
    fromY: 0,
    toX: 0,
    toY: 0,
    hue: 0,
    age: 0,
    alive: false
  }));

  private head = 0;

  spawn(side: Side, fromX: number, fromY: number, toX: number, toY: number, hue: number): void {
    const orb = this.items[this.head]!;
    this.head = (this.head + 1) % ORB_MAX;
    orb.side = side;
    orb.fromX = fromX;
    orb.fromY = fromY;
    orb.toX = toX;
    orb.toY = toY;
    orb.hue = hue;
    orb.age = 0;
    orb.alive = true;
  }

  /** Is an orb still on its way to `side`'s column? */
  inFlight(side: Side): boolean {
    for (const orb of this.items) if (orb.alive && orb.side === side) return true;
    return false;
  }

  /**
   * Move every orb on. `land` is called once for each one that arrives this
   * step, with the orb itself.
   */
  update(dt: number, land: (orb: Orb) => void): void {
    for (const orb of this.items) {
      if (!orb.alive) continue;
      orb.age += dt;
      if (orb.age >= ORB_LIFE) {
        orb.alive = false;
        land(orb);
      }
    }
  }

  clear(): void {
    for (const orb of this.items) orb.alive = false;
  }
}

/** Where an orb is at `t` (0..1): an arc bowed towards the middle of the court. */
export function orbAt(orb: Orb, t: number, midX: number, out: { x: number; y: number }): void {
  const e = easeInOutCubic(t);
  const cx = (orb.fromX + orb.toX) / 2 + (midX - (orb.fromX + orb.toX) / 2) * 0.35;
  // Bowed upwards, but never out over the wall where the court would clip it.
  const cy = Math.max(30, Math.min(orb.fromY, orb.toY) - 120);
  const u = 1 - e;
  out.x = u * u * orb.fromX + 2 * u * e * cx + e * e * orb.toX;
  out.y = u * u * orb.fromY + 2 * u * e * cy + e * e * orb.toY;
}

// --------------------------------------------------------------- confetti

export interface Confetto {
  /** Screen position, in CSS pixels: confetti falls down the *screen*. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  w: number;
  h: number;
  hue: number;
  age: number;
  life: number;
  alive: boolean;
}

const CONFETTI_MAX = 90;
const CONFETTI_GRAVITY = 900;

/**
 * The winning point's confetti.
 *
 * Unlike every other effect it lives in screen space, because it falls: on a
 * portrait phone the field is turned a quarter, and confetti that fell
 * towards the field's "bottom" would drift sideways across the glass.
 */
export class ConfettiSystem {
  readonly items: Confetto[] = Array.from({ length: CONFETTI_MAX }, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    rot: 0,
    spin: 0,
    w: 0,
    h: 0,
    hue: 0,
    age: 0,
    life: 0,
    alive: false
  }));

  private head = 0;

  /** Burst `count` pieces from a screen point, fanned upwards. */
  burst(x: number, y: number, count: number, hues: readonly number[], power = 1): void {
    for (let i = 0; i < count; i++) {
      const piece = this.items[this.head]!;
      this.head = (this.head + 1) % CONFETTI_MAX;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const speed = (420 + Math.random() * 560) * power;
      piece.x = x;
      piece.y = y;
      piece.vx = Math.cos(angle) * speed;
      piece.vy = Math.sin(angle) * speed;
      piece.rot = Math.random() * Math.PI * 2;
      piece.spin = (Math.random() - 0.5) * 16;
      piece.w = 5 + Math.random() * 5;
      piece.h = 3 + Math.random() * 4;
      piece.hue = hues[i % hues.length] ?? 0;
      piece.age = 0;
      piece.life = 1.2 + Math.random() * 0.8;
      piece.alive = true;
    }
  }

  update(dt: number): void {
    const drag = Math.pow(0.985, dt * 60);
    for (const piece of this.items) {
      if (!piece.alive) continue;
      piece.age += dt;
      if (piece.age >= piece.life) {
        piece.alive = false;
        continue;
      }
      piece.vy += CONFETTI_GRAVITY * dt;
      piece.vx *= drag;
      piece.vy *= drag;
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      piece.rot += piece.spin * dt;
    }
  }

  get active(): boolean {
    for (const piece of this.items) if (piece.alive) return true;
    return false;
  }

  clear(): void {
    for (const piece of this.items) piece.alive = false;
  }
}

// ------------------------------------------------------------ court grid

/** Field units between two grid lines. */
export const GRID_STEP = 50;
const SPRING = 90;
const DAMPING = 7.5;
/** Largest displacement any impulse may cause, so the floor never tears. */
const MAX_OFFSET = 26;

/**
 * The court floor: a lattice of points that ripple away from every impact.
 *
 * Each point is its own damped spring pulled back to rest - no springs
 * between neighbours, which is what keeps it a few hundred multiplies a step
 * rather than the full Geometry Wars mesh. Once the energy has gone the grid
 * reports itself at rest and the renderer draws plain straight lines.
 */
export class CourtGrid {
  cols = 0;
  rows = 0;
  /** Displacement and velocity per point, row-major. */
  dx = new Float32Array(0);
  dy = new Float32Array(0);
  vx = new Float32Array(0);
  vy = new Float32Array(0);
  active = false;
  private width = 0;

  /** Match the lattice to the field's current length. */
  resize(width: number): void {
    if (Math.abs(width - this.width) < 0.5 && this.cols > 0) return;
    this.width = width;
    this.cols = Math.max(2, Math.round(width / GRID_STEP) + 1);
    this.rows = Math.round(FIELD_H / GRID_STEP) + 1;
    const n = this.cols * this.rows;
    this.dx = new Float32Array(n);
    this.dy = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.active = false;
  }

  /** Horizontal spacing: the columns stretch to fill the field exactly. */
  get stepX(): number {
    return this.width / Math.max(1, this.cols - 1);
  }

  get stepY(): number {
    return FIELD_H / Math.max(1, this.rows - 1);
  }

  /** Push every point near (x, y) outwards, falling off with distance. */
  impulse(x: number, y: number, strength: number, radius = 150): void {
    if (this.cols === 0 || strength <= 0) return;
    const sx = this.stepX;
    const sy = this.stepY;
    const inv = 1 / (radius * radius);
    const c0 = Math.max(0, Math.floor((x - radius * 2) / sx));
    const c1 = Math.min(this.cols - 1, Math.ceil((x + radius * 2) / sx));
    const r0 = Math.max(0, Math.floor((y - radius * 2) / sy));
    const r1 = Math.min(this.rows - 1, Math.ceil((y + radius * 2) / sy));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const px = c * sx - x;
        const py = r * sy - y;
        const d2 = px * px + py * py;
        const falloff = Math.exp(-d2 * inv);
        if (falloff < 0.02) continue;
        const d = Math.sqrt(d2) || 1;
        const i = r * this.cols + c;
        this.vx[i]! += (px / d) * strength * falloff;
        this.vy[i]! += (py / d) * strength * falloff;
      }
    }
    this.active = true;
  }

  update(dt: number): void {
    if (!this.active) return;
    let energy = 0;
    const n = this.dx.length;
    const damp = Math.exp(-DAMPING * dt);
    for (let i = 0; i < n; i++) {
      let vx = this.vx[i]! - this.dx[i]! * SPRING * dt;
      let vy = this.vy[i]! - this.dy[i]! * SPRING * dt;
      vx *= damp;
      vy *= damp;
      let dx = this.dx[i]! + vx * dt;
      let dy = this.dy[i]! + vy * dt;
      if (dx > MAX_OFFSET) dx = MAX_OFFSET;
      else if (dx < -MAX_OFFSET) dx = -MAX_OFFSET;
      if (dy > MAX_OFFSET) dy = MAX_OFFSET;
      else if (dy < -MAX_OFFSET) dy = -MAX_OFFSET;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.dx[i] = dx;
      this.dy[i] = dy;
      energy += Math.abs(dx) + Math.abs(dy) + Math.abs(vx) * 0.02 + Math.abs(vy) * 0.02;
    }
    if (energy < 0.5) {
      this.dx.fill(0);
      this.dy.fill(0);
      this.vx.fill(0);
      this.vy.fill(0);
      this.active = false;
    }
  }

  clear(): void {
    this.dx.fill(0);
    this.dy.fill(0);
    this.vx.fill(0);
    this.vy.fill(0);
    this.active = false;
  }
}

// ----------------------------------------------------------------- easing

export function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutBack(t: number, s = 1.70158): number {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}

/**
 * Cheap smooth noise in -1..1: two incommensurate sines. Camera shake reads
 * as a shudder with this rather than the per-frame white noise it used to be.
 */
export function wobble(t: number, seed: number): number {
  return (Math.sin(t * 2.1 + seed) + Math.sin(t * 3.7 + seed * 1.7) * 0.6) / 1.6;
}
