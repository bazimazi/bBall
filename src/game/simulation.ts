import { updateArena } from './arena';
import { updateAbilityFx } from './casts';
import { FIELD_H } from './constants';
import { driveAi } from './ai';
import { advanceWave, celebrate, launchBall } from './match';
import { hsla } from './palette';
import { movePaddle, stepBall } from './physics';
import { playerPaddleSpeed, updateRuntime } from './talents';
import { stepTutorial } from './tutorial';
import { combatant } from './combatant';
import type { Orb } from './effects';
import { clamp, decay, lerp } from './utils/math';
import { ballHue, hueOf, panAt, type World } from './world';

function updateEffects(world: World, dt: number): void {
  world.rings.update(dt);
  world.popups.update(dt);
  world.grid.update(dt);
  world.orbs.update(dt, (orb) => landOrb(world, orb));
}

/** A point's orb reaching its pip: the pip lights, with a chime and a ring of its own. */
function landOrb(world: World, orb: Orb): void {
  const { fx } = world;
  if (orb.side === 'you') fx.pipPopYou = 1;
  else fx.pipPopBot = 1;
  world.rings.spawn(orb.toX, orb.toY, orb.hue, 34, 0.4, 3, 80);
  world.particles.emit(
    orb.toX,
    orb.toY,
    10,
    { speed: 160, life: 0.4, size: 2.4, color: hsla(orb.hue, 100, 75, 0.9) },
    world.motion
  );
  if (world.match.status !== 'menu') world.audio.pip(panAt(world, orb.toX, orb.toY));
}

/**
 * The serve gathering itself: sparks drawn in to the ball from all round it,
 * in the colour of the side it is about to leave from.
 */
function gather(world: World, dt: number): void {
  const { fx, match, ball } = world;
  fx.gatherTick += dt;
  if (match.serveTimer < 0.12 || fx.gatherTick < 0.035) return;
  fx.gatherTick = 0;
  const hue = hueOf(world, match.serveDir > 0 ? 'you' : 'bot');
  world.particles.converge(ball.x, ball.y, 2, 74, 0.36, 2.4, hsla(hue, 100, 74, 0.9), world.motion);
}

/**
 * On fire: a ball deep into a hot rally sheds flame behind it. It says what
 * the banner said, for as long as the rally keeps it true.
 */
function flames(world: World, dt: number): void {
  const { fx, ball } = world;
  if (fx.heat < 0.72) {
    fx.flameTick = 0;
    return;
  }
  fx.flameTick += dt;
  if (fx.flameTick < 1 / 55) return;
  fx.flameTick = 0;
  const heat = (fx.heat - 0.72) / 0.28;
  world.particles.emit(
    ball.x,
    ball.y,
    2,
    {
      angle: Math.atan2(-ball.vy, -ball.vx),
      spread: 0.9,
      speed: 80 + heat * 60,
      life: 0.3 + heat * 0.12,
      size: 2.6 + heat * 1.6,
      color: hsla(ballHue(world) + (Math.random() - 0.5) * 18, 100, 58 + Math.random() * 14, 0.9),
      drag: 0.9
    },
    world.motion
  );
}

/**
 * A finished match: the replay counting down, running, and handing over to
 * the celebration; then the loser's paddle fading out.
 */
function afterMatch(world: World, dt: number): void {
  const { replay, fx, match } = world;
  if (replay.pending > 0) {
    replay.pending -= dt;
    if (replay.pending <= 0) replay.begin(world);
  } else if (replay.active && replay.play(world, dt)) {
    celebrate(world);
    match.overTimer = 1;
  }
  if (fx.celebrated) fx.endFade = Math.min(1, fx.endFade + dt / 0.7);
}

/** Advance the world by one fixed timestep. */
export function step(world: World, dt: number): void {
  const { fx, match, ball, player, bot } = world;
  // A pause holds hazards, effects, cooldowns and the replay at exactly the
  // same instant. A resume only advances its own clock until play returns.
  if (match.status === 'paused') return;
  if (match.status === 'resuming') {
    match.resumeTimer = Math.max(0, match.resumeTimer - dt);
    if (match.resumeTimer <= 1e-9) {
      match.resumeTimer = 0;
      match.status = match.resumeTo;
    }
    return;
  }
  // Calm effects keep the menu's background court still, too.
  if (match.status === 'menu' && world.motion < 0.5) return;
  if (
    match.status === 'serve' &&
    !world.tutorial &&
    !world.autoServe &&
    !match.serveRequested &&
    match.serveTimer <= 0
  ) {
    // Once the normal serve delay ends, hold the court's clock. Players may
    // aim without adding time to a timed challenge or farming skill recovery.
    movePaddle(player, dt, playerPaddleSpeed(world));
    if (world.rules.versus) movePaddle(bot, dt, playerPaddleSpeed(world));
    return;
  }
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
  fx.rallyPop = Math.max(0, fx.rallyPop - dt / 0.28);
  if (fx.vsTimer > 0) fx.vsTimer = Math.max(0, fx.vsTimer - dt);
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
  if (world.tutorial) {
    stepTutorial(world, dt);
    return;
  }
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
      if (!world.rules.versus) updateRuntime(combatant(world, 'bot'), dt);
      player.target = clamp(player.target, player.half, FIELD_H - player.half);
      movePaddle(player, dt, playerPaddleSpeed(world));
      if (world.rules.versus) {
        bot.target = clamp(bot.target, bot.half, FIELD_H - bot.half);
        movePaddle(bot, dt, playerPaddleSpeed(world));
      } else {
        bot.target = lerp(bot.target, FIELD_H / 2, Math.min(1, dt * 3));
        movePaddle(bot, dt, 600);
      }
      gather(world, dt);
      match.serveTimer = Math.max(0, match.serveTimer - dt);
      if (match.serveTimer <= 0 && (world.autoServe || match.serveRequested)) launchBall(world);
      break;
    }

    case 'play': {
      match.elapsed += dt;
      updateRuntime(world, dt);
      if (!world.rules.versus) updateRuntime(combatant(world, 'bot'), dt);
      movePaddle(player, dt, playerPaddleSpeed(world));
      // Two players: the far paddle is a person too, at the same speed.
      if (world.rules.versus) movePaddle(bot, dt, playerPaddleSpeed(world));
      else driveAi(world, bot, world.botBrain, dt);
      stepBall(world, dt);
      advanceWave(world);
      // The point may have just ended the match; only a live one is taped.
      if (match.status === 'play') {
        world.replay.record(world);
        flames(world, dt);
      }
      break;
    }

    case 'over':
      afterMatch(world, dt);
      break;

    default:
      break; // paused: effects only
  }
}
