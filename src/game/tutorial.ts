import { BALANCE } from '../core/balance/config';
import { practiceRules } from '../core/modes/rules';
import { driveAi } from './ai';
import { FIELD_H } from './constants';
import { startMatch } from './match';
import { movePaddle, stepBall } from './physics';
import { DEFAULT_LOADOUT, playerPaddleSpeed, resetRuntime } from './talents';
import type { TutorialStep } from './types';
import { clamp } from './utils/math';
import type { World } from './world';

/** Set up the same readable incoming shot, held until the player asks for it. */
function readyShot(world: World): void {
  const { ball, match, tutorial, player } = world;
  if (!tutorial) return;
  ball.x = world.view.w * 0.68;
  ball.y = FIELD_H * 0.42;
  ball.px = ball.x;
  ball.py = ball.y;
  ball.vx = ball.vy = 0;
  ball.owner = 'bot';
  ball.speed = BALANCE.tutorial.serve;
  tutorial.targetY =
    tutorial.step === 'move'
      ? FIELD_H * 0.28
      : ball.y - (tutorial.step === 'angle' ? player.half * BALANCE.tutorial.placement : 0);
  match.status = 'serve';
  match.serveDir = -1;
  match.serveTimer = 0;
  match.serveRequested = false;
  match.rally = 0;
  world.trail.length = 0;
}

export function startTutorial(world: World): void {
  startMatch(world, { ...practiceRules('rookie'), label: 'First rally' });
  // Teach ordinary contact with a consistent paddle, whatever build is equipped.
  world.loadout = DEFAULT_LOADOUT;
  resetRuntime(world);
  world.tuning.serveSpeed = BALANCE.tutorial.serve;
  world.tuning.maxSpeed = BALANCE.tutorial.max;
  world.tuning.speedPerHit = BALANCE.tutorial.growth;
  world.tuning.perPoint = 0;
  world.fx.vsTimer = world.fx.bannerTimer = 0;
  world.tutorial = {
    step: 'move',
    cleared: false,
    feedback: null,
    targetY: 0,
    flightLeft: 0
  };
  readyShot(world);
}

/** Only a demonstrated return can advance the lesson. */
export function advanceTutorial(world: World): void {
  const tutorial = world.tutorial;
  if (!tutorial?.cleared) return;
  const next: TutorialStep = tutorial.step === 'return' ? 'angle' : 'complete';
  tutorial.step = next;
  tutorial.cleared = false;
  tutorial.feedback = null;
  tutorial.flightLeft = 0;
  readyShot(world);
}

/** Real movement and collision physics, with no penalty for a missed attempt. */
export function stepTutorial(world: World, dt: number): void {
  const { tutorial, match, player, ball } = world;
  if (!tutorial) return;
  movePaddle(player, dt, playerPaddleSpeed(world));
  if (tutorial.step === 'complete') return;
  if (tutorial.step === 'move') {
    match.serveRequested = false;
    if (Math.abs(player.y - tutorial.targetY) <= 14) {
      tutorial.step = 'return';
      readyShot(world);
    }
    return;
  }

  if (tutorial.flightLeft > 0) {
    tutorial.flightLeft = Math.max(0, tutorial.flightLeft - dt);
    if (match.status === 'play') {
      driveAi(world, world.bot, world.botBrain, dt);
      stepBall(world, dt);
    }
    if (tutorial.flightLeft === 0) readyShot(world);
    return;
  }
  if (tutorial.cleared) {
    match.serveRequested = false;
    return;
  }
  if (match.status === 'serve') {
    if (!match.serveRequested) return;
    match.serveRequested = false;
    match.status = 'play';
    tutorial.feedback = null;
    ball.vx = -ball.speed;
    ball.vy = 0;
    world.audio.serve();
  }

  const hits = match.hits;
  stepBall(world, dt);
  if (match.hits > hits) {
    const placed = Math.abs(clamp(player.hitY / player.half, -1, 1));
    tutorial.cleared = tutorial.step === 'return' || placed >= BALANCE.tutorial.angleThreshold;
    tutorial.feedback = tutorial.cleared ? null : 'centre';
    tutorial.flightLeft = BALANCE.tutorial.returnPreview;
  } else if (world.match.status === 'serve') {
    readyShot(world);
  }
}
