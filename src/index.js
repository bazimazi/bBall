/*
 * bBall - a minimal bouncing ball duel.
 *
 * The simulation always runs in a landscape "field" space whose short axis is
 * a constant FIELD_H, so the game plays identically on every device. When the
 * viewport is portrait the field is simply rotated a quarter turn on screen,
 * which keeps one physics code path for every orientation.
 */

'use strict';

// ---------------------------------------------------------------- constants

const FIELD_H = 600;           // field units across the short axis (constant)
const MIN_ASPECT = 1.25;       // the field never gets squarer than this...
const MAX_ASPECT = 2.15;       // ...nor longer, so wide screens stay fair

const BALL_R = 11;
const PADDLE_W = 16;
const PADDLE_H = 108;
const PADDLE_INSET = 46;       // paddle centre distance from the field edge
const PADDLE_MAX_SPEED = 1550; // field units / second
const KEY_SPEED = 1080;

const SERVE_SPEED = 470;
const SPEED_PER_POINT = 17;    // serve speed grows a little every point
const SPEED_PER_HIT = 1.045;   // ...and a little more on every rally hit
const MAX_SPEED = 1180;
const MAX_BOUNCE_ANGLE = 0.92; // radians off the long axis (~53 degrees)
const SPIN_INFLUENCE = 0.26;

const WIN_SCORE = 5;
const SERVE_DELAY = 0.8;       // seconds the ball hovers at centre before launch
const FIXED_DT = 1 / 120;
const MAX_FRAME_DT = 0.25;

const COMBO_STEPS = [
  { at: 5, label: 'NICE' },
  { at: 10, label: 'HEATING UP' },
  { at: 16, label: 'ON FIRE' },
  { at: 24, label: 'UNREAL' }
];

const HUE = { you: 171, bot: 342, hot: 34 };
const FONT = '-apple-system, system-ui, "Segoe UI", Roboto, sans-serif';

// ------------------------------------------------------------------- canvas

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

/** Field size plus the transform that maps field space onto the screen. */
const view = {
  w: 900, h: FIELD_H,   // field units
  cx: 0, cy: 0,         // court centre in CSS pixels
  scale: 1,
  rotated: false,
  dpr: 1,
  vw: 0, vh: 0          // viewport in CSS pixels
};

const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let motion = reduceMotionQuery.matches ? 0.25 : 1;

// -------------------------------------------------------------------- state

function makePaddle(side) {
  return {
    side,
    x: 0,
    y: FIELD_H / 2,     // paddle centre in field units
    vy: 0,
    target: FIELD_H / 2,
    half: PADDLE_H / 2,
    flash: 0,
    score: 0,
    aimed: false,       // bot only: has it committed to this approach?
    wait: 0             // bot only: remaining reaction delay
  };
}

const player = makePaddle('you');
const bot = makePaddle('bot');

const ball = {
  x: 0, y: FIELD_H / 2,
  px: 0, py: FIELD_H / 2,
  vx: 0, vy: 0,
  speed: SERVE_SPEED,
  squash: 0,
  squashAngle: 0,
  owner: 'you'          // who touched it last; tints the glow
};

const game = {
  state: 'menu',        // menu | serve | play | paused | over
  resumeTo: 'play',
  serveTimer: 0,
  serveDir: 1,
  rally: 0,
  best: 0,
  bestThisMatch: 0,
  points: 0,
  heat: 0,
  timeScale: 1,
  freeze: 0,
  shake: 0,
  shakeX: 0,
  shakeY: 0,
  flash: 0,
  comboIdx: -1,
  comboTimer: 0,
  comboLabel: '',
  winner: null,
  newBest: false,
  overTimer: 0,
  overShown: false,
  time: 0
};

const trail = [];
const TRAIL_MAX = 20;
let trailTick = 0;

// ------------------------------------------------------------------ storage

function storeGet(key, fallback) {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch (err) {
    return fallback;
  }
}

function storeSet(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch (err) { /* private mode - best effort only */ }
}

game.best = parseInt(storeGet('bball.best', '0'), 10) || 0;

// -------------------------------------------------------------------- audio

const audio = {
  ac: null,
  master: null,
  muted: storeGet('bball.muted', '0') === '1',

  unlock() {
    if (this.ac) {
      if (this.ac.state === 'suspended') this.ac.resume();
      return;
    }
    const AC = window.AudioContext || window['webkitAudioContext'];
    if (!AC) return;
    try {
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = this.muted ? 0 : 0.45;
      this.master.connect(this.ac.destination);
    } catch (err) {
      this.ac = null;
    }
  },

  setMuted(muted) {
    this.muted = muted;
    storeSet('bball.muted', muted ? '1' : '0');
    if (this.master) {
      const t = this.ac.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(muted ? 0 : 0.45, t, 0.02);
    }
  },

  /** One short synthesised blip - no assets, no dependencies. */
  tone(freq, dur, type, gain, slideTo, delay) {
    if (!this.ac || this.muted) return;
    const t = this.ac.currentTime + (delay || 0);
    const osc = this.ac.createOscillator();
    const env = this.ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.007);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  },

  hit(power) {
    const f = 250 + power * 340;
    this.tone(f, 0.085, 'triangle', 0.3, f * 0.62);
    this.tone(f * 2, 0.035, 'sine', 0.08);
  },
  wall(power) {
    this.tone(140 + power * 100, 0.06, 'sine', 0.18, 90);
  },
  point(won) {
    if (won) {
      this.tone(523, 0.1, 'triangle', 0.22);
      this.tone(784, 0.16, 'triangle', 0.2, 0, 0.08);
    } else {
      this.tone(210, 0.24, 'sawtooth', 0.12, 105);
    }
  },
  combo(step) {
    const base = 600 + step * 140;
    this.tone(base, 0.08, 'square', 0.09);
    this.tone(base * 1.5, 0.11, 'square', 0.08, 0, 0.06);
  },
  over(won) {
    const notes = won ? [523, 659, 784, 1047] : [440, 370, 311, 233];
    for (let i = 0; i < notes.length; i++) {
      this.tone(notes[i], 0.28, 'triangle', 0.18, 0, i * 0.1);
    }
  },
  ui() {
    this.tone(640, 0.05, 'sine', 0.1);
  }
};

