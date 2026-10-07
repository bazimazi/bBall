import type { ResolvedTheme } from '../../core/cosmetics/theme';
import { BALL_R, PADDLE_W } from '../constants';
import { hsla } from '../palette';
import type { Paddle, Vec2 } from '../types';
import { clamp } from '../utils/math';
import type { World } from '../world';
import { BAR_H, BAR_PAD, BAR_W, type GlowCache } from './glow';
import { roundRect } from './shapes';

/**
 * How each cosmetic is drawn.
 *
 * A ball, a trail and a paddle each have a *style* on top of their numbers,
 * and this is the one file that knows what a style looks like. Every style
 * keeps the same silhouette and the same brightness budget as the plain one -
 * a Void ball is no harder to follow than a Classic, a Pixel trail says as
 * much about where the ball has been as a Comet - so a cosmetic changes how
 * the game looks and never how it plays.
 */

/** A cheap, stable pseudo-random in -1..1 from a seed. */
function jitter(seed: number): number {
  const n = Math.sin(seed * 127.1) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

// ------------------------------------------------------------------ paddle

/** Samples along a paddle's spine. Enough for a smooth bow, few enough to be free. */
const SPINE = 14;
const spine: Vec2[] = Array.from({ length: SPINE }, () => ({ x: 0, y: 0 }));

/**
 * A paddle, bowed where the ball just struck it.
 *
 * The paddle is drawn as its own spine - a short polyline stroked as thick as
 * the paddle, with round or square caps - so a hit can push the middle of it
 * back like a struck string and it springs straight again as the flash fades.
 * The halo sprite behind it stays straight: the bow is a few units deep, and
 * the eye reads it off the crisp body, not the glow.
 */
export function drawPaddleBody(
  ctx: CanvasRenderingContext2D,
  world: World,
  glow: GlowCache,
  paddle: Paddle,
  dir: 1 | -1,
  hue: number,
  styled: boolean,
  alpha: number
): void {
  const theme = world.theme;
  const flash = paddle.flash;
  // Squash on contact: thicker and a touch shorter, springing back.
  const w = PADDLE_W * (1 + flash * 0.4);
  const h = paddle.half * 2 * (1 - flash * 0.07);
  const cx = paddle.x + dir * flash * 3;
  const top = paddle.y - h / 2;

  ctx.save();
  ctx.globalAlpha = alpha;

  // The halo: a pre-blurred capsule stretched to the paddle - the neon look
  // without a single shadowBlur in the frame loop.
  const halo = (0.62 + flash * 0.5) * theme.paddleGlow;
  if (halo > 0.01) {
    const x = cx - w / 2;
    const core = BAR_W - BAR_PAD * 2;
    const tall = BAR_H - BAR_PAD * 2;
    const sx = w / core;
    const sy = h / tall;
    const reach = 1 + flash * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, halo) * alpha;
    ctx.drawImage(
      glow.bar(hue, 58),
      x - BAR_PAD * sx * reach,
      top - BAR_PAD * sy * reach,
      (core + BAR_PAD * 2 * reach) * sx,
      (tall + BAR_PAD * 2 * reach) * sy
    );
    ctx.restore();
  }

  // The spine, bowed away from the ball at the point it struck.
  const round = theme.paddleRound >= 0.5;
  const inset = w / 2;
  const y0 = top + inset;
  const y1 = top + h - inset;
  // A gentle bow of the whole paddle, deepest at the contact - never a kink.
  const rubbery = paddle.equipment.surface === 'rubber' || paddle.equipment.surface === 'split';
  const firm = paddle.equipment.core === 'springsteel' || paddle.equipment.surface === 'ceramic';
  const bow = Math.min(1, flash) * (rubbery ? 5 : firm ? 1.8 : 3.6);
  const hitY = paddle.y + clamp(paddle.hitY, -paddle.half, paddle.half) * 0.6;
  const sigma = Math.max(22, h * 0.45);
  for (let i = 0; i < SPINE; i++) {
    const y = y0 + ((y1 - y0) * i) / (SPINE - 1);
    const d = (y - hitY) / sigma;
    spine[i]!.x = cx - dir * bow * Math.exp(-d * d);
    spine[i]!.y = y;
  }

  const body = styled && theme.paddleStyle === 'circuit' ? 40 : 62;
  ctx.lineCap = round ? 'round' : 'square';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = hsla(hue, 92, body + flash * 22, 1);
  ctx.lineWidth = w;
  strokeSpine(ctx, 0, SPINE);

  const style = styled ? theme.paddleStyle : 'capsule';
  switch (style) {
    case 'blade':
      bladeEdges(ctx, world, hue, w, flash);
      break;
    case 'halo':
      spineLight(ctx, hue, w, flash, 1);
      haloRing(ctx, world, hue, cx, top, w, h);
      break;
    case 'prism':
      prismSheen(ctx, world, hue, top, h, w, flash);
      break;
    case 'circuit':
      circuitTraces(ctx, world, hue, w, flash);
      break;
    default:
      spineLight(ctx, hue, w, flash, 1);
  }

  if (styled && theme.paddleEngraving > 0) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = hsla(hue, 20, 98, 0.85);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < theme.paddleEngraving; i++) {
      const y = top + h * 0.2 + i * 6;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.3, y);
      ctx.lineTo(cx, y + 3);
      ctx.lineTo(cx + w * 0.3, y);
      ctx.stroke();
    }
  }
  // Contact identity survives muted sound and the Calm effects setting.
  if (
    paddle.equipment.surface !== 'balanced-surface' ||
    paddle.equipment.core !== 'balanced-core'
  ) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = hsla(hue, 25, 94, 0.9);
    ctx.lineWidth = 1.5;
    const marks = paddle.equipment.surface === 'ceramic' ? 1 : rubbery ? 3 : 2;
    for (let i = 0; i < marks; i++) {
      const y = paddle.y + (i - (marks - 1) / 2) * 7;
      ctx.beginPath();
      ctx.moveTo(cx - w / 3, y);
      ctx.lineTo(cx + w / 3, y);
      ctx.stroke();
    }
    if (paddle.equipment.surface === 'split') {
      for (const sign of [-1, 1]) {
        const y = paddle.y + sign * paddle.half * 0.5;
        ctx.beginPath();
        ctx.moveTo(cx - w / 2, y);
        ctx.lineTo(cx + w / 2, y);
        ctx.stroke();
      }
    }
  }
  if (paddle.material.stored > 0 || paddle.material.switchCharge) {
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = hsla(hue, 50, 95, 1);
    ctx.lineWidth = 2;
    const y = paddle.y;
    ctx.beginPath();
    ctx.moveTo(cx + dir * 18, y - 7);
    ctx.lineTo(cx + dir * 24, y);
    ctx.lineTo(cx + dir * 18, y + 7);
    ctx.lineTo(cx + dir * 12, y);
    ctx.closePath();
    ctx.stroke();
  }
  // The contact ring: a rounded outline that flares and fades with the hit.
  if (flash > 0.02) {
    ctx.globalAlpha = flash * 0.5 * alpha;
    ctx.strokeStyle = hsla(hue, 100, 80, 1);
    ctx.lineWidth = 2;
    const radius = (w / 2) * theme.paddleRound + 5;
    roundRect(ctx, cx - w / 2 - 5, top - 5, w + 10, h + 10, radius);
    ctx.stroke();
  }
  ctx.restore();
}

