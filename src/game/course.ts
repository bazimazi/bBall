import { BALANCE } from '../core/balance/config';
import type { ArenaSpec, GateSpec } from '../core/modes/types';
import { BALL_R, FIELD_H } from './constants';
import type { Side, Vec2 } from './types';
import type { World } from './world';
import { combatant } from './combatant';
import { applyTempo } from './talents';

export interface CourseState {
  time: number;
  rails: number[];
  openUntil: number[];
  switchLocks: number[];
  zoneLock: number;
  events: Record<Side, { banks: number; switches: number; breaks: number; gates: number }>;
}

export function createCourse(spec?: ArenaSpec | null): CourseState {
  return {
    time: 0,
    rails: (spec?.rails ?? []).map((r) => r.hp ?? -1),
    openUntil: (spec?.gates ?? []).map(() => 0),
    switchLocks: (spec?.switches ?? []).map(() => 0),
    zoneLock: 0,
    events: {
      you: { banks: 0, switches: 0, breaks: 0, gates: 0 },
      bot: { banks: 0, switches: 0, breaks: 0, gates: 0 }
    }
  };
}

export function gateOpening(g: GateSpec, time: number, openUntil = 0) {
  const cycle = (time % g.period) / g.period;
  // Every gate has a visible full-width release beat. Shallow trajectories
  // outside a moving gap's range must still have a way out.
  const release = g.phased ? 0.5 : 0.88;
  const open = time < openUntil || (g.phased ? cycle < release : cycle >= release);
  return {
    center: g.center + Math.sin((time * Math.PI * 2) / g.period) * (g.amplitude ?? 0),
    gap: open ? 1 : g.gap,
    seconds: g.period * (cycle < release ? release - cycle : 1 - cycle)
  };
}

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  rail: number;
}

/** Same segment geometry for collision, forecasting and drawing. */
export function courseSegments(
  spec: ArenaSpec | null,
  width: number,
  time: number,
  course: CourseState
): Segment[] {
  const segments: Segment[] = [];
  for (const [i, r] of (spec?.rails ?? []).entries()) {
    if (course.rails[i] === 0) continue;
    segments.push({
      ax: r.ax * width,
      ay: r.ay * FIELD_H,
      bx: r.bx * width,
      by: r.by * FIELD_H,
      rail: i
    });
  }
  for (const [i, g] of (spec?.gates ?? []).entries()) {
    const opening = gateOpening(g, time, course.openUntil[i]);
    if (opening.gap >= 1) continue;
    const top = Math.max(0, (opening.center - opening.gap / 2) * FIELD_H);
    const bottom = Math.min(FIELD_H, (opening.center + opening.gap / 2) * FIELD_H);
    segments.push(
      { ax: g.x * width, ay: 0, bx: g.x * width, by: top, rail: -1 },
      { ax: g.x * width, ay: bottom, bx: g.x * width, by: FIELD_H, rail: -1 }
    );
  }
  return segments;
}

/** Swept contact against a finite reflecting face; reflects only approaching balls. */
export function reflectSegment(segment: Segment, from: Vec2, to: Vec2, velocity: Vec2): boolean {
  const sx = segment.bx - segment.ax,
    sy = segment.by - segment.ay;
  const len = Math.hypot(sx, sy);
  if (len < 1) return false;
  let nx = -sy / len,
    ny = sx / len;
  const initial = (from.x - segment.ax) * nx + (from.y - segment.ay) * ny;
  if (initial < 0) {
    nx = -nx;
    ny = -ny;
  }
  const start = Math.abs(initial);
  const end = (to.x - segment.ax) * nx + (to.y - segment.ay) * ny;
  const toward = velocity.x * nx + velocity.y * ny;
  let hit = Infinity,
    hx = nx,
    hy = ny;
  if (toward < 0 && end <= BALL_R && !(start < BALL_R && end < -BALL_R)) {
    const t = Math.max(0, Math.min(1, (start - BALL_R) / (start - end || 1)));
    const cx = from.x + (to.x - from.x) * t,
      cy = from.y + (to.y - from.y) * t;
    const along = ((cx - segment.ax) * sx + (cy - segment.ay) * sy) / (len * len);
    if (along >= 0 && along <= 1) hit = t;
  }
  // Swept endpoint circles make rounded rail tips and gate lips agree with
  // the face. A fast grazing shot must not tunnel through a visible tip.
  const dx = to.x - from.x,
    dy = to.y - from.y,
    a = dx * dx + dy * dy;
  if (a > 1e-12)
    for (const [ex, ey] of [
      [segment.ax, segment.ay],
      [segment.bx, segment.by]
    ]) {
      const ox = from.x - ex!,
        oy = from.y - ey!,
        b = 2 * (ox * dx + oy * dy),
        c = ox * ox + oy * oy - BALL_R * BALL_R;
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) continue;
      const t = c <= 0 ? 0 : (-b - Math.sqrt(discriminant)) / (2 * a);
      if (t < 0 || t > 1 || t >= hit) continue;
      const cx = ox + dx * t,
        cy = oy + dy * t,
        distance = Math.hypot(cx, cy);
      if (distance < 1e-9) continue;
      const cxn = cx / distance,
        cyn = cy / distance;
      if (velocity.x * cxn + velocity.y * cyn >= 0) continue;
      hit = t;
      hx = cxn;
      hy = cyn;
    }
  if (!Number.isFinite(hit)) return false;
  to.x = from.x + dx * hit + hx * 1.5;
  to.y = from.y + dy * hit + hy * 1.5;
  const normal = velocity.x * hx + velocity.y * hy;
  velocity.x -= 2 * normal * hx;
  velocity.y -= 2 * normal * hy;
  // Rails cannot trap a near-vertical shot.
  const speed = Math.hypot(velocity.x, velocity.y);
  if (Math.abs(velocity.x) < speed * 0.3) {
    velocity.x = Math.sign(velocity.x || nx || 1) * speed * 0.3;
    velocity.y = Math.sign(velocity.y) * Math.sqrt(speed * speed - velocity.x * velocity.x);
  }
  return true;
}