// ------------------------------------------------------------------- layout

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function layout() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cs = getComputedStyle(document.documentElement);
  const inset = (name) => parseFloat(cs.getPropertyValue(name)) || 0;

  const padX = 14 + Math.max(inset('--safe-l'), inset('--safe-r'));
  const padY = 14 + Math.max(inset('--safe-t'), inset('--safe-b'));
  const availW = Math.max(120, vw - padX * 2);
  const availH = Math.max(120, vh - padY * 2);

  view.vw = vw;
  view.vh = vh;
  view.rotated = availH > availW;

  const long = Math.max(availW, availH);
  const short = Math.min(availW, availH);
  const aspect = clamp(long / short, MIN_ASPECT, MAX_ASPECT);

  const oldW = view.w;
  view.w = FIELD_H * aspect;
  view.h = FIELD_H;
  view.scale = Math.min(long / view.w, short / view.h);
  view.cx = vw / 2;
  view.cy = vh / 2;

  // Keep play proportional when the field length changes (resize / rotate).
  const k = view.w / oldW;
  if (k !== 1) {
    ball.x *= k;
    ball.px *= k;
    ball.vx *= k;
    normaliseBallSpeed();
    for (let i = 0; i < trail.length; i++) trail[i].x *= k;
  }
  player.x = PADDLE_INSET;
  bot.x = view.w - PADDLE_INSET;

  const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
  const bw = Math.round(vw * dpr);
  const bh = Math.round(vh * dpr);
  view.dpr = dpr;
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  canvas.style.width = vw + 'px';
  canvas.style.height = vh + 'px';
  invalidateGradients();
}

/** Field point -> screen point in CSS pixels (camera shake excluded). */
function toScreenX(fx, fy) {
  const a = (fx - view.w / 2) * view.scale;
  const b = (fy - view.h / 2) * view.scale;
  return view.cx + (view.rotated ? b : a);
}

function toScreenY(fx, fy) {
  const a = (fx - view.w / 2) * view.scale;
  const b = (fy - view.h / 2) * view.scale;
  return view.cy + (view.rotated ? -a : b);
}

/** Screen point in CSS pixels -> the field's cross-axis coordinate. */
function screenToFieldY(sx, sy) {
  const ux = (sx - view.cx) / view.scale;
  const uy = (sy - view.cy) / view.scale;
  return (view.rotated ? ux : uy) + view.h / 2;
}

function applyFieldTransform() {
  ctx.translate(view.cx, view.cy);
  if (view.rotated) ctx.rotate(-Math.PI / 2);
  ctx.scale(view.scale, view.scale);
  ctx.translate(-view.w / 2, -view.h / 2);
}

// ---------------------------------------------------------------- particles

const P_MAX = 320;
const parts = new Array(P_MAX);
for (let i = 0; i < P_MAX; i++) {
  parts[i] = { x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, size: 0, drag: 0.94, color: '#fff', alive: false };
}
let pHead = 0;

function emit(x, y, count, opts) {
  const n = Math.round(count * motion);
  for (let i = 0; i < n; i++) {
    const p = parts[pHead];
    pHead = (pHead + 1) % P_MAX;
    const angle = opts.angle === undefined
      ? Math.random() * Math.PI * 2
      : opts.angle + (Math.random() - 0.5) * (opts.spread || Math.PI);
    const speed = opts.speed * (0.25 + Math.random() * 0.75);
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.age = 0;
    p.life = opts.life * (0.7 + Math.random() * 0.6);
    p.size = opts.size * (0.6 + Math.random() * 0.8);
    p.drag = opts.drag || 0.93;
    p.color = opts.color;
    p.alive = true;
  }
}

