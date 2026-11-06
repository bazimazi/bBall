import { BALANCE } from '../../core/balance/config';
import {
  BALL_R,
  FIELD_H,
  MAX_PADDLE_SCALE,
  MIN_PADDLE_SCALE,
  PADDLE_H,
  PADDLE_W
} from '../constants';
import { hsla } from '../palette';
import { talentHue } from '../passiveFx';
import { ballTimeScale, flowStacks, nextCharged } from '../talents';
import { clamp } from '../utils/math';
import { ballHue, hueOf, type World } from '../world';

/**
 * The passive half of a build, drawn where it acts - for as long as it acts.
 *
 * `abilityFx.ts` draws what a skill is doing; this file draws what the
 * passives are doing between their payouts, so a build with no buttons still
 * reads at a glance: how much paddle the build added, where its edge criticals
 * live, that the next return is about to leave charged, that a Shield charge
 * is on its way back, that the ball is in Clutch's slowed half.
 *
 * The same two rules as the skills hold. Each mark is in its talent's branch
 * colour, never a brighter version of the player's; and the marks that carry
 * a read keep an alpha floor under Calm, while the decorative ones scale with
 * `world.motion`. Nothing here is drawn during a replay - those passives
 * belong to now, not to the point being replayed.
 */

const SHIELD_HUE_ALPHA = 0.55;

function live(world: World): boolean {
  const { status } = world.match;
  return status !== 'menu' && status !== 'over' && !world.rules.versus && !world.replay.active;
}

// ------------------------------------------------------------------ court

/**
 * Marks on the court itself, behind everything the player has to watch:
 * Shield's recharge running along the line, Clutch's slowed half, and
 * Reckless's bare goal line.
 */
export function drawCourtMarks(ctx: CanvasRenderingContext2D, world: World): void {
  if (!live(world)) return;
  drawShieldRecharge(ctx, world);
  drawClutch(ctx, world);
  drawReckless(ctx, world);
}

/**
 * A missing Shield charge, coming back: a line filling out from the middle
 * of the player's goal line towards both walls. When it meets them the
 * charge is back - and the `recharge` cast runs the same way, so the two read
 * as one motion.
 */
function drawShieldRecharge(ctx: CanvasRenderingContext2D, world: World): void {
  const { talents: runtime, loadout } = world;
  if (runtime.shieldMax <= 0 || runtime.shield >= runtime.shieldMax) return;
  const span = Math.max(0.01, loadout.effects.shieldRecharge);
  const progress = clamp(1 - runtime.shieldTimer / span, 0, 1);
  const hue = hueOf(world, 'you');
  const mid = FIELD_H / 2;
  const reach = progress * mid;

  ctx.save();
  // The track the charge is filling, so an empty wall still says "coming".
  ctx.fillStyle = hsla(hue, 60, 70, 0.14);
  ctx.fillRect(0, 0, 2, FIELD_H);
  ctx.fillStyle = hsla(hue, 100, 74, SHIELD_HUE_ALPHA);
  ctx.fillRect(0, mid - reach, 3, reach * 2);
  // The two heads, the part that moves.
  ctx.fillStyle = hsla(hue, 100, 86, 0.9);
  ctx.fillRect(0, mid - reach - 3, 4, 3);
  ctx.fillRect(0, mid + reach, 4, 3);
  ctx.restore();
}

/**
 * Clutch: the player's half, while the match is one point from lost. Tinted
 * always, and breathing while the ball is actually running slow in it - the
 * time Clutch lends is invisible otherwise.
 */
function drawClutch(ctx: CanvasRenderingContext2D, world: World): void {
  const { talents: runtime, loadout, view, fx, motion } = world;
  if (!runtime.clutch || loadout.effects.clutchSlow <= 0) return;
  const hue = talentHue('clutch');
  const slowed = ballTimeScale(world) < 1;
  const half = view.w / 2;
  const breathe = slowed ? 0.5 + 0.5 * Math.sin(fx.time * 5) : 0;

  ctx.save();
  const wash = ctx.createLinearGradient(0, 0, half, 0);
  const strength = (slowed ? 0.12 + breathe * 0.06 : 0.05) * Math.max(0.5, motion);
  wash.addColorStop(0, hsla(hue, 90, 60, strength));
  wash.addColorStop(1, hsla(hue, 90, 60, strength * 0.25));
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, half, FIELD_H);
  // The edge of the slowed half, so the ball is seen crossing into it.
  ctx.strokeStyle = hsla(hue, 100, 76, slowed ? 0.55 : 0.28);
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 9]);
  ctx.lineDashOffset = slowed ? -fx.time * 18 : 0;
  ctx.beginPath();
  ctx.moveTo(half - 4, 10);
  ctx.lineTo(half - 4, FIELD_H - 10);
  ctx.stroke();
  ctx.restore();
}

