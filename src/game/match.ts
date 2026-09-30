import { objectiveMet } from '../core/modes/rules';
import { dayKey } from '../core/progression/xp';
import type { MatchResult, MatchRules } from '../core/modes/types';
import { BALL_R, FIELD_H, PADDLE_W, PIP_GAP, PIP_INSET, SERVE_DELAY } from './constants';
import { arenaServe, BANNER_TIME, checkBossPhase, setupArena } from './arena';
import { clearAbilityFx } from './casts';
import { hsla } from './palette';
import { withBoons } from '../core/talents/effects';
import {
  DEFAULT_LOADOUT,
  matchStats,
  resetDrive,
  resetRally,
  resetRuntime,
  trySecondChance,
  tryZenith,
  wonPoint
} from './talents';
import type { Paddle, Side } from './types';
import { clamp } from './utils/math';
import { toScreenX, toScreenY } from './view';
import {
  addKick,
  addShake,
  applyPaddleSizes,
  buzz,
  isHuman,
  attractRules,
  centreBall,
  centrePaddles,
  hueOf,
  panAt,
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
  arenaServe(world);
  world.replay.reset();
  for (const brain of [botBrain, demoBrain]) {
    brain.aimed = false;
    brain.reads = 0;
    brain.misread = false;
    // The serve is seen no faster than anything else.
    brain.wait = brain.profile.reaction;
  }
}

/** The steepest a person may aim a serve, and the shallowest one may leave. */
const SERVE_AIM = 0.5;
const SERVE_FLOOR = 0.12;

/** The paddle a serve leaves from: the one at the end the ball travels away from. */
function serverOf(world: World): Paddle {
  return world.match.serveDir > 0 ? world.player : world.bot;
}

/**
 * Is a person about to aim this serve?
 *
 * The side the ball leaves from steers it with where their paddle stands -
 * high sends it high, low sends it low - so the serve after a lost point is a
 * decision rather than a coin toss. A bot's serve stays a toss-up, and so
 * does every serve in the attract demo.
 */
export function aimedServe(world: World): boolean {
  const { match } = world;
  if (match.status !== 'serve') return false;
  return isHuman(world, serverOf(world).side);
}

/**
 * The angle an aimed serve leaves at: the serving paddle's lean away from the
 * middle, as a share of how far it could lean. Never flatter than a floor, so
 * no serve is ever a dead-straight gift.
 */
export function serveAimAngle(world: World): number {
  const paddle = serverOf(world);
  const travel = FIELD_H / 2 - paddle.half;
  const lean = travel > 1 ? clamp((paddle.y - FIELD_H / 2) / travel, -1, 1) : 0;
  const angle = lean * SERVE_AIM;
  if (Math.abs(angle) >= SERVE_FLOOR) return angle;
  return (lean < 0 ? -1 : 1) * SERVE_FLOOR;
}

export function launchBall(world: World): void {
  const { match, ball, fx, tuning } = world;
  match.rally = 0;
  fx.comboIndex = -1;
  ball.speed = Math.min(
    tuning.maxSpeed,
    tuning.serveSpeed + Math.min(match.points, 10) * tuning.perPoint
  );

  // A person aims their own serve; otherwise it leaves on a gentle angle -
  // never dead flat, never steep - either way.
  const angle = aimedServe(world)
    ? serveAimAngle(world)
    : (0.16 + Math.random() * 0.34) * (Math.random() < 0.5 ? 1 : -1);
  ball.vx = Math.cos(angle) * ball.speed * match.serveDir;
  ball.vy = Math.sin(angle) * ball.speed;
  ball.owner = match.serveDir > 0 ? 'you' : 'bot';

  if (match.status !== 'menu') world.audio.serve();
  match.status = 'play';
}

/**
 * The match is over. The final point plays out in slow motion, then - when
 * the player has replays on and there is enough of the point on tape - it is
 * wound back and shown again, and only then does the celebration start. The
 * result itself is published a beat after that.
 */
function endMatch(world: World, won: boolean): void {
  const { match, fx } = world;
  match.winner = won ? 'you' : 'bot';
  match.status = 'over';
  match.overTimer = 1.1;
  match.overShown = false;
  fx.celebrated = false;
  fx.endFade = 0;
  world.audio.matchOver(won);
  buzz(world, won ? 80 : 120);

  if (world.replays && world.motion >= 0.5 && world.replay.worthShowing) {
    world.replay.schedule();
    return;
  }
  celebrate(world);
}

/** Is the closing replay still to come, or running? The result waits for it. */
export function replayHolding(world: World): boolean {
  return world.replay.pending > 0 || world.replay.active;
}

/**
 * Cut the closing replay short - a tap, or a key - and go straight to the
 * celebration. Returns true when there was one to cut.
 */