function updateParticles(dt) {
  for (let i = 0; i < P_MAX; i++) {
    const p = parts[i];
    if (!p.alive) continue;
    p.age += dt;
    if (p.age >= p.life) { p.alive = false; continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const d = Math.pow(p.drag, dt * 60);
    p.vx *= d;
    p.vy *= d;
  }
}

function clearParticles() {
  for (let i = 0; i < P_MAX; i++) parts[i].alive = false;
}

// ------------------------------------------------------------------- colour

function lerp(a, b, t) { return a + (b - a) * t; }

/** Blend a hue towards the "hot" hue, taking the short way round. */
function heatHue(base) {
  let d = HUE.hot - base;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  let h = base + d * game.heat;
  if (h < 0) h += 360;
  return h % 360;
}

function ballHue() {
  return heatHue(ball.owner === 'you' ? HUE.you : HUE.bot);
}

function sideHue(side) {
  return side === 'you' ? HUE.you : HUE.bot;
}

function hsla(h, s, l, a) {
  return 'hsla(' + h.toFixed(0) + ',' + s + '%,' + l + '%,' + a + ')';
}

// ------------------------------------------------------------------ physics

function normaliseBallSpeed() {
  const v = Math.hypot(ball.vx, ball.vy);
  if (v > 0.0001) {
    const k = ball.speed / v;
    ball.vx *= k;
    ball.vy *= k;
  }
}

function centreBall() {
  ball.x = view.w / 2;
  ball.y = FIELD_H / 2;
  ball.px = ball.x;
  ball.py = ball.y;
  ball.vx = 0;
  ball.vy = 0;
  ball.squash = 0;
  trail.length = 0;
}

function beginServe(dir) {
  game.serveDir = dir;
  game.serveTimer = SERVE_DELAY;
  game.state = 'serve';
  centreBall();
  bot.aimed = false;
  bot.wait = 0;
}

function launchBall() {
  game.rally = 0;
  game.comboIdx = -1;
  ball.speed = Math.min(MAX_SPEED, SERVE_SPEED + Math.min(game.points, 10) * SPEED_PER_POINT);
  // Serve on a gentle angle - never dead flat, never steep.
  const angle = (0.16 + Math.random() * 0.34) * (Math.random() < 0.5 ? 1 : -1);
  ball.vx = Math.cos(angle) * ball.speed * game.serveDir;
  ball.vy = Math.sin(angle) * ball.speed;
  ball.owner = game.serveDir > 0 ? 'you' : 'bot';
  if (game.state !== 'menu') audio.tone(360, 0.07, 'sine', 0.12, 520);
  game.state = 'play';
}

function movePaddle(p, dt, speed) {
  const prev = p.y;
  const max = speed * dt;
  const dy = clamp(p.target - p.y, -max, max);
  p.y = clamp(p.y + dy, p.half, FIELD_H - p.half);
  p.vy = (p.y - prev) / dt;
}

/** Where the ball will cross a given x, accounting for wall bounces. */
function predictY(targetX) {
  if (Math.abs(ball.vx) < 1) return ball.y;
  const t = (targetX - ball.x) / ball.vx;
  if (t <= 0) return ball.y;
  const span = FIELD_H - BALL_R * 2;
  let m = (ball.y + ball.vy * t - BALL_R) % (span * 2);
  if (m < 0) m += span * 2;
  if (m > span) m = span * 2 - m;
  return m + BALL_R;
}

/*
 * Bot skill ramps over the match, with a light rubber band for tension.
 * It is deliberately capped well below perfect: if the bot's aim error ever
 * fell inside its own paddle it could never miss, and two flawless players
 * produce a rally that never ends and a match that never finishes.
 */
function botSkill() {
  if (game.state === 'menu') return 0.62;
  const progress = clamp(game.points / 8, 0, 1);
  const chase = clamp((player.score - bot.score) * 0.05, -0.05, 0.1);
  return clamp(0.3 + progress * 0.4 + chase, 0.25, 0.8);
}

/*
 * Triangular spread - usually close, occasionally badly off, like a person.
 * It widens as the ball speeds up so a long rally gets harder for the bot too,
 * which is what stops high-level rallies from running on forever.
 */
function aimError(skill) {
  const fast = clamp((ball.speed - SERVE_SPEED) / (MAX_SPEED - SERVE_SPEED), 0, 1);
  const spread = lerp(104, 72, clamp((skill - 0.3) / 0.5, 0, 1)) * (0.8 + 0.75 * fast);
  return (Math.random() + Math.random() - 1) * spread;
}

function aiControl(p, dt, skill) {
  const towards = p.side === 'bot' ? ball.vx > 0 : ball.vx < 0;
  if (towards && game.state !== 'serve') {
    if (!p.aimed) {
      p.wait -= dt;
      if (p.wait <= 0) {
        // Offset the paddle so the ball strikes off-centre and the return is
        // placed into whichever half the opponent has left open.
        const foe = p.side === 'bot' ? player : bot;
        const away = foe.y < FIELD_H / 2 ? 1 : -1;
        const place = away * (0.3 + skill * 0.55);
        const cross = predictY(p.x);
        p.target = clamp(cross - place * p.half + aimError(skill), p.half, FIELD_H - p.half);
        p.aimed = true;
      }
    }
  } else {
    // Drift back towards the middle while the ball is away.
    p.aimed = false;
    p.wait = 0.24 - skill * 0.17;
    p.target = lerp(p.target, FIELD_H / 2, Math.min(1, dt * 1.6));
  }
  movePaddle(p, dt, 520 + skill * 420);
}

function onPaddleHit(p, contactY, dir) {
  const off = clamp((contactY - p.y) / p.half, -1, 1);
  ball.speed = Math.min(MAX_SPEED, ball.speed * SPEED_PER_HIT);

  // Angle comes from where the ball struck, nudged by the paddle's own motion.
  let vy = Math.sin(off * MAX_BOUNCE_ANGLE) * ball.speed + p.vy * SPIN_INFLUENCE;
  let angle = Math.atan2(vy, Math.abs(Math.cos(off * MAX_BOUNCE_ANGLE) * ball.speed));
  angle = clamp(angle, -MAX_BOUNCE_ANGLE, MAX_BOUNCE_ANGLE);
  ball.vx = Math.cos(angle) * ball.speed * dir;
  ball.vy = Math.sin(angle) * ball.speed;
  ball.owner = p.side;

  const power = clamp((ball.speed - SERVE_SPEED) / (MAX_SPEED - SERVE_SPEED), 0, 1);
  p.flash = 1;
  ball.squash = 1;
  ball.squashAngle = 0;                       // compressed along the long axis
  game.rally++;
  game.freeze = (0.012 + power * 0.03) * motion;
  addShake(2.6 + power * 4);
  bot.aimed = false;
  player.aimed = false;

  emit(ball.x + dir * BALL_R, contactY, 12 + power * 10, {
    angle: dir > 0 ? 0 : Math.PI,
    spread: 1.5,
    speed: 150 + power * 250,
    life: 0.4,
    size: 3.4,
    color: hsla(sideHue(p.side), 100, 66, 0.9)
  });
  // The attract demo plays silently and never raises a combo banner.
  if (game.state !== 'menu') {
    audio.hit(power);
    checkCombo();
  }
}

function checkCombo() {
  for (let i = COMBO_STEPS.length - 1; i >= 0; i--) {
    if (game.rally >= COMBO_STEPS[i].at && i > game.comboIdx) {
      game.comboIdx = i;
      game.comboLabel = COMBO_STEPS[i].label;
      game.comboTimer = 1.3;
      addShake(4 + i);
      audio.combo(i);
      emit(ball.x, ball.y, 26, {
        speed: 260, life: 0.6, size: 3, color: hsla(ballHue(), 100, 68, 0.9)
      });
      break;
    }
  }
}

/** Circle-vs-rectangle rescue so the ball can never end up inside a paddle. */
function resolveOverlap(p) {
  const left = p.x - PADDLE_W / 2;
  const right = p.x + PADDLE_W / 2;
  const top = p.y - p.half;
  const bottom = p.y + p.half;
  const nx = clamp(ball.x, left, right);
  const ny = clamp(ball.y, top, bottom);
  const dx = ball.x - nx;
  const dy = ball.y - ny;
  if (dx * dx + dy * dy >= BALL_R * BALL_R) return false;

  // Solve for the y that puts the ball exactly BALL_R from the paddle, keeping
  // x fixed - a plain scaled push leaves corner contacts still overlapping.
  const sep = Math.sqrt(Math.max(0, BALL_R * BALL_R - dx * dx)) + 0.01;
  const newY = ny + Math.sign(dy) * sep;

  // Prefer shoving the ball off the paddle's end, but only when that leaves it
  // inside the walls - otherwise eject sideways so it can never be re-trapped.
  if (Math.abs(dy) > Math.abs(dx) && newY >= BALL_R && newY <= FIELD_H - BALL_R) {
    ball.y = newY;
    ball.vy = Math.abs(ball.vy) * Math.sign(dy);
  } else {
    const sx = dx !== 0 ? Math.sign(dx) : (p.side === 'you' ? 1 : -1);
    ball.x = (sx > 0 ? right : left) + sx * BALL_R;
    ball.vx = Math.abs(ball.vx) * sx;
  }
  return true;
}

/**
 * Swept paddle test. `dir` is the direction the ball leaves in:
 * +1 for the left paddle, -1 for the right one.
 */
function sweepPaddle(p, dir, dt) {
  const face = dir > 0
    ? p.x + PADDLE_W / 2 + BALL_R
    : p.x - PADDLE_W / 2 - BALL_R;
  const crossed = dir > 0
    ? (ball.px >= face && ball.x <= face)
    : (ball.px <= face && ball.x >= face);

  if (crossed) {
    const span = ball.px - ball.x;
    const t = Math.abs(span) < 0.0001 ? 0 : (ball.px - face) / span;
    const contactY = ball.py + (ball.y - ball.py) * t;
    const reach = p.half + BALL_R * 0.55;
    if (contactY > p.y - reach && contactY < p.y + reach) {
      onPaddleHit(p, contactY, dir);
      const rest = (1 - clamp(t, 0, 1)) * dt;
      ball.x = face + ball.vx * rest;
      ball.y = contactY + ball.vy * rest;
      return true;
    }
  }
  return false;
}

function onWallBounce() {
  const power = clamp((ball.speed - SERVE_SPEED) / (MAX_SPEED - SERVE_SPEED), 0, 1);
  ball.squash = 0.8;
  ball.squashAngle = Math.PI / 2;              // compressed against the wall
  addShake(1.6 + power * 2.4);
  emit(ball.x, ball.y, 6 + power * 6, {
    angle: ball.vy > 0 ? Math.PI / 2 : -Math.PI / 2,
    spread: 1.9,
    speed: 100 + power * 170,
    life: 0.34,
    size: 2.8,
    color: hsla(ballHue(), 90, 70, 0.7)
  });
  if (game.state !== 'menu') audio.wall(power);
}

function stepBall(dt) {
  ball.px = ball.x;
  ball.py = ball.y;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.y - BALL_R < 0) {
    ball.y = BALL_R + (BALL_R - ball.y);
    ball.vy = Math.abs(ball.vy);
    onWallBounce();
  } else if (ball.y + BALL_R > FIELD_H) {
    ball.y = FIELD_H - BALL_R - (ball.y + BALL_R - FIELD_H);
    ball.vy = -Math.abs(ball.vy);
    onWallBounce();
  }
  ball.y = clamp(ball.y, BALL_R, FIELD_H - BALL_R);

  // Swept test only against the paddle the ball is heading for...
  if (ball.vx < 0) sweepPaddle(player, 1, dt);
  else sweepPaddle(bot, -1, dt);

  // A contact can nudge the ball past a wall; pull it back without reflecting,
  // so the real bounce still plays next step.
  ball.y = clamp(ball.y, BALL_R, FIELD_H - BALL_R);

  // ...but either paddle can also slide sideways into a ball moving away from
  // it, so both get an overlap rescue once the ball is known to be in bounds.
  resolveOverlap(player);
  resolveOverlap(bot);

  trailTick += dt;
  if (trailTick >= 1 / 90) {
    trailTick = 0;
    trail.push({ x: ball.x, y: ball.y });
    if (trail.length > TRAIL_MAX) trail.shift();
  }

  if (ball.x < -BALL_R * 3) scorePoint(bot);
  else if (ball.x > view.w + BALL_R * 3) scorePoint(player);
}

