import type { AbilityId } from '../talents/types';

export const LOOT_ITEMS = ['shards', 'threads', 'cores'] as const;
export type LootItem = (typeof LOOT_ITEMS)[number];
export type LootBundle = Record<LootItem, number>;
export const LOOT_MODES = [
  'quick',
  'campaign',
  'challenge',
  'daily',
  'run',
  'endless',
  'tournament'
] as const;
export type LootMode = (typeof LOOT_MODES)[number];
export const MAX_LOOT = 1_000_000;
export const emptyLoot = (): LootBundle => ({ shards: 0, threads: 0, cores: 0 });

export const ITEM_INFO = {
  shards: {
    name: 'Rally Shards',
    source: 'Complete ranked matches. More returns yield more shards.'
  },
  threads: {
    name: 'Tactic Threads',
    source: 'Play Journey, Challenges, Daily, Gauntlet, Endless or Tournament.'
  },
  cores: {
    name: 'Resonance Cores',
    source: 'Win against Elite or Legend, survive three waves, or complete a three-mode circuit.'
  }
} as const;

export const RESEARCH_IDS = [
  'precision-refund',
  'dual-spec',
  'triple-spec',
  'board-switch',
  'pulse-brake',
  'phase-lens',
  'resonance-trials'
] as const;
export type ResearchId = (typeof RESEARCH_IDS)[number];
export interface ResearchDef {
  id: ResearchId;
  name: string;
  blurb: string;
  cost: LootBundle;
  requires: readonly ResearchId[];
  ability?: AbilityId;
}
export const RESEARCH: readonly ResearchDef[] = [
  {
    id: 'precision-refund',
    name: 'Precision Refund',
    blurb:
      'Refund one talent rank for free. Dependent talents stay safe; blocked refunds explain why.',
    cost: { shards: 18, threads: 2, cores: 0 },
    requires: []
  },
  {
    id: 'dual-spec',
    name: 'Dual Specialization',
    blurb: 'Pin two saved builds for quick selection.',
    cost: { shards: 30, threads: 5, cores: 1 },
    requires: []
  },
  {
    id: 'triple-spec',
    name: 'Triple Specialization',
    blurb: 'Pin a third build to prepare for another kind of court.',
    cost: { shards: 45, threads: 8, cores: 2 },
    requires: ['dual-spec']
  },
  {
    id: 'board-switch',
    name: 'Courtside Switch',
    blurb:
      'Switch pinned builds on the board between rallies. Cooldowns and spent defenses carry over.',
    cost: { shards: 40, threads: 6, cores: 2 },
    requires: ['dual-spec']
  },
  {
    id: 'pulse-brake',
    name: 'Pulse Brake',
    blurb:
      'A research skill: slow an incoming ball by 28%. Works only while the ball approaches your paddle; 18s cooldown.',
    cost: { shards: 28, threads: 4, cores: 1 },
    requires: [],
    ability: 'pulse-brake'
  },
  {
    id: 'phase-lens',
    name: 'Phase Lens',
    blurb:
      'A research skill: straighten an incoming ball and clear its curve. Read chaotic courts; 22s cooldown.',
    cost: { shards: 35, threads: 6, cores: 2 },
    requires: [],
    ability: 'phase-lens'
  },
  {
    id: 'resonance-trials',
    name: 'Resonance Trials',
    blurb:
      'Open three optional expert trials. Research skills are recommended; every first clear yields bonus loot.',
    cost: { shards: 35, threads: 5, cores: 1 },
    requires: ['pulse-brake']
  }
];
export const researchById = (id: string) => RESEARCH.find((entry) => entry.id === id);
export const isResearchId = (value: unknown): value is ResearchId =>
  typeof value === 'string' && RESEARCH_IDS.includes(value as ResearchId);
export const RESEARCH_ABILITIES: readonly AbilityId[] = ['pulse-brake', 'phase-lens'];
