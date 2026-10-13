import { techniqueTarget } from '../core/modes/drills';
import { BALL_R, FIELD_H } from './constants';
import { createCourse } from './course';
import type { World } from './world';

/** Show the court the incoming feed will actually use while the player aims. */
export function prepareTechnique(world: World): void {
  if (!world.rules.technique || world.rules.ranked) return;
  const { ball, arena } = world;
  arena.course = createCourse(arena.spec);
  arena.time = 0;
  ball.x = world.view.w / 2;
  ball.y = FIELD_H / 2;
  ball.px = ball.x;
  ball.py = ball.y;
  ball.owner = 'bot';
}
/** The ball touches the far court boundary when its centre reaches this line. */
export const techniqueGoalX = (width: number): number => width - BALL_R;
/** Every attempt begins with the same incoming ball and hazard clock. */
export function feedTechnique(world: World): void {
  if (!world.rules.technique || world.rules.ranked) return;
  prepareTechnique(world);
  const { ball } = world;
  ball.speed = 360;
  ball.vx = -360;
  ball.vy = 0;
  ball.owner = 'bot';
}
/** null means the attempt is still in flight. Called after real court collision. */
export function techniqueOutcome(world: World): boolean | null {
  const id = world.rules.technique;
  if (
    !id ||
    world.rules.ranked ||
    world.match.status !== 'play' ||
    world.ball.owner !== 'you' ||
    world.ball.x < techniqueGoalX(world.view.w) - 1e-9
  )
    return null;
  const [low, high] = techniqueTarget(id, world.match.points);
  const events = world.arena.course.events.you;
  return (
    world.ball.y >= low * FIELD_H &&
    world.ball.y <= high * FIELD_H &&
    (id !== 'bank' || events.banks > 0) &&
    (id !== 'gate' || events.gates > 0)
  );
}