function scorePoint(scorer) {
  const won = scorer.side === 'you';

  if (game.state === 'menu') {
    // Attract mode: rally home, never touch the score or the record.
    beginServe(Math.random() < 0.5 ? 1 : -1);
    game.state = 'menu';
    game.serveTimer = 0.5;
    return;
  }

  if (game.rally > game.bestThisMatch) game.bestThisMatch = game.rally;
  if (game.rally > game.best) {
    game.best = game.rally;
    game.newBest = true;
    storeSet('bball.best', game.best);
  }

  scorer.score++;
  game.points++;
  game.comboTimer = 0;          // the rally is over - clear its banner
  game.flash = won ? 0.5 : 0.35;
  game.timeScale = motion > 0.5 ? 0.32 : 1;
  addShake(10);

  const goalX = won ? view.w : 0;
  emit(goalX, clamp(ball.y, BALL_R, FIELD_H - BALL_R), 46, {
    angle: won ? Math.PI : 0,
    spread: 2.2,
    speed: 440,
    life: 0.85,
    size: 4.2,
    color: hsla(sideHue(scorer.side), 100, 66, 0.95)
  });
  audio.point(won);
  trail.length = 0;

  if (scorer.score >= WIN_SCORE) {
    game.winner = scorer.side;
    game.state = 'over';
    game.overTimer = 0.9;
    game.overShown = false;
    audio.over(won);
    return;
  }
  // The conceding side receives the next serve.
  beginServe(won ? -1 : 1);
}