function strokeSpine(ctx: CanvasRenderingContext2D, from: number, to: number, dx = 0): void {
  ctx.beginPath();
  ctx.moveTo(spine[from]!.x + dx, spine[from]!.y);
  for (let i = from + 1; i < to; i++) ctx.lineTo(spine[i]!.x + dx, spine[i]!.y);
  ctx.stroke();
}

/** The lit core down the middle: what makes a bar read as a glowing tube. */
function spineLight(
  ctx: CanvasRenderingContext2D,
  hue: number,
  w: number,
  flash: number,
  share: number
): void {
  ctx.strokeStyle = hsla(hue, 100, 88, (0.5 + flash * 0.35) * share);
  ctx.lineWidth = w * 0.32;
  ctx.lineCap = 'round';
  strokeSpine(ctx, 1, SPINE - 1);
}

/** Blade: two honed edges and a glint that runs up and down them. */
function bladeEdges(
  ctx: CanvasRenderingContext2D,
  world: World,
  hue: number,
  w: number,
  flash: number
): void {
  spineLight(ctx, hue, w * 0.55, flash, 0.8);
  ctx.strokeStyle = hsla(hue, 100, 90, 0.55 + flash * 0.3);
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'butt';
  strokeSpine(ctx, 0, SPINE, -w * 0.4);
  strokeSpine(ctx, 0, SPINE, w * 0.4);
  const k = (Math.sin(world.fx.time * 1.7) + 1) / 2;
  const at = spine[Math.round(k * (SPINE - 1))]!;
  ctx.fillStyle = hsla(hue, 60, 96, 0.8);
  ctx.beginPath();
  ctx.moveTo(at.x, at.y - 7);
  ctx.lineTo(at.x + w * 0.35, at.y);
  ctx.lineTo(at.x, at.y + 7);
  ctx.lineTo(at.x - w * 0.35, at.y);
  ctx.closePath();
  ctx.fill();
}