/** Reckless: nothing saves this player, so their goal line is drawn bare and hazardous. */
function drawReckless(ctx: CanvasRenderingContext2D, world: World): void {
  if (!world.loadout.effects.unsaved) return;
  const hue = talentHue('reckless');
  const flicker = 0.75 + 0.25 * Math.sin(world.fx.time * 9) * world.motion;
  ctx.save();
  ctx.strokeStyle = hsla(hue, 100, 62, 0.6 * flicker);
  ctx.lineWidth = 3;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.moveTo(1.5, 0);
  ctx.lineTo(1.5, FIELD_H);
  ctx.stroke();
  ctx.restore();
}

// ----------------------------------------------------------------- paddle

/**
 * Marks on the player's paddle: the length the build added past the plain
 * paddle, the edge zones that guarantee a critical, the face lit when the
 * next return will leave charged, and Flow State's stacks behind it.
 */
export function drawPaddleMarks(ctx: CanvasRenderingContext2D, world: World): void {
  if (!live(world)) return;
  drawReach(ctx, world);
  drawEdgeZones(ctx, world);
  drawChargedFace(ctx, world);
  drawFlow(ctx, world);
}

/**
 * Reach: where the plain paddle would have ended, ticked across the paddle,
 * with what lies past it lit. Long Reach is otherwise the one talent that is
 * always working and never visible; the same marks show every other length
 * source - a drive, Clutch, a skill's afterglow - growing past them.
 */
