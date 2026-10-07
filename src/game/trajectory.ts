import { applyArenaForces, portalExit, placeBumpers, type PortalTrip } from './arena';
import { bounceBumper } from './hazardContacts';
import { collideCourse } from './course';
import { bankBall, ballTimeScale, swerveBall } from './talents';
import { combatant } from './combatant';
import { BALL_R, FIELD_H } from './constants';
import { clamp } from './utils/math';
import type { Vec2 } from './types';
import type { World } from './world';

/** A bounded forward read. It only mutates copied gameplay state. */
export function forecast(
  world: World,
  targetX: number,
  out?: Vec2[],
  count?: { n: number }
): number {
  const ghost = Object.create(world) as World;
  const arena = {
    ...world.arena,
    bumpers: world.arena.bumpers.map((b) => ({ ...b })),
    bricks: world.arena.bricks.map((b) => ({ ...b })),
    course: {
      ...world.arena.course,
      rails: [...world.arena.course.rails],
      openUntil: [...world.arena.course.openUntil],
      switchLocks: [...world.arena.course.switchLocks],
      events: {
        you: { ...world.arena.course.events.you },
        bot: { ...world.arena.course.events.bot }
      }
    }
  };
  const ball = { ...world.ball };
  Object.defineProperty(ghost, 'match', {
    value: { ...world.match, score: { ...world.match.score }, status: 'play' }
  });
  Object.defineProperties(ghost, {
    arena: { value: arena },
    ball: { value: ball },
    botBrain: { value: { ...world.botBrain } },
    talents: {
      value: {
        ...world.talents,
        tactics: { ...world.talents.tactics },
        slots: world.talents.slots.map((s) => ({ ...s }))
      }
    },
    botTalents: {
      value: {
        ...world.botTalents,
        tactics: { ...world.botTalents.tactics },
        slots: world.botTalents.slots.map((s) => ({ ...s }))
      }
    }
  });
  let n = 0;
  const put = (x: number, y: number) => {
    if (out) {
      const p = out[n] ?? (out[n] = { x: 0, y: 0 });
      p.x = x;
      p.y = y;
      n++;
    }
  };
  put(ball.x, ball.y);
  const trip: PortalTrip = { x: 0, y: 0, pair: 0, from: 0 };
  const dt = 1 / 120;
  const runtimes = [ghost.talents, ghost.botTalents];
  const tactics = ['redirect', 'anchor', 'breach', 'relay', 'reserve', 'rebound'] as const;
  const side = Math.sign(targetX - ball.x);
  for (let i = 0; i < 360; i++) {
    for (const runtime of runtimes) {
      runtime.blink = Math.max(0, runtime.blink - dt);
      for (const id of tactics)
        if (runtime.tactics[id]) runtime.tactics[id] = Math.max(0, runtime.tactics[id]! - dt);
    }
    arena.time += dt * arena.intensity;
    const wind = arena.spec?.wind;
    if (wind && wind.period > 0) {
      arena.windTimer -= dt * arena.intensity;
      if (arena.windTimer <= 0) {
        arena.windTimer = wind.period;
        arena.windDir = arena.windDir === 1 ? -1 : 1;
      }
    }
    placeBumpers(ghost);
    const travel = dt * ballTimeScale(ghost);
    swerveBall(ghost, dt);
    swerveBall(combatant(ghost, 'bot'), dt);
    applyArenaForces(ghost, travel);
    ball.px = ball.x;
    ball.py = ball.y;
    ball.x += ball.vx * travel;
    ball.y += ball.vy * travel;
    if (ball.y < BALL_R) {
      ball.y = BALL_R + (BALL_R - ball.y);
      ball.vy = Math.abs(ball.vy);
      bankBall(combatant(ghost, ball.owner));
    } else if (ball.y > FIELD_H - BALL_R) {
      ball.y = FIELD_H - BALL_R - (ball.y - (FIELD_H - BALL_R));
      ball.vy = -Math.abs(ball.vy);
      bankBall(combatant(ghost, ball.owner));
    }
    if (Math.sign(targetX - ball.x) !== side) {
      const t = (targetX - ball.px) / (ball.x - ball.px || 1);
      const y = clamp(ball.py + (ball.y - ball.py) * t, BALL_R, FIELD_H - BALL_R);
      put(targetX, y);
      if (count) count.n = n;
      return y;
    }
    collideCourse(ghost);
    for (const b of arena.bumpers) bounceBumper(ball, b, world.tuning.maxSpeed);
    for (const b of arena.bricks) {
      if (!b.alive) continue;
      const dx = ball.x - clamp(ball.x, b.x, b.x + b.w),
        dy = ball.y - clamp(ball.y, b.y, b.y + b.h);
      if (dx * dx + dy * dy >= BALL_R * BALL_R) continue;
      if (Math.abs(dx) >= Math.abs(dy)) {
        const sign = ball.x < b.x + b.w / 2 ? -1 : 1;
        ball.vx = Math.abs(ball.vx) * sign;
        ball.x = (sign < 0 ? b.x : b.x + b.w) + sign * (BALL_R + 0.5);
      } else {
        const sign = ball.y < b.y + b.h / 2 ? -1 : 1;
        ball.vy = Math.abs(ball.vy) * sign;
        ball.y = clamp(
          (sign < 0 ? b.y : b.y + b.h) + sign * (BALL_R + 0.5),
          BALL_R,
          FIELD_H - BALL_R
        );
      }
      b.hp -= (ball.owner === 'you' ? ghost.talents : ghost.botTalents).tactics.breach ? 2 : 1;
      b.alive = b.hp > 0;
    }
    arena.portalLock = Math.max(0, arena.portalLock - dt);
    if (arena.portalLock === 0 && portalExit(ghost, ball.x, ball.y, ball.vx, ball.vy, trip)) {
      put(ball.x, ball.y);
      put(NaN, NaN);
      ball.x = trip.x;
      ball.y = trip.y;
      put(ball.x, ball.y);
      arena.portalLock = 0.12;
    }
    if (i % 5 === 0) put(ball.x, ball.y);
  }
  if (count) count.n = n;
  return ball.y;
}
