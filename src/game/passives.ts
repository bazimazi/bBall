import { BALANCE } from '../core/balance/config';
import { talentById } from '../core/talents/catalog';
import type { TalentId } from '../core/talents/types';
import { talentHue } from './passiveFx';
import { comboSteps, flowStacks, inClutch } from './talents';
import type { PassiveView } from './types';
import type { World } from './world';

/**
 * The player's passive talents, flattened for the HUD.
 *
 * A chip per passive that has a state worth watching mid-rally: a charge
 * coming back, a count building towards a payout, a window open, a use left.
 * The always-on passives - Long Reach, Edge Pressure, Bastion, Heavy Impact -
 * have no state to count, so they are drawn on the court where they act and
 * get no chip here.
 *
 * Read from the resolved effects rather than the talent ranks, so a Gauntlet
 * boon that grants the same effect lights the same chip.
 */

/** Ring steps published to the HUD: smooth enough, and few re-renders. */
const STEPS = 24;

function quantise(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * STEPS) / STEPS;
}

function chip(
  world: World,
  id: TalentId,
  state: PassiveView['state'],
  progress: number,
  value: number | null = null,
  max = 0,
  seconds = 0
): PassiveView {
  return {
    id,
    name: talentById(id)?.name ?? id,
    hue: talentHue(id),
    state,
    progress: quantise(progress),
    value,
    max,
    seconds: seconds > 0 ? Math.ceil(seconds) : 0,
    procs: world.talents.procs[id] ?? 0
  };
}

export function passiveViews(world: World): PassiveView[] {
  const views: PassiveView[] = [];
  if (world.match.status === 'menu' || world.rules.versus) return views;
  const runtime = world.talents;
  const { effects } = world.loadout;

  // --------------------------------------------------------------- defence
  if (runtime.shieldMax > 0) {
    const full = runtime.shield >= runtime.shieldMax;
    const span = Math.max(0.01, effects.shieldRecharge);
    views.push(
      chip(
        world,
        'shield',
        runtime.shield > 0 ? 'ready' : 'building',
        full ? 1 : 1 - runtime.shieldTimer / span,
        runtime.shield,
        runtime.shieldMax,
        full ? 0 : runtime.shieldTimer
      )
    );
  }

  if (effects.adrenalineEvery > 0) {
    const banked = runtime.spareSave > 0;
    const into = runtime.drive % effects.adrenalineEvery;
    views.push(
      chip(
        world,
        'adrenaline',
        banked ? 'ready' : 'building',
        banked ? 1 : into / effects.adrenalineEvery,
        banked ? null : effects.adrenalineEvery - into
      )
    );
  }

  if (effects.secondChances > 0) {
    const { match } = world;
    const left = runtime.secondChances;
    const losing = match.maxLives > 0 ? match.lives <= 1 : match.score.bot >= match.score.you;
    views.push(
      chip(
        world,
        'second-chance',
        left <= 0 ? 'spent' : losing ? 'ready' : 'idle',
        left / effects.secondChances,
        left,
        effects.secondChances
      )
    );
  }

  if (effects.counterPace > 0) {
    const primed = runtime.primedBy === 'counterstrike' ? runtime.primed : 0;
    views.push(
      chip(
        world,
        'counterstrike',
        primed > 0 ? 'active' : 'idle',
        primed / BALANCE.effects.counterstrike.primed,
        primed > 0 ? primed : null
      )
    );
  }

  if (effects.clutchLength > 0 || effects.clutchSlow > 0) {
    views.push(chip(world, 'clutch', inClutch(world) ? 'active' : 'idle', inClutch(world) ? 1 : 0));
  }

  // -------------------------------------------------------------- momentum
  if (effects.momentumEvery > 0) {
    const into = runtime.rallyReturns % effects.momentumEvery;
    const left = effects.momentumEvery - into;
    views.push(
      chip(world, 'momentum', left === 1 ? 'ready' : 'building', into / effects.momentumEvery, left)
    );
  }

  if (effects.hotHand > 0) {
    const primed = runtime.primedBy === 'hot-hand' ? runtime.primed : 0;
    views.push(
      chip(
        world,
        'hot-hand',
        primed > 0 ? 'active' : 'idle',
        primed / effects.hotHand,
        primed > 0 ? primed : null
      )
    );
  }

  if (effects.comboLength > 0) {
    const steps = comboSteps(world);
    const top = steps >= effects.comboSteps;
    views.push(
      chip(
        world,
        'combo-drive',
        steps > 0 ? 'active' : 'building',
        top ? 1 : (runtime.drive % effects.comboEvery) / effects.comboEvery,
        steps > 0 ? steps : null,
        effects.comboSteps
      )
    );
  }

  if (effects.flowAngle > 0 || effects.flowHeft > 0) {
    const max = BALANCE.effects.flowState.stacks;
    const stacks = flowStacks(world);
    views.push(
      chip(
        world,
        'flow-state',
        stacks >= max ? 'ready' : stacks > 0 ? 'active' : 'idle',
        stacks / max,
        stacks > 0 ? stacks : null,
        max
      )
    );
  }

  // ---------------------------------------------------- control and utility
  if (effects.blinkSeconds > 0) {
    views.push(
      chip(
        world,
        'blink-strike',
        runtime.blink > 0 ? 'active' : 'idle',
        runtime.blink / effects.blinkSeconds,
        null,
        0,
        runtime.blink
      )
    );
  }

  if (effects.afterglowLength > 0) {
    views.push(
      chip(
        world,
        'afterglow',
        runtime.afterglow > 0 ? 'active' : 'idle',
        runtime.afterglow / Math.max(0.01, effects.afterglowSeconds),
        null,
        0,
        runtime.afterglow
      )
    );
  }

  return views;
}

/**
 * A key that changes exactly when something a chip shows changes, so the
 * engine can skip rebuilding the views - and React re-rendering them -
 * on every other frame.
 */
export function passiveKey(views: readonly PassiveView[]): string {
  let key = '';
  for (const view of views)
    key += `${view.id}:${view.state}:${view.progress}:${view.value}:${view.max}:${view.seconds}:${view.procs};`;
  return key;
}
