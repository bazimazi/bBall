import { t as translateText } from '../../core/i18n';
import { BALL_R } from '../constants';
import { easeOutBack, easeOutCubic, ORB_LIFE, orbAt } from '../effects';
import { aimedServe, serveAimAngle, VS_TIME } from '../match';
import { hsla } from '../palette';
import { clamp } from '../utils/math';
import { hueOf, type World } from '../world';
import type { GlowCache } from './glow';

/**
 * The match as a show: how it opens, how a point is carried home, where a
 * serve is aimed, and the replay of the point that settled it.
 *
 * None of this is gameplay and all of it is optional to the eye - it sits
 * over a serve, at the edge of the court, or after the match is decided -
 * so it can afford to be big.
 */

const orbPoint = { x: 0, y: 0 };

/** Points flying home to their pips: a bright core with a short tail, in field space. */
export function drawOrbs(ctx: CanvasRenderingContext2D, world: World, glow: GlowCache): void {
  const midX = world.view.w / 2;
  let open = false;
  for (const orb of world.orbs.items) {
    if (!orb.alive) continue;
    if (!open) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      open = true;
    }
    const t = clamp(orb.age / ORB_LIFE, 0, 1);
    const sprite = glow.dot(orb.hue, 66);
    // The tail: the same curve a little behind, fading.
    for (let k = 5; k >= 0; k--) {
      const lag = clamp(t - k * 0.035, 0, 1);
      orbAt(orb, lag, midX, orbPoint);
      const size = (k === 0 ? 30 : 22 - k * 3) * (0.8 + 0.2 * Math.sin(t * Math.PI));
      ctx.globalAlpha = k === 0 ? 0.95 : 0.5 * (1 - k / 6);
      ctx.drawImage(sprite, orbPoint.x - size, orbPoint.y - size, size * 2, size * 2);
    }
    orbAt(orb, t, midX, orbPoint);
    ctx.globalAlpha = 1;
    ctx.fillStyle = hsla(orb.hue, 100, 90, 1);
    ctx.beginPath();
    ctx.arc(orbPoint.x, orbPoint.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (open) ctx.restore();
}

/**
 * Where an aimed serve is going: a dashed guide leaving the ball along the
 * angle the serving paddle is setting, with a chevron at its end. It follows
 * the paddle live, so aiming is simply moving.
 */
export function drawServeAim(ctx: CanvasRenderingContext2D, world: World): void {
  if (!aimedServe(world)) return;
  const { ball, match, fx } = world;
  const angle = serveAimAngle(world);
  const dir = match.serveDir;
  const ux = Math.cos(angle) * dir;
  const uy = Math.sin(angle);
  const side = dir > 0 ? 'you' : 'bot';
  const hue = hueOf(world, side);
  const start = BALL_R + 12;
  const length = 118;
  const pulse = 0.55 + 0.25 * Math.sin(fx.time * 9);

  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = hsla(hue, 100, 76, 1);
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.setLineDash([7, 8]);
  ctx.lineDashOffset = -fx.time * 40;
  ctx.beginPath();
  ctx.moveTo(ball.x + ux * start, ball.y + uy * start);
  ctx.lineTo(ball.x + ux * (start + length), ball.y + uy * (start + length));
  ctx.stroke();
  ctx.setLineDash([]);

  const tipX = ball.x + ux * (start + length + 4);
  const tipY = ball.y + uy * (start + length + 4);
  const back = 13;
  const wide = 9;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tipX - ux * back - uy * wide, tipY - uy * back + ux * wide);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(tipX - ux * back + uy * wide, tipY - uy * back - ux * wide);
  ctx.stroke();
  ctx.restore();
}

/**
 * The versus card: the two names sliding in from their own sides on bands of
 * their own colour, "VS" landing between them, and what is being played
 * underneath. Screen space, upright on every device.
 */
