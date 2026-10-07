import type { EquipmentSnapshot } from './types';
import { BALANCE } from '../balance/config';
import type { EquipmentSlot, PaddleKit } from './types';
import { NEUTRAL_KIT } from './types';

export interface Component {
  id: string;
  slot: EquipmentSlot;
  name: string;
  cost: number;
  milestone: number;
  benefit: string;
  costText: string;
  technique: string;
}
export const COMPONENTS: readonly Component[] = [
  {
    id: 'balanced-core',
    slot: 'core',
    name: 'Balanced core',
    cost: 0,
    milestone: 0,
    benefit: 'The original rebound response.',
    costText: 'No material bonus.',
    technique: 'Any technique'
  },
  {
    id: 'springsteel',
    slot: 'core',
    name: 'Springsteel',
    cost: 12,
    milestone: 1,
    benefit: 'Clean centre returns build more pace.',
    costText: 'Less moving grip. Charged returns gain no extra rebound.',
    technique: 'Arrive early and strike the centre'
  },
  {
    id: 'cork',
    slot: 'core',
    name: 'Cork',
    cost: 12,
    milestone: 1,
    benefit: 'Absorbs more incoming bonus pace.',
    costText: 'Your new attack bonus is weaker.',
    technique: 'Absorb an attack and place your return'
  },
  {
    id: 'memory-gel',
    slot: 'core',
    name: 'Memory gel',
    cost: 30,
    milestone: 4,
    benefit: 'Stores absorbed attack pace for one later return.',
    costText: 'Weaker attack bonuses. Charge expires at the next serve.',
    technique: 'Catch an attack, then choose your release'
  },
  {
    id: 'balanced-surface',
    slot: 'surface',
    name: 'Balanced surface',
    cost: 0,
    milestone: 0,
    benefit: 'The original placement and moving grip.',
    costText: 'No surface bonus.',
    technique: 'Any technique'
  },
  {
    id: 'rubber',
    slot: 'surface',
    name: 'Rubber',
    cost: 12,
    milestone: 1,
    benefit: 'Moving contact adds more angle.',
    costText: 'Stationary contact is flatter.',
    technique: 'Move through outer contacts'
  },
  {
    id: 'ceramic',
    slot: 'surface',
    name: 'Ceramic',
    cost: 12,
    milestone: 1,
    benefit: 'A small centre band gives a steady straight return.',
    costText: 'Moving flicks have less influence.',
    technique: 'Settle, then place'
  },
  {
    id: 'graphite',
    slot: 'surface',
    name: 'Graphite',
    cost: 24,
    milestone: 4,
    benefit: 'More moving grip at the outer edge.',
    costText: 'Less moving grip near the centre.',
    technique: 'Commit to a moving edge contact'
  },
  {
    id: 'woven',
    slot: 'surface',
    name: 'Woven fibre',
    cost: 24,
    milestone: 4,
    benefit: 'Gentler changes in placement near the edges.',
    costText: 'Lower maximum ordinary angle.',
    technique: 'Make controlled edge saves'
  },
  {
    id: 'split',
    slot: 'surface',
    name: 'Split surface',
    cost: 30,
    milestone: 4,
    benefit: 'A ceramic centre blends into rubber ends.',
    costText: 'Both surface strengths are reduced.',
    technique: 'Choose where on the face to make contact'
  },
  {
    id: 'balanced-frame',
    slot: 'frame',
    name: 'Balanced frame',
    cost: 0,
    milestone: 0,
    benefit: 'Original reach.',
    costText: 'No frame bonus.',
    technique: 'Any technique'
  },
  {
    id: 'extended',
    slot: 'frame',
    name: 'Extended frame',
    cost: 20,
    milestone: 3,
    benefit: 'Six percentage points more everyday reach.',
    costText: 'Less moving grip. Shares the talent reach limit.',
    technique: 'Cover space and place early'
  },
  {
    id: 'compact',
    slot: 'frame',
    name: 'Compact frame',
    cost: 20,
    milestone: 3,
    benefit: 'More placement authority.',
    costText: 'Six percentage points less reach.',
    technique: 'Accept a smaller target for sharper placement'
  },
  {
    id: 'empty-insert',
    slot: 'insert',
    name: 'No insert',
    cost: 0,
    milestone: 0,
    benefit: 'No conditional effect.',
    costText: 'No insert bonus.',
    technique: 'Any technique'
  },
  {
    id: 'copper',
    slot: 'insert',
    name: 'Copper',
    cost: 24,
    milestone: 4,
    benefit: 'A real switch hit charges one next-return bonus.',
    costText: 'Less moving grip and passive attack bonus. One charge; expires on serve.',
    technique: 'Route through a switch before attacking'
  }
];
export function componentById(id: string): Component | undefined {
  return COMPONENTS.find((part) => part.id === id);
}
export function kitOf(value: unknown): PaddleKit {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const kit = { ...NEUTRAL_KIT };
  for (const slot of ['core', 'surface', 'frame', 'insert'] as const) {
    const part = typeof source[slot] === 'string' ? componentById(source[slot]) : undefined;
    if (part?.slot === slot) kit[slot] = part.id;
  }
  if (source.tuning === 'firm' || source.tuning === 'grip') kit.tuning = source.tuning;
  if (kit.core === 'memory-gel' && kit.insert === 'copper') kit.insert = 'empty-insert';
  return kit;
}
export function sameKit(a: PaddleKit, b: PaddleKit): boolean {
  return (['core', 'surface', 'frame', 'insert', 'tuning'] as const).every(
    (key) => a[key] === b[key]
  );
}
export function neutralKit(kit: PaddleKit): boolean {
  return sameKit(kit, { ...NEUTRAL_KIT });
}
export function kitName(kit: PaddleKit): string {
  if (neutralKit(kit)) return 'Neutral paddle';
  const names = (['core', 'surface', 'frame', 'insert'] as const)
    .filter((slot) => kit[slot] !== NEUTRAL_KIT[slot])
    .map((slot) => componentById(kit[slot])?.name);
  if (kit.tuning !== 'standard') names.push(`${kit.tuning === 'firm' ? 'Firm' : 'Grip'} tuning`);
  return names.filter(Boolean).join(' · ');
}
export function equipmentReach(kit: PaddleKit): number {
  return kit.frame === 'extended'
    ? BALANCE.equipment.frameReach
    : kit.frame === 'compact'
      ? -BALANCE.equipment.frameReach
      : 0;
}