/** Halo: a second, fainter tube around the first. */
function haloRing(
  ctx: CanvasRenderingContext2D,
  world: World,
  hue: number,
  cx: number,
  top: number,
  w: number,
  h: number
): void {
  const pad = 6 + Math.sin(world.fx.time * 2.2) * 1.2;
  const x = cx - w / 2 - pad;
  const y = top - pad;
  const ww = w + pad * 2;
  const hh = h + pad * 2;
  const r = ww / 2;
  ctx.strokeStyle = hsla(hue, 100, 80, 0.5);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + ww, y, x + ww, y + hh, r);
  ctx.arcTo(x + ww, y + hh, x, y + hh, r);
  ctx.arcTo(x, y + hh, x, y, r);
  ctx.arcTo(x, y, x + ww, y, r);
  ctx.closePath();
  ctx.stroke();
}

/** Prism: light split into its colours, sliding along the paddle. */
function prismSheen(
  ctx: CanvasRenderingContext2D,
  world: World,
  hue: number,
  top: number,
  h: number,
  w: number,
  flash: number
): void {
  const shift = (world.fx.time * 0.35) % 1;
  const gradient = ctx.createLinearGradient(0, top, 0, top + h);
  for (let i = 0; i <= 6; i++) {
    const k = i / 6;
    gradient.addColorStop(k, hsla((hue + (k + shift) * 360) % 360, 100, 80, 0.85));
  }
  ctx.strokeStyle = gradient;
  ctx.lineWidth = w * 0.46;
  ctx.lineCap = 'round';
  strokeSpine(ctx, 1, SPINE - 1);
  spineLight(ctx, hue, w * 0.5, flash, 0.7);
}

