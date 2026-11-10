import { t as translateText, locale } from '../../core/i18n';
import { BALL_R, FIELD_H } from '../constants';
import { bumperHue, wellPolarity, WIND_WARNING } from '../arena';
import { hsla, PERSIAN_CANVAS_FONT } from '../palette';
import type { World } from '../world';
import type { GlowCache } from './glow';
import { roundRect } from './shapes';
import { courseSegments, gateOpening } from '../course';
import { SPARK_HUES } from '../sparks';
import { BALANCE } from '../../core/balance/config';
import type { SparkKind } from '../../core/modes/types';
import type { Paddle } from '../types';

/**
 * The court's hazards, drawn under the ball and over the floor.
 *
 * Each one is drawn so that what it *does* is visible before it does it: a
 * bumper glows where it will be, an orbit leaves its track, the wind shows
 * which way it blows and flashes the other way before it turns, and a
 * gravity well draws its pull inwards. Nothing here may be brighter than the
 * ball - the court tells the player what is coming, the ball is still the
 * thing to watch.
 */
export function drawArena(ctx: CanvasRenderingContext2D, world: World, glow: GlowCache): void {
  // What the sparks left each side holding outlives a court change, so it is
  // drawn whatever the court.
  drawSparkHolds(ctx, world, glow);
  const spec = world.arena.spec;
  if (!spec) return;
  drawCourse(ctx, world);
  if (spec.well) drawWell(ctx, world, glow);
  if (spec.wind) drawWind(ctx, world);
  if (world.arena.bricks.length > 0) drawBricks(ctx, world);
  if (world.arena.bumpers.length > 0) drawBumpers(ctx, world, glow);
  if (world.arena.portals.length > 0) drawPortals(ctx, world, glow);
  if (world.arena.warden) drawWarden(ctx, world, glow);
  if (world.arena.sparks.orbs.length > 0) drawSparks(ctx, world, glow);
}

/**
 * Each spark wears its effect as a glyph, readable at a glance and at any
 * court size: arrows apart for Wide, a flame for Fire, a wall for Ward,
 * arrows together for Hex. It pops in over a third of a second - the time in
 * which it cannot be taken - and then breathes gently.
 */
function drawSparks(ctx: CanvasRenderingContext2D, world: World, glow: GlowCache): void {
  const r = BALANCE.sparks.radius;
  for (const orb of world.arena.sparks.orbs) {
    const hue = SPARK_HUES[orb.kind];
    const pop = Math.min(1, orb.age / 0.3);
    const ease = 1 - Math.pow(1 - pop, 3);
    const size = r * ease * (1 + Math.sin(orb.age * 4.2) * 0.06);
    if (size <= 0.5) continue;
    const g = size * 2.8;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * ease;
    ctx.drawImage(glow.dot(hue, 62), orb.x - g, orb.y - g, g * 2, g * 2);
    ctx.restore();

    ctx.save();
    ctx.translate(orb.x, orb.y);
    ctx.rotate(orb.age * 0.9);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
    }
    ctx.closePath();
    ctx.fillStyle = hsla(hue, 70, 14, 0.92);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = hsla(hue, 100, 70, pop < 1 ? 0.6 : 0.95);
    ctx.stroke();
    ctx.restore();
    drawGlyph(ctx, orb.kind, orb.x, orb.y, size * 0.58, hsla(hue, 100, 80, 0.95));
  }
}

