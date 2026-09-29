import { updateArena } from './arena';
import { updateAbilityFx } from './casts';
import { FIELD_H } from './constants';
import { driveAi } from './ai';
import { launchBall } from './match';
import { movePaddle, stepBall } from './physics';
import { playerPaddleSpeed, updateRuntime } from './talents';
import { clamp, decay, lerp } from './utils/math';
import type { World } from './world';

function updateEffects(world: World, dt: number): void {
  world.rings.update(dt);
  world.popups.update(dt);
  world.grid.update(dt);
}

/** Advance the world by one fixed timestep. */
export function step(world: World, dt: number): void {
  const { fx, match, ball, player, bot } = world;
  fx.time += dt;

  // Decays that should keep running even during a hit-stop freeze.
  fx.shake *= decay(0.0016, dt);
  if (fx.shake < 0.05) fx.shake = 0;
  fx.flash *= decay(0.0008, dt);
  // The tint belongs to the flash that asked for it; once that has gone, the
  // next plain flash must not inherit a capstone's colour.
  if (fx.flash < 0.01) fx.flashHue = -1;
  if (fx.castTimer > 0) fx.castTimer = Math.max(0, fx.castTimer - dt);
  // The viewport-wide wave and the camera punch run in real time alongside
  // the hit-stop they arrived with, so the freeze reads as impact rather
  // than as a frame the game dropped.
  if (fx.burst > 0) fx.burst = Math.max(0, fx.burst - dt);
  fx.punch *= decay(0.0004, dt);
  if (fx.punch < 0.002) fx.punch = 0;
  ball.squash *= decay(0.0009, dt);
  player.flash *= decay(0.0005, dt);
  bot.flash *= decay(0.0005, dt);
  if (fx.comboTimer > 0) fx.comboTimer = Math.max(0, fx.comboTimer - dt);
  fx.kick *= decay(0.00005, dt);
  if (Math.abs(fx.kick) < 0.05) fx.kick = 0;
  fx.goalFlash *= decay(0.006, dt);
  if (fx.goalFlash < 0.01) fx.goalFlash = 0;
  fx.pipPopYou = Math.max(0, fx.pipPopYou - dt / 0.5);
  fx.pipPopBot = Math.max(0, fx.pipPopBot - dt / 0.5);
  if (fx.edgeCooldown > 0) fx.edgeCooldown -= dt;
  if (fx.bannerTimer > 0) fx.bannerTimer = Math.max(0, fx.bannerTimer - dt);
  world.confetti.update(dt);

  const heatTarget = match.status === 'play' ? clamp(match.rally / 18, 0, 1) : 0;
  fx.heat += (heatTarget - fx.heat) * Math.min(1, dt * 2.2);

  if (fx.freeze > 0) {
    fx.freeze -= dt;
    // Skill animations slow with the hit-stop they caused rather than running
    // on through it - a capstone's flare is part of the impact, not after it.
    world.particles.update(dt * 0.25);
    updateEffects(world, dt * 0.25);
    updateAbilityFx(world, dt * 0.25);
    return;
  }
  world.particles.update(dt);
  updateEffects(world, dt);
  updateAbilityFx(world, dt);
  updateArena(world, dt);

  switch (match.status) {
    case 'menu': {
      driveAi(world, player, world.demoBrain, dt);
      driveAi(world, bot, world.botBrain, dt);
      if (match.serveTimer > 0) {
        match.serveTimer -= dt;
        if (match.serveTimer <= 0) {
          match.points = 0;
          launchBall(world);
          match.status = 'menu'; // launchBall flips to `play`; attract mode stays put
        }
      } else {
        stepBall(world, dt);
      }
      break;
    }

    case 'serve': {
      match.elapsed += dt;
      updateRuntime(world, dt);
      player.target = clamp(player.target, player.half, FIELD_H - player.half);
      movePaddle(player, dt, playerPaddleSpeed(world));
      if (world.rules.versus) {
        bot.target = clamp(bot.target, bot.half, FIELD_H - bot.half);
        movePaddle(bot, dt, playerPaddleSpeed(world));
      } else {
        bot.target = lerp(bot.target, FIELD_H / 2, Math.min(1, dt * 3));
        movePaddle(bot, dt, 600);
      }
      match.serveTimer -= dt;
      if (match.serveTimer <= 0) launchBall(world);
      break;
    }

    case 'play': {
      match.elapsed += dt;
      updateRuntime(world, dt);
      movePaddle(player, dt, playerPaddleSpeed(world));
      // Two players: the far paddle is a person too, at the same speed.
      if (world.rules.versus) movePaddle(bot, dt, playerPaddleSpeed(world));
      else driveAi(world, bot, world.botBrain, dt);
      stepBall(world, dt);
      break;
    }

    default:
      break; // paused / over: effects only
  }
}
