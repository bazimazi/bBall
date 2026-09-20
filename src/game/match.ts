import { objectiveMet } from '../core/modes/rules';
import type { MatchResult, MatchRules } from '../core/modes/types';
import { BALL_R, FIELD_H, SERVE_DELAY } from './constants';
import { hsla } from './palette';
import { matchStats, resetDrive, resetRally, resetRuntime, trySecondChance } from './talents';
import type { Side } from './types';
import { clamp } from './utils/math';
import {
  addShake,
  applyPaddleSizes,
  attractRules,
  centreBall,
  centrePaddles,
  hueOf,
  setBrainProfile,
  tuningFor,
  type World
} from './world';

export function beginServe(world: World, dir: 1 | -1): void {
  const { match, botBrain, demoBrain } = world;
  match.serveDir = dir;
  match.serveTimer = SERVE_DELAY;
  match.status = 'serve';
  centreBall(world);
  resetRally(world);
  for (const brain of [botBrain, demoBrain]) {
    brain.aimed = false;
    brain.reads = 0;
    brain.misread = false;
    // The serve is seen no faster than anything else.
    brain.wait = brain.profile.reaction;
  }
}

export function launchBall(world: World): void {
  const { match, ball, fx, tuning } = world;
  match.rally = 0;
  fx.comboIndex = -1;
  ball.speed = Math.min(
    tuning.maxSpeed,
    tuning.serveSpeed + Math.min(match.points, 10) * tuning.perPoint
  );

  // Serve on a gentle angle - never dead flat, never steep.
  const angle = (0.16 + Math.random() * 0.34) * (Math.random() < 0.5 ? 1 : -1);
  ball.vx = Math.cos(angle) * ball.speed * match.serveDir;
  ball.vy = Math.sin(angle) * ball.speed;
  ball.owner = match.serveDir > 0 ? 'you' : 'bot';

  if (match.status !== 'menu') world.audio.serve();
  match.status = 'play';
}

/** The match is over. The result itself is published a beat later. */
function endMatch(world: World, won: boolean): void {
  const { match } = world;
  match.winner = won ? 'you' : 'bot';
  match.status = 'over';
  match.overTimer = 0.9;
  match.overShown = false;
  world.audio.matchOver(won);
}

function buildResult(world: World, won: boolean, abandoned: boolean): MatchResult {
  const { match, rules } = world;
  const core = {
    mode: rules.mode,
    ranked: rules.ranked,
    botId: rules.bot.id,
    botRank: rules.bot.rank,
    won,
    scoreYou: match.score.you,
    scoreBot: match.score.bot,
    bestRally: match.bestThisMatch,
    hits: match.hits,
    seconds: Math.round(match.elapsed),
    livesLeft: match.lives,
    objective: rules.objective,
    challengeId: rules.challengeId,
    tournamentRound: rules.tournamentRound,
    tournamentTier: rules.tournamentTier,
    talent: matchStats(world),
    shutout: won && match.score.bot === 0,
    comeback: won && match.deficit >= 2,
    abandoned
  };
  return { ...core, objectiveMet: objectiveMet(rules.objective, core) };
}

/**
 * Hand the finished match to the UI. Called once, after the short pause that
 * lets the winning point be seen.
 */
export function publishResult(world: World, abandoned = false): void {
  const { match } = world;
  if (match.overShown) return;
  match.result = buildResult(world, match.winner === 'you', abandoned);
  match.resultId++;
  match.overShown = true;
}

/** Record the rally that just ended against this match's best. */
function noteRally(world: World): void {
  const { match } = world;
  if (match.rally > match.bestThisMatch) match.bestThisMatch = match.rally;
}

function pointFx(world: World, scorer: Side, won: boolean): void {
  const { fx, ball, view, particles, audio } = world;
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
      color: hsla(hueOf(world, scorer), 100, 66, 0.95)
    },
    world.motion
  );
  audio.point(won);
  world.trail.length = 0;
}

