import type { ArenaAmbient } from '../../core/cosmetics/catalog';
import { FIELD_H } from '../constants';
import { hsla } from '../palette';
import type { World } from '../world';
import type { GlowCache } from './glow';

/**
 * The living part of an arena: what drifts, falls or flickers on its floor.
 *
 * Every arena cosmetic used to differ only in colour. Now each one has a
 * scene - stars over Midnight, embers rising off the Forge, rain and
 * lightning over Stormfront, a synthwave sun on Sunset Drive - drawn on the
 * court floor, under the grid, under everything that matters.
 *
 * Three rules keep a scene out of the way:
 *
 *  - It is faint. Nothing here is ever as bright as a paddle, let alone the
 *    ball; a scene is atmosphere, never information.
 *  - It is stateless. Every mote is a handful of random seeds, rolled once,
 *    and its position is a function of time - no pools to update, nothing to
 *    step, nothing that can drift out of sync with a paused game.
 *  - It knows which way is down. Rain falls down the *screen* and embers rise
 *    up it, so on an upright phone - where the court is turned a quarter -
 *    the scene is drawn in a frame turned with it.
 *
 * It does listen, a little: a hot rally and the soundtrack's beat lift it.
 */

interface Mote {
  /** 0..1 across the screen and down it. */
  u: number;
  v: number;
  /** 0.5..1.5, a per-mote pace. */
  speed: number;
  /** 0..1. */
  size: number;
  /** 0..1, where in its cycle it starts. */
  phase: number;
}

const COUNTS: Readonly<Record<ArenaAmbient, number>> = {
  stars: 72,
  motes: 30,
  data: 20,
  embers: 40,
  rain: 60,
  storm: 84,
  sparks: 30,
  gold: 44,
  bubbles: 28,
  sunset: 44
};

/** A stable pseudo-random 0..1 from an integer - for events that recur on a clock. */
function hash(n: number): number {
  const s = Math.sin(n * 91.3458 + 17.17) * 47453.5453;
  return s - Math.floor(s);
}

function frac(n: number): number {
  return n - Math.floor(n);
}

export class AmbientLayer {
  private kind: ArenaAmbient | null = null;
  private motes: Mote[] = [];

  private seed(kind: ArenaAmbient): void {
    this.kind = kind;
    this.motes = Array.from({ length: COUNTS[kind] }, () => ({
      u: Math.random(),
      v: Math.random(),
      speed: 0.5 + Math.random(),
      size: Math.random(),
      phase: Math.random()
    }));
  }

  /** Draw the scene, in field space, inside the court's clip. */
  draw(ctx: CanvasRenderingContext2D, world: World, glow: GlowCache): void {
    const kind = world.theme.ambient;
    if (kind !== this.kind) this.seed(kind);
    const { view, fx } = world;

    // U across the screen, V down it, both in field units.
    const U = view.rotated ? FIELD_H : view.w;
    const V = view.rotated ? view.w : FIELD_H;
    // Reduced motion keeps the scene but slows it right down.
    const t = fx.time * (0.3 + 0.7 * world.motion);
    const beat = world.match.status === 'menu' ? 0 : world.audio.beat();
    const lift = 0.85 + fx.heat * 0.4 + beat * 0.25;

    ctx.save();
    if (view.rotated) ctx.transform(0, 1, -1, 0, view.w, 0);
    switch (kind) {
      case 'stars':
        this.stars(ctx, U, V, t, lift, 1);
        this.shootingStar(ctx, U, V, t);
        break;
      case 'motes':
        this.drift(ctx, glow, U, V, t, lift);
        break;
      case 'data':
        this.data(ctx, U, V, t, lift);
        break;
      case 'embers':
        this.embers(ctx, glow, U, V, t, lift, 22, 0.08);
        break;
      case 'rain':
        this.rain(ctx, U, V, t, lift, false);
        break;
      case 'storm':
        this.rain(ctx, U, V, t, lift, true);
        this.lightning(ctx, U, V, t, world.motion);
        break;
      case 'sparks':
        this.sparks(ctx, U, V, t, lift);
        this.embers(ctx, glow, U, V, t, lift * 0.6, 16, 0.05);
        break;
      case 'gold':
        this.rays(ctx, U, V, t, lift);
        this.dust(ctx, U, V, t, lift);
        break;
      case 'bubbles':
        this.caustics(ctx, U, V, t, lift);
        this.bubbles(ctx, U, V, t, lift);
        break;
      case 'sunset':
        this.sun(ctx, U, V, t, lift, beat);
        this.stars(ctx, U, V * 0.42, t, lift, 0.7);
        break;
    }
    ctx.restore();
  }