/** Circuit: traces and pads etched down a dark board, with a signal running along it. */
function circuitTraces(
  ctx: CanvasRenderingContext2D,
  world: World,
  hue: number,
  w: number,
  flash: number
): void {
  ctx.strokeStyle = hsla(hue, 100, 78, 0.85);
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'butt';
  strokeSpine(ctx, 1, SPINE - 1);
  ctx.fillStyle = hsla(hue, 100, 84, 0.9);
  for (let i = 1; i < SPINE - 1; i++) {
    const p = spine[i]!;
    const side = i % 2 === 0 ? 1 : -1;
    ctx.fillRect(p.x - 1.6, p.y - 1.6, 3.2, 3.2);
    ctx.fillRect(p.x, p.y - 0.6, side * w * 0.36, 1.2);
  }
  // The signal: a bright pad travelling the length of the board.
  const k = (world.fx.time * 0.9) % 1;
  const at = Math.min(SPINE - 2, 1 + Math.floor(k * (SPINE - 2)));
  const p = spine[at]!;
  ctx.fillStyle = hsla(hue, 70, 96, 0.9 + flash * 0.1);
  ctx.fillRect(p.x - 2.6, p.y - 2.6, 5.2, 5.2);
}

// -------------------------------------------------------------------- ball

/**
 * The ball, in its equipped style. Called with the context already moved to
 * the ball's centre; `angle` is the frame the squash and stretch are drawn
 * in, `spin` how far it has rolled.
 */
