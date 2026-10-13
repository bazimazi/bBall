import { PADDLE_H } from './constants';
import { resizePaddle } from './paddle';
import type { World } from './world';

export function bossBeat(world: World): 'windup' | 'guard' | 'recovery' | null {
  const rhythm = world.rules.boss?.rhythm;
  if (!rhythm) return null;
  const time = world.arena.time % rhythm.period;
  return time < rhythm.windup
    ? 'windup'
    : time < rhythm.windup + rhythm.guard
      ? 'guard'
      : 'recovery';
}
export function bossCue(world: World): string | null {
  const beat = bossBeat(world);
  return beat === 'windup'
    ? 'Guard rising · prepare a wide return'
    : beat === 'guard'
      ? 'Guard up · keep the rally alive'
      : beat === 'recovery'
        ? 'Guard open · aim for an edge'
        : null;
}
/** Only the opponent's reach changes. Transition smoothly without restoring spent skills. */
export function updateBossRhythm(world: World): void {
  const boss = world.rules.boss;
  const rhythm = boss?.rhythm;
  if (!boss || !rhythm) return;
  const time = world.arena.time % rhythm.period;
  const recovery = rhythm.windup + rhythm.guard;
  const factor =
    time < rhythm.windup
      ? rhythm.recoveryScale + ((1 - rhythm.recoveryScale) * time) / rhythm.windup
      : time < recovery
        ? 1
        : 1 - (1 - rhythm.recoveryScale) * Math.min(1, (time - recovery) / 0.45);
  let base = world.rules.modifiers.botPaddleScale;
  for (let i = 0; i < world.arena.phase; i++) base = boss.phases[i]?.botPaddleScale ?? base;
  world.bot.baseHalf = (PADDLE_H / 2) * base * factor;
  resizePaddle(world.bot);
}