export function collideCourse(world: World): void {
  const { arena, ball } = world;
  const course = arena.course;
  const events = course.events[ball.owner];
  const actor = combatant(world, ball.owner);
  // A gate may not close onto an already occupied opening. Approaching a
  // closed face still collides normally.
  for (const [i, g] of (arena.spec?.gates ?? []).entries()) {
    const previous = gateOpening(g, course.time, course.openUntil[i]);
    const current = gateOpening(g, arena.time, course.openUntil[i]);
    const within = (opening: ReturnType<typeof gateOpening>) =>
      opening.gap >= 1 || Math.abs(ball.py / FIELD_H - opening.center) < opening.gap / 2;
    if (Math.abs(ball.px - g.x * world.view.w) <= BALL_R && within(previous) && !within(current)) {
      course.openUntil[i] = arena.time + 0.15;
    }
  }
  course.time = arena.time;
  for (const segment of courseSegments(arena.spec, world.view.w, arena.time, course)) {
    if (
      reflectSegment(segment, { x: ball.px, y: ball.py }, ball, {
        get x() {
          return ball.vx;
        },
        set x(v) {
          ball.vx = v;
        },
        get y() {
          return ball.vy;
        },
        set y(v) {
          ball.vy = v;
        }
      })
    ) {
      if (segment.rail >= 0) {
        events.banks++;
        if ((actor.talents.tactics.anchor ?? 0) > 0) {
          actor.talents.primed = 1;
          actor.talents.tactics.anchor = 0;
        }
        const hp = course.rails[segment.rail] ?? -1;
        if (hp > 0) {
          const damage = (actor.talents.tactics.breach ?? 0) > 0 ? 2 : 1;
          course.rails[segment.rail] = Math.max(0, hp - damage);
          if (hp <= damage) events.breaks++;
        }
      }
      world.botBrain.aimed = false;
      world.botBrain.wait = world.botBrain.profile.reaction;
      break;
    }
  }
  for (const g of arena.spec?.gates ?? []) {
    if ((ball.px - g.x * world.view.w) * (ball.x - g.x * world.view.w) < 0)
      course.events[ball.owner].gates++;
  }
  for (const [i, s] of (arena.spec?.switches ?? []).entries()) {
    if (arena.time < (course.switchLocks[i] ?? 0)) continue;
    if (Math.hypot(ball.x - s.x * world.view.w, ball.y - s.y * FIELD_H) > s.r + BALL_R) continue;
    course.switchLocks[i] = arena.time + 1;
    course.openUntil[s.gate] = arena.time + 3;
    events.switches++;
    if (actor.player.equipment.insert === 'copper') actor.player.material.switchCharge = true;
    if ((actor.talents.tactics.relay ?? 0) > 0) {
      applyTempo(actor, 2);
      actor.talents.tactics.relay = 0;
    }
  }
  if (arena.time >= course.zoneLock) {
    for (const z of arena.spec?.zones ?? []) {
      if (
        ball.x < z.x * world.view.w ||
        ball.x > (z.x + z.w) * world.view.w ||
        ball.y < z.y * FIELD_H ||
        ball.y > (z.y + z.h) * FIELD_H
      )
        continue;
      const previous = ball.speed;
      ball.speed = Math.min(
        Math.min(BALANCE.ball.hardMax, Math.max(previous, world.tuning.maxSpeed)),
        Math.max(BALANCE.ball.hardMin, previous * z.scale)
      );
      ball.vx *= ball.speed / previous;
      ball.vy *= ball.speed / previous;
      course.zoneLock = arena.time + 1;
      break;
    }
  }
}
