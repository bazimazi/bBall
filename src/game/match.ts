import {
  BALL_R,
  FIELD_H,
  MAX_SPEED,
  SERVE_DELAY,
  SERVE_SPEED,
  SPEED_PER_POINT,
  STORAGE_KEYS,
  WIN_SCORE
} from './constants';
import { hsla, sideHue } from './palette';
import type { Side } from './types';
import { clamp } from './utils/math';
import { writeStored } from './utils/storage';
import { addShake, centreBall, centrePaddles, type World } from './world';

export function beginServe(world: World, dir: 1 | -1): void {
  const { match, bot } = world;
  match.serveDir = dir;
  match.serveTimer = SERVE_DELAY;
  match.status = 'serve';
  centreBall(world);
  bot.aimed = false;
  bot.wait = 0;
}

export function launchBall(world: World): void {
  const { match, ball, fx } = world;
  match.rally = 0;
  fx.comboIndex = -1;
  ball.speed = Math.min(MAX_SPEED, SERVE_SPEED + Math.min(match.points, 10) * SPEED_PER_POINT);

  // Serve on a gentle angle - never dead flat, never steep.
  const angle = (0.16 + Math.random() * 0.34) * (Math.random() < 0.5 ? 1 : -1);
  ball.vx = Math.cos(angle) * ball.speed * match.serveDir;
  ball.vy = Math.sin(angle) * ball.speed;
  ball.owner = match.serveDir > 0 ? 'you' : 'bot';

  if (match.status !== 'menu') world.audio.serve();
  match.status = 'play';
}

/**
 * Award the point that just ended, then either finish the match or set up the
 * next serve. In attract mode nothing is scored - the demo just rallies on.
 */
export function scorePoint(world: World, scorer: Side): void {
  const { match, fx, ball, view, particles, audio } = world;
  const won = scorer === 'you';

  if (match.status === 'menu') {
    beginServe(world, Math.random() < 0.5 ? 1 : -1);
    match.status = 'menu';
    match.serveTimer = 0.5;
    return;
  }

  if (match.rally > match.bestThisMatch) match.bestThisMatch = match.rally;
  if (match.rally > match.best) {
    match.best = match.rally;
    match.newBest = true;
    writeStored(STORAGE_KEYS.best, match.best);
  }

  match.score[scorer]++;
  match.points++;
  fx.comboTimer = 0; // the rally is over - clear its banner
  fx.flash = won ? 0.5 : 0.35;
  fx.timeScale = world.motion > 0.5 ? 0.32 : 1;
  addShake(world, 10);

  particles.emit(
    won ? view.w : 0,
    clamp(ball.y, BALL_R, FIELD_H - BALL_R),
    46,
    {
      angle: won ? Math.PI : 0,
      spread: 2.2,
      speed: 440,
      life: 0.85,
      size: 4.2,
      color: hsla(sideHue(scorer), 100, 66, 0.95)
    },
    world.motion
  );
  audio.point(won);
  world.trail.length = 0;

  if (match.score[scorer] >= WIN_SCORE) {
    match.winner = scorer;
    match.status = 'over';
    match.overTimer = 0.9;
    match.overShown = false;
    audio.matchOver(won);
    return;
  }

  // The conceding side receives the next serve.
  beginServe(world, won ? -1 : 1);
}

export function startMatch(world: World): void {
  const { match, fx } = world;
  match.score.you = 0;
  match.score.bot = 0;
  match.points = 0;
  match.rally = 0;
  match.bestThisMatch = 0;
  match.winner = null;
  match.newBest = false;
  match.overShown = false;
  fx.heat = 0;
  fx.timeScale = 1;
  fx.freeze = 0;
  fx.comboIndex = -1;
  fx.comboTimer = 0;
  centrePaddles(world);
  world.particles.clear();
  beginServe(world, Math.random() < 0.5 ? 1 : -1);
}

export function returnToMenu(world: World): void {
  const { match, fx } = world;
  match.status = 'menu';
  match.winner = null;
  match.score.you = 0;
  match.score.bot = 0;
  match.points = 0;
  match.rally = 0;
  fx.heat = 0;
  fx.timeScale = 1;
  world.particles.clear();
  centreBall(world);
  match.serveTimer = 0.35;
}

export function isMatchPoint(world: World): boolean {
  const { score } = world.match;
  return score.you === WIN_SCORE - 1 || score.bot === WIN_SCORE - 1;
}
