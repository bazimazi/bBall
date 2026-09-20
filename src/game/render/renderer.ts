import type { ResolvedTheme } from '../../core/cosmetics/theme';
import { BALL_R, PADDLE_W, SERVE_DELAY } from '../constants';
import { isMatchPoint } from '../match';
import { BACKDROP, CANVAS_FONT, heatHue, hsla } from '../palette';
import { paddleBuffed } from '../talents';
import type { Paddle, Side, Vec2 } from '../types';
import { clamp } from '../utils/math';
import { applyFieldTransform, toScreenX, toScreenY } from '../view';
import { ballHue, hueOf, type World } from '../world';
import { roundRect } from './shapes';

const COURT_RADIUS = 26;
const COMBO_DURATION = 1.3;

/**
 * Canvas renderer. All drawing state lives here; the simulation never touches
 * the context. Gradients are cached and rebuilt only when the geometry, the
 * theme or the heat bucket changes - allocating them every frame costs real
 * time on low-end phones.
 */
export class Renderer {
  private readonly edgeA: Vec2[] = [];
  private readonly edgeB: Vec2[] = [];

  private bgHeatBucket = -1;
  private bg: CanvasGradient | null = null;
  private court: CanvasGradient | null = null;
  private endGlow: Partial<Record<Side, CanvasGradient>> = {};
  private theme: ResolvedTheme | null = null;

  private readonly ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  /** Call whenever the view geometry or the equipped theme changes. */
  invalidate(): void {
    this.bgHeatBucket = -1;
    this.court = null;
    this.endGlow = {};
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

    ctx.save();
    ctx.translate(fx.shakeX, fx.shakeY);

    ctx.save();
    applyFieldTransform(ctx, view);
    this.drawCourt(world);
    ctx.restore();

    this.drawScreenHud(world);
    ctx.restore();

    if (fx.flash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${(fx.flash * 0.28).toFixed(3)})`;
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
    this.drawTrail(world);
    this.drawDashGhost(world);
    this.drawPaddle(world, world.player, 1);
    this.drawPaddle(world, world.bot, -1);
    this.drawPlayerAura(world);
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

    this.drawPipColumn(world, 24, hueOf(world, 'you'), match.winScore, match.score.you);
    this.drawPipColumn(world, view.w - 24, hueOf(world, 'bot'), match.winScore, match.score.bot);
  }

  private drawPipColumn(world: World, x: number, hue: number, total: number, filled: number): void {
    const { ctx } = this;
    const gap = 30;
    const top = world.view.h / 2 - ((total - 1) * gap) / 2;

    for (let i = 0; i < total; i++) {
      const y = top + i * gap;
      ctx.beginPath();
      if (i < filled) {
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = hsla(hue, 95, 66, 1);
        ctx.shadowColor = hsla(hue, 95, 60, 0.9);
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
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
    const w = PADDLE_W * (1 + flash * 0.4);
    const h = paddle.half * 2 * (1 - flash * 0.07);
    // Paddles keep their identity colour at all times - only the ball runs hot.
    const hue = hueOf(world, paddle.side);
    const x = paddle.x - w / 2 + dir * flash * 3;
    const y = paddle.y - h / 2;
    const radius = (w / 2) * theme.paddleRound;

    ctx.save();
    ctx.shadowColor = hsla(hue, 95, 60, (0.55 + flash * 0.4) * theme.paddleGlow);
    ctx.shadowBlur = (16 + flash * 26) * theme.paddleGlow;
    ctx.fillStyle = hsla(hue, 92, 62 + flash * 22, 1);
    roundRect(ctx, x, y, w, h, radius);
    ctx.fill();
    ctx.restore();

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
    if (runtime.shieldMax <= 0 || runtime.shield <= 0 || world.match.status === 'menu') return;

    const strength = runtime.shield / runtime.shieldMax;
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

  /** A fading ghost of where the paddle was before it dashed. */
  private drawDashGhost(world: World): void {
    const { ctx } = this;
    const { talents: runtime, player, loadout } = world;
    if (runtime.dashFx <= 0) return;

    const t = clamp(runtime.dashFx / Math.max(0.01, loadout.effects.dashSeconds), 0, 1);
    const hue = hueOf(world, 'you');
    const top = Math.min(runtime.dashFrom, player.y) - player.half;
    const bottom = Math.max(runtime.dashFrom, player.y) + player.half;

    ctx.save();
    ctx.globalAlpha = t * 0.45;
    ctx.fillStyle = hsla(hue, 95, 66, 1);
    roundRect(ctx, player.x - PADDLE_W / 2, top, PADDLE_W, bottom - top, PADDLE_W / 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * What the player's build is doing, drawn on the paddle itself.
   *
   * A charged strike pulses hot, an open guard window snaps to a bright
   * bracket, and any other paddle buff shows as a quiet halo. Three states,
   * three shapes, none of them anywhere near the ball.
   */
  private drawPlayerAura(world: World): void {
    const { ctx } = this;
    const { talents: runtime, player, fx } = world;
    if (world.match.status === 'menu') return;

    const x = player.x - PADDLE_W / 2;
    const y = player.y - player.half;
    const w = PADDLE_W;
    const h = player.half * 2;

    if (runtime.strikeArmed > 0) {
      // Under prefers-reduced-motion the ring is steady rather than pulsing;
      // it still has to be unmistakable, so it keeps the brighter alpha.
      const pulse = world.motion > 0.5 ? 0.5 + 0.5 * Math.sin(fx.time * 16) : 1;
      ctx.save();
      ctx.globalAlpha = 0.45 + 0.4 * pulse;
      ctx.strokeStyle = hsla(26, 100, 62, 1);
      ctx.lineWidth = 3;
      ctx.shadowColor = hsla(26, 100, 58, 0.9);
      ctx.shadowBlur = 18 * world.motion;
      roundRect(ctx, x - 6, y - 9, w + 12, h + 18, w / 2 + 6);
      ctx.stroke();
      ctx.restore();
    }

    if (runtime.guardWindow > 0) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      // Two brackets rather than a ring: unmistakable, and it leaves the
      // paddle's own silhouette readable while the ball is on the way.
      ctx.moveTo(x - 10, y - 4);
      ctx.lineTo(x - 10, y + h + 4);
      ctx.moveTo(x + w + 10, y - 4);
      ctx.lineTo(x + w + 10, y + h + 4);
      ctx.stroke();
      ctx.restore();
    } else if (paddleBuffed(runtime)) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = hsla(hueOf(world, 'you'), 100, 82, 1);
      ctx.lineWidth = 2;
      roundRect(ctx, x - 4, y - 6, w + 8, h + 12, w / 2 + 4);
      ctx.stroke();
      ctx.restore();
    }
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

    const reach = BALL_R * 4.2;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
    glow.addColorStop(0, hsla(hue, 100, 70, 0.5 * theme.ballGlow));
    glow.addColorStop(0.45, hsla(hue, 100, 60, 0.16 * theme.ballGlow));
    glow.addColorStop(1, hsla(hue, 100, 60, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, reach, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = theme.ballFill;
    ctx.fill();
    ctx.lineWidth = 2.5 * theme.ballRing;
    ctx.strokeStyle = hsla(hue, 100, 68, 0.9);
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

  private drawParticles(world: World): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of world.particles.items) {
      if (!p.alive) continue;
      const a = 1 - p.age / p.life;
      ctx.globalAlpha = a * (0.45 + a * 0.55);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.35 + a * 0.65), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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
}