export function drawVersusCard(
  ctx: CanvasRenderingContext2D,
  world: World,
  cx: number,
  cy: number,
  s: number,
  font: string
): void {
  const { fx, view } = world;
  if (fx.vsTimer <= 0 || !fx.vsLeft) return;
  const t = clamp(1 - fx.vsTimer / VS_TIME, 0, 1);
  const enter = easeOutCubic(clamp(t / 0.2, 0, 1));
  const leave = t > 0.78 ? easeOutCubic((t - 0.78) / 0.22) : 0;
  const alpha = Math.min(1, t / 0.08) * (1 - leave);
  const youHue = hueOf(world, 'you');
  const botHue = hueOf(world, 'bot');
  // Well above the centre spot, where the ball is waiting to be served.
  const y = cy - 132 * s;
  const bandH = 58 * s;
  const gap = 46 * s;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textBaseline = 'middle';

  // The bands: in from each edge, out the way they came.
  const reach = view.vw;
  const leftShift = (enter - 1 - leave) * reach * 0.6;
  const rightShift = (1 - enter + leave) * reach * 0.6;
  const slant = 18 * s;
  for (const [hue, sign, shift] of [
    [youHue, -1, leftShift],
    [botHue, 1, rightShift]
  ] as const) {
    const inner = cx + sign * (gap * 0.55) + shift;
    const outer = sign < 0 ? -20 + shift : view.vw + 20 + shift;
    const band = ctx.createLinearGradient(inner, 0, outer, 0);
    band.addColorStop(0, hsla(hue, 90, 50, 0.34));
    band.addColorStop(1, hsla(hue, 90, 40, 0.04));
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.moveTo(inner + sign * slant * 0.5, y - bandH / 2);
    ctx.lineTo(outer, y - bandH / 2);
    ctx.lineTo(outer, y + bandH / 2);
    ctx.lineTo(inner - sign * slant * 0.5, y + bandH / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hsla(hue, 100, 70, 0.9);
    ctx.fillRect(Math.min(inner, outer), y + bandH / 2 - 2 * s, Math.abs(outer - inner), 2 * s);
  }

  // The names, shrunk to fit their half if they have to be.
  const size = 30 * s;
  const room = cx - gap - 24 * s;
  for (const [name, hue, sign, shift] of [
    [fx.vsLeft, youHue, -1, leftShift],
    [fx.vsRight, botHue, 1, rightShift]
  ] as const) {
    const text = (sign < 0 && !world.rules.versus ? name : translateText(name)).toUpperCase();
    ctx.font = `850 ${size.toFixed(1)}px ${font}`;
    const width = ctx.measureText(text).width;
    const fit = width > room ? room / width : 1;
    ctx.save();
    ctx.translate(cx + sign * gap + shift, y);
    ctx.scale(fit, fit);
    ctx.textAlign = sign < 0 ? 'right' : 'left';
    ctx.fillStyle = hsla(hue, 100, 82, 1);
    ctx.fillText(text, 0, 1 * s);
    ctx.restore();
  }

  // "VS" lands between them with an overshoot.
  const pop = t < 0.12 ? 0 : easeOutBack(clamp((t - 0.12) / 0.2, 0, 1), 3);
  if (pop > 0) {
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(pop * (1 - leave * 0.5), pop * (1 - leave * 0.5));
    ctx.textAlign = 'center';
    ctx.font = `900 ${(24 * s).toFixed(1)}px ${font}`;
    ctx.fillStyle = 'rgba(238,242,255,0.95)';
    ctx.fillText(translateText('VS'), 0, 1 * s);
    ctx.restore();
  }

  if (fx.vsSub) {
    ctx.globalAlpha = alpha * clamp((t - 0.15) / 0.2, 0, 1);
    ctx.textAlign = 'center';
    ctx.font = `650 ${(14 * s).toFixed(1)}px ${font}`;
    ctx.fillStyle = 'rgba(238,242,255,0.72)';
    ctx.fillText(translateText(fx.vsSub), cx, y + bandH / 2 + 20 * s);
  }
  ctx.restore();
}

/**
 * The replay's frame around the court: cinematic bars closing in along the
 * court's long sides - never across its ends, where the paddles are - a
 * recording light, what to press to skip it, and how far through it is.
 * Screen space, over the court.
 */
export function drawReplayFrame(
  ctx: CanvasRenderingContext2D,
  world: World,
  font: string,
  coarse: boolean
): void {
  const { replay, view, fx } = world;
  const showing = replay.active
    ? 1
    : replay.pending > 0
      ? 1 - clamp(replay.pending / 0.35, 0, 1)
      : 0;
  if (showing <= 0) return;
  const s = clamp(Math.min(view.vw, view.vh) / 620, 0.62, 1.3);
  // Upright, the court's long axis runs down the screen, so the bars stand
  // at the sides instead.
  const across = view.rotated;
  const depth = Math.round((across ? view.vw : view.vh) * 0.075 * easeOutCubic(showing));

  ctx.save();
  ctx.fillStyle = 'rgba(2,3,8,0.86)';
  if (across) {
    ctx.fillRect(0, 0, depth, view.vh);
    ctx.fillRect(view.vw - depth, 0, depth, view.vh);
  } else {
    ctx.fillRect(0, 0, view.vw, depth);
    ctx.fillRect(0, view.vh - depth, view.vw, depth);
  }

  if (replay.active) {
    ctx.textBaseline = 'middle';
    const pad = 14 * s;
    const labelY = across ? 72 * s : Math.max(depth / 2, 20 * s);
    const labelX = across ? depth + pad : 20 * s;

    // The recording light and the word, on a pill of their own.
    ctx.font = `800 ${(15 * s).toFixed(1)}px ${font}`;
    const word = ctx.measureText(translateText('REPLAY')).width;
    ctx.fillStyle = 'rgba(2,3,8,0.7)';
    pill(ctx, labelX - 8 * s, labelY - 15 * s, word + 44 * s, 30 * s);
    const blink = Math.sin(fx.time * 6) > -0.2 ? 1 : 0.25;
    ctx.fillStyle = `rgba(255,70,90,${blink})`;
    ctx.beginPath();
    ctx.arc(labelX + 8 * s, labelY, 6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(238,242,255,0.94)';
    ctx.fillText(translateText('REPLAY'), labelX + 22 * s, labelY + 1);

    ctx.textAlign = 'right';
    ctx.font = `650 ${(12 * s).toFixed(1)}px ${font}`;
    ctx.fillStyle = 'rgba(238,242,255,0.55)';
    const hintY = across ? view.vh - 40 * s : view.vh - Math.max(depth / 2, 20 * s);
    const hintX = across ? view.vw - depth - pad : view.vw - 18 * s;
    ctx.fillText(
      translateText(coarse ? 'Tap to skip' : 'Click or press Space to skip'),
      hintX,
      hintY
    );

    // How much of the point is left to see.
    const hue = hueOf(world, world.match.winner ?? 'you');
    ctx.fillStyle = hsla(hue, 100, 66, 0.9);
    if (across) ctx.fillRect(depth - 2, 0, 2, view.vh * replay.progress);
    else ctx.fillRect(0, view.vh - depth, view.vw * replay.progress, 2);
  }
  ctx.restore();
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