function addShake(amount) {
  game.shake = Math.min(18, game.shake + amount * motion);
}

// --------------------------------------------------------------- simulation

function step(dt) {
  game.time += dt;

  // Decays that should keep running even during a hit-stop freeze.
  game.shake *= Math.pow(0.0016, dt);
  if (game.shake < 0.05) game.shake = 0;
  game.flash *= Math.pow(0.0008, dt);
  ball.squash *= Math.pow(0.0009, dt);
  player.flash *= Math.pow(0.0005, dt);
  bot.flash *= Math.pow(0.0005, dt);
  if (game.comboTimer > 0) game.comboTimer = Math.max(0, game.comboTimer - dt);

  const heatTarget = game.state === 'play' ? clamp(game.rally / 18, 0, 1) : 0;
  game.heat += (heatTarget - game.heat) * Math.min(1, dt * 2.2);

  if (game.freeze > 0) {
    game.freeze -= dt;
    updateParticles(dt * 0.25);
    return;
  }
  updateParticles(dt);

  switch (game.state) {
    case 'menu': {
      const skill = botSkill();
      aiControl(player, dt, skill);
      aiControl(bot, dt, skill);
      if (game.serveTimer > 0) {
        game.serveTimer -= dt;
        if (game.serveTimer <= 0) {
          game.points = 0;
          launchBall();
          game.state = 'menu';
        }
      } else {
        stepBall(dt);
      }
      break;
    }
    case 'serve': {
      player.target = clamp(player.target, player.half, FIELD_H - player.half);
      movePaddle(player, dt, PADDLE_MAX_SPEED);
      bot.target = lerp(bot.target, FIELD_H / 2, Math.min(1, dt * 3));
      movePaddle(bot, dt, 600);
      game.serveTimer -= dt;
      if (game.serveTimer <= 0) launchBall();
      break;
    }
    case 'play': {
      movePaddle(player, dt, PADDLE_MAX_SPEED);
      aiControl(bot, dt, botSkill());
      stepBall(dt);
      break;
    }
    default:
      break;                                   // paused / over: effects only
  }
}

// -------------------------------------------------------------------- input

const keys = { up: false, down: false };
let pointerId = null;

function pointerToTarget(e) {
  player.target = clamp(screenToFieldY(e.clientX, e.clientY), player.half, FIELD_H - player.half);
}