function drawGlyph(
  ctx: CanvasRenderingContext2D,
  kind: SparkKind,
  x: number,
  y: number,
  s: number,
  color: string
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.5, s * 0.28);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'wide' || kind === 'hex') {
    // Along the paddle's own axis: heads out for longer, heads in for shorter.
    for (const end of [-1, 1]) {
      const tip = end * s;
      ctx.moveTo(0, end * s * 0.25);
      ctx.lineTo(0, tip);
      const head = kind === 'wide' ? tip : end * s * 0.25;
      const back = (kind === 'wide' ? -end : end) * s * 0.42;
      ctx.moveTo(-s * 0.42, head + back);
      ctx.lineTo(0, head);
      ctx.lineTo(s * 0.42, head + back);
    }
    ctx.stroke();
  } else if (kind === 'fire') {
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(s * 0.9, -s * 0.1, s * 0.45, s * 0.7);
    ctx.quadraticCurveTo(0, s * 1.05, -s * 0.45, s * 0.7);
    ctx.quadraticCurveTo(-s * 0.9, -s * 0.1, 0, -s);
    ctx.fill();
  } else {
    ctx.moveTo(0, -s);
    ctx.lineTo(0, s);
    ctx.moveTo(-s * 0.55, -s * 0.6);
    ctx.quadraticCurveTo(-s * 0.15, 0, -s * 0.55, s * 0.6);
    ctx.moveTo(s * 0.55, -s * 0.6);
    ctx.quadraticCurveTo(s * 0.15, 0, s * 0.55, s * 0.6);
    ctx.stroke();
  }
  ctx.restore();
}

/** A held Ward lights its goal line; Wide, Hex and Fire tint the paddle that carries them. */
function drawSparkHolds(ctx: CanvasRenderingContext2D, world: World, glow: GlowCache): void {
  const sparks = world.arena.sparks;
  for (const side of ['you', 'bot'] as const) {
    const hold = sparks.hold[side];
    const flash = sparks.wardFlash[side];
    if (hold.ward > 0 || flash > 0) {
      const x = side === 'you' ? 3 : world.view.w - 3;
      const pulse = 0.55 + Math.sin(world.fx.time * 5) * 0.15;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = hsla(SPARK_HUES.ward, 100, 72, Math.max(hold.ward > 0 ? pulse : 0, flash));
      ctx.lineWidth = 4 + flash * 6;
      ctx.setLineDash(hold.ward > 0 ? [14, 8] : []);
      ctx.beginPath();
      ctx.moveTo(x, 10);
      ctx.lineTo(x, FIELD_H - 10);
      ctx.stroke();
      ctx.restore();
    }
    const paddle = side === 'you' ? world.player : world.bot;
    if (hold.wide > 0) aura(ctx, world, glow, paddle, SPARK_HUES.wide, hold.wide);
    if (hold.hex > 0) aura(ctx, world, glow, paddle, SPARK_HUES.hex, hold.hex);
    if (hold.fire > 0) aura(ctx, world, glow, paddle, SPARK_HUES.fire, 9);
  }
}

/** A soft glow along a paddle; it flickers in its last second so the end is no surprise. */
function aura(
  ctx: CanvasRenderingContext2D,
  world: World,
  glow: GlowCache,
  paddle: Paddle,
  hue: number,
  left: number
): void {
  const flicker = left < 1 ? 0.5 + 0.5 * Math.sin(world.fx.time * 30) : 1;
  const w = 34;
  const h = paddle.half * 2 + 30;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.55 * flicker;
  ctx.drawImage(glow.bar(hue, 62), paddle.x - w / 2, paddle.y - h / 2, w, h);
  ctx.restore();
}

/** The warden: a slimmer paddle in the boss's colour, on a faint track of its own. */
function drawWarden(ctx: CanvasRenderingContext2D, world: World, glow: GlowCache): void {
  const warden = world.arena.warden!;
  const hue = world.rules.boss?.hue ?? 0;
  ctx.save();
  ctx.strokeStyle = hsla(hue, 70, 70, 0.12);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 9]);
  ctx.beginPath();
  ctx.moveTo(warden.x, 0);
  ctx.lineTo(warden.x, FIELD_H);
  ctx.stroke();
  ctx.setLineDash([]);
  const h = warden.half * 2 + 26;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.35 + warden.flash * 0.5;
  ctx.drawImage(glow.bar(hue, 60), warden.x - 16, warden.y - h / 2, 32, h);
  ctx.restore();
  roundRect(ctx, warden.x - 5, warden.y - warden.half, 10, warden.half * 2, 5);
  ctx.fillStyle = hsla(hue, 80, 58 + warden.flash * 25, 0.92);
  ctx.fill();
}

