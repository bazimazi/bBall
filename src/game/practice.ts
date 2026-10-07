import { step } from './simulation';
import { FIXED_DT } from './constants';
import { forecast } from './trajectory';
import type { World } from './world';

/** Deliberate stepping is restricted to unranked, paused Practice. */
export function stepPractice(world: World): boolean {
  if (world.rules.mode !== 'practice' || world.match.status !== 'paused') return false;
  world.match.status = world.match.resumeTo;
  for (let i = 0; i < 12 && (world.match.status === 'play' || world.match.status === 'serve'); i++)
    step(world, FIXED_DT);
  const status = world.match.status;
  if (status === 'play' || status === 'serve') {
    world.match.resumeTo = status;
    world.match.status = 'paused';
  }
  return true;
}
export function practiceLanding(world: World): string | null {
  if (
    world.rules.mode !== 'practice' ||
    world.match.status !== 'paused' ||
    world.match.resumeTo !== 'play'
  )
    return null;
  const target = world.ball.vx < 0 ? world.player : world.bot;
  return `${target.side === 'you' ? 'Your' : 'Opponent'} landing estimate: ${Math.round(forecast(world, target.x) / 6)}% from the top · next 3 seconds`;
}
