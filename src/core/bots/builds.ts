import { BALANCE } from '../balance/config';
import { tierById } from '../tournament/bracket';
import type { TalentId } from '../talents/types';
import type { BotLevelId, BotProfile } from './types';
import { botProfile } from './levels';

/**
 * Opponent builds: the talents a bot brings to the later content.
 *
 * A player's build keeps growing for fifty levels, and bot brains stop at
 * Legend. Measured with a human-model player, a casual level-30 build beat
 * Legend - Mythic contract included - nearly every time, and two thirds of
 * the Journey went down on the first try. So the opponents in the content a
 * developed build reaches have builds of their own, bought through the same
 * catalogue and the same caps as the player's.
 *
 * Only talents that work from the far side of the court are on these lists:
 * reach, placement and pace. A save at the line, a refund or a read on the
 * ball - Shield, Second Chance, Foresight, Heavy Impact - would do nothing.
 */
const SCHOOL_PLANS: Readonly<Record<string, readonly TalentId[]>> = {
  anchor: ['long-reach', 'combo-drive', 'precision', 'flow-state'],
  aggressor: ['critical-strike', 'bank-shot', 'momentum', 'edge-pressure', 'precision'],
  banker: ['critical-strike', 'bank-shot', 'precision', 'long-reach'],
  curver: ['precision', 'swerve', 'long-reach', 'critical-strike'],
  disruptor: ['precision', 'critical-strike', 'momentum', 'flow-state'],
  opportunist: ['long-reach', 'precision', 'critical-strike', 'combo-drive']
};

/** Everything a bot build may draw on, after its school's own priorities. */
const COMMON_PLAN: readonly TalentId[] = [
  'long-reach',
  'precision',
  'critical-strike',
  'combo-drive',
  'flow-state',
  'bank-shot',
  'momentum',
  'edge-pressure',
  'hot-hand',
  'swerve',
  'fast-start',
  'cooldown-mastery'
];

/** The order a bot of this school buys its talents in. */
export function opponentPlan(profile: BotProfile): readonly TalentId[] {
  const school = SCHOOL_PLANS[profile.personality ?? 'opportunist'] ?? SCHOOL_PLANS.opportunist!;
  return [...school, ...COMMON_PLAN.filter((id) => !school.includes(id))];
}

const O = BALANCE.opponents;

function points(value: number): number {
  return Math.max(0, Math.min(O.max, Math.round(value)));
}

/**
 * A Journey stage's opponent build. The first five worlds teach the game and
 * keep plain opponents; the expansion worlds grow with the level a player
 * reaches them at, with trials and bosses a step above their world.
 */
export function journeyBotPoints(world: number, index: number, frontierSector = 0): number {
  if (frontierSector > 0) return points(O.frontier + frontierSector * O.frontierStep);
  if (world <= 5) return 0;
  const base = O.journey + (world - 6) * O.journeyStep;
  const bump = index === 23 ? O.boss : index >= 20 ? O.trial : index < 3 ? -O.teaching : 0;
  return points(base + bump);
}

/** A Gauntlet encounter: its act and the run's Pressure. */
export function runBotPoints(act: number, pressure: number, boss: boolean): number {
  return points(act * O.runAct + pressure * O.runPressure + (boss ? O.boss : 0));
}

/**
 * A cup by its tier, 0 for Bronze. Scaled from the level the cup opens at:
 * five points a tier put a Gold final out of reach of the player it opens
 * for.
 */
export function cupBotPoints(tier: number): number {
  return points((tierById(tier).minLevel - O.cupFrom) * O.cupLevel);
}

/** The build an opponent of this tier actually brings for `points`. */
export function buildFor(bot: BotLevelId, points: number): number {
  return Math.round(points * (botProfile(bot).rank >= 6 ? O.championShare : 1));
}

/** Quick Match contracts: the standing challenge for a finished build. */
export function contractBotPoints(contract: 'master' | 'mythic' | undefined): number {
  return contract === 'mythic' ? O.mythic : contract === 'master' ? O.master : 0;
}
