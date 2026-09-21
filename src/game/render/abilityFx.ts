import { abilityById } from '../../core/talents/abilities';
import { liveEffect } from '../abilities';
import { GhostTrail, ULTIMATE_BANNER, type Cast } from '../casts';
import { FIELD_H, PADDLE_W } from '../constants';
import { hsla } from '../palette';
import { paddleBuffed } from '../talents';
import { clamp } from '../utils/math';
import { hueOf, type World } from '../world';
import { roundRect } from './shapes';

/**
 * Every pixel a skill puts on the court.
 *
 * Split out of the renderer because it is the one part of the drawing that
 * grows with the catalogue: a new ability means a case in {@link drawCast}
 * for the moment it fires and, if it lasts, a case in {@link skillLayer} for
 * as long as it runs. The renderer itself stays the size it always was.
 *
 * Two rules hold the whole file together:
 *
 *  - Every mark a skill makes is in *that skill's* hue, never the player's,
 *    so two effects at once are two colours and never one brighter blur.
 *  - Every alpha is multiplied by `world.motion`, so a player who asked for
 *    reduced motion gets the same information at a quarter of the intensity
 *    rather than a different screen.
 */

/** Smooth 0..1 -> 0..1, fast out of the gate and slow into the wall. */
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** A cheap, stable pseudo-random in -1..1 from an integer seed. */
function jitter(seed: number): number {
  const n = Math.sin(seed * 127.1) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

/** One stroked ring. The workhorse of nearly every effect below. */
function ring(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  width: number,
  hue: number,
  alpha: number,
  light = 66
): void {
  if (alpha <= 0.005 || r <= 0) return;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = hsla(hue, 100, light, alpha);
  ctx.lineWidth = Math.max(0.5, width);
  ctx.stroke();
}

/**
 * A jagged bolt from one point to another.
 *
 * `seed` decides the kinks, so passing a time bucket makes a bolt that
 * flickers in place rather than one that crawls.
 */
function bolt(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  amp: number,
  seed: number
): void {
  const steps = 5;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const off = i === steps ? 0 : jitter(seed + i * 7.3) * amp;
    ctx.lineTo(x0 + dx * t + nx * off, y0 + dy * t + ny * off);
  }
  ctx.stroke();
}

// ------------------------------------------------------------ afterimages

/**
 * The paddle's afterimages, under everything else.
 *
 * Dash leaves three or four in a straight line because it teleported;
 * Slipstream leaves a continuous smear because it is simply moving faster
 * than a paddle is meant to. Same trail, two very different shapes - which
 * is exactly how the two skills feel.
 */
export function drawGhosts(ctx: CanvasRenderingContext2D, world: World): void {
  const { player, motion } = world;
  const hue = hueOf(world, 'you');

  for (const ghost of world.ghosts.items) {
    if (!ghost.alive) continue;
    const fade = GhostTrail.fade(ghost);
    ctx.save();
    ctx.globalAlpha = fade * fade * 0.4 * motion;
    ctx.fillStyle = hsla(hue, 95, 70, 1);
    roundRect(
      ctx,
      player.x - PADDLE_W / 2,
      ghost.y - ghost.half,
      PADDLE_W,
      ghost.half * 2,
      PADDLE_W / 2
    );
    ctx.fill();
    ctx.restore();
  }
}

/**
 * The streak a dash leaves between where the paddle was and where it is.
 *
 * A dash is instantaneous, so without this the paddle simply appears
 * somewhere else - the one ability in the game with no motion to read.
 */