export function skipReplay(world: World): boolean {
  if (world.match.status !== 'over' || !replayHolding(world)) return false;
  world.replay.pending = 0;
  world.replay.active = false;
  celebrate(world);
  world.match.overTimer = Math.min(world.match.overTimer, 0.55);
  return true;
}

/**
 * The end of a match, marked: the loser's paddle comes apart, and a winner -
 * the player, or either player of a two-player match - gets the crowd and
 * the confetti. Once per match.
 */
export function celebrate(world: World): void {
  const { match, fx, view, motion } = world;
  if (fx.celebrated || match.status !== 'over') return;
  fx.celebrated = true;
  const won = match.winner === 'you';

  // The losing paddle dissolves into its own colour.
  const loser = won ? world.bot : world.player;
  const loserHue = hueOf(world, loser.side);
  for (let i = 0; i < 9; i++) {
    const y = loser.y - loser.half + ((i + 0.5) / 9) * loser.half * 2;
    world.particles.emit(
      loser.x + (Math.random() - 0.5) * PADDLE_W,
      y,
      4,
      { speed: 110, life: 0.9, size: 3, color: hsla(loserHue, 90, 70, 0.85), drag: 0.95 },
      motion
    );
  }

  // A two-player match has a winner either way, and they both deserve it.
  const cheer = won || world.rules.versus === true;
  if (!cheer) return;
  world.audio.celebrate();
  fx.punch = Math.max(fx.punch, 0.8 * motion);
  const winner = won ? 'you' : 'bot';
  const hue = hueOf(world, winner);
  const hues = [hue, (hue + 36) % 360, 48, (hue + 320) % 360];
  const count = Math.round(34 * Math.max(0.35, motion));
  world.confetti.burst(view.vw * 0.22, view.vh * 0.98, count, hues);
  world.confetti.burst(view.vw * 0.78, view.vh * 0.98, count, hues);
  world.confetti.burst(
    toScreenX(view, won ? view.w : 0, FIELD_H / 2),
    toScreenY(view, won ? view.w : 0, FIELD_H / 2),
    Math.round(count * 0.6),
    hues,
    0.8
  );
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
    stageId: rules.stageId,
    dailyKey: rules.dailyKey,
    runStage: rules.runStage,
    bossId: rules.boss?.id,
    day: dayKey(),
    talent: matchStats(world),
    flicks: match.flicks,
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
  buzz(world, won ? 28 : 50);
  fx.timeScale = world.motion > 0.5 ? 0.32 : 1;
  addShake(world, 10);
  addKick(world, won ? 9 : -9);

  // The line that was breached lights up in the scorer's colour, and the
  // floor bows away from where the ball went through it.
  const lineX = won ? view.w : 0;
  const y = clamp(ball.y, BALL_R, FIELD_H - BALL_R);

  // A serve that won the point untouched is an ace, and it says so.
  if (world.match.rally === 0 && ball.owner === scorer) {
    world.popups.spawn('ACE', won ? view.w - 70 : 70, y, hueOf(world, scorer), 26);
  }
  const hue = hueOf(world, scorer);
  fx.goalFlash = 1;
  fx.goalSide = won ? 'bot' : 'you';
  world.rings.spawn(lineX, y, hue, 190, 0.62, 9, 78);
  world.rings.spawn(lineX, y, hue, 110, 0.4, 5, 86);
  world.grid.impulse(lineX, y, 900, 230);

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
  audio.point(won, panAt(world, lineX, y));
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
  if (!won && (tryZenith(world) || trySecondChance(world))) {
    resetDrive(world);
    pointFx(world, 'you', true);
    beginServe(world, 1);
    return;
  }

  pointFx(world, scorer, won);
  if (won) wonPoint(world);
  else resetDrive(world);

  // Endless: the run is measured in lives, not points. A miss by the wall
  // simply restarts the rally.
  if (match.maxLives > 0) {
    if (!won) {
      match.lives = Math.max(0, match.lives - 1);
      breakLife(world);
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
  sendOrb(world, scorer);
  if (won && match.score.you < match.winScore) checkBossPhase(world);
  match.deficit = Math.max(match.deficit, match.score.bot - match.score.you);

  if (match.score[scorer] >= match.winScore) {
    endMatch(world, won);
    return;
  }

  // The conceding side receives the next serve.
  beginServe(world, won ? -1 : 1);
}

/** A life lost in a lives mode: its pip breaks apart rather than simply going dark. */
function breakLife(world: World): void {
  const { match } = world;
  const top = FIELD_H / 2 - ((match.maxLives - 1) * PIP_GAP) / 2;
  const y = top + match.lives * PIP_GAP;
  const hue = hueOf(world, 'you');
  world.rings.spawn(PIP_INSET, y, hue, 40, 0.5, 4, 78);
  world.particles.emit(
    PIP_INSET,
    y,
    16,
    { speed: 190, life: 0.6, size: 2.8, color: hsla(hue, 100, 72, 0.9) },
    world.motion
  );
}

/**
 * Carry the point home: an orb leaves the line the ball went through and
 * arcs to the scorer's column, and the pip lights when it lands.
 */
function sendOrb(world: World, scorer: Side): void {
  const { match, view, ball } = world;
  if (match.winScore <= 0) return;
  const lineX = scorer === 'you' ? view.w : 0;
  const pipX = scorer === 'you' ? PIP_INSET : view.w - PIP_INSET;
  const top = FIELD_H / 2 - ((match.winScore - 1) * PIP_GAP) / 2;
  const pipY = top + (match.score[scorer] - 1) * PIP_GAP;
  const y = clamp(ball.y, BALL_R, FIELD_H - BALL_R);
  world.orbs.spawn(scorer, lineX, y, pipX, pipY, hueOf(world, scorer));
}

/** Start a brand new match under `rules`. */
export function startMatch(world: World, rules: MatchRules = world.rules): void {
  const { match, fx } = world;
  world.rules = rules;
  world.tuning = tuningFor(rules);
  // The build this match is played with: none at all in a two-player match,
  // the run's boons folded in for a Gauntlet one, the player's own otherwise.
  world.loadout = rules.versus
    ? DEFAULT_LOADOUT
    : rules.boons
      ? withBoons(world.baseLoadout, rules.boons)
      : world.baseLoadout;
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
  match.flicks = 0;
  match.elapsed = 0;
  match.winner = null;
  match.overShown = false;
  match.result = null;

  clearEffects(world);
  fx.heat = 0;
  fx.timeScale = 1;
  fx.freeze = 0;
  fx.comboIndex = -1;
  fx.comboTimer = 0;
  centrePaddles(world);
  world.particles.clear();
  clearAbilityFx(world);
  setupArena(world);
  beginServe(world, Math.random() < 0.5 ? 1 : -1);
  introBanner(world);
}

/**
 * A boss announces itself, and a named stage says its name, over a first
 * serve held a beat longer so the card can be read.
 */
function introBanner(world: World): void {
  const { rules, fx, match } = world;
  const boss = rules.boss;
  if (boss) {
    fx.bannerText = boss.name;
    fx.bannerSub = boss.title;
    fx.bannerHue = boss.hue;
  } else if (rules.intro) {
    fx.bannerText = rules.intro.title;
    fx.bannerSub = rules.intro.sub;
    fx.bannerHue = hueOf(world, 'you');
  } else {
    // Everything else walks on to a versus card: the two names, sliding in
    // from their own ends of the court.
    fx.vsLeft = rules.versus ? 'Player 1' : world.playerName;
    fx.vsRight = rules.versus ? 'Player 2' : rules.bot.name;
    fx.vsSub = rules.label;
    fx.vsTimer = VS_TIME;
    match.serveTimer += 0.55;
    return;
  }
  fx.bannerTimer = BANNER_TIME;
  match.serveTimer += 1.1;
  if (boss) world.audio.phase();
}

/** Seconds the versus card a match opens on stays up. */
export const VS_TIME = 1.45;

/** Drop back to the attract-mode demo behind the menus. */
export function returnToMenu(world: World): void {
  const { match, fx } = world;
  world.rules = attractRules();
  world.tuning = tuningFor(world.rules);
  world.loadout = world.baseLoadout;
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
  match.flicks = 0;
  match.elapsed = 0;
  match.deficit = 0;
  match.result = null;
  match.overShown = false;
  clearEffects(world);
  fx.heat = 0;
  fx.timeScale = 1;
  world.particles.clear();
  clearAbilityFx(world);
  setupArena(world);
  centreBall(world);
  match.serveTimer = 0.35;
}

/** Every lingering presentation effect, gone - a new match starts clean. */
function clearEffects(world: World): void {
  const { fx } = world;
  world.rings.clear();
  world.popups.clear();
  world.confetti.clear();
  world.grid.clear();
  world.orbs.clear();
  world.replay.clear();
  fx.celebrated = false;
  fx.endFade = 0;
  fx.vsTimer = 0;
  fx.rallyPop = 0;
  fx.kick = 0;
  fx.goalFlash = 0;
  fx.pipPopYou = 0;
  fx.pipPopBot = 0;
  fx.edgeCooldown = 0;
  fx.punch = 0;
  fx.bannerTimer = 0;
}

export function isMatchPoint(world: World): boolean {
  const { score, winScore } = world.match;
  if (winScore <= 0) return false;
  return score.you === winScore - 1 || score.bot === winScore - 1;
}