  // --------------------------------------------------------------- scenes

  private stars(
    ctx: CanvasRenderingContext2D,
    U: number,
    V: number,
    t: number,
    lift: number,
    share: number
  ): void {
    ctx.fillStyle = hsla(215, 70, 88, 1);
    const count = Math.round(this.motes.length * share);
    for (let i = 0; i < count; i++) {
      const m = this.motes[i]!;
      const twinkle = 0.5 + 0.5 * Math.sin(t * (0.8 + m.speed * 1.6) + m.phase * 40);
      ctx.globalAlpha = (0.08 + 0.3 * twinkle * twinkle) * Math.min(1.3, lift);
      const s = 0.8 + m.size * 1.6;
      ctx.fillRect(m.u * U - s / 2, m.v * V - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  /** Every few seconds, one star falls - somewhere different each time. */
  private shootingStar(ctx: CanvasRenderingContext2D, U: number, V: number, t: number): void {
    const period = 6.5;
    const bucket = Math.floor(t / period);
    const local = t - bucket * period - hash(bucket) * 2;
    if (local < 0 || local > 0.8) return;
    const k = local / 0.8;
    const x0 = (0.1 + hash(bucket + 1) * 0.8) * U;
    const y0 = hash(bucket + 2) * 0.35 * V;
    const dx = (hash(bucket + 3) < 0.5 ? -1 : 1) * 0.55;
    const len = 220;
    const x = x0 + dx * len * k * 2;
    const y = y0 + len * k * 1.6;
    const tail = 90 * Math.sin(k * Math.PI);
    const gradient = ctx.createLinearGradient(x, y, x - dx * tail, y - tail * 0.8);
    gradient.addColorStop(0, hsla(210, 80, 92, 0.55 * Math.sin(k * Math.PI)));
    gradient.addColorStop(1, hsla(210, 80, 92, 0));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dx * tail, y - tail * 0.8);
    ctx.stroke();
  }

  /** Dusk: soft lights drifting on slow, crossing currents. */
  private drift(
    ctx: CanvasRenderingContext2D,
    glow: GlowCache,
    U: number,
    V: number,
    t: number,
    lift: number
  ): void {
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const x = frac(m.u + Math.sin(t * 0.05 * m.speed + m.phase * 9) * 0.06 + t * 0.004) * U;
      const y = frac(m.v + Math.cos(t * 0.04 * m.speed + m.phase * 7) * 0.05) * V;
      const r = 6 + m.size * 12;
      const hue = 280 + m.phase * 60;
      ctx.globalAlpha = (0.1 + 0.08 * Math.sin(t * 0.7 + m.phase * 20)) * lift;
      ctx.drawImage(glow.dot(hue, 62, 80), x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Grid: code falling down the lanes, and a scan line sweeping the floor. */
  private data(ctx: CanvasRenderingContext2D, U: number, V: number, t: number, lift: number): void {
    ctx.fillStyle = hsla(172, 90, 70, 1);
    for (const m of this.motes) {
      const x = Math.round((m.u * U) / 10) * 10;
      const head = frac(t * 0.09 * m.speed + m.phase) * (V + 160) - 80;
      for (let k = 0; k < 7; k++) {
        const y = head - k * 13;
        if (y < -10 || y > V + 10) continue;
        ctx.globalAlpha = (k === 0 ? 0.32 : 0.16 * (1 - k / 7)) * lift;
        ctx.fillRect(x - 1.5, y, 3, k === 0 ? 7 : 5);
      }
    }
    const scan = frac(t * 0.07) * V * 1.4 - V * 0.2;
    const band = ctx.createLinearGradient(0, scan - 40, 0, scan + 4);
    band.addColorStop(0, hsla(172, 90, 70, 0));
    band.addColorStop(1, hsla(172, 90, 70, 0.07 * lift));
    ctx.globalAlpha = 1;
    ctx.fillStyle = band;
    ctx.fillRect(0, scan - 40, U, 44);
  }

  /** Embers: rising, swaying, dying out towards the top. */
  private embers(
    ctx: CanvasRenderingContext2D,
    glow: GlowCache,
    U: number,
    V: number,
    t: number,
    lift: number,
    hue: number,
    rate: number
  ): void {
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const p = frac(t * rate * m.speed + m.phase);
      const y = V * (1.05 - p * 1.1);
      const x = m.u * U + Math.sin(t * 1.3 * m.speed + m.phase * 30) * 14;
      const life = Math.sin(p * Math.PI);
      const r = 3 + m.size * 5;
      ctx.globalAlpha = life * 0.28 * lift;
      ctx.drawImage(glow.dot(hue + m.size * 18, 60), x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = life * 0.5 * lift;
      ctx.fillStyle = hsla(hue + 12, 100, 70, 1);
      ctx.fillRect(x - 0.9, y - 0.9, 1.8, 1.8);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Neon rain, or a storm's: slanted streaks, all stroked in one path per colour. */
  private rain(
    ctx: CanvasRenderingContext2D,
    U: number,
    V: number,
    t: number,
    lift: number,
    storm: boolean
  ): void {
    const slant = storm ? 0.42 : 0.18;
    const hues = storm ? [205, 215] : [300, 186];
    ctx.lineCap = 'round';
    ctx.lineWidth = storm ? 1.3 : 1.5;
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = hsla(hues[pass]!, storm ? 40 : 90, storm ? 82 : 72, 1);
      ctx.globalAlpha = (storm ? 0.1 : 0.12) * lift;
      ctx.beginPath();
      for (let i = pass; i < this.motes.length; i += 2) {
        const m = this.motes[i]!;
        const p = frac(t * (storm ? 1.4 : 0.9) * m.speed + m.phase);
        const y = p * (V + 90) - 45;
        const x = m.u * (U + 80) - 40 + p * slant * 90;
        const len = 14 + m.size * (storm ? 26 : 16);
        ctx.moveTo(x, y);
        ctx.lineTo(x - slant * len, y - len);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Now and then the storm lights the court: a double flicker, a bolt, and
   * nothing for a few seconds. Faint, because it is behind a match.
   */
  private lightning(
    ctx: CanvasRenderingContext2D,
    U: number,
    V: number,
    t: number,
    motion: number
  ): void {
    const period = 7.3;
    const bucket = Math.floor(t / period);
    const local = t - bucket * period - hash(bucket * 3) * 3.5;
    if (local < 0 || local > 0.5) return;
    const flicker = Math.max(Math.exp(-local * 18), Math.exp(-Math.abs(local - 0.14) * 22) * 0.8);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = flicker * 0.08 * (0.4 + 0.6 * motion);
    ctx.fillStyle = hsla(210, 60, 88, 1);
    ctx.fillRect(0, 0, U, V);

    ctx.globalAlpha = flicker * 0.28;
    ctx.strokeStyle = hsla(205, 80, 90, 1);
    ctx.lineWidth = 2;
    ctx.lineJoin = 'bevel';
    ctx.beginPath();
    let x = (0.15 + hash(bucket + 7) * 0.7) * U;
    let y = -10;
    ctx.moveTo(x, y);
    for (let k = 1; k < 9; k++) {
      x += (hash(bucket * 13 + k) - 0.5) * 70;
      y += V * 0.08;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Forge: sparks thrown up off the floor in short arcs. */
  private sparks(
    ctx: CanvasRenderingContext2D,
    U: number,
    V: number,
    t: number,
    lift: number
  ): void {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.8;
    for (const m of this.motes) {
      const p = frac(t * 0.45 * m.speed + m.phase);
      const height = V * (0.12 + m.size * 0.32);
      const side = m.phase < 0.5 ? -1 : 1;
      const x = m.u * U + side * p * 70;
      const y = V - height * Math.sin(p * Math.PI);
      // The spark's own direction of travel, for its streak.
      const dx = side * 70;
      const dy = -height * Math.PI * Math.cos(p * Math.PI);
      const n = Math.hypot(dx, dy) || 1;
      ctx.globalAlpha = (1 - p) * 0.5 * lift;
      ctx.strokeStyle = hsla(34 + m.size * 16, 100, 66, 1);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - (dx / n) * 13, y - (dy / n) * 13);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Apex: broad shafts of light from above, turning slowly. Each one is three
   * wedges of widening spread laid over each other, so its edges fall away
   * softly instead of cutting the floor in two.
   */
  private rays(ctx: CanvasRenderingContext2D, U: number, V: number, t: number, lift: number): void {
    ctx.globalCompositeOperation = 'lighter';
    const ox = U / 2;
    const oy = -V * 0.3;
    const length = V * 1.7;
    const gradient = ctx.createLinearGradient(ox, oy, ox, oy + length);
    gradient.addColorStop(0, hsla(46, 100, 72, 0.028 * lift));
    gradient.addColorStop(0.55, hsla(46, 100, 72, 0.014 * lift));
    gradient.addColorStop(1, hsla(46, 100, 72, 0));
    ctx.fillStyle = gradient;
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(t * 0.18 + i * 2.1) * 0.2 + (i - 1) * 0.34;
      for (let layer = 1; layer <= 3; layer++) {
        const spread = (0.035 + i * 0.01) * layer;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + Math.sin(sway - spread) * length, oy + Math.cos(sway - spread) * length);
        ctx.lineTo(ox + Math.sin(sway + spread) * length, oy + Math.cos(sway + spread) * length);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Gold dust settling through the light. */
  private dust(ctx: CanvasRenderingContext2D, U: number, V: number, t: number, lift: number): void {
    ctx.fillStyle = hsla(46, 100, 76, 1);
    for (const m of this.motes) {
      const p = frac(t * 0.025 * m.speed + m.phase);
      const x = m.u * U + Math.sin(t * 0.5 + m.phase * 20) * 20;
      const y = p * V;
      const glint = 0.5 + 0.5 * Math.sin(t * 3 * m.speed + m.phase * 50);
      ctx.globalAlpha = (0.08 + glint * glint * 0.32) * lift;
      const s = 1 + m.size * 1.4;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  /** Abyss: light rippling on the floor as if from a surface far above. */
  private caustics(
    ctx: CanvasRenderingContext2D,
    U: number,
    V: number,
    t: number,
    lift: number
  ): void {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      const base = V * (0.14 + k * 0.24);
      for (let x = -20; x <= U + 20; x += 24) {
        const y =
          base +
          Math.sin(x * 0.012 + t * 0.7 + k * 1.7) * 22 +
          Math.sin(x * 0.031 - t * 0.5 + k) * 9;
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      // A wide, faint wash with a thin bright line through it: light on water.
      ctx.strokeStyle = hsla(186, 90, 70, 0.016 * lift);
      ctx.lineWidth = 26;
      ctx.stroke();
      ctx.strokeStyle = hsla(186, 90, 78, 0.05 * lift);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Bubbles wobbling up towards a surface that is never reached. */
  private bubbles(
    ctx: CanvasRenderingContext2D,
    U: number,
    V: number,
    t: number,
    lift: number
  ): void {
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = hsla(188, 80, 82, 1);
    ctx.fillStyle = hsla(188, 80, 92, 1);
    for (const m of this.motes) {
      const p = frac(t * 0.05 * m.speed + m.phase);
      const x = m.u * U + Math.sin(t * 1.9 * m.speed + m.phase * 40) * 7;
      const y = V * (1.05 - p * 1.1);
      const r = 2 + m.size * 5;
      const life = Math.sin(p * Math.PI);
      ctx.globalAlpha = life * 0.22 * lift;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = life * 0.3 * lift;
      ctx.fillRect(x - r * 0.45, y - r * 0.45, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Sunset Drive: the synthwave sun - a disc cut into bands that thicken and
   * part towards its foot - on the centre of the court, breathing with the
   * beat.
   */
  private sun(
    ctx: CanvasRenderingContext2D,
    U: number,
    V: number,
    t: number,
    lift: number,
    beat: number
  ): void {
    const cx = U / 2;
    const cy = V / 2;
    const r = Math.min(U, V) * (0.27 + beat * 0.006);
    const top = cy - r;
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.8);
    halo.addColorStop(0, hsla(330, 100, 60, 0.05 * lift));
    halo.addColorStop(1, hsla(330, 100, 60, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(cx - r * 1.8, cy - r * 1.8, r * 3.6, r * 3.6);

    // The disc: one vertical gradient, yellow at the crown to hot pink at the
    // foot, clipped to a true circle. Above the waist it is solid; below it
    // the classic bands, thinning as they fall and scrolling slowly down.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const fill = ctx.createLinearGradient(0, top, 0, cy + r);
    fill.addColorStop(0, hsla(52, 100, 62, 0.16 * lift));
    fill.addColorStop(0.5, hsla(18, 100, 60, 0.15 * lift));
    fill.addColorStop(1, hsla(328, 100, 60, 0.14 * lift));
    ctx.fillStyle = fill;
    ctx.fillRect(cx - r, top, r * 2, r * 1.04);
    const pitch = r / 6;
    const drift = frac(t * 0.12);
    for (let j = -1; j < 7; j++) {
      const y = cy + r * 0.04 + (j + drift) * pitch;
      const depth = Math.max(0, (y - cy) / r);
      const h = pitch * (1 - Math.min(0.85, 0.2 + depth * 0.75));
      ctx.fillRect(cx - r, Math.max(cy + r * 0.04, y), r * 2, h);
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }
}