/** Pure surface response; raw remains the actual collision offset. */
export function surfaceResponse(
  kit: PaddleKit,
  offset: number,
  raw: number
): { off: number; grip: number } {
  const E = BALANCE.equipment;
  const abs = Math.min(1, Math.abs(raw));
  const ceramic = (u: number) =>
    Math.abs(u) <= E.ceramicBand
      ? 0
      : (Math.sign(u) * (Math.abs(u) - E.ceramicBand)) / (1 - E.ceramicBand);
  let off = offset,
    grip = 1;
  if (kit.surface === 'rubber') {
    off *= E.rubberOffset;
    grip *= E.rubberGrip;
  }
  if (kit.surface === 'ceramic') {
    off = ceramic(offset);
    grip *= E.ceramicGrip;
  }
  if (kit.surface === 'graphite')
    grip *= E.graphiteCentre + (E.graphiteEdge - E.graphiteCentre) * abs * abs;
  if (kit.surface === 'woven') off = Math.sin((offset * Math.PI) / 2) * E.wovenAngle;
  if (kit.surface === 'split') {
    const blend = Math.max(0, Math.min(1, (abs - E.splitStart) / (E.splitEnd - E.splitStart)));
    const t = blend * blend * (3 - 2 * blend);
    off = ceramic(offset) * (1 - t) + offset * E.rubberOffset * t;
    off = (offset + off) / 2;
    grip = 1 + ((E.ceramicGrip - 1) * (1 - t) + (E.rubberGrip - 1) * t) / 2;
  }
  if (kit.core === 'springsteel') grip *= E.steelGrip;
  if (kit.frame === 'extended') grip *= E.extendedGrip;
  if (kit.frame === 'compact') off *= E.compactOffset;
  if (kit.insert === 'copper') grip *= E.copperGrip;
  if (kit.tuning === 'firm') grip *= E.firmGrip;
  if (kit.tuning === 'grip') {
    grip *= E.tuningGrip;
    off *= E.tuningOffset;
  }
  return {
    off: Math.max(-1, Math.min(1, off)),
    grip: Math.max(E.minGrip, Math.min(E.maxGrip, grip))
  };
}
export function reboundBonus(kit: PaddleKit, raw: number, empowered: boolean): number {
  const E = BALANCE.equipment;
  if (empowered) return 0;
  let bonus = kit.core === 'springsteel' && Math.abs(raw) <= E.steelBand ? E.steelGrowth : 0;
  if (kit.tuning === 'firm' && Math.abs(raw) <= E.steelBand) bonus += E.firmGrowth;
  return bonus;
}

export function contactAngle(
  off: number,
  speed: number,
  velocity: number,
  spin: number,
  limit: number
): number {
  const vy = Math.sin(off * limit) * speed + velocity * BALANCE.equipment.spinInfluence * spin;
  const wanted = Math.atan2(vy, Math.abs(Math.cos(off * limit) * speed));
  return Math.max(-limit, Math.min(limit, wanted));
}

export function snapshotOf(value: unknown): EquipmentSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const b = value as Record<string, unknown>;
  if (
    typeof b.version !== 'number' ||
    !Number.isInteger(b.version) ||
    b.version < 0 ||
    b.version > 1000
  )
    return undefined;
  return { version: b.version, kit: b.version === 0 ? { ...NEUTRAL_KIT } : kitOf(b.kit) };
}
