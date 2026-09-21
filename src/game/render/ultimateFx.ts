import { activeUltimate } from '../abilities';
import { ULTIMATE_BURST } from '../casts';
import { hsla } from '../palette';
import { clamp } from '../utils/math';
import { toScreenX, toScreenY } from '../view';
import type { World } from '../world';

/**
 * What a capstone does to the whole page.
 *
 * Everything here is drawn in *screen* space, over the full viewport and
 * outside the court's clip, because the point of it is that it cannot be
 * missed by someone whose eyes are on the ball. The court-level animation in
 * `abilityFx.ts` says which skill fired; this says that one fired at all.
 *
 * Three layers, in the order they are drawn:
 *
 *  1. `backdrop` - the space around the court takes the skill's colour for as
 *     long as the effect runs. It is behind the court, so it can never make
 *     the ball or the paddles harder to read, and on a phone - where the
 *     court nearly fills the screen - it is the border of the whole page.
 *  2. `overlay`'s rim - the same colour again, gently, *over* everything, so
 *     the glow is there on a wide screen too.
 *  3. `overlay`'s wave - a single band of light leaving the paddle and
 *     crossing the entire viewport, past all four corners, once.
 *
 * Gradients are cached and rebuilt only when the hue or the viewport changes;
 * one allocation per frame for eight seconds is exactly the cost the rest of
 * the renderer goes out of its way to avoid.
 */

/** How far past the furthest corner the wave travels before it is done. */
const WAVE_OVERRUN = 1.08;
/** Fraction of the wave's reach taken up by the band of light itself. */
const WAVE_BAND = 0.22;

/** Peak alpha of the wash behind the court, and of the rim over it. */
const BACKDROP_ALPHA = 0.5;
const RIM_ALPHA = 0.17;

/** Radius, as a fraction of the half-diagonal, where the rim starts. */
const RIM_INNER = 0.42;

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** The distance from `(x, y)` to the furthest corner of the viewport. */
function cornerReach(x: number, y: number, vw: number, vh: number): number {
  return Math.max(
    Math.hypot(x, y),
    Math.hypot(vw - x, y),
    Math.hypot(x, vh - y),
    Math.hypot(vw - x, vh - y)
  );
}

export class UltimateLayer {
  private hue = -1;
  private vw = 0;
  private vh = 0;
  private wash: CanvasGradient | null = null;

  /** Call whenever the viewport geometry changes. */
  invalidate(): void {
    this.wash = null;
    this.hue = -1;
  }

  /**
   * The rim gradient, cached per hue and viewport.
   *
   * Built at full opacity and faded with `globalAlpha`, so the breathing and
   * the fade-out at the end of the window cost nothing to animate.
   */
  private rimWash(ctx: CanvasRenderingContext2D, world: World, hue: number): CanvasGradient {
    const { vw, vh } = world.view;
    if (this.wash && this.hue === hue && this.vw === vw && this.vh === vh) return this.wash;

    const r = Math.hypot(vw, vh) / 2;
    const gradient = ctx.createRadialGradient(vw / 2, vh / 2, r * RIM_INNER, vw / 2, vh / 2, r);
    gradient.addColorStop(0, hsla(hue, 100, 55, 0));
    gradient.addColorStop(0.55, hsla(hue, 100, 52, 0.35));
    gradient.addColorStop(1, hsla(hue, 100, 58, 1));

    this.wash = gradient;
    this.hue = hue;
    this.vw = vw;
    this.vh = vh;
    return gradient;
  }