function onPointerDown(e) {
  audio.unlock();
  if (game.state === 'play' || game.state === 'serve') {
    pointerId = e.pointerId;
    if (canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    pointerToTarget(e);
    if (game.state === 'serve' && game.serveTimer > 0.05) game.serveTimer = 0;
  }
}

function onPointerMove(e) {
  if (game.state !== 'play' && game.state !== 'serve') return;
  if (e.pointerType === 'mouse' || pointerId === null || e.pointerId === pointerId) {
    pointerToTarget(e);
  }
}

function onPointerUp(e) {
  if (e.pointerId === pointerId) pointerId = null;
}

canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
canvas.addEventListener('pointermove', onPointerMove, { passive: true });
canvas.addEventListener('pointerup', onPointerUp, { passive: true });
canvas.addEventListener('pointercancel', onPointerUp, { passive: true });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function applyKeys(dt) {
  if (!keys.up && !keys.down) return;
  const dir = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  player.target = clamp(player.target + dir * KEY_SPEED * dt, player.half, FIELD_H - player.half);
}

window.addEventListener('keydown', (e) => {
  if (e.repeat || !e.key) return;
  const k = e.key.toLowerCase();
  if (k === 'arrowup' || k === 'w') { keys.up = true; e.preventDefault(); audio.unlock(); }
  else if (k === 'arrowdown' || k === 's') { keys.down = true; e.preventDefault(); audio.unlock(); }
  else if (k === ' ' || k === 'enter') {
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    e.preventDefault();
    audio.unlock();
    if (game.state === 'menu') startMatch();
    else if (game.state === 'over') startMatch();
    else if (game.state === 'paused') resumeGame();
    else if (game.state === 'serve') game.serveTimer = 0;
  } else if (k === 'escape' || k === 'p') {
    e.preventDefault();
    if (game.state === 'play' || game.state === 'serve') pauseGame();
    else if (game.state === 'paused') resumeGame();
  } else if (k === 'm') {
    audio.unlock();
    toggleMute();
  }
});

window.addEventListener('keyup', (e) => {
  if (!e.key) return;
  const k = e.key.toLowerCase();
  if (k === 'arrowup' || k === 'w') keys.up = false;
  else if (k === 'arrowdown' || k === 's') keys.down = false;
});

// ----------------------------------------------------------------------- ui

const overlay = document.getElementById('overlay');
const panels = {
  start: document.getElementById('panelStart'),
  pause: document.getElementById('panelPause'),
  over: document.getElementById('panelOver')
};
const pauseBtn = document.getElementById('pauseBtn');
const soundBtn = document.getElementById('soundBtn');
const startBest = document.getElementById('startBest');
const startHint = document.getElementById('startHint');
const overTitle = document.getElementById('overTitle');
const overYou = document.getElementById('overYou');
const overBot = document.getElementById('overBot');
const overBest = document.getElementById('overBest');

function showPanel(name) {
  for (const key in panels) panels[key].classList.toggle('on', key === name);
  overlay.classList.toggle('show', Boolean(name));
  pauseBtn.classList.toggle('on', !name && game.state !== 'menu' && game.state !== 'over');
  if (name) {
    const btn = panels[name].querySelector('.btn-primary');
    if (btn) window.setTimeout(() => btn.blur(), 0);
  }
}

function bestText() {
  return game.best > 0 ? 'Best rally ' + game.best : '';
}

function showStart() {
  startBest.textContent = bestText();
  startHint.textContent = hasTouch() ? 'Drag anywhere to move' : 'Move the mouse or use ↑ ↓';
  showPanel('start');
}

function hasTouch() {
  return window.matchMedia('(hover: none)').matches || 'ontouchstart' in window;
}

function startMatch() {
  audio.unlock();
  audio.ui();
  player.score = 0;
  bot.score = 0;
  game.points = 0;
  game.rally = 0;
  game.bestThisMatch = 0;
  game.winner = null;
  game.heat = 0;
  game.timeScale = 1;
  game.freeze = 0;
  game.comboIdx = -1;
  game.comboTimer = 0;
  game.overShown = false;
  game.newBest = false;
  player.y = player.target = FIELD_H / 2;
  bot.y = bot.target = FIELD_H / 2;
  player.vy = bot.vy = 0;
  clearParticles();
  beginServe(Math.random() < 0.5 ? 1 : -1);
  showPanel(null);
}

function pauseGame() {
  if (game.state !== 'play' && game.state !== 'serve') return;
  game.resumeTo = game.state;
  game.state = 'paused';
  keys.up = keys.down = false;
  pointerId = null;
  audio.ui();
  showPanel('pause');
}

function resumeGame() {
  if (game.state !== 'paused') return;
  audio.unlock();
  audio.ui();
  game.state = game.resumeTo;
  if (game.state === 'serve') game.serveTimer = Math.max(game.serveTimer, 0.5);
  showPanel(null);
}

function toMenu() {
  audio.ui();
  game.state = 'menu';
  game.winner = null;
  player.score = 0;
  bot.score = 0;
  game.points = 0;
  game.rally = 0;
  game.heat = 0;
  game.timeScale = 1;
  clearParticles();
  centreBall();
  game.serveTimer = 0.35;
  showStart();
}

function showGameOver() {
  const won = game.winner === 'you';
  overTitle.textContent = won ? 'You win' : 'Bot wins';
  overTitle.className = 'heading ' + (won ? 'win' : 'lose');
  overYou.textContent = player.score;
  overBot.textContent = bot.score;
  overBest.textContent = game.bestThisMatch === 0 ? '' :
    'Longest rally ' + game.bestThisMatch +
    (game.newBest ? ' · new best!' : ' · best ' + game.best);
  showPanel('over');
}

function toggleMute() {
  audio.setMuted(!audio.muted);
  soundBtn.classList.toggle('muted', audio.muted);
  soundBtn.setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
  soundBtn.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
  if (!audio.muted) audio.ui();
}

document.getElementById('playBtn').addEventListener('click', startMatch);
document.getElementById('againBtn').addEventListener('click', startMatch);
document.getElementById('resumeBtn').addEventListener('click', resumeGame);
document.getElementById('quitBtn').addEventListener('click', toMenu);
/* A pointer click must not leave focus parked on an icon button, or Space
   would keep activating it instead of serving. Keyboard activation (detail 0)
   deliberately keeps focus where it is. */
function dropPointerFocus(e) {
  if (e.detail > 0 && e.currentTarget.blur) e.currentTarget.blur();
}

pauseBtn.addEventListener('click', (e) => { dropPointerFocus(e); pauseGame(); });
soundBtn.addEventListener('click', (e) => { dropPointerFocus(e); audio.unlock(); toggleMute(); });

soundBtn.classList.toggle('muted', audio.muted);
soundBtn.setAttribute('aria-pressed', audio.muted ? 'true' : 'false');

// ----------------------------------------------------------------- renderer

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/*
 * Gradients are rebuilt only when the geometry or the heat bucket changes -
 * allocating them every frame is a needless cost on low-end phones.
 */
const grad = { bgHeat: -1, bg: null, court: null, endYou: null, endBot: null };

function invalidateGradients() {
  grad.bgHeat = -1;
  grad.court = null;
  grad.endYou = null;
  grad.endBot = null;
}

function drawBackground() {
  ctx.fillStyle = '#06080f';
  ctx.fillRect(0, 0, view.vw, view.vh);

  const bucket = Math.round(game.heat * 12);
  if (bucket !== grad.bgHeat || !grad.bg) {
    grad.bgHeat = bucket;
    const r = Math.max(view.vw, view.vh) * 0.75;
    const g = ctx.createRadialGradient(view.cx, view.cy, 0, view.cx, view.cy, r);
    g.addColorStop(0, hsla(heatHue(205), 60, 22, 0.55));
    g.addColorStop(1, 'rgba(6,8,15,0)');
    grad.bg = g;
  }
  ctx.fillStyle = grad.bg;
  ctx.fillRect(0, 0, view.vw, view.vh);
}

function drawCourt() {
  const w = view.w;
  const h = view.h;
  const radius = 26;

  roundRect(0, 0, w, h, radius);
  ctx.save();
  ctx.clip();

  if (!grad.court) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0c1121');
    g.addColorStop(1, '#070a14');
    grad.court = g;
  }
  ctx.fillStyle = grad.court;
  ctx.fillRect(0, 0, w, h);

  // A soft wash of colour behind each player's end.
  drawEndGlow(0, HUE.you, 'endYou');
  drawEndGlow(w, HUE.bot, 'endBot');

  // Net
  ctx.strokeStyle = 'rgba(238,242,255,0.10)';
  ctx.lineWidth = 2;
  ctx.setLineDash([9, 13]);
  ctx.beginPath();
  ctx.moveTo(w / 2, 8);
  ctx.lineTo(w / 2, h - 8);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 74, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(238,242,255,0.06)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (game.state !== 'menu') drawPips();

  drawTrail();
  drawPaddle(player, 1);
  drawPaddle(bot, -1);
  drawParticles();
  drawBall();

  ctx.restore();

  roundRect(0, 0, w, h, radius);
  ctx.strokeStyle = 'rgba(238,242,255,0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawEndGlow(x, hue, key) {
  if (!grad[key]) {
    const g = ctx.createRadialGradient(x, view.h / 2, 0, x, view.h / 2, view.h * 0.85);
    g.addColorStop(0, hsla(hue, 80, 50, 0.13));
    g.addColorStop(1, hsla(hue, 80, 50, 0));
    grad[key] = g;
  }
  ctx.fillStyle = grad[key];
  ctx.fillRect(x - view.h * 0.85, 0, view.h * 1.7, view.h);
}