export function drawDashStreak(ctx: CanvasRenderingContext2D, world: World): void {
  const { talents: runtime, player, loadout, motion } = world;
  if (runtime.dashFx <= 0) return;

  const def = abilityById('dash');
  const hue = def?.hue ?? 192;
  const t = clamp(runtime.dashFx / Math.max(0.01, loadout.effects.dashSeconds), 0, 1);
  const top = Math.min(runtime.dashFrom, player.y) - player.half;
  const bottom = Math.max(runtime.dashFrom, player.y) + player.half;
  const sign = player.y >= runtime.dashFrom ? 1 : -1;

  ctx.save();

  // The corridor itself: a band of the dash's colour between the two ends.
  const band = ctx.createLinearGradient(0, top, 0, bottom);
  const head = sign > 0 ? 1 : 0;
  band.addColorStop(0, hsla(hue, 100, 70, head > 0 ? 0 : 0.5 * t * motion));
  band.addColorStop(1, hsla(hue, 100, 70, head > 0 ? 0.5 * t * motion : 0));
  ctx.fillStyle = band;
  roundRect(ctx, player.x - PADDLE_W / 2, top, PADDLE_W, bottom - top, PADDLE_W / 2);
  ctx.fill();

  // Speed lines either side of the corridor, so the direction is unmistakable.
  ctx.globalAlpha = t * 0.75 * motion;
  ctx.strokeStyle = hsla(hue, 100, 78, 1);
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const off = (i - 2) * 7;
    const shrink = Math.abs(i - 2) * 9;
    ctx.beginPath();
    ctx.moveTo(player.x + off, top + shrink);
    ctx.lineTo(player.x + off, bottom - shrink);
    ctx.stroke();
  }

  // A ring at the point of departure, expanding as the streak fades.
  ring(ctx, player.x, runtime.dashFrom, 14 + (1 - t) * 34, 2.5 * t, hue, t * 0.7 * motion, 74);
  ctx.restore();
}

// ------------------------------------------------------------- live auras

interface Geom {
  /** The paddle's box, in field units. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** This slot's distance from the paddle. */
  pad: number;
}

/**
 * What the player's build is doing, drawn on the paddle itself.
 *
 * One layer per equipped skill, always at that slot's own distance from the
 * paddle and always in that skill's own hue, so two effects running at once
 * are two separate rings rather than one brighter blur. Passive paddle buffs
 * keep the quiet halo they always had, on the outside of the stack where they
 * cannot be mistaken for a skill.
 */
export function drawPlayerAura(ctx: CanvasRenderingContext2D, world: World): void {
  const { talents: runtime, player } = world;
  if (world.match.status === 'menu') return;

  const geom: Geom = {
    x: player.x - PADDLE_W / 2,
    y: player.y - player.half,
    w: PADDLE_W,
    h: player.half * 2,
    pad: 0
  };

  let outer = 4;
  for (let i = 0; i < runtime.slots.length; i++) {
    const id = runtime.slots[i]?.id;
    if (!id) continue;
    const def = abilityById(id);
    if (!def) continue;
    const live = liveEffect(world, id);
    if (!live.active) continue;

    // The slot decides the distance, not the order things were cast in: a
    // ring must never hop inwards because another effect ran out.
    geom.pad = 6 + i * 5.5;
    outer = Math.max(outer, geom.pad);
    skillLayer(ctx, world, id, def.hue, def.ultimate === true, geom);

    if (live.maxCharges > 0) {
      drawChargePips(ctx, world, live.charges, live.maxCharges, def.hue, geom.pad);
    }
  }

  // The passives sit outside every skill ring, so the two never touch.
  if (paddleBuffed(runtime)) {
    const pad = outer + 5;
    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = hsla(hueOf(world, 'you'), 100, 82, 1);
    ctx.lineWidth = 2;
    roundRect(
      ctx,
      geom.x - pad,
      geom.y - pad - 2,
      geom.w + pad * 2,
      geom.h + pad * 2 + 4,
      geom.w / 2 + pad
    );
    ctx.stroke();
    ctx.restore();
  }
}