  /**
   * Behind the court: the page around the playfield, held in the capstone's
   * colour for the whole of its window.
   *
   * This is the layer that does the work the player never has to look for.
   * It is bright, because nothing is drawn on top of it that matters, and it
   * is the *only* thing in the game allowed to recolour the backdrop.
   */
  backdrop(ctx: CanvasRenderingContext2D, world: World): void {
    const live = activeUltimate(world);
    if (!live || world.match.status === 'menu') return;

    const { vw, vh } = world.view;
    // A slow breath rather than a pulse: eight seconds of flashing would be
    // punishing, eight seconds of a colour that is clearly alive is not.
    const breathe = 0.82 + 0.18 * Math.sin(world.fx.time * 2.4);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = BACKDROP_ALPHA * live.strength * breathe * (0.45 + 0.55 * world.motion);
    ctx.fillStyle = this.rimWash(ctx, world, live.hue);
    ctx.fillRect(0, 0, vw, vh);

    // A hairline right at the edge of the page, so the colour has an edge to
    // sit against on a screen where the court leaves almost no margin.
    ctx.globalAlpha *= 0.9;
    ctx.strokeStyle = hsla(live.hue, 100, 68, 1);
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, vw - 3, vh - 3);
    ctx.restore();
  }

  /** Over everything: the sustained rim, then the wave that opened it. */
  overlay(ctx: CanvasRenderingContext2D, world: World): void {
    if (world.match.status === 'menu') return;
    this.rim(ctx, world);
    this.wave(ctx, world);
  }

  /** The gentle copy of the backdrop, drawn on top so it reads on a wide screen. */
  private rim(ctx: CanvasRenderingContext2D, world: World): void {
    const live = activeUltimate(world);
    if (!live) return;

    const { vw, vh } = world.view;
    const breathe = 0.82 + 0.18 * Math.sin(world.fx.time * 2.4);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = RIM_ALPHA * live.strength * breathe * (0.4 + 0.6 * world.motion);
    ctx.fillStyle = this.rimWash(ctx, world, live.hue);
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();
  }

  /**
   * One band of light leaving the paddle and crossing the whole viewport.
   *
   * Drawn as a moving stop in a radial gradient rather than a stroked circle,
   * so it stays a wave of colour at any size instead of a hoop that happens
   * to be bigger than the screen. The impact lines behind it are what make it
   * read as speed rather than as a slow bloom.
   */
  private wave(ctx: CanvasRenderingContext2D, world: World): void {
    const { fx, view, motion } = world;
    if (fx.burst <= 0) return;

    const t = clamp(1 - fx.burst / ULTIMATE_BURST, 0, 1);
    const fade = 1 - t;
    const ox = toScreenX(view, fx.burstX, fx.burstY);
    const oy = toScreenY(view, fx.burstX, fx.burstY);
    const reach = cornerReach(ox, oy, view.vw, view.vh) * WAVE_OVERRUN;
    const head = easeOut(t) * reach;
    const band = reach * WAVE_BAND;
    const hue = fx.castHue;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = fade * fade * (0.45 + 0.55 * motion);

    // The three stops have to stay strictly increasing however far the head
    // has travelled, or the gradient throws.
    const span = reach * 1.25;
    const inner = clamp((head - band) / span, 0, 0.997);
    const crest = clamp(head / span, inner + 0.001, 0.998);
    const outer = clamp((head + band * 0.45) / span, crest + 0.001, 1);

    const gradient = ctx.createRadialGradient(ox, oy, 0, ox, oy, span);
    gradient.addColorStop(0, hsla(hue, 100, 60, 0));
    gradient.addColorStop(inner, hsla(hue, 100, 60, 0));
    gradient.addColorStop(crest, hsla(hue, 100, 66, 0.85));
    gradient.addColorStop(outer, hsla(hue, 100, 60, 0));
    if (outer < 1) gradient.addColorStop(1, hsla(hue, 100, 60, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, view.vw, view.vh);

    // The crest itself, so the wave has an edge rather than only a glow.
    ctx.globalAlpha = fade * fade * 0.7 * motion;
    ctx.strokeStyle = hsla(hue, 100, 82, 1);
    ctx.lineWidth = 3 + fade * 5;
    ctx.beginPath();
    ctx.arc(ox, oy, head, 0, Math.PI * 2);
    ctx.stroke();

    this.impactLines(ctx, world, ox, oy, reach, t);
    ctx.restore();
  }

  /**
   * Rays thrown out past the corners of the page in the first third of the
   * wave. They are what a player catches out of the corner of their eye -
   * the part of the effect that needs no attention at all.
   */
  private impactLines(
    ctx: CanvasRenderingContext2D,
    world: World,
    ox: number,
    oy: number,
    reach: number,
    t: number
  ): void {
    if (t > 0.55) return;
    const k = 1 - t / 0.55;
    const hue = world.fx.castHue;
    const spin = world.fx.castId * 0.37; // a different spoke pattern every cast

    ctx.globalAlpha = k * k * 0.75 * world.motion;
    ctx.strokeStyle = hsla(hue, 100, 78, 1);
    ctx.lineCap = 'butt';
    for (let i = 0; i < 22; i++) {
      const a = spin + (i * Math.PI * 2) / 22;
      const from = reach * (0.18 + easeOut(t) * 0.75);
      const to = from + reach * 0.4 * k;
      ctx.lineWidth = 2 + k * 5;
      ctx.beginPath();
      ctx.moveTo(ox + Math.cos(a) * from, oy + Math.sin(a) * from);
      ctx.lineTo(ox + Math.cos(a) * to, oy + Math.sin(a) * to);
      ctx.stroke();
    }
  }
}
