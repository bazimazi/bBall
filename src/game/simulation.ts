import { FIELD_H } from './constants';
import { driveAi } from './ai';
import { launchBall } from './match';
import { movePaddle, stepBall } from './physics';
import { playerPaddleSpeed, updateRuntime } from './talents';
import { clamp, decay, lerp } from './utils/math';
import type { World } from './world';

/** Advance the world by one fixed timestep. */
export function step(world: World, dt: number): void {
  const { fx, match, ball, player, bot } = world;
  fx.time += dt;

  // Decays that should keep running even during a hit-stop freeze.
  fx.shake *= decay(0.0016, dt);
  if (fx.shake < 0.05) fx.shake = 0;
  fx.flash *= decay(0.0008, dt);
  ball.squash *= decay(0.0009, dt);
  player.flash *= decay(0.0005, dt);
  bot.flash *= decay(0.0005, dt);
  if (fx.comboTimer > 0) fx.comboTimer = Math.max(0, fx.comboTimer - dt);

  const heatTarget = match.status === 'play' ? clamp(match.rally / 18, 0, 1) : 0;
  fx.heat += (heatTarget - fx.heat) * Math.min(1, dt * 2.2);

  if (fx.freeze > 0) {
    fx.freeze -= dt;
    world.particles.update(dt * 0.25);
    return;
  }
  world.particles.update(dt);

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
      bot.target = lerp(bot.target, FIELD_H / 2, Math.min(1, dt * 3));
      movePaddle(bot, dt, 600);
      match.serveTimer -= dt;
      if (match.serveTimer <= 0) launchBall(world);
      break;
    }

    case 'play': {
      match.elapsed += dt;
      updateRuntime(world, dt);
      movePaddle(player, dt, playerPaddleSpeed(world));
      driveAi(world, bot, world.botBrain, dt);
      stepBall(world, dt);
      break;
    }

    default:
      break; // paused / over: effects only
  }
}