function drawReach(ctx: CanvasRenderingContext2D, world: World): void {
  const { player } = world;
  const plain = clamp(
    player.baseHalf * player.scale,
    (PADDLE_H / 2) * MIN_PADDLE_SCALE,
    (PADDLE_H / 2) * MAX_PADDLE_SCALE
  );
  const extra = player.half - plain;
  if (extra < 2) return;
  const hue = hueOf(world, 'you');
  const x = player.x - PADDLE_W / 2;

  ctx.save();
  ctx.fillStyle = hsla(hue, 100, 82, 0.2);
  ctx.fillRect(x, player.y - player.half, PADDLE_W, extra);
  ctx.fillRect(x, player.y + plain, PADDLE_W, extra);
  ctx.strokeStyle = 'rgba(238,242,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const s of [-1, 1]) {
    const y = player.y + s * plain;
    ctx.moveTo(x - 3, y);
    ctx.lineTo(x + PADDLE_W + 3, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Edge Pressure: the stretch at each end of the paddle where a contact is a
 * guaranteed charged critical, along the face that meets the ball. It is a
 * talent about aiming, so it is drawn as the target.
 */
function drawEdgeZones(ctx: CanvasRenderingContext2D, world: World): void {
  const threshold = world.loadout.effects.edgePressure;
  if (threshold <= 0) return;
  const { player, fx, motion } = world;
  const hue = talentHue('edge-pressure');
  const from = threshold * player.half;
  const to = player.half + BALL_R * 0.55;
  const face = player.x + PADDLE_W / 2 + 3;
  const shimmer = 0.75 + 0.25 * Math.sin(fx.time * 6) * motion;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = hsla(hue, 100, 66, 0.85 * shimmer);
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  for (const s of [-1, 1]) {
    ctx.moveTo(face, player.y + s * from);
    ctx.lineTo(face, player.y + s * to);
  }
  ctx.stroke();
  ctx.fillStyle = hsla(hue, 100, 62, 0.22);
  for (const s of [-1, 1]) {
    const a = player.y + s * from;
    const b = player.y + s * Math.min(to, player.half);
    ctx.fillRect(player.x - PADDLE_W / 2, Math.min(a, b), PADDLE_W, Math.abs(b - a));
  }
  ctx.restore();
}

/**
 * The next return will leave charged - a Momentum beat landing on it, Hot
 * Hand or Counterstrike charges in hand, a Blink Strike window open - so the
 * paddle's face is lit in that talent's colour. A charge the player did not
 * press a button for is one they would otherwise never know they had.
 */
function drawChargedFace(ctx: CanvasRenderingContext2D, world: World): void {
  const { talents: runtime, player, fx, motion } = world;
  // Power Strike and Overload already crackle across the face.
  if (runtime.strikeArmed > 0 || runtime.overload > 0) return;
  const source = nextCharged(world);
  if (!source) return;
  const hue = talentHue(source);
  const pulse = 0.65 + 0.35 * Math.sin(fx.time * 12) * Math.max(0.4, motion);
  const face = player.x + PADDLE_W / 2;

  ctx.save();
  ctx.strokeStyle = hsla(hue, 100, 70, 0.9 * pulse);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.shadowColor = hsla(hue, 100, 60, 0.9);
  ctx.shadowBlur = world.graphicsIntensity === 'high' ? 10 * motion : 0;
  ctx.beginPath();
  ctx.moveTo(face + 4, player.y - player.half + 4);
  ctx.lineTo(face + 4, player.y + player.half - 4);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Counted charges are counted on the face: Hot Hand's four, Counterstrike's three.
  if (runtime.primed > 0 && runtime.blink <= 0) {
    ctx.fillStyle = hsla(hue, 100, 78, 0.95);
    const gap = 9;
    const top = player.y - ((runtime.primed - 1) * gap) / 2;
    for (let i = 0; i < runtime.primed; i++) {
      ctx.beginPath();
      ctx.arc(face + 11, top + i * gap, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Flow State's stacks, as a string of beads down the middle of the paddle
 * that light one by one as the rally runs on - the read wearing down, made
 * visible. On the paddle rather than behind it, where the score pips live.
 */
function drawFlow(ctx: CanvasRenderingContext2D, world: World): void {
  const { loadout, player } = world;
  if (loadout.effects.flowAngle <= 0 && loadout.effects.flowHeft <= 0) return;
  const max = BALANCE.effects.flowState.stacks;
  const stacks = flowStacks(world);
  if (stacks <= 0) return;
  const hue = talentHue('flow-state');
  const span = Math.min(player.half * 2 - 14, max * 9);
  const gap = span / (max - 1);
  const top = player.y - span / 2;

  ctx.save();
  for (let i = 0; i < max; i++) {
    ctx.beginPath();
    ctx.arc(player.x, top + i * gap, i < stacks ? 2.3 : 1.4, 0, Math.PI * 2);
    if (i < stacks) {
      ctx.fillStyle = hsla(hue, 100, stacks >= max ? 82 : 68, 0.95);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(6,8,15,0.45)';
      ctx.fill();
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------- ball

/**
 * A heavy ball: the player's return wears a doubled, shivering edge either
 * side of its line - a blur of where it might be, which is exactly what Heavy
 * Impact, Flow State and a critical's weight do to the opponent's read. The
 * outlines always overlap the ball, so it never reads as a second one, and
 * they are gone the moment the opponent touches it.
 */
export function drawHeft(ctx: CanvasRenderingContext2D, world: World): void {
  const { ball, fx, motion } = world;
  if (!live(world) || world.match.status !== 'play') return;
  if (ball.owner !== 'you' || ball.heft < 0.05 || (ball.vx === 0 && ball.vy === 0)) return;
  const speed = Math.hypot(ball.vx, ball.vy) || 1;
  const nx = -ball.vy / speed;
  const ny = ball.vx / speed;
  const heft = clamp(ball.heft, 0, 1.2);
  // Heavier is a wider shiver, but never wider than the ball itself.
  const reach = BALL_R * Math.min(0.8, 0.25 + heft * 0.5);
  const wave = Math.sin(fx.time * 23);
  const hue = ballHue(world);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hsla(hue, 100, 74, 1);
  ctx.lineWidth = 1.6;
  ctx.globalAlpha = Math.min(0.45, 0.2 + heft * 0.2) * Math.max(0.5, motion);
  for (const s of [-1, 1]) {
    const off = reach * (0.65 + 0.35 * s * wave);
    ctx.beginPath();
    ctx.arc(ball.x + nx * off * s, ball.y + ny * off * s, BALL_R, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