/** The steady ring every skill wears, before its own flourish goes on top. */
function baseRing(
  ctx: CanvasRenderingContext2D,
  world: World,
  hue: number,
  ultimate: boolean,
  geom: Geom,
  pulse = 1
): void {
  const { pad, x, y, w, h } = geom;
  ctx.save();
  ctx.globalAlpha = (0.5 + 0.38 * pulse) * (0.55 + 0.45 * world.motion);
  ctx.strokeStyle = hsla(hue, 100, 62, 1);
  ctx.lineWidth = ultimate ? 3.5 : 3;
  ctx.shadowColor = hsla(hue, 100, 58, 0.9);
  ctx.shadowBlur = 16 * world.motion;
  roundRect(ctx, x - pad, y - pad - 3, w + pad * 2, h + pad * 2 + 6, w / 2 + pad);
  ctx.stroke();
  ctx.restore();
}

/**
 * The flourish that belongs to one skill and to no other.
 *
 * Each case answers the same question in its own visual language: what is
 * this skill doing to the next few seconds of the rally? Power Strike is
 * holding a charge, so it crackles; Perfect Guard is closing a window, so its
 * ring shrinks; Aegis is holding a line, so it draws one.
 */
function skillLayer(
  ctx: CanvasRenderingContext2D,
  world: World,
  id: string,
  hue: number,
  ultimate: boolean,
  geom: Geom
): void {
  const { fx, motion, talents: runtime, player, loadout } = world;
  const time = fx.time;

  switch (id) {
    // Held charge. It has to be *felt* rather than noticed, so it is the one
    // ordinary skill that pulses, and the arc across the paddle's face says
    // which direction the charge is about to go.
    case 'power-strike': {
      const pulse = motion > 0.5 ? 0.5 + 0.5 * Math.sin(time * 16) : 1;
      baseRing(ctx, world, hue, ultimate, geom, pulse);
      drawCrackle(ctx, world, hue, geom, 3, 0.55 + 0.45 * pulse);
      break;
    }

    case 'dash':
      baseRing(ctx, world, hue, ultimate, geom);
      break;

    // A window closing. The ring walks in towards the paddle as the window
    // runs out, so the read is a shape rather than a number.
    case 'perfect-guard': {
      const span = Math.max(0.01, loadout.effects.guardWindow);
      const left = clamp(runtime.guardWindow / span, 0, 1);
      drawGuardBrackets(ctx, geom, hue);
      drawGuardClose(ctx, world, hue, geom, left);
      break;
    }

    // Charged, critical, cornered - and burning while it waits. The bolts
    // are twice as many as Power Strike's and reach further out.
    case 'overload': {
      const pulse = motion > 0.5 ? 0.5 + 0.5 * Math.sin(time * 11) : 1;
      baseRing(ctx, world, hue, ultimate, geom, pulse);
      drawCrackle(ctx, world, hue, geom, 6, 0.8);
      break;
    }

    // Speed, drawn as the wake of it: streaks trailing the paddle, as long as
    // the paddle is currently moving fast.
    case 'slipstream': {
      baseRing(ctx, world, hue, ultimate, geom);
      drawSlipstreamWake(ctx, world, hue, geom);
      break;
    }

    // A line held. The barrier is at the goal, not on the paddle, because
    // the goal is the thing the skill is actually defending.
    case 'aegis': {
      baseRing(ctx, world, hue, ultimate, geom);
      drawAegisWall(ctx, world, hue);
      break;
    }

    // Peak form: a crown of rays that turns, and the only halo in the game
    // that does not pulse. Zenith is steadiness, so it is drawn steady.
    case 'zenith': {
      baseRing(ctx, world, hue, ultimate, geom);
      drawZenithRays(ctx, world, hue, geom);
      break;
    }

    // Every other skill, ready again: a second ring shadowing the first, one
    // beat behind it - the echo of the aura rather than a new shape.
    case 'echo': {
      baseRing(ctx, world, hue, ultimate, geom);
      const beat = (time * 1.6) % 1;
      ctx.save();
      ctx.globalAlpha = (1 - beat) * 0.5 * motion;
      ctx.strokeStyle = hsla(hue, 100, 74, 1);
      ctx.lineWidth = 2;
      const grow = geom.pad + beat * 22;
      roundRect(
        ctx,
        geom.x - grow,
        geom.y - grow - 3,
        geom.w + grow * 2,
        geom.h + grow * 2 + 6,
        geom.w / 2 + grow
      );
      ctx.stroke();
      ctx.restore();
      break;
    }

    default:
      baseRing(ctx, world, hue, ultimate, geom);
      break;
  }

  // Slipstream is the one skill that changes the paddle's shape, so it also
  // gets a lit cap at each end - the player has to see what they gained.
  if (id === 'slipstream') {
    ctx.save();
    ctx.globalAlpha = 0.7 * motion;
    ctx.fillStyle = hsla(hue, 100, 76, 1);
    for (const end of [geom.y, geom.y + geom.h]) {
      ctx.beginPath();
      ctx.ellipse(player.x, end, geom.w * 0.55, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Bolts crawling the paddle's face, for the two skills that hold a charge. */
function drawCrackle(
  ctx: CanvasRenderingContext2D,
  world: World,
  hue: number,
  geom: Geom,
  count: number,
  strength: number
): void {
  const { x, y, w, h, pad } = geom;
  // Re-seeded a dozen times a second: a bolt should snap between shapes, not
  // slide between them.
  const bucket = Math.floor(world.fx.time * 14);

  ctx.save();
  ctx.globalAlpha = 0.75 * strength * world.motion;
  ctx.strokeStyle = hsla(hue, 100, 78, 1);
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.shadowColor = hsla(hue, 100, 60, 0.9);
  ctx.shadowBlur = 8 * world.motion;

  for (let i = 0; i < count; i++) {
    const seed = bucket * 31 + i * 17;
    const a = y + ((jitter(seed) + 1) / 2) * h;
    const b = y + ((jitter(seed + 3.7) + 1) / 2) * h;
    const side = i % 2 === 0 ? 1 : -1;
    bolt(ctx, x + w / 2, a, x + w / 2 + side * (pad + 18), b, 5, seed);
  }
  ctx.restore();
}

/**
 * Perfect Guard, as two brackets rather than a ring.
 *
 * It is the one skill whose whole value is a timing read, so it gets a shape
 * of its own: unmistakable at a glance, and it leaves the paddle's silhouette
 * readable while the ball is on the way.
 */
function drawGuardBrackets(ctx: CanvasRenderingContext2D, geom: Geom, hue: number): void {
  const { x, y, w, h, pad } = geom;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = hsla(hue, 100, 72, 1);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.shadowColor = hsla(hue, 100, 60, 0.8);
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x - pad - 4, y - 4);
  ctx.lineTo(x - pad - 4, y + h + 4);
  ctx.moveTo(x + w + pad + 4, y - 4);
  ctx.lineTo(x + w + pad + 4, y + h + 4);
  ctx.stroke();
  ctx.restore();
}

/** The window itself: a ring that closes onto the paddle as the time goes. */
function drawGuardClose(
  ctx: CanvasRenderingContext2D,
  world: World,
  hue: number,
  geom: Geom,
  left: number
): void {
  const { x, y, w, h, pad } = geom;
  const reach = pad + 4 + left * 30;

  ctx.save();
  ctx.globalAlpha = (0.35 + 0.5 * (1 - left)) * world.motion;
  ctx.strokeStyle = hsla(hue, 100, 80, 1);
  ctx.lineWidth = 1.5 + (1 - left) * 2;
  ctx.setLineDash([9, 7]);
  ctx.lineDashOffset = -world.fx.time * 26;
  roundRect(ctx, x - reach, y - reach, w + reach * 2, h + reach * 2, w / 2 + reach);
  ctx.stroke();
  ctx.restore();
}

/** Slipstream's wake: streaks behind the paddle, scaled by how fast it moves. */
function drawSlipstreamWake(
  ctx: CanvasRenderingContext2D,
  world: World,
  hue: number,
  geom: Geom
): void {
  const { player, motion } = world;
  const speed = clamp(Math.abs(player.vy) / 1400, 0, 1);
  if (speed < 0.06) return;

  const sign = player.vy > 0 ? -1 : 1; // the wake is behind, not in front
  const len = 20 + speed * 90;

  ctx.save();
  ctx.globalAlpha = speed * 0.8 * motion;
  ctx.strokeStyle = hsla(hue, 100, 78, 1);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    const from = player.y + sign * (geom.h / 2);
    ctx.beginPath();
    ctx.moveTo(player.x + i * 6, from);
    ctx.lineTo(player.x + i * 6, from + sign * len * (1 - Math.abs(i) * 0.35));
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Aegis, drawn where it actually works: across the player's own goal line.
 *
 * Wider and brighter than the passive Shield wash it stands in front of, and
 * built out of cells that light up one per save left - so "two balls saved"
 * is something the player can see without reading the HUD.
 */
function drawAegisWall(ctx: CanvasRenderingContext2D, world: World, hue: number): void {
  const { talents: runtime, fx, motion, view } = world;
  const saves = runtime.aegisSaves;
  if (saves <= 0) return;

  const width = 46;
  const shimmer = 0.5 + 0.5 * Math.sin(fx.time * 3.2);

  ctx.save();
  const wash = ctx.createLinearGradient(0, 0, width, 0);
  wash.addColorStop(0, hsla(hue, 100, 64, (0.4 + shimmer * 0.16) * motion));
  wash.addColorStop(1, hsla(hue, 100, 64, 0));
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, view.h);

  // The face of the barrier, and the lattice that makes it look like one.
  ctx.fillStyle = hsla(hue, 100, 82, (0.65 + shimmer * 0.3) * motion);
  ctx.fillRect(0, 0, 4, view.h);

  ctx.globalAlpha = (0.3 + shimmer * 0.2) * motion;
  ctx.strokeStyle = hsla(hue, 100, 80, 1);
  ctx.lineWidth = 1.2;
  const cell = 34;
  const drift = (fx.time * 16) % cell;
  ctx.beginPath();
  for (let y = -cell + drift; y < view.h + cell; y += cell) {
    ctx.moveTo(4, y);
    ctx.lineTo(width, y + cell / 2);
    ctx.moveTo(4, y + cell);
    ctx.lineTo(width, y + cell / 2);
  }
  ctx.stroke();
  ctx.restore();
}

/** Zenith's crown: rays that turn slowly around the paddle. */
function drawZenithRays(
  ctx: CanvasRenderingContext2D,
  world: World,
  hue: number,
  geom: Geom
): void {
  const { player, motion, fx } = world;
  const spin = fx.time * 0.9;
  const inner = geom.h / 2 + geom.pad + 8;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.globalAlpha = 0.55 * motion;
  ctx.strokeStyle = hsla(hue, 100, 78, 1);
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.shadowColor = hsla(hue, 100, 64, 0.9);
  ctx.shadowBlur = 12 * motion;
  for (let i = 0; i < 8; i++) {
    const a = spin + (i * Math.PI) / 4;
    const long = i % 2 === 0 ? 20 : 11;
    // Squashed onto the paddle's own proportions, so the crown hugs the
    // shape it belongs to rather than floating in a circle around it.
    const sx = Math.cos(a) * 0.42;
    const sy = Math.sin(a);
    ctx.beginPath();
    ctx.moveTo(sx * inner, sy * inner);
    ctx.lineTo(sx * (inner + long), sy * (inner + long));
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Uses left of a counted effect - Overload's returns, Aegis's saves - as pips
 * above the paddle, in that skill's hue. The same number is on the HUD
 * button; this is the copy the player can read without looking away.
 */
function drawChargePips(
  ctx: CanvasRenderingContext2D,
  world: World,
  charges: number,
  max: number,
  hue: number,
  pad: number
): void {
  const { player } = world;
  const gap = 9;
  const y = player.y - player.half - pad - 10;
  const left = player.x - ((max - 1) * gap) / 2;

  ctx.save();
  for (let i = 0; i < max; i++) {
    ctx.beginPath();
    ctx.arc(left + i * gap, y, i < charges ? 3.4 : 2.6, 0, Math.PI * 2);
    if (i < charges) {
      ctx.fillStyle = hsla(hue, 100, 70, 0.95);
      ctx.shadowColor = hsla(hue, 100, 60, 0.9);
      ctx.shadowBlur = 10 * world.motion;
      ctx.fill();
    } else {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = hsla(hue, 70, 70, 0.35);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ casts

/** Every one-shot skill animation currently running. */
export function drawCasts(ctx: CanvasRenderingContext2D, world: World): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const cast of world.casts.items) {
    if (!cast.alive) continue;
    drawCast(ctx, cast, clamp(cast.age / cast.life, 0, 1));
  }
  ctx.restore();
}

function drawCast(ctx: CanvasRenderingContext2D, cast: Cast, t: number): void {
  const { hue, x, y, size, strength } = cast;
  const fade = 1 - t;

  switch (cast.kind) {
    // The court-wide ring a capstone opens with: one wave out, one behind it.
    case 'shockwave': {
      const r = easeOut(t) * size * 0.5;
      ring(ctx, x, y, r, 7 * fade, hue, fade * fade * 0.85 * strength, 72);
      ring(ctx, x, y, r * 0.62, 4 * fade, hue, fade * 0.5 * strength, 82);
      break;
    }

    // Power Strike: three arcs collapsing onto the paddle, then a flare as
    // they land. The motion is inwards - the charge is being *taken on*.
    case 'power-strike': {
      const r = (1 - easeOut(t)) * size + 16;
      ctx.save();
      ctx.lineWidth = 4 * (0.4 + fade * 0.6);
      ctx.strokeStyle = hsla(hue, 100, 72, fade * 0.95 * strength);
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(x, y, r, a, a + 1.1);
        ctx.stroke();
      }
      ctx.restore();
      if (t > 0.6) {
        const flare = (t - 0.6) / 0.4;
        ring(ctx, x, y, 12 + flare * 40, 5 * (1 - flare), hue, (1 - flare) * 0.9 * strength, 84);
      }
      break;
    }

    // Dash: a ripple at the point of departure. The streak itself is drawn
    // live from the runtime, because it has to follow the paddle.
    case 'dash': {
      ring(ctx, x, y, 10 + easeOut(t) * size, 3 * fade, hue, fade * 0.8 * strength, 78);
      break;
    }

    // Perfect Guard opening: a single bloom outwards, so the player sees the
    // window start before the ring begins walking back in.
    case 'perfect-guard': {
      ring(ctx, x, y, easeOut(t) * size, 3.5 * fade, hue, fade * 0.9 * strength, 80);
      break;
    }

    // Overload: a column of fire up the paddle's lane, plus a hard ring.
    case 'overload': {
      const grow = easeOut(Math.min(1, t * 1.6));
      const halfW = 26 + grow * 26;
      const column = ctx.createLinearGradient(x - halfW, 0, x + halfW, 0);
      column.addColorStop(0, hsla(hue, 100, 60, 0));
      column.addColorStop(0.5, hsla(hue, 100, 62, fade * 0.5 * strength));
      column.addColorStop(1, hsla(hue, 100, 60, 0));
      ctx.fillStyle = column;
      ctx.fillRect(x - halfW, 0, halfW * 2, FIELD_H);
      ring(ctx, x, y, easeOut(t) * size, 6 * fade, hue, fade * 0.9 * strength, 70);
      break;
    }

    // Slipstream: the lane itself lights up, top to bottom, because that is
    // the stretch of court the skill just handed the player.
    case 'slipstream': {
      const reach = easeOut(t) * FIELD_H * 0.6;
      ctx.save();
      ctx.globalAlpha = fade * 0.85 * strength;
      ctx.strokeStyle = hsla(hue, 100, 78, 1);
      ctx.lineWidth = 3 * fade;
      for (let i = -2; i <= 2; i++) {
        const lx = x + i * 9;
        const shrink = Math.abs(i) * 0.22;
        ctx.beginPath();
        ctx.moveTo(lx, y - reach * (1 - shrink));
        ctx.lineTo(lx, y + reach * (1 - shrink));
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    // Aegis: the barrier being raised. It sweeps out from the ball's height
    // to the full line, so the wall reads as something that was *built*.
    case 'aegis': {
      const reach = easeOut(t) * FIELD_H;
      ctx.save();
      ctx.globalAlpha = fade * 0.9 * strength;
      const wall = ctx.createLinearGradient(0, 0, 70, 0);
      wall.addColorStop(0, hsla(hue, 100, 72, 0.9));
      wall.addColorStop(1, hsla(hue, 100, 72, 0));
      ctx.fillStyle = wall;
      ctx.fillRect(0, Math.max(0, y - reach / 2), 70, reach);
      ctx.restore();
      ring(ctx, x, y, easeOut(t) * size, 5 * fade, hue, fade * 0.8 * strength, 76);
      break;
    }

    // Zenith: a shaft of light from above, landing on the paddle, and a halo
    // that settles rather than expands. Everything about it is vertical.
    case 'zenith': {
      const drop = easeOut(Math.min(1, t * 1.5));
      ctx.save();
      ctx.globalAlpha = fade * strength;
      const shaft = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
      shaft.addColorStop(0, hsla(hue, 100, 70, 0));
      shaft.addColorStop(0.5, hsla(hue, 100, 74, 0.45));
      shaft.addColorStop(1, hsla(hue, 100, 70, 0));
      ctx.fillStyle = shaft;
      ctx.fillRect(x - 40, y - drop * y, 80, drop * y);
      ctx.restore();
      ring(
        ctx,
        x,
        y,
        size * 0.45 * (1.4 - easeOut(t) * 0.4),
        4 * fade,
        hue,
        fade * 0.95 * strength,
        84
      );
      break;
    }

    // Echo: three rings, staggered, each one a little weaker than the last.
    case 'echo': {
      for (let i = 0; i < 3; i++) {
        const lag = t - i * 0.18;
        if (lag <= 0) continue;
        const k = Math.min(1, lag / 0.7);
        ring(
          ctx,
          x,
          y,
          easeOut(k) * size,
          4 * (1 - k),
          hue,
          (1 - k) * (0.85 - i * 0.2) * strength,
          74
        );
      }
      break;
    }

    // One beat of Echo's window, quiet enough to live under the rally.
    case 'echo-pulse': {
      ring(ctx, x, y, easeOut(t) * size, 2.5 * fade, hue, fade * fade * 0.45 * strength, 78);
      break;
    }

    // A charged or critical return leaving the paddle: a ring at the contact
    // and two chevrons pointing the way the ball went.
    case 'strike-impact': {
      ring(ctx, x, y, 8 + easeOut(t) * size, 5 * fade, hue, fade * 0.9 * strength, 76);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(cast.dir);
      ctx.globalAlpha = fade * fade * 0.95 * strength;
      ctx.strokeStyle = hsla(hue, 100, 84, 1);
      ctx.lineWidth = 4 * fade;
      for (let i = 0; i < 2; i++) {
        const reach = 16 + i * 16 + easeOut(t) * 46;
        ctx.beginPath();
        ctx.moveTo(reach - 12, -15);
        ctx.lineTo(reach, 0);
        ctx.lineTo(reach - 12, 15);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    // The guard read landing. Bright, short, and white at the core - it is a
    // moment of timing rather than a state, so nothing about it lingers.
    case 'guard-parry': {
      ring(ctx, x, y, 6 + easeOut(t) * size, 6 * fade, hue, fade * strength, 88);
      ctx.save();
      ctx.globalAlpha = fade * fade * 0.9 * strength;
      ctx.strokeStyle = hsla(hue, 60, 96, 1);
      ctx.lineWidth = 2;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const from = 12 + easeOut(t) * 30;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * from, y + Math.sin(a) * from);
        ctx.lineTo(x + Math.cos(a) * (from + 14), y + Math.sin(a) * (from + 14));
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    // Aegis catching one: the whole line flares, brightest where it was hit.
    case 'aegis-save': {
      ctx.save();
      ctx.globalAlpha = fade * fade * strength;
      const flare = ctx.createRadialGradient(0, y, 0, 0, y, 150 + easeOut(t) * 160);
      flare.addColorStop(0, hsla(hue, 100, 80, 0.85));
      flare.addColorStop(1, hsla(hue, 100, 70, 0));
      ctx.fillStyle = flare;
      ctx.fillRect(0, 0, 120, FIELD_H);
      ctx.restore();
      ring(ctx, 2, y, 10 + easeOut(t) * size, 5 * fade, hue, fade * 0.9 * strength, 84);
      break;
    }

    // A point handed back. The ring closes *inwards*, which is the only
    // motion in the game that runs that way - time being taken back.
    case 'zenith-refund': {
      const r = (1 - easeOut(t)) * size + 8;
      ring(ctx, x, y, r, 5, hue, (0.3 + fade * 0.7) * strength, 82);
      ring(ctx, x, y, r * 1.5, 2.5, hue, fade * 0.5 * strength, 78);
      break;
    }
  }
}

// ------------------------------------------------------------- the banner

/**
 * A capstone's name, in its own colour, under the court's centre.
 *
 * The one piece of text the game prints for a skill. It is here because four
 * round buttons and four coloured auras still do not tell a player *which*
 * forty-second cooldown they just spent - and because an ultimate that fires
 * without announcing itself does not feel like one.
 */
export function drawUltimateBanner(
  ctx: CanvasRenderingContext2D,
  world: World,
  cx: number,
  cy: number,
  s: number,
  font: string
): void {
  const { fx } = world;
  if (fx.castTimer <= 0 || !fx.castLabel) return;

  const t = clamp(1 - fx.castTimer / ULTIMATE_BANNER, 0, 1);
  // Snaps open, holds, then lets go - a banner that faded in would be read
  // after the moment it belongs to.
  const pop = 1 + Math.max(0, 0.35 - t) * 2.2;
  const alpha = t > 0.7 ? (1 - t) / 0.3 : 1;

  ctx.save();
  ctx.globalAlpha = alpha * (0.5 + 0.5 * world.motion);
  ctx.translate(cx, cy + 132 * s);
  ctx.scale(pop, pop);
  ctx.font = `800 ${(26 * s).toFixed(1)}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = hsla(fx.castHue, 100, 50, 0.9);
  ctx.shadowBlur = 18;
  ctx.fillStyle = hsla(fx.castHue, 100, 76, 1);
  ctx.fillText(fx.castLabel.toUpperCase(), 0, 0);

  // A hairline under it, drawn out from the centre as the banner lands.
  ctx.shadowBlur = 0;
  ctx.globalAlpha *= 0.7;
  const width = 54 * s * easeOut(Math.min(1, t * 3));
  ctx.strokeStyle = hsla(fx.castHue, 100, 70, 1);
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.moveTo(-width, 20 * s);
  ctx.lineTo(width, 20 * s);
  ctx.stroke();
  ctx.restore();
}
