import type { AbilityDef } from './abilities';
import type { TalentDef, TalentEffects, TalentSave } from './types';

export const NEW_ACTIVES = ['redirect', 'anchor', 'breach', 'relay', 'reserve', 'rebound'] as const;
export const NEW_PASSIVES = [
  'railcraft',
  'gate-reader',
  'switch-tempo',
  'charge-control',
  'deflector-force',
  'pulse-focus',
  'corner-study',
  'steady-hand',
  'route-memory',
  'guard-discipline',
  'reserve-capacity',
  'breachcraft',
  'relay-recovery',
  'rebound-focus',
  'bank-flow',
  'storm-flow',
  'balanced-casting',
  'patient-recovery'
] as const;
export type ExpansionTalentId = (typeof NEW_ACTIVES)[number] | (typeof NEW_PASSIVES)[number];

const PASSIVES: readonly (readonly [
  ExpansionTalentId,
  string,
  string,
  (e: TalentEffects, r: number) => void
])[] = [
  [
    'railcraft',
    'Railcraft',
    'Bank angle +2% per rank',
    (e, r) => {
      e.bankShot += 0.02 * r;
    }
  ],
  [
    'gate-reader',
    'Gate Reader',
    'Dash distance +8 units per rank',
    (e, r) => {
      e.dashDistance += 8 * r;
    }
  ],
  [
    'switch-tempo',
    'Switch Tempo',
    'Return cooldown recovery +0.1s per rank',
    (e, r) => {
      e.tempo += 0.1 * r;
    }
  ],
  [
    'charge-control',
    'Charge Control',
    'Strike window +0.4s per rank',
    (e, r) => {
      e.powerStrikeWindow += 0.4 * r;
    }
  ],
  [
    'deflector-force',
    'Deflector Force',
    'Heavy returns +4% per rank',
    (e, r) => {
      e.heft += 0.04 * r;
    }
  ],
  [
    'pulse-focus',
    'Pulse Focus',
    'Curve +25 units per rank',
    (e, r) => {
      e.swerve += 25 * r;
    }
  ],
  [
    'corner-study',
    'Corner Study',
    'Return angle +2% per rank',
    (e, r) => {
      e.angleMul *= 1 + 0.02 * r;
    }
  ],
  [
    'steady-hand',
    'Steady Hand',
    'Less motion spin, 4% per rank',
    (e, r) => {
      e.spinMul *= 1 - 0.04 * r;
    }
  ],
  [
    'route-memory',
    'Route Memory',
    'Afterglow lasts 0.5s longer per rank',
    (e, r) => {
      e.afterglowSeconds += 0.5 * r;
    }
  ],
  [
    'guard-discipline',
    'Guard Discipline',
    'Guard recovery 0.3s sooner per rank',
    (e, r) => {
      e.guardCooldown -= 0.3 * r;
    }
  ],
  [
    'reserve-capacity',
    'Reserve Capacity',
    'Strike pace +3% per rank',
    (e, r) => {
      e.powerStrikeSpeed += 0.03 * r;
    }
  ],
  [
    'breachcraft',
    'Breachcraft',
    'Critical pace +2% per rank',
    (e, r) => {
      e.critGrowth += 0.02 * r;
    }
  ],
  [
    'relay-recovery',
    'Relay Recovery',
    'Passive skill recovery +3% per rank',
    (e, r) => {
      e.recharge += 0.03 * r;
    }
  ],
  [
    'rebound-focus',
    'Rebound Focus',
    'Guard reach +4 units per rank',
    (e, r) => {
      e.guardReach += 4 * r;
    }
  ],
  [
    'bank-flow',
    'Bank Flow',
    'Flow angle +0.3% per rank',
    (e, r) => {
      e.flowAngle += 0.003 * r;
    }
  ],
  [
    'storm-flow',
    'Storm Flow',
    'Flow heft +0.5% per rank',
    (e, r) => {
      e.flowHeft += 0.005 * r;
    }
  ],
  [
    'balanced-casting',
    'Balanced Casting',
    'Alternating cast recovery +0.1s per rank',
    (e, r) => {
      e.castTempo += 0.1 * r;
    }
  ],
  [
    'patient-recovery',
    'Patient Recovery',
    'Shield recovery 2% faster per rank',
    (e, r) => {
      e.shieldRecharge *= 1 - 0.02 * r;
    }
  ]
];
const ACTIVE_TEXT = [
  'For 4 seconds, your next return leaves at a deliberate wide angle',
  'For 5 seconds, a rail bank charges your next paddle return',
  'For 5 seconds, deal double structure damage; returns lose 5% pace',
  'For 6 seconds, a switch hit recovers 2 seconds from other skills',
  'After 3 seconds, your next return gains 12% pace, within the speed cap',
  'For 3 seconds, your next return banks 1 second of cooldown recovery'
] as const;

export const EXPANSION_TALENTS: readonly TalentDef[] = [...NEW_ACTIVES, ...NEW_PASSIVES].map(
  (id, i) => ({
    id,
    branch: (['power', 'control', 'defense', 'momentum', 'utility'] as const)[i % 5]!,
    name: i < 6 ? id[0]!.toUpperCase() + id.slice(1) : PASSIVES[i - 6]![1],
    blurb: i < 6 ? ACTIVE_TEXT[i]! : PASSIVES[i - 6]![2],
    maxRank: i < 6 ? 1 : 2,
    costs: i < 6 ? [2] : [1, 1],
    tier: 5 + Math.floor(i / 15),
    column: Math.floor(i / 5) % 3,
    requires: [],
    ...(i < 6 ? { ability: NEW_ACTIVES[i]! } : {}),
    rankText: (rank) =>
      `${i < 6 ? ACTIVE_TEXT[i]! : PASSIVES[i - 6]![2]}${i >= 6 ? ` · rank ${rank}` : ''}`
  })
);

export const EXPANSION_ABILITIES: readonly AbilityDef[] = NEW_ACTIVES.map((id, i) => ({
  id,
  talent: id,
  name: id[0]!.toUpperCase() + id.slice(1),
  blurb: ACTIVE_TEXT[i]!,
  hue: 35 + i * 53,
  cooldown: (e) => [10, 12, 14, 12, 16, 10][i]! * e.cooldownMul,
  summary: () => ACTIVE_TEXT[i]!
}));

export function applyExpansionTalents(e: TalentEffects, save: TalentSave): void {
  for (const [id, , , apply] of PASSIVES) apply(e, Math.min(2, save.ranks[id] ?? 0));
}