/**
 * Award the point that just ended, then either finish the match or set up the
 * next serve. In attract mode nothing is scored - the demo just rallies on.
 */
export function scorePoint(world: World, scorer: Side): void {
  const { match } = world;
  const won = scorer === 'you';

  if (match.status === 'menu') {
    beginServe(world, Math.random() < 0.5 ? 1 : -1);
    match.status = 'menu';
    match.serveTimer = 0.5;
    return;
  }

  noteRally(world);

  // Second Chance steps in before anything is scored: the rally is over, the
  // drive is broken, but the point itself is handed back. One use, then it
  // is gone for the rest of the match.
  if (!won && trySecondChance(world)) {
    resetDrive(world);
    pointFx(world, 'you', true);
    beginServe(world, 1);
    return;
  }

  pointFx(world, scorer, won);
  if (!won) resetDrive(world);

  // Endless: the run is measured in lives, not points. A miss by the wall
  // simply restarts the rally.
  if (match.maxLives > 0) {
    if (!won) {
      match.lives = Math.max(0, match.lives - 1);
      if (match.lives === 0) {
        endMatch(world, false);
        return;
      }
    }
    beginServe(world, won ? -1 : 1);
    return;
  }

  match.score[scorer]++;
  match.points++;
  match.deficit = Math.max(match.deficit, match.score.bot - match.score.you);

  if (match.score[scorer] >= match.winScore) {
    endMatch(world, won);
    return;
  }

  // The conceding side receives the next serve.
  beginServe(world, won ? -1 : 1);
}

/** Start a brand new match under `rules`. */
export function startMatch(world: World, rules: MatchRules = world.rules): void {
  const { match, fx } = world;
  world.rules = rules;
  world.tuning = tuningFor(rules);
  applyPaddleSizes(world);
  setBrainProfile(world.botBrain, rules.bot);
  // Shields, charges and cooldowns all start a match full and cold.
  resetRuntime(world);

  match.mode = rules.mode;
  match.label = rules.label;
  match.winScore = rules.winScore;
  match.lives = rules.lives;
  match.maxLives = rules.lives;
  match.score.you = rules.modifiers.startScore.you;
  match.score.bot = rules.modifiers.startScore.bot;
  match.deficit = Math.max(0, match.score.bot - match.score.you);
  match.points = match.score.you + match.score.bot;
  match.rally = 0;
  match.bestThisMatch = 0;
  match.hits = 0;
  match.elapsed = 0;
  match.winner = null;
  match.overShown = false;
  match.result = null;

  fx.heat = 0;
  fx.timeScale = 1;
  fx.freeze = 0;
  fx.comboIndex = -1;
  fx.comboTimer = 0;
  centrePaddles(world);
  world.particles.clear();
  beginServe(world, Math.random() < 0.5 ? 1 : -1);
}

/** Drop back to the attract-mode demo behind the menus. */
export function returnToMenu(world: World): void {
  const { match, fx } = world;
  world.rules = attractRules();
  world.tuning = tuningFor(world.rules);
  applyPaddleSizes(world);
  setBrainProfile(world.botBrain, world.rules.bot);
  resetRuntime(world);

  match.status = 'menu';
  match.mode = world.rules.mode;
  match.label = world.rules.label;
  match.winner = null;
  match.score.you = 0;
  match.score.bot = 0;
  match.winScore = world.rules.winScore;
  match.lives = 0;
  match.maxLives = 0;
  match.points = 0;
  match.rally = 0;
  match.bestThisMatch = 0;
  match.hits = 0;
  match.elapsed = 0;
  match.deficit = 0;
  match.result = null;
  match.overShown = false;
  fx.heat = 0;
  fx.timeScale = 1;
  world.particles.clear();
  centreBall(world);
  match.serveTimer = 0.35;
}

export function isMatchPoint(world: World): boolean {
  const { score, winScore } = world.match;
  if (winScore <= 0) return false;
  return score.you === winScore - 1 || score.bot === winScore - 1;
}