export function drawBallStyled(
  ctx: CanvasRenderingContext2D,
  world: World,
  glow: GlowCache,
  hue: number,
  rx: number,
  ry: number,
  angle: number,
  speedT: number,
  spin: number
): void {
  const theme = world.theme;
  const style = theme.ballStyle;
  const time = world.fx.time;
  const { ball } = world;

  // Comet: the glow is dragged out behind the ball along its travel.
  if (style === 'comet' && theme.ballGlow > 0.01) {
    const travel = Math.atan2(ball.vy, ball.vx);
    const reach = BALL_R * (3.4 + speedT * 1.4);
    ctx.save();
    ctx.rotate(travel);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(glow.dot(hue, 64), -reach * 2.6, -reach * 0.7, reach * 3, reach * 1.4);
    ctx.restore();
  }

  // Nova: a corona that breathes.
  if (style === 'nova') {
    ctx.save();
    ctx.rotate(time * 0.8);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = hsla(hue, 100, 72, 0.55);
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI * 2) / 10;
      const long = BALL_R * (1.55 + 0.35 * Math.sin(time * 6 + i * 1.7) + speedT * 0.3);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.14) * BALL_R * 1.02, Math.sin(a - 0.14) * BALL_R * 1.02);
      ctx.lineTo(Math.cos(a) * long, Math.sin(a) * long);
      ctx.lineTo(Math.cos(a + 0.14) * BALL_R * 1.02, Math.sin(a + 0.14) * BALL_R * 1.02);
      ctx.fill();
    }
    ctx.restore();
  }

  // Void: an accretion disc, tilted, turning around a hole in the court.
  if (style === 'void') {
    ctx.save();
    ctx.rotate(0.45);
    ctx.strokeStyle = hsla(hue, 100, 70, 0.75);
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -time * 40;
    ctx.beginPath();
    ctx.ellipse(0, 0, BALL_R * 1.85, BALL_R * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  ctx.save();
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = theme.ballFill;
  ctx.fill();
  ctx.lineWidth = 2.5 * theme.ballRing;
  // The ring runs white-hot as the rally heats up; a pearl's shimmers through
  // the spectrum, a plasma ball's flickers between its hue and violet.
  const heat = world.fx.heat;
  const ringHue =
    style === 'pearl'
      ? (hue + Math.sin(time * 1.6) * 60 + 360) % 360
      : style === 'plasma'
        ? Math.floor(time * 14) % 2 === 0
          ? hue
          : 268
        : hue;
  ctx.strokeStyle = hsla(ringHue, 100, 68 + heat * 18, 0.9);
  ctx.stroke();
  ctx.restore();

  // Patterns that roll with the ball, clipped to it.
  switch (style) {
    case 'classic':
    case 'pearl': {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, rx * 0.92, ry * 0.92, angle, 0, Math.PI * 2);
      ctx.clip();
      ctx.rotate(spin);
      ctx.strokeStyle = hsla(hue, 70, style === 'pearl' ? 78 : 70, style === 'pearl' ? 0.5 : 0.35);
      ctx.lineWidth = 1.4;
      // A seam like a tennis ball's: two arcs bowing towards each other.
      ctx.beginPath();
      ctx.arc(-BALL_R * 1.1, 0, BALL_R * 1.05, -0.9, 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(BALL_R * 1.1, 0, BALL_R * 1.05, Math.PI - 0.9, Math.PI + 0.9);
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'star': {
      ctx.save();
      ctx.rotate(spin * 0.35 + time * 0.6);
      ctx.globalCompositeOperation = 'lighter';
      const twinkle = 0.75 + 0.25 * Math.sin(time * 9);
      ctx.fillStyle = hsla(48, 100, 90, 0.85 * twinkle);
      for (let i = 0; i < 2; i++) {
        ctx.rotate(Math.PI / 2);
        const long = BALL_R * (2.1 + speedT * 0.5) * (i === 0 ? 1 : 0.8);
        ctx.beginPath();
        ctx.moveTo(-long, 0);
        ctx.lineTo(0, -BALL_R * 0.22);
        ctx.lineTo(long, 0);
        ctx.lineTo(0, BALL_R * 0.22);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'plasma': {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = hsla(268, 100, 82, 0.9);
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round';
      const bucket = Math.floor(time * 16);
      for (let i = 0; i < 3; i++) {
        const seed = bucket * 7 + i * 13;
        const a = jitter(seed) * Math.PI;
        const mid = BALL_R * 0.55;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(
          Math.cos(a + jitter(seed + 1) * 0.6) * mid,
          Math.sin(a + jitter(seed + 1) * 0.6) * mid
        );
        ctx.lineTo(Math.cos(a) * BALL_R * 1.25, Math.sin(a) * BALL_R * 1.25);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'void': {
      ctx.beginPath();
      ctx.arc(0, 0, BALL_R * 0.45, 0, Math.PI * 2);
      ctx.strokeStyle = hsla(hue, 100, 76, 0.45);
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

// ------------------------------------------------------------------- trail

const edgeA: Vec2[] = [];
const edgeB: Vec2[] = [];

/** Sparks an Ember trail sheds, owned by the renderer: presentation only. */
interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  alive: boolean;
}

const EMBER_MAX = 48;
const embers: Ember[] = Array.from({ length: EMBER_MAX }, () => ({
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  age: 0,
  life: 0,
  alive: false
}));
let emberHead = 0;
let emberClock = 0;

/**
 * The trail behind the ball, in the equipped style. `dt` is the render
 * step's share of simulated time, for the few styles that shed something.
 */
export function drawTrailStyled(
  ctx: CanvasRenderingContext2D,
  world: World,
  hue: number,
  dt: number
): void {
  const theme: ResolvedTheme = world.theme;
  const trail = world.trail;
  const n = trail.length;
  const style = theme.trailStyle;

  if (style === 'ember') updateEmbers(world, dt);
  if (n < 3) {
    if (style === 'ember') drawEmbers(ctx, hue);
    return;
  }

  if (style === 'pixel') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = n - 1; i >= 0; i -= 2) {
      const t = i / (n - 1);
      const p = trail[i]!;
      const s = Math.max(2, Math.round((BALL_R * 1.5 * t) / 3) * 3);
      const x = Math.round(p.x / 4) * 4;
      const y = Math.round(p.y / 4) * 4;
      ctx.fillStyle = hsla(hue, 100, 64 + (1 - t) * 10, 0.55 * theme.trailAlpha * t);
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.restore();
    return;
  }

  // Every other style starts from the comet's strip. It is drawn as a
  // triangle strip: neighbouring quads share their joint edge exactly, so it
  // tapers with no seams, and - unlike one long self-intersecting polygon - a
  // sharp bounce cannot punch a hole in it.
  const width = style === 'ribbon' ? 0.52 : theme.trailWidth;
  for (let i = 0; i < n; i++) {
    const a = trail[Math.max(0, i - 1)]!;
    const b = trail[Math.min(n - 1, i + 1)]!;
    const here = trail[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const t = i / (n - 1);
    const w = BALL_R * 0.95 * width * t * t;
    const nx = len < 0.0001 ? 0 : (-dy / len) * w;
    const ny = len < 0.0001 ? 0 : (dx / len) * w;
    const ea = edgeA[i] ?? (edgeA[i] = { x: 0, y: 0 });
    const eb = edgeB[i] ?? (edgeB[i] = { x: 0, y: 0 });
    ea.x = here.x + nx;
    ea.y = here.y + ny;
    eb.x = here.x - nx;
    eb.y = here.y - ny;
  }

  const time = world.fx.time;
  const fade = style === 'ember' ? 0.7 : 1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 1; i < n; i++) {
    const t = i / (n - 1);
    const a0 = edgeA[i - 1]!;
    const a1 = edgeA[i]!;
    const b1 = edgeB[i]!;
    const b0 = edgeB[i - 1]!;
    ctx.beginPath();
    ctx.moveTo(a0.x, a0.y);
    ctx.lineTo(a1.x, a1.y);
    ctx.lineTo(b1.x, b1.y);
    ctx.lineTo(b0.x, b0.y);
    ctx.closePath();
    const quadHue = style === 'aurora' ? (hue + (1 - t) * 150 + time * 50) % 360 : hue;
    ctx.fillStyle = hsla(quadHue, 100, 64, 0.42 * theme.trailAlpha * t * t * fade);
    ctx.fill();
  }

  // Ribbon: a white-hot thread down the middle of the strip.
  if (style === 'ribbon') {
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6;
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1);
      ctx.strokeStyle = hsla(hue, 100, 88, 0.7 * t * t);
      ctx.beginPath();
      ctx.moveTo(trail[i - 1]!.x, trail[i - 1]!.y);
      ctx.lineTo(trail[i]!.x, trail[i]!.y);
      ctx.stroke();
    }
  }
  ctx.restore();

  if (style === 'ember') drawEmbers(ctx, hue);
}

function updateEmbers(world: World, dt: number): void {
  const { ball, match } = world;
  for (const e of embers) {
    if (!e.alive) continue;
    e.age += dt;
    if (e.age >= e.life) {
      e.alive = false;
      continue;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    const drag = Math.pow(0.9, dt * 60);
    e.vx *= drag;
    e.vy *= drag;
  }
  const moving = (ball.vx !== 0 || ball.vy !== 0) && match.status !== 'paused';
  if (!moving || dt <= 0) return;
  emberClock += dt;
  while (emberClock > 1 / 70) {
    emberClock -= 1 / 70;
    const e = embers[emberHead]!;
    emberHead = (emberHead + 1) % EMBER_MAX;
    const back = Math.atan2(-ball.vy, -ball.vx) + (Math.random() - 0.5) * 1.4;
    const speed = 40 + Math.random() * 80;
    e.x = ball.x;
    e.y = ball.y;
    e.vx = Math.cos(back) * speed;
    e.vy = Math.sin(back) * speed;
    e.age = 0;
    e.life = 0.3 + Math.random() * 0.35;
    e.alive = true;
  }
}

function drawEmbers(ctx: CanvasRenderingContext2D, hue: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const e of embers) {
    if (!e.alive) continue;
    const k = e.age / e.life;
    // From the ball's own colour to a dying orange.
    const h = hue + (((34 - hue + 540) % 360) - 180) * k;
    ctx.fillStyle = hsla((h + 360) % 360, 100, 64, (1 - k) * 0.8);
    const s = 2.6 * (1 - k * 0.6);
    ctx.fillRect(e.x - s / 2, e.y - s / 2, s, s);
  }
  ctx.restore();
}