function drawCourse(ctx: CanvasRenderingContext2D, world: World): void {
  const { arena, view } = world;
  ctx.save();
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const s of courseSegments(arena.spec, view.w, arena.time, arena.course)) {
    ctx.strokeStyle = s.rail < 0 ? '#91d9ff' : '#ffc47b';
    ctx.beginPath();
    ctx.moveTo(s.ax, s.ay);
    ctx.lineTo(s.bx, s.by);
    ctx.stroke();
    if (s.rail >= 0 && (arena.course.rails[s.rail] ?? -1) > 0) {
      drawCourseLabel(
        ctx,
        world,
        String(arena.course.rails[s.rail]),
        (s.ax + s.bx) / 2,
        (s.ay + s.by) / 2 - 10,
        '#ffc47b'
      );
    }
  }
  for (const [i, g] of (arena.spec?.gates ?? []).entries()) {
    const o = gateOpening(g, arena.time, arena.course.openUntil[i]);
    ctx.strokeStyle = '#91d9ff';
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 1;
    ctx.strokeRect(
      g.x * view.w - 4,
      (o.gap >= 1 ? 0 : o.center - o.gap / 2) * FIELD_H,
      8,
      o.gap * FIELD_H
    );
    ctx.setLineDash([]);
    drawCourseLabel(
      ctx,
      world,
      `${o.gap >= 1 ? 'Open' : 'Release'} ${Math.max(0, o.seconds).toFixed(1)}s`,
      g.x * view.w + 10,
      24,
      '#91d9ff'
    );
  }
  for (const s of arena.spec?.switches ?? []) {
    const x = s.x * view.w,
      y = s.y * FIELD_H;
    ctx.strokeStyle = '#a0ffca';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - s.r);
    ctx.lineTo(x + s.r, y);
    ctx.lineTo(x, y + s.r);
    ctx.lineTo(x - s.r, y);
    ctx.closePath();
    ctx.stroke();
  }
  for (const z of arena.spec?.zones ?? []) {
    ctx.fillStyle = 'rgba(255,196,123,.12)';
    ctx.fillRect(z.x * view.w, z.y * FIELD_H, z.w * view.w, z.h * FIELD_H);
    ctx.strokeStyle = '#ffc47b';
    ctx.lineWidth = 1;
    ctx.strokeRect(z.x * view.w, z.y * FIELD_H, z.w * view.w, z.h * FIELD_H);
  }
  ctx.restore();
}

