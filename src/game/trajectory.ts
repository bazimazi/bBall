import {
  applyArenaForces,
  portalExit,
  placeBumpers,
  type ArenaState,
  type BrickState,
  type PortalTrip
} from './arena';
import { bounceBumper } from './hazardContacts';
import { collideCourse, type CourseState } from './course';
import { bankBall, ballTimeScale } from './talents';
import { combatant } from './combatant';
import { BALL_R, FIELD_H } from './constants';
import { clamp } from './utils/math';
import type { ArenaSpec } from '../core/modes/types';
import type { Ball, Vec2 } from './types';
import type { World } from './world';

/** Broad-phase reach: a ball's radius plus slack well past any rounding. */
const NEAR = BALL_R + 4;

/**
 * Could {@link collideCourse} do anything this step besides advance the
 * course clock?
 *
 * Each of its effects needs the ball close to a feature: a gate's line
 * within a radius of the swept path (closing lips, crossings and the gate
 * faces), a rail's box around that path, or a switch or zone at the ball's
 * new position. These boxes contain every exact test, so skipping the call
 * when this says no gives the same read. It only spares rebuilding the
 * course geometry on the many steps a read spends in open court.
 */
export function nearCourse(spec: ArenaSpec, width: number, ball: Ball): boolean {
  const minX = Math.min(ball.px, ball.x) - NEAR;
  const maxX = Math.max(ball.px, ball.x) + NEAR;
  if (spec.gates)
    for (const gate of spec.gates) {
      const x = gate.x * width;
      if (x >= minX && x <= maxX) return true;
    }
  const minY = Math.min(ball.py, ball.y) - NEAR;
  const maxY = Math.max(ball.py, ball.y) + NEAR;
  if (spec.rails)
    for (const rail of spec.rails) {
      const ax = rail.ax * width;
      const bx = rail.bx * width;
      const ay = rail.ay * FIELD_H;
      const by = rail.by * FIELD_H;
      if (
        Math.max(ax, bx) >= minX &&
        Math.min(ax, bx) <= maxX &&
        Math.max(ay, by) >= minY &&
        Math.min(ay, by) <= maxY
      )
        return true;
    }
  if (spec.switches)
    for (const s of spec.switches) {
      const reach = s.r + NEAR;
      if (Math.abs(ball.x - s.x * width) <= reach && Math.abs(ball.y - s.y * FIELD_H) <= reach)
        return true;
    }
  if (spec.zones)
    for (const zone of spec.zones) {
      if (
        ball.x >= zone.x * width - NEAR &&
        ball.x <= (zone.x + zone.w) * width + NEAR &&
        ball.y >= zone.y * FIELD_H - NEAR &&
        ball.y <= (zone.y + zone.h) * FIELD_H + NEAR
      )
        return true;
    }
  return false;
}

/**
 * A bounded forward read. It only mutates copied gameplay state.
 *
 * The bots call this every physics step on a court that bends or blocks the
 * ball, so the copies are taken lazily: the course's counters and the brick
 * wall are cloned the first time the read actually touches them, and most
 * reads cross open court without doing either.
 */
export function forecast(
  world: World,
  targetX: number,
  out?: Vec2[],
  count?: { n: number }
): number {
  const ghost = Object.create(world) as World;
  const source = world.arena;
  // The clock is written on every step; the arrays only on contact.
  const course: CourseState = { ...source.course };
  let courseOwned = false;
  let bricksOwned = false;
  const arena: ArenaState = {
    ...source,
    bumpers: source.bumpers.map((b) => ({ ...b })),
    course
  };
  const ball = { ...world.ball };
  Object.defineProperty(ghost, 'match', {
    value: { ...world.match, score: { ...world.match.score }, status: 'play' }
  });
  Object.defineProperties(ghost, {
    player: {
      value: {
        ...world.player,
        material: { ...world.player.material, stats: { ...world.player.material.stats } }
      }
    },
    bot: {
      value: {
        ...world.bot,
        material: { ...world.bot.material, stats: { ...world.bot.material.stats } }
      }
    },
    arena: { value: arena },
    ball: { value: ball },
    botBrain: { value: { ...world.botBrain } },
    // A Swerve that has not broken yet is invisible: the read sees a
    // straight ball, and once it has broken the break is in its velocity.
    talents: {
      value: {
        ...world.talents,
        swerveDir: 0,
        slots: world.talents.slots.map((s) => ({ ...s }))
      }
    },
    botTalents: {
      value: {
        ...world.botTalents,
        swerveDir: 0,
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
  /** The wall is cloned before the first brick this read breaks. */
  const ownBrick = (index: number): BrickState => {
    if (!bricksOwned) {
      arena.bricks = arena.bricks.map((b) => ({ ...b }));
      bricksOwned = true;
    }
    return arena.bricks[index]!;
  };
  put(ball.x, ball.y);
  const trip: PortalTrip = { x: 0, y: 0, pair: 0, from: 0 };
  const dt = 1 / 120;
  const runtimes = [ghost.talents, ghost.botTalents];
  const side = Math.sign(targetX - ball.x);
  const width = world.view.w;
  for (let i = 0; i < 360; i++) {
    for (const runtime of runtimes) runtime.blink = Math.max(0, runtime.blink - dt);
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
    if (arena.spec && nearCourse(arena.spec, width, ball)) {
      if (!courseOwned) {
        course.rails = [...course.rails];
        course.openUntil = [...course.openUntil];
        course.switchLocks = [...course.switchLocks];
        course.events = { you: { ...course.events.you }, bot: { ...course.events.bot } };
        courseOwned = true;
      }
      collideCourse(ghost);
    } else {
      // Everything the exact pass would have done in open court.
      course.time = arena.time;
    }
    for (const b of arena.bumpers) bounceBumper(ball, b, world.tuning.maxSpeed);
    for (let k = 0; k < arena.bricks.length; k++) {
      const b = arena.bricks[k]!;
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
      const hit = ownBrick(k);
      hit.hp -= 1;
      hit.alive = hit.hp > 0;
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
