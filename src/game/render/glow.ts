import { hsla } from '../palette';

/**
 * Pre-rendered glow sprites.
 *
 * Each glow is painted into a small offscreen canvas and reused with
 * `drawImage`, avoiding repeated gradient and blur construction.
 *
 * Hues are quantised so a ball warming through a long rally re-uses a few
 * dozen sprites rather than minting one per frame. Each cache holds at most
 * 96 sprites, evicting the least recently used one rather than dropping the
 * paddle and ambient glows along with old ball colours.
 */

const SIZE = 128;
const HUE_STEP = 4;
const LIMIT = 96;

type Sprite = HTMLCanvasElement;

function hueBucket(hue: number): number {
  const rounded = Math.round(hue / HUE_STEP) * HUE_STEP;
  return ((rounded % 360) + 360) % 360;
}

/** Map insertion order tracks recency; a hit stays warm as old hues leave. */
function reuse(cache: Map<string, Sprite>, key: string): Sprite | undefined {
  const sprite = cache.get(key);
  if (sprite) {
    cache.delete(key);
    cache.set(key, sprite);
  }
  return sprite;
}

function remember(cache: Map<string, Sprite>, key: string, sprite: Sprite): void {
  if (cache.size >= LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, sprite);
}

function canvas(w: number, h: number): Sprite {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export class GlowCache {
  private readonly dots = new Map<string, Sprite>();
  private readonly bars = new Map<string, Sprite>();

  clear(): void {
    this.dots.clear();
    this.bars.clear();
  }

  /** A soft round glow, bright at the centre, gone at the edge. */
  dot(hue: number, light = 62, sat = 100): Sprite {
    const h = hueBucket(hue);
    const key = `${h}:${light}:${sat}`;
    let sprite = reuse(this.dots, key);
    if (sprite) return sprite;

    sprite = canvas(SIZE, SIZE);
    const ctx = sprite.getContext('2d');
    if (ctx) {
      const r = SIZE / 2;
      const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
      gradient.addColorStop(0, hsla(h, sat, light + 8, 1));
      gradient.addColorStop(0.16, hsla(h, sat, light, 0.62));
      gradient.addColorStop(0.45, hsla(h, sat, light - 4, 0.18));
      gradient.addColorStop(1, hsla(h, sat, light - 4, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
    remember(this.dots, key, sprite);
    return sprite;
  }

  /**
   * A paddle's halo: a blurred capsule, painted with `shadowBlur` offscreen
   * and reused at whatever length the paddle has grown to.
   */
  bar(hue: number, light = 60): Sprite {
    const h = hueBucket(hue);
    const key = `${h}:${light}`;
    let sprite = reuse(this.bars, key);
    if (sprite) return sprite;

    const w = 64;
    const tall = 192;
    sprite = canvas(w, tall);
    const ctx = sprite.getContext('2d');
    if (ctx) {
      const pad = 24;
      ctx.shadowColor = hsla(h, 95, light, 1);
      ctx.shadowBlur = 18;
      ctx.fillStyle = hsla(h, 95, light, 0.9);
      const x = pad;
      const y = pad;
      const bw = w - pad * 2;
      const bh = tall - pad * 2;
      const r = bw / 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + bw, y, x + bw, y + bh, r);
      ctx.arcTo(x + bw, y + bh, x, y + bh, r);
      ctx.arcTo(x, y + bh, x, y, r);
      ctx.arcTo(x, y, x + bw, y, r);
      ctx.closePath();
      ctx.fill();
      // Knock the solid core out again: the sprite is only the halo, and the
      // paddle itself is drawn crisp on top of it.
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fill();
    }
    remember(this.bars, key, sprite);
    return sprite;
  }
}

/** Margin, in sprite pixels, the halo extends past the paddle on each side. */
export const BAR_PAD = 24;
export const BAR_W = 64;
export const BAR_H = 192;
