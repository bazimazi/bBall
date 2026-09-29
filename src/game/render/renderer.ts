import type { ResolvedTheme } from '../../core/cosmetics/theme';
import { tracePath } from '../ai';
import { BALL_R, FIELD_H, PADDLE_W, SERVE_DELAY } from '../constants';
import { isMatchPoint } from '../match';
import { BACKDROP, CANVAS_FONT, heatHue, hsla } from '../palette';
import type { Paddle, Side, Vec2 } from '../types';
import { clamp } from '../utils/math';
import { applyFieldTransform, toScreenX, toScreenY } from '../view';
import { ballHue, hueOf, type World } from '../world';
import {
  drawCasts,
  drawDashStreak,
  drawGhosts,
  drawPlayerAura,
  drawUltimateBanner
} from './abilityFx';
import { BANNER_TIME } from '../arena';
import { easeOutBack, easeOutCubic, POPUP_LIFE } from '../effects';
import { drawArena } from './arenaFx';
import { BAR_H, BAR_PAD, BAR_W, GlowCache } from './glow';
import { roundRect } from './shapes';
import { UltimateLayer } from './ultimateFx';

const COURT_RADIUS = 26;
const COMBO_DURATION = 1.3;
/** How far a capstone's camera punch pushes the view in, at full strength. */
const PUNCH_ZOOM = 0.045;

/**
 * Canvas renderer. All drawing state lives here; the simulation never touches
 * the context. Gradients are cached and rebuilt only when the geometry, the
 * theme or the heat bucket changes - allocating them every frame costs real
 * time on low-end phones.
 */
export class Renderer {
  private readonly edgeA: Vec2[] = [];
  private readonly edgeB: Vec2[] = [];
  /** Foresight's path, reused every frame. */
  private readonly path: Vec2[] = [];

  private bgHeatBucket = -1;
  private bg: CanvasGradient | null = null;
  private court: CanvasGradient | null = null;
  private endGlow: Partial<Record<Side, CanvasGradient>> = {};
  private theme: ResolvedTheme | null = null;
  private readonly ultimate = new UltimateLayer();
  private readonly glow = new GlowCache();
  private vignette: CanvasGradient | null = null;
  /** Match-point heartbeat tint, per side, cached with the vignette. */
  private pressure: Partial<Record<Side, CanvasGradient>> = {};

  private readonly ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /** Call whenever the view geometry or the equipped theme changes. */
  invalidate(): void {
    this.bgHeatBucket = -1;
    this.court = null;
    this.endGlow = {};
    this.vignette = null;
    this.pressure = {};
    this.glow.clear();
    this.ultimate.invalidate();
  }

  render(world: World): void {
    const { ctx } = this;
    const { view, fx } = world;

    // A theme swap arrives through the engine, but catch it here too so a
    // cached gradient can never outlive the cosmetic it came from.
    if (this.theme !== world.theme) {
      this.theme = world.theme;
      this.invalidate();
    }

    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    this.drawBackground(world);
    // Behind the court, so a capstone colours the page without ever sitting
    // between the player and the ball.
    this.ultimate.backdrop(ctx, world);

    ctx.save();
    // The kick shoves the camera along the field's long axis, which is the
    // screen's vertical on a portrait phone.
    const kick = fx.kick * view.scale;
    ctx.translate(fx.shakeX + (view.rotated ? 0 : kick), fx.shakeY + (view.rotated ? -kick : 0));
    if (fx.shakeRot !== 0) {
      ctx.translate(view.cx, view.cy);
      ctx.rotate(fx.shakeRot);
      ctx.translate(-view.cx, -view.cy);
    }
    // The camera punch takes the court *and* the screen HUD with it - half a
    // zoom would read as the court resizing rather than as an impact.
    if (fx.punch > 0) {
      const zoom = 1 + fx.punch * PUNCH_ZOOM;
      ctx.translate(view.cx, view.cy);
      ctx.scale(zoom, zoom);
      ctx.translate(-view.cx, -view.cy);
    }

    ctx.save();
    applyFieldTransform(ctx, view);
    this.drawCourt(world);
    ctx.restore();

    this.drawScreenHud(world);
    ctx.restore();

    this.drawVignette(world);
    this.drawConfetti(world);

    // Over everything, and outside the punch: the wave has to cross the real
    // viewport, not a viewport that is itself being pushed around.
    this.ultimate.overlay(ctx, world);

    if (fx.flash > 0.01) {
      // A capstone washes the viewport in its own colour; everything else
      // gets the plain white one it always had.
      const alpha = fx.flash * 0.28;
      ctx.fillStyle =
        fx.flashHue < 0
          ? `rgba(255,255,255,${alpha.toFixed(3)})`
          : hsla(fx.flashHue, 100, 66, alpha);
      ctx.fillRect(0, 0, view.vw, view.vh);
    }
  }