/** Court geometry rotates on phones; its reading cues stay upright at a readable screen size. */
function drawCourseLabel(
  ctx: CanvasRenderingContext2D,
  { view }: World,
  text: string,
  x: number,
  y: number,
  color: string
): void {
  text = translateText(text);
  const pixel = 1 / view.scale;
  ctx.save();
  ctx.translate(x, y);
  if (view.rotated) ctx.rotate(Math.PI / 2);
  const font = locale() === 'fa-IR' ? PERSIAN_CANVAS_FONT : 'sans-serif';
  ctx.font = `${12 * pixel}px ${font}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(3,4,10,.85)';
  ctx.fillRect(-3 * pixel, -9 * pixel, ctx.measureText(text).width + 6 * pixel, 18 * pixel);
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/**
 * Portals: two mouths per pair, turning opposite ways, with motes forever
 * falling into them and a faint thread between the two so the pairing can be
 * read before the ball ever finds out. Both mouths flare together when the
 * ball goes through - the thing that just happened happened at both ends.
 */
function drawPortals(ctx: CanvasRenderingContext2D, world: World, glow: GlowCache): void {
  const { fx, motion } = world;
  for (const portal of world.arena.portals) {
    const flash = Math.max(portal.flashA, portal.flashB);
    ctx.save();
    ctx.strokeStyle = hsla(portal.hue, 90, 72, 1);
    ctx.globalAlpha = 0.07 + flash * 0.35 * motion;
    ctx.lineWidth = 2 + flash * 2;
    ctx.setLineDash([3, 11]);
    ctx.lineDashOffset = -fx.time * 30;
    ctx.beginPath();
    ctx.moveTo(portal.ax, portal.ay);
    ctx.lineTo(portal.bx, portal.by);
    ctx.stroke();
    ctx.restore();

    drawMouth(ctx, glow, world, portal.ax, portal.ay, portal.r, portal.hue, 1, portal.flashA);
    drawMouth(ctx, glow, world, portal.bx, portal.by, portal.r, portal.hue, -1, portal.flashB);
  }
}

function drawMouth(
  ctx: CanvasRenderingContext2D,
  glow: GlowCache,
  world: World,
  x: number,
  y: number,
  r: number,
  hue: number,
  spin: 1 | -1,
  flash: number
): void {
  const time = world.fx.time;
  const g = r * (2.3 + flash * 1.2);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.38 + flash * 0.5;
  ctx.drawImage(glow.dot(hue, 58), x - g, y - g, g * 2, g * 2);
  ctx.restore();

  // The dark of the hole itself.
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(3,4,10,0.92)';
  ctx.fill();

  ctx.save();
  ctx.lineCap = 'round';
  // Two sets of arms turning against each other: the swirl.
  for (const [radius, speed, width, alpha] of [
    [0.74, 2.2, 3, 0.75],
    [0.44, -3.1, 2.2, 0.55]
  ] as const) {
    ctx.strokeStyle = hsla(hue, 100, 70 + flash * 18, alpha);
    ctx.lineWidth = width;
    for (let k = 0; k < 3; k++) {
      const a = time * speed * spin + (k * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(x, y, r * radius, a, a + 1.25);
      ctx.stroke();
    }
  }
  // Motes spiralling in and vanishing at the centre.
  ctx.fillStyle = hsla(hue, 100, 82, 1);
  for (let i = 0; i < 7; i++) {
    const phase = (time * 0.7 + i / 7) % 1;
    const reach = r * (1.35 - phase * 1.25);
    const a = i * 0.9 + phase * 4.2 * spin + time * 0.6 * spin;
    ctx.globalAlpha = Math.min(1, phase * (1 - phase) * 3.2) * world.motion;
    ctx.beginPath();
    ctx.arc(
      x + Math.cos(a) * reach,
      y + Math.sin(a) * reach,
      0.8 + (1 - phase) * 1.6,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = hsla(hue, 100, 72 + flash * 20, 0.95);
  ctx.beginPath();
  ctx.arc(x, y, r * (1 + flash * 0.1), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBumpers(ctx: CanvasRenderingContext2D, world: World, glow: GlowCache): void {
  const hue = bumperHue(world);
  const sprite = glow.dot(hue, 60);
  const { view } = world;

  // Orbits first, faint, so a moving bumper's path is readable in advance.
  ctx.save();
  ctx.strokeStyle = hsla(hue, 70, 70, 0.08);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 10]);
  for (const bumper of world.arena.bumpers) {
    const slide = bumper.spec.slide;
    if (slide) {
      ctx.beginPath();
      ctx.moveTo(
        bumper.spec.x * view.w,
        Math.max(bumper.r, bumper.spec.y * FIELD_H - slide.amplitude)
      );
      ctx.lineTo(
        bumper.spec.x * view.w,
        Math.min(FIELD_H - bumper.r, bumper.spec.y * FIELD_H + slide.amplitude)
      );
      ctx.stroke();
    }
    const orbit = bumper.spec.orbit;
    if (!orbit) continue;
    ctx.beginPath();
    ctx.arc(bumper.spec.x * view.w, bumper.spec.y * FIELD_H, orbit.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();

  for (const bumper of world.arena.bumpers) {
    const { x, y, r, flash } = bumper;
    const g = r * (2.4 + flash * 1.4);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 + flash * 0.45;
    ctx.drawImage(sprite, x - g, y - g, g * 2, g * 2);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, r * (1 + flash * 0.12), 0, Math.PI * 2);
    ctx.fillStyle = hsla(hue, 60, 16 + flash * 20, 0.92);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = hsla(hue, 100, 70 + flash * 20, 0.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = hsla(hue, 100, 74 + flash * 20, 0.55 + flash * 0.4);
    ctx.fill();
  }
}

function drawWell(ctx: CanvasRenderingContext2D, world: World, glow: GlowCache): void {
  const spec = world.arena.spec?.well;
  if (!spec) return;
  const { arena, view, fx } = world;
  const x = spec.x * view.w;
  const y = spec.y * FIELD_H;
  const polarity = wellPolarity(world);
  const hue = polarity < 0 ? 32 : (world.rules.boss?.hue ?? 250);
  const strength = Math.min(1.6, (spec.strength * arena.intensity) / 900) * Math.abs(polarity);

  // Rings falling inwards forever: the pull, drawn.
  ctx.save();
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const t = (fx.time * 0.45 * arena.intensity + i / 4) % 1;
    const r = 26 + (polarity < 0 ? t : 1 - t) * 150;
    ctx.globalAlpha = t * 0.22 * strength;
    ctx.strokeStyle = hsla(hue, 90, 70, 1);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  const g = 70;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(glow.dot(hue, 56), x - g, y - g, g * 2, g * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, BALL_R * 1.3, 0, Math.PI * 2);
  ctx.fillStyle = '#05060c';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = hsla(hue, 100, 76, 0.9);
  ctx.stroke();
  // A fixed polarity glyph keeps the direction readable at any effect strength.
  ctx.strokeStyle = hsla(hue, 100, 76, 0.9);
  ctx.beginPath();
  ctx.moveTo(x - 5, y);
  ctx.lineTo(x + 5, y);
  if (polarity >= 0) {
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 5);
  }
  ctx.stroke();
}

function drawWind(ctx: CanvasRenderingContext2D, world: World): void {
  const spec = world.arena.spec?.wind;
  if (!spec) return;
  const { arena, view, fx } = world;
  const dir = arena.windDir;
  const warning = spec.period > 0 && arena.windTimer < WIND_WARNING;
  // Streaks drifting the way the wind blows.
  const speed = 160 * arena.intensity;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = hsla(195, 70, 80, 1);
  ctx.lineWidth = 1.6;
  const columns = Math.max(6, Math.round(view.w / 110));
  for (let i = 0; i < columns; i++) {
    const x = ((i + 0.5) / columns) * view.w;
    const laneDir = spec.shear && x < view.w / 2 ? -dir : dir;
    const offset = ((fx.time * speed + i * 137) % (FIELD_H + 120)) - 60;
    const y = laneDir > 0 ? offset : FIELD_H - offset;
    const length = 26 + (i % 3) * 12;
    ctx.globalAlpha = 0.09 + (i % 2) * 0.04;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - laneDir * length);
    ctx.stroke();
  }

  // Chevrons along both touchlines, pointing the way it blows - or, in the
  // last moments before it turns, flashing the way it is about to.
  const pointing = warning ? -dir : dir;
  const blink = warning ? (Math.sin(fx.time * 26) > 0 ? 1 : 0.25) : 1;
  ctx.globalAlpha = (warning ? 0.55 : 0.2) * blink;
  ctx.strokeStyle = warning ? hsla(38, 100, 66, 1) : hsla(195, 80, 80, 1);
  ctx.lineWidth = 3;
  for (const edge of [22, view.w - 22]) {
    const lanePointing = spec.shear && edge < view.w / 2 ? -pointing : pointing;
    for (let k = -1; k <= 1; k++) {
      const cy = FIELD_H / 2 + k * 70;
      ctx.beginPath();
      ctx.moveTo(edge - 10, cy - lanePointing * 8);
      ctx.lineTo(edge, cy + lanePointing * 4);
      ctx.lineTo(edge + 10, cy - lanePointing * 8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBricks(ctx: CanvasRenderingContext2D, world: World): void {
  for (const brick of world.arena.bricks) {
    if (!brick.alive) continue;
    const hue = world.theme[brick.side === 'you' ? 'youHue' : 'botHue'];
    const health = brick.hp / brick.maxHp;
    ctx.fillStyle = hsla(hue, 70, 34 + brick.flash * 40, 0.45 + health * 0.35);
    roundRect(ctx, brick.x, brick.y, brick.w, brick.h, 5);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hsla(hue, 100, 70 + brick.flash * 20, 0.55 + health * 0.35);
    ctx.stroke();
    if (brick.maxHp > 1 && brick.hp > 1) {
      // Armour: an inner line that the first hit knocks off.
      ctx.strokeStyle = hsla(hue, 100, 82, 0.6);
      ctx.lineWidth = 1.5;
      roundRect(ctx, brick.x + 4, brick.y + 4, brick.w - 8, brick.h - 8, 3);
      ctx.stroke();
    }
  }
}