function drawPips() {
  const gap = 30;
  const top = view.h / 2 - ((WIN_SCORE - 1) * gap) / 2;
  for (let side = 0; side < 2; side++) {
    const p = side === 0 ? player : bot;
    const x = side === 0 ? 24 : view.w - 24;
    const hue = sideHue(p.side);
    for (let i = 0; i < WIN_SCORE; i++) {
      const y = top + i * gap;
      if (i < p.score) {
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = hsla(hue, 95, 66, 1);
        ctx.shadowColor = hsla(hue, 95, 60, 0.9);
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = hsla(hue, 60, 60, 0.3);
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
    }
  }
}

function drawPaddle(p, dir) {
  const flash = p.flash;
  const w = PADDLE_W * (1 + flash * 0.4);
  const h = p.half * 2 * (1 - flash * 0.07);
  // Paddles keep their identity colour at all times - only the ball runs hot.
  const hue = sideHue(p.side);
  const x = p.x - w / 2 + dir * flash * 3;
  const y = p.y - h / 2;

  ctx.save();
  ctx.shadowColor = hsla(hue, 95, 60, 0.55 + flash * 0.4);
  ctx.shadowBlur = 16 + flash * 26;
  ctx.fillStyle = hsla(hue, 92, 62 + flash * 22, 1);
  roundRect(x, y, w, h, w / 2);
  ctx.fill();
  ctx.restore();

  if (flash > 0.02) {
    ctx.save();
    ctx.globalAlpha = flash * 0.5;
    ctx.strokeStyle = hsla(hue, 100, 80, 1);
    ctx.lineWidth = 2;
    roundRect(x - 5, y - 5, w + 10, h + 10, (w + 10) / 2);
    ctx.stroke();
    ctx.restore();
  }
}

const edgeA = [];
const edgeB = [];

/*
 * The comet is drawn as a triangle strip: neighbouring quads share their joint
 * edge exactly, so it tapers smoothly with no seams, and - unlike one long
 * self-intersecting polygon - a sharp bounce cannot punch a hole in it.
 */
function drawTrail() {
  const n = trail.length;
  if (n < 3) return;

  for (let i = 0; i < n; i++) {
    const a = trail[Math.max(0, i - 1)];
    const b = trail[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const t = i / (n - 1);
    const w = BALL_R * 0.95 * t * t;
    const nx = len < 0.0001 ? 0 : (-dy / len) * w;
    const ny = len < 0.0001 ? 0 : (dx / len) * w;
    edgeA[i] = { x: trail[i].x + nx, y: trail[i].y + ny };
    edgeB[i] = { x: trail[i].x - nx, y: trail[i].y - ny };
  }

  const hue = ballHue();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 1; i < n; i++) {
    const t = i / (n - 1);
    ctx.beginPath();
    ctx.moveTo(edgeA[i - 1].x, edgeA[i - 1].y);
    ctx.lineTo(edgeA[i].x, edgeA[i].y);
    ctx.lineTo(edgeB[i].x, edgeB[i].y);
    ctx.lineTo(edgeB[i - 1].x, edgeB[i - 1].y);
    ctx.closePath();
    ctx.fillStyle = hsla(hue, 100, 64, 0.42 * t * t);
    ctx.fill();
  }
  ctx.restore();
}

function drawBall() {
  if (game.state === 'serve') drawServeRing();
  if (ball.vx === 0 && ball.vy === 0 && game.state !== 'serve' && game.state !== 'menu') return;

  const hue = ballHue();
  const speedT = clamp((ball.speed - SERVE_SPEED) / (MAX_SPEED - SERVE_SPEED), 0, 1);
  const squash = ball.squash;

  // Stretch along travel, squash against the surface that was just hit.
  const velAngle = Math.atan2(ball.vy, ball.vx);
  const stretch = speedT * 0.22;
  const angle = squash > 0.05 ? ball.squashAngle : velAngle;
  const rx = BALL_R * (squash > 0.05 ? 1 - 0.38 * squash : 1 + stretch);
  const ry = BALL_R * (squash > 0.05 ? 1 + 0.3 * squash : 1 - stretch * 0.55);

  ctx.save();
  ctx.translate(ball.x, ball.y);

  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, BALL_R * 4.2);
  glow.addColorStop(0, hsla(hue, 100, 70, 0.5));
  glow.addColorStop(0.45, hsla(hue, 100, 60, 0.16));
  glow.addColorStop(1, hsla(hue, 100, 60, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, BALL_R * 4.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(angle);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = hsla(hue, 100, 68, 0.9);
  ctx.stroke();
  ctx.restore();
}

function drawServeRing() {
  const t = 1 - clamp(game.serveTimer / SERVE_DELAY, 0, 1);
  const hue = heatHue(game.serveDir > 0 ? HUE.you : HUE.bot);
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.35 * Math.sin(t * Math.PI);
  ctx.strokeStyle = hsla(hue, 100, 70, 1);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R + 6 + (1 - t) * 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < P_MAX; i++) {
    const p = parts[i];
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
 * Screen-space overlay: drawn upright whatever the field orientation, so text
 * is always readable on a portrait phone.
 */
function drawScreenHud() {
  const cx = toScreenX(view.w / 2, view.h / 2);
  const cy = toScreenY(view.w / 2, view.h / 2);
  const s = view.scale;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (game.rally >= 2 && (game.state === 'play' || game.state === 'paused')) {
    ctx.save();
    ctx.font = '800 ' + (170 * s).toFixed(1) + 'px ' + FONT;
    ctx.fillStyle = hsla(heatHue(198), 72, 72, 0.09 + game.heat * 0.13);
    ctx.fillText(String(game.rally), cx, cy);
    ctx.restore();
  }

  if (game.comboTimer > 0 && game.state !== 'serve') {
    const t = 1 - game.comboTimer / 1.3;
    const pop = 1 + Math.max(0, 0.3 - t) * 2;
    ctx.save();
    ctx.globalAlpha = Math.min(1, game.comboTimer * 2.2);
    ctx.translate(cx, cy - 116 * s);
    ctx.scale(pop, pop);
    ctx.font = '800 ' + (25 * s).toFixed(1) + 'px ' + FONT;
    ctx.fillStyle = 'hsl(38,100%,64%)';
    ctx.fillText(game.comboLabel, 0, 0);
    ctx.restore();
  }

  if (game.state === 'serve') {
    const matchPoint = player.score === WIN_SCORE - 1 || bot.score === WIN_SCORE - 1;
    if (matchPoint) {
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(game.time * 6);
      ctx.font = '750 ' + (20 * s).toFixed(1) + 'px ' + FONT;
      ctx.fillStyle = player.score === WIN_SCORE - 1 ? 'hsl(171,90%,66%)' : 'hsl(342,90%,68%)';
      ctx.fillText('MATCH POINT', cx, cy - 116 * s);
      ctx.restore();
    }
  }
}

function render() {
  const dpr = view.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground();

  ctx.save();
  ctx.translate(game.shakeX, game.shakeY);

  ctx.save();
  applyFieldTransform();
  drawCourt();
  ctx.restore();

  drawScreenHud();
  ctx.restore();

  if (game.flash > 0.01) {
    ctx.fillStyle = 'rgba(255,255,255,' + (game.flash * 0.28).toFixed(3) + ')';
    ctx.fillRect(0, 0, view.vw, view.vh);
  }
}

// ---------------------------------------------------------------- main loop

let lastTime = 0;
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);

  let rdt = (now - lastTime) / 1000;
  lastTime = now;
  if (!isFinite(rdt) || rdt <= 0) rdt = FIXED_DT;
  if (rdt > MAX_FRAME_DT) rdt = MAX_FRAME_DT;   // tab was hidden or stalled

  // Ease slow-motion back to normal in real time.
  game.timeScale += (1 - game.timeScale) * Math.min(1, rdt * 3);
  if (game.timeScale > 0.999) game.timeScale = 1;

  if (game.state === 'play' || game.state === 'serve') applyKeys(rdt);

  acc += rdt * game.timeScale;
  let steps = 0;
  while (acc >= FIXED_DT && steps < 40) {
    step(FIXED_DT);
    acc -= FIXED_DT;
    steps++;
  }
  if (steps >= 40) acc = 0;

  if (game.shake > 0) {
    game.shakeX = (Math.random() - 0.5) * game.shake;
    game.shakeY = (Math.random() - 0.5) * game.shake;
  } else {
    game.shakeX = game.shakeY = 0;
  }

  if (game.state === 'over' && !game.overShown) {
    game.overTimer -= rdt;
    if (game.overTimer <= 0) {
      game.overShown = true;
      showGameOver();
    }
  }

  render();
}

// ------------------------------------------------------------------- events

let resizeRaf = 0;
function scheduleLayout() {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    layout();
  });
}

window.addEventListener('resize', scheduleLayout);
window.addEventListener('orientationchange', scheduleLayout);
if (window.visualViewport) window.visualViewport.addEventListener('resize', scheduleLayout);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseGame();
    if (audio.ac && audio.ac.state === 'running') audio.ac.suspend();
  } else {
    lastTime = performance.now();
    acc = 0;
    if (audio.ac && !audio.muted && game.state !== 'paused') audio.ac.resume();
  }
});

window.addEventListener('blur', () => pauseGame());

if (reduceMotionQuery.addEventListener) {
  reduceMotionQuery.addEventListener('change', (e) => { motion = e.matches ? 0.25 : 1; });
}

// -------------------------------------------------------------------- start

layout();
centreBall();
player.y = player.target = FIELD_H / 2;
bot.y = bot.target = FIELD_H / 2;
game.serveTimer = 0.4;
showStart();
lastTime = performance.now();
requestAnimationFrame(frame);