  private drawBackground(world: World): void {
    const { ctx } = this;
    const { view, fx, theme } = world;

    ctx.fillStyle = BACKDROP;
    ctx.fillRect(0, 0, view.vw, view.vh);

    const bucket = Math.round(fx.heat * 12);
    if (bucket !== this.bgHeatBucket || !this.bg) {
      this.bgHeatBucket = bucket;
      const r = Math.max(view.vw, view.vh) * 0.75;
      const gradient = ctx.createRadialGradient(view.cx, view.cy, 0, view.cx, view.cy, r);
      gradient.addColorStop(0, hsla(heatHue(theme.bgHue, fx.heat, theme.hotHue), 60, 22, 0.55));
      gradient.addColorStop(1, 'rgba(6,8,15,0)');
      this.bg = gradient;
    }
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, view.vw, view.vh);
  }

  private drawCourt(world: World): void {
    const { ctx } = this;
    const { w, h } = world.view;
    const theme = world.theme;

    roundRect(ctx, 0, 0, w, h, COURT_RADIUS);
    ctx.save();
    ctx.clip();

    if (!this.court) {
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, theme.courtTop);
      gradient.addColorStop(1, theme.courtBottom);
      this.court = gradient;
    }
    ctx.fillStyle = this.court;
    ctx.fillRect(0, 0, w, h);

    // A soft wash of colour behind each player's end.
    this.drawEndGlow(world, 0, 'you');
    this.drawEndGlow(world, w, 'bot');
    this.drawGrid(world);
    this.drawGoalFlash(world);

    ctx.strokeStyle = `rgba(238,242,255,${theme.lineAlpha})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([theme.dash[0], theme.dash[1]]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 8);
    ctx.lineTo(w / 2, h - 8);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 74, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(238,242,255,${theme.lineAlpha * 0.6})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    if (world.match.status !== 'menu') this.drawPips(world);

    this.drawShieldWall(world);
    this.drawBastion(world);
    this.drawForesight(world);
    drawArena(ctx, world, this.glow);
    this.drawRings(world);
    this.drawSpeedLines(world);
    this.drawTrail(world);
    drawGhosts(ctx, world);
    drawDashStreak(ctx, world);
    this.drawPaddle(world, world.player, 1);
    this.drawPaddle(world, world.bot, -1);
    drawPlayerAura(ctx, world);
    drawCasts(ctx, world);
    this.drawParticles(world);
    this.drawBall(world);

    ctx.restore();

    roundRect(ctx, 0, 0, w, h, COURT_RADIUS);
    ctx.strokeStyle = 'rgba(238,242,255,0.14)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private drawEndGlow(world: World, x: number, side: Side): void {
    const { ctx } = this;
    const { h } = world.view;
    let gradient = this.endGlow[side];
    if (!gradient) {
      const hue = hueOf(world, side);
      gradient = ctx.createRadialGradient(x, h / 2, 0, x, h / 2, h * 0.85);
      gradient.addColorStop(0, hsla(hue, 80, 50, 0.13));
      gradient.addColorStop(1, hsla(hue, 80, 50, 0));
      this.endGlow[side] = gradient;
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(x - h * 0.85, 0, h * 1.7, h);
  }

  /** Score pips per side - or, in a lives-based mode, the lives left. */
  private drawPips(world: World): void {
    const { view, match } = world;

    if (match.maxLives > 0) {
      this.drawPipColumn(world, 24, hueOf(world, 'you'), match.maxLives, match.lives);
      return;
    }
    if (match.winScore <= 0) return;

    const { fx } = world;
    this.drawPipColumn(
      world,
      24,
      hueOf(world, 'you'),
      match.winScore,
      match.score.you,
      fx.pipPopYou
    );
    this.drawPipColumn(
      world,
      view.w - 24,
      hueOf(world, 'bot'),
      match.winScore,
      match.score.bot,
      fx.pipPopBot
    );
  }

  private drawPipColumn(
    world: World,
    x: number,
    hue: number,
    total: number,
    filled: number,
    pop = 0
  ): void {
    const { ctx } = this;
    const gap = 30;
    const top = world.view.h / 2 - ((total - 1) * gap) / 2;
    const sprite = this.glow.dot(hue, 60, 95);

    for (let i = 0; i < total; i++) {
      const y = top + i * gap;
      if (i < filled) {
        // The newest pip lands with a little overshoot - a point is scored,
        // not merely counted.
        const fresh = i === filled - 1 && pop > 0;
        const scale = fresh ? 1 + pop * 0.9 * Math.sin((1 - pop) * Math.PI * 1.5 + 0.5) : 1;
        const r = 7 * Math.max(0.5, scale);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fresh ? 0.75 + pop * 0.25 : 0.7;
        const g = r * (fresh ? 4.4 + pop * 3 : 4);
        ctx.drawImage(sprite, x - g, y - g, g * 2, g * 2);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = hsla(hue, 95, 66 + (fresh ? pop * 20 : 0), 1);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = hsla(hue, 60, 60, 0.3);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }
  }

  private drawPaddle(world: World, paddle: Paddle, dir: 1 | -1): void {
    const { ctx } = this;
    const theme = world.theme;
    const flash = paddle.flash;
    // Squash on contact: thinner and a touch longer, springing back.
    const w = PADDLE_W * (1 + flash * 0.4);
    const h = paddle.half * 2 * (1 - flash * 0.07);
    // Paddles keep their identity colour at all times - only the ball runs hot.
    const hue = hueOf(world, paddle.side);
    const x = paddle.x - w / 2 + dir * flash * 3;
    const y = paddle.y - h / 2;
    const radius = (w / 2) * theme.paddleRound;

    // The halo is a pre-blurred capsule stretched to the paddle: the neon
    // look without a single shadowBlur in the frame loop.
    const glow = (0.62 + flash * 0.5) * theme.paddleGlow;
    if (glow > 0.01) {
      const core = BAR_W - BAR_PAD * 2;
      const tall = BAR_H - BAR_PAD * 2;
      const sx = w / core;
      const sy = h / tall;
      const reach = 1 + flash * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, glow);
      ctx.drawImage(
        this.glow.bar(hue, 58),
        x - BAR_PAD * sx * reach,
        y - BAR_PAD * sy * reach,
        (core + BAR_PAD * 2 * reach) * sx,
        (tall + BAR_PAD * 2 * reach) * sy
      );
      ctx.restore();
    }

    ctx.fillStyle = hsla(hue, 92, 62 + flash * 22, 1);
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();
    // A bright spine down the middle reads as a lit tube rather than a bar.
    ctx.fillStyle = hsla(hue, 100, 88, 0.5 + flash * 0.35);
    roundRect(
      ctx,
      x + w * 0.34,
      y + 5,
      w * 0.32,
      Math.max(0, h - 10),
      w * 0.16 * theme.paddleRound
    );
    ctx.fill();

    if (flash > 0.02) {
      ctx.save();
      ctx.globalAlpha = flash * 0.5;
      ctx.strokeStyle = hsla(hue, 100, 80, 1);
      ctx.lineWidth = 2;
      roundRect(ctx, x - 5, y - 5, w + 10, h + 10, radius + 5);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * A held Shield charge glows against the player's own line.
   *
   * It is drawn behind everything the player has to watch, at the one edge of
   * the court where nothing else happens - so a defensive build is legible at
   * a glance without a single pixel over the play area.
   */
  private drawShieldWall(world: World): void {
    const { ctx } = this;
    const { talents: runtime, view } = world;
    // A save Adrenaline banked guards the same line, so it lights the same wall.
    const held = runtime.shield + runtime.spareSave;
    if (held <= 0 || world.match.status === 'menu') return;

    const strength = Math.min(1, held / Math.max(1, runtime.shieldMax));
    const hue = hueOf(world, 'you');
    const width = 30;
    const glow = ctx.createLinearGradient(0, 0, width, 0);
    glow.addColorStop(0, hsla(hue, 100, 72, 0.34 * strength));
    glow.addColorStop(1, hsla(hue, 100, 72, 0));

    ctx.save();
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, view.h);
    ctx.fillStyle = hsla(hue, 100, 78, 0.5 * strength);
    ctx.fillRect(0, 0, 2.5, view.h);
    ctx.restore();
  }

  /** Bastion's two walled corners, lit along the player's line. */
  private drawBastion(world: World): void {
    const { ctx } = this;
    const reach = world.loadout.effects.bastion;
    if (reach <= 0 || world.match.status === 'menu') return;

    const hue = hueOf(world, 'you');
    const h = world.view.h;
    const span = reach + BALL_R;
    ctx.save();
    ctx.fillStyle = hsla(hue, 70, 82, 0.55);
    ctx.fillRect(0, 0, 3.5, span);
    ctx.fillRect(0, h - span, 3.5, span);
    ctx.fillStyle = hsla(hue, 70, 72, 0.12);
    ctx.fillRect(0, 0, 18, span);
    ctx.fillRect(0, h - span, 18, span);
    ctx.restore();
  }

  /**
   * Foresight: where the incoming ball will reach the player's line.
   *
   * Rank one marks the arrival once the ball is in the player's half; rank
   * two draws the whole path from the moment the opponent strikes it. Both
   * are drawn faint and behind the ball - it is a read, not a target, and
   * the ball itself must stay the brightest thing on the court.
   */
  private drawForesight(world: World): void {
    const { ctx } = this;
    const { ball, player, view, match } = world;
    const rank = world.loadout.effects.foresight;
    if (rank <= 0 || match.status !== 'play' || ball.vx >= 0) return;
    if (rank < 2 && ball.x > view.w / 2) return;

    const n = tracePath(world, player.x + PADDLE_W / 2 + BALL_R, this.path);
    if (n < 2) return;
    const end = this.path[n - 1]!;
    const hue = hueOf(world, 'you');
    // Fades in over the first stretch of the approach, so it arrives as a
    // hint rather than popping on.
    const fade = clamp((view.w - ball.x) / (view.w * 0.25), 0, 1);

    ctx.save();
    if (rank >= 2) {
      ctx.globalAlpha = 0.28 * fade;
      ctx.strokeStyle = hsla(hue, 90, 76, 1);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 9]);
      ctx.beginPath();
      ctx.moveTo(this.path[0]!.x, this.path[0]!.y);
      for (let i = 1; i < n; i++) ctx.lineTo(this.path[i]!.x, this.path[i]!.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const y = clamp(end.y, BALL_R, FIELD_H - BALL_R);
    ctx.globalAlpha = 0.6 * fade;
    ctx.strokeStyle = hsla(hue, 100, 78, 1);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(player.x, y, BALL_R + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.35 * fade;
    ctx.beginPath();
    ctx.moveTo(4, y);
    ctx.lineTo(player.x - BALL_R - 6, y);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The comet is drawn as a triangle strip: neighbouring quads share their
   * joint edge exactly, so it tapers smoothly with no seams, and - unlike one
   * long self-intersecting polygon - a sharp bounce cannot punch a hole in it.
   */
  private drawTrail(world: World): void {
    const { ctx } = this;
    const trail = world.trail;
    const n = trail.length;
    if (n < 3) return;

    const theme = world.theme;
    for (let i = 0; i < n; i++) {
      const a = trail[Math.max(0, i - 1)]!;
      const b = trail[Math.min(n - 1, i + 1)]!;
      const here = trail[i]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const t = i / (n - 1);
      const w = BALL_R * 0.95 * theme.trailWidth * t * t;
      const nx = len < 0.0001 ? 0 : (-dy / len) * w;
      const ny = len < 0.0001 ? 0 : (dx / len) * w;
      this.edgeA[i] = { x: here.x + nx, y: here.y + ny };
      this.edgeB[i] = { x: here.x - nx, y: here.y - ny };
    }

    const hue = ballHue(world);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < n; i++) {
      const t = i / (n - 1);
      const a0 = this.edgeA[i - 1]!;
      const a1 = this.edgeA[i]!;
      const b1 = this.edgeB[i]!;
      const b0 = this.edgeB[i - 1]!;
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(a1.x, a1.y);
      ctx.lineTo(b1.x, b1.y);
      ctx.lineTo(b0.x, b0.y);
      ctx.closePath();
      ctx.fillStyle = hsla(hue, 100, 64, 0.42 * theme.trailAlpha * t * t);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBall(world: World): void {
    const { ctx } = this;
    const { ball, match, theme, tuning } = world;

    if (match.status === 'serve') this.drawServeRing(world);
    if (ball.vx === 0 && ball.vy === 0 && match.status !== 'serve' && match.status !== 'menu') {
      return;
    }

    const hue = ballHue(world);
    const span = Math.max(1, tuning.maxSpeed - tuning.serveSpeed);
    const speedT = clamp((ball.speed - tuning.serveSpeed) / span, 0, 1);
    const squash = ball.squash;

    // Stretch along travel, squash against the surface that was just hit.
    const velocityAngle = Math.atan2(ball.vy, ball.vx);
    const stretch = speedT * 0.22;
    const angle = squash > 0.05 ? ball.squashAngle : velocityAngle;
    const rx = BALL_R * (squash > 0.05 ? 1 - 0.38 * squash : 1 + stretch);
    const ry = BALL_R * (squash > 0.05 ? 1 + 0.3 * squash : 1 - stretch * 0.55);

    ctx.save();
    ctx.translate(ball.x, ball.y);

    // Pre-rendered glow, a little bigger and brighter the faster it flies.
    const reach = BALL_R * (4.2 + speedT * 1.6);
    if (theme.ballGlow > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, 0.62 * theme.ballGlow * (1 + speedT * 0.4));
      ctx.drawImage(this.glow.dot(hue, 62), -reach, -reach, reach * 2, reach * 2);
      ctx.restore();
    }

    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = theme.ballFill;
    ctx.fill();
    ctx.lineWidth = 2.5 * theme.ballRing;
    // The ring runs white-hot as the rally heats up.
    ctx.strokeStyle = hsla(hue, 100, 68 + world.fx.heat * 18, 0.9);
    ctx.stroke();
    ctx.restore();
  }

  private drawServeRing(world: World): void {
    const { ctx } = this;
    const { ball, match, fx, theme } = world;
    const t = 1 - clamp(match.serveTimer / SERVE_DELAY, 0, 1);
    const base = match.serveDir > 0 ? theme.youHue : theme.botHue;
    const hue = heatHue(base, fx.heat, theme.hotHue);

    ctx.save();
    ctx.globalAlpha = 0.25 + 0.35 * Math.sin(t * Math.PI);
    ctx.strokeStyle = hsla(hue, 100, 70, 1);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R + 6 + (1 - t) * 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Sparks are drawn as short streaks along their own velocity, so a burst
   * reads as motion rather than as a spray of dots.
   */
  private drawParticles(world: World): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const p of world.particles.items) {
      if (!p.alive) continue;
      const a = 1 - p.age / p.life;
      const size = p.size * (0.35 + a * 0.65);
      ctx.globalAlpha = a * (0.45 + a * 0.55);
      const speed = Math.abs(p.vx) + Math.abs(p.vy);
      if (speed > 60) {
        const k = 0.028;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = size * 1.3;
        ctx.beginPath();
        ctx.moveTo(p.x - p.vx * k, p.y - p.vy * k);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** The floor lattice: faint, warmer with heat, bowed by every impact. */
  private drawGrid(world: World): void {
    const { ctx } = this;
    const { grid, theme, fx, view } = world;
    if (theme.gridAlpha <= 0) return;
    if (grid.cols === 0) grid.resize(view.w);

    const beat = world.match.status === 'menu' ? 0 : world.audio.beat();
    const alpha = theme.gridAlpha * (0.75 + fx.heat * 0.9 + beat * 0.6);
    const hue = heatHue(theme.bgHue, fx.heat, theme.hotHue);
    const { cols, rows, dx, dy } = grid;
    const sx = grid.stepX;
    const sy = grid.stepY;

    ctx.save();
    ctx.strokeStyle = hsla(hue, 80, 72, Math.min(0.4, alpha));
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (!grid.active) {
      for (let r = 1; r < rows - 1; r++) {
        ctx.moveTo(0, r * sy);
        ctx.lineTo(view.w, r * sy);
      }
      for (let c = 1; c < cols - 1; c++) {
        ctx.moveTo(c * sx, 0);
        ctx.lineTo(c * sx, view.h);
      }
    } else {
      for (let r = 1; r < rows - 1; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          const px = c * sx + dx[i]!;
          const py = r * sy + dy[i]!;
          if (c === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      }
      for (let c = 1; c < cols - 1; c++) {
        for (let r = 0; r < rows; r++) {
          const i = r * cols + c;
          const px = c * sx + dx[i]!;
          const py = r * sy + dy[i]!;
          if (r === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /** The breached goal line, lit in the scorer's colour for a moment. */
  private drawGoalFlash(world: World): void {
    const { fx, view } = world;
    if (fx.goalFlash <= 0) return;
    const { ctx } = this;
    const atRight = fx.goalSide === 'bot';
    const hue = hueOf(world, atRight ? 'you' : 'bot');
    const x = atRight ? view.w : 0;
    const width = 90 + (1 - fx.goalFlash) * 60;
    // Built per frame, but only for the half second a goal flash lasts.
    const band = ctx.createLinearGradient(x, 0, atRight ? x - width : x + width, 0);
    band.addColorStop(0, hsla(hue, 100, 70, 0.55 * fx.goalFlash));
    band.addColorStop(1, hsla(hue, 100, 70, 0));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = band;
    ctx.fillRect(atRight ? x - width : x, 0, width, view.h);
    ctx.fillStyle = hsla(hue, 100, 85, 0.9 * fx.goalFlash);
    ctx.fillRect(atRight ? x - 3 : x, 0, 3, view.h);
    ctx.restore();
  }

  /** Shockwaves: eased out, thinning and fading as they grow. */
  private drawRings(world: World): void {
    const { ctx } = this;
    let open = false;
    for (const ring of world.rings.items) {
      if (!ring.alive) continue;
      if (!open) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        open = true;
      }
      const t = ring.age / ring.life;
      const r = BALL_R + (ring.size - BALL_R) * easeOutCubic(t);
      ctx.globalAlpha = (1 - t) * 0.85 * Math.max(0.3, world.motion);
      ctx.strokeStyle = hsla(ring.hue, 100, ring.light, 1);
      ctx.lineWidth = Math.max(0.5, ring.width * (1 - t));
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (open) ctx.restore();
  }

  /**
   * Speed lines behind a ball near the top of its range. They exist only in
   * that band, so seeing them *means* something: this one is fast.
   */
  private drawSpeedLines(world: World): void {
    const { ball, tuning, fx, match } = world;
    if (match.status !== 'play' || world.motion < 0.5) return;
    const span = Math.max(1, tuning.maxSpeed - tuning.serveSpeed);
    const pace = (ball.speed - tuning.serveSpeed) / span;
    if (pace < 0.62) return;
    const strength = clamp((pace - 0.62) / 0.38, 0, 1.4);
    const v = Math.hypot(ball.vx, ball.vy);
    if (v < 1) return;
    const ux = ball.vx / v;
    const uy = ball.vy / v;
    const { ctx } = this;
    // A new pattern every 50 ms: flicker without per-line state.
    const seed = Math.floor(fx.time * 20);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hsla(ballHue(world), 100, 80, 1);
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const n = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
      const f = n - Math.floor(n);
      const offset = (f - 0.5) * BALL_R * 5;
      const back = BALL_R * (2.5 + f * 3);
      const length = 40 + f * 90 * strength;
      const sx = ball.x - ux * back - uy * offset;
      const sy = ball.y - uy * back + ux * offset;
      ctx.globalAlpha = 0.18 * strength * (0.6 + f * 0.4);
      ctx.lineWidth = 1.2 + f * 1.3;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - ux * length, sy - uy * length);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Darkened edges, always; at match point a slow heartbeat of the leading
   * side's colour creeps in from the rim.
   */
  private drawVignette(world: World): void {
    const { ctx } = this;
    const { view, match, fx } = world;
    if (!this.vignette) {
      const r = Math.hypot(view.vw, view.vh) / 2;
      const g = ctx.createRadialGradient(view.cx, view.cy, r * 0.55, view.cx, view.cy, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.5)');
      this.vignette = g;
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, view.vw, view.vh);

    const live = match.status === 'play' || match.status === 'serve';
    if (!live || !isMatchPoint(world)) return;
    const side: Side = match.score.you === match.winScore - 1 ? 'you' : 'bot';
    let tint = this.pressure[side];
    if (!tint) {
      const r = Math.hypot(view.vw, view.vh) / 2;
      const hue = hueOf(world, side);
      tint = ctx.createRadialGradient(view.cx, view.cy, r * 0.5, view.cx, view.cy, r);
      tint.addColorStop(0, hsla(hue, 90, 50, 0));
      tint.addColorStop(1, hsla(hue, 90, 50, 0.3));
      this.pressure[side] = tint;
    }
    // Lub-dub: two beats close together, then a rest.
    const t = (fx.time * 1.15) % 1;
    const beat = Math.max(Math.exp(-t * 14), Math.exp(-Math.abs(t - 0.22) * 16) * 0.7);
    ctx.save();
    ctx.globalAlpha = (0.35 + beat * 0.65) * Math.max(0.4, world.motion);
    ctx.fillStyle = tint;
    ctx.fillRect(0, 0, view.vw, view.vh);
    ctx.restore();
  }

  /** The winning point's confetti - screen space, so it falls down the glass. */
  private drawConfetti(world: World): void {
    const { ctx } = this;
    for (const piece of world.confetti.items) {
      if (!piece.alive) continue;
      const fade = Math.min(1, (piece.life - piece.age) / 0.4);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.rot);
      // Tumbling: the visible height breathes as the piece turns over.
      ctx.scale(1, Math.cos(piece.rot * 1.7));
      ctx.fillStyle = hsla(piece.hue, 95, 64, 1);
      ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
      ctx.restore();
    }
  }

  /**
   * Screen-space overlay: drawn upright whatever the field orientation, so
   * text is always readable on a portrait phone.
   */
  private drawScreenHud(world: World): void {
    const { ctx } = this;
    const { view, match, fx, theme } = world;
    const cx = toScreenX(view, view.w / 2, view.h / 2);
    const cy = toScreenY(view, view.w / 2, view.h / 2);
    const s = view.scale;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (match.rally >= 2 && (match.status === 'play' || match.status === 'paused')) {
      ctx.save();
      ctx.font = `800 ${(170 * s).toFixed(1)}px ${CANVAS_FONT}`;
      ctx.fillStyle = hsla(heatHue(198, fx.heat, theme.hotHue), 72, 72, 0.09 + fx.heat * 0.13);
      ctx.fillText(String(match.rally), cx, cy);
      ctx.restore();
    }

    if (fx.comboTimer > 0 && match.status !== 'serve') {
      const t = 1 - fx.comboTimer / COMBO_DURATION;
      const pop = 1 + Math.max(0, 0.3 - t) * 2;
      ctx.save();
      ctx.globalAlpha = Math.min(1, fx.comboTimer * 2.2);
      ctx.translate(cx, cy - 116 * s);
      ctx.scale(pop, pop);
      ctx.font = `800 ${(25 * s).toFixed(1)}px ${CANVAS_FONT}`;
      ctx.fillStyle = 'hsl(38,100%,64%)';
      ctx.fillText(fx.comboLabel, 0, 0);
      ctx.restore();
    }

    drawUltimateBanner(ctx, world, cx, cy, s, CANVAS_FONT);
    this.drawBanner(world, cx, cy, s);
    this.drawPopups(world);

    if (match.status === 'serve' && isMatchPoint(world)) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(fx.time * 6);
      ctx.font = `750 ${(20 * s).toFixed(1)}px ${CANVAS_FONT}`;
      const mine = match.score.you === match.winScore - 1;
      ctx.fillStyle = hsla(mine ? theme.youHue : theme.botHue, 90, 67, 1);
      ctx.fillText('MATCH POINT', cx, cy - 116 * s);
      ctx.restore();
    }
  }

  /** Words rising off special returns, upright whatever the orientation. */
  private drawPopups(world: World): void {
    const { ctx } = this;
    const { view } = world;
    for (const popup of world.popups.items) {
      if (!popup.alive) continue;
      const t = popup.age / POPUP_LIFE;
      const grow = popup.age < 0.22 ? 0.55 + easeOutBack(popup.age / 0.22, 2.6) * 0.45 : 1;
      const rise = easeOutCubic(t) * 34;
      const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      const x = toScreenX(view, popup.x, popup.y);
      const y = toScreenY(view, popup.x, popup.y) - 26 * view.scale - rise;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(grow, grow);
      ctx.globalAlpha = fade;
      ctx.font = `850 ${(popup.size * view.scale).toFixed(1)}px ${CANVAS_FONT}`;
      ctx.lineWidth = 4 * view.scale;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(6,8,15,0.75)';
      ctx.strokeText(popup.text, 0, 0);
      ctx.fillStyle = hsla(popup.hue, 100, 78, 1);
      ctx.fillText(popup.text, 0, 0);
      ctx.restore();
    }
  }

  /**
   * The big card across the middle: a stage's name, a boss walking on, a
   * boss moving into its next phase. Scales in with a little overshoot,
   * holds, and fades - never while the ball is in the player's face, because
   * it only ever appears over a serve or on the point a phase begins.
   */
  private drawBanner(world: World, cx: number, cy: number, s: number): void {
    const { fx } = world;
    if (fx.bannerTimer <= 0 || !fx.bannerText) return;
    const { ctx } = this;
    const age = BANNER_TIME - fx.bannerTimer;
    const grow = age < 0.3 ? 0.7 + easeOutBack(age / 0.3, 2.2) * 0.3 : 1;
    const fade = Math.min(1, fx.bannerTimer / 0.45, age / 0.12);
    ctx.save();
    ctx.translate(cx, cy - 40 * s);
    ctx.scale(grow, grow);
    ctx.globalAlpha = fade;
    // A band of the banner's colour behind the words.
    const width = 520 * s;
    ctx.fillStyle = hsla(fx.bannerHue, 70, 12, 0.72);
    ctx.fillRect(-width / 2, -46 * s, width, 92 * s);
    ctx.fillStyle = hsla(fx.bannerHue, 100, 66, 0.9);
    ctx.fillRect(-width / 2, -46 * s, width, 2 * s);
    ctx.fillRect(-width / 2, 44 * s, width, 2 * s);
    ctx.font = `850 ${(40 * s).toFixed(1)}px ${CANVAS_FONT}`;
    ctx.fillStyle = hsla(fx.bannerHue, 100, 80, 1);
    ctx.fillText(fx.bannerText.toUpperCase(), 0, -8 * s);
    if (fx.bannerSub) {
      ctx.font = `650 ${(15 * s).toFixed(1)}px ${CANVAS_FONT}`;
      ctx.fillStyle = 'rgba(238,242,255,0.72)';
      ctx.fillText(fx.bannerSub, 0, 26 * s);
    }
    ctx.restore();
  }
}
