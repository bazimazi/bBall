import { botProfile } from '../bots/levels';
import { NEUTRAL_KIT } from '../equipment/types';
import { NEUTRAL_MODIFIERS, type ArenaSpec, type MatchRules } from './types';

export type TechniqueId = 'bank' | 'gate' | 'placement';
export const TECHNIQUES: readonly {
  id: TechniqueId;
  name: string;
  hint: string;
  arena: ArenaSpec;
}[] = [
  {
    id: 'bank',
    name: 'Bank-shot drill',
    hint: 'Return off the marked rail, then cross the target line. Move the paddle off centre to angle your return.',
    arena: { rails: [{ ax: 0.3, ay: 0.22, bx: 0.64, by: 0.22 }] }
  },
  {
    id: 'gate',
    name: 'Gate-timing drill',
    hint: 'Send your return through the moving opening. Watch the gate timer; pause and step to study the crossing.',
    arena: { gates: [{ x: 0.55, center: 0.5, gap: 0.32, amplitude: 0.2, period: 4 }] }
  },
  {
    id: 'placement',
    name: 'Placement drill',
    hint: 'Cross the highlighted half; it switches after each attempt. Meet the ball just off your paddle’s centre, on the target’s side, and it leaves toward that side. Edge contacts are steep and rebound off the walls.',
    arena: {}
  }
];
export function techniqueRules(id: TechniqueId): MatchRules {
  const drill = TECHNIQUES.find((d) => d.id === id)!;
  return {
    mode: 'practice',
    ranked: false,
    technique: id,
    label: drill.name,
    bot: { ...botProfile('rookie'), name: 'Misses' },
    winScore: 3,
    lives: 0,
    modifiers: { ...NEUTRAL_MODIFIERS, startScore: { you: 0, bot: 0 }, arena: drill.arena },
    equipment: { version: 1, kit: { ...NEUTRAL_KIT } },
    opponentEquipment: { ...NEUTRAL_KIT },
    seed: `technique-v1-${id}`,
    objective: {
      id: 'win',
      label: 'Three targets before three misses · identical feeds · no rewards',
      value: 0
    },
    intro: { title: drill.name, sub: drill.hint }
  };
}
/**
 * The band of the far end an attempt must cross, in fractions of the court's
 * height. Placement alternates halves either side of a small centre gap: from
 * the identical centred feed, contacts from just off centre to about a third
 * of the way to the paddle's end reach the chosen half directly or off one
 * wall on every court width, while edge contacts leave so steep they rebound
 * several times.
 */
export function techniqueTarget(id: TechniqueId, attempts: number): readonly [number, number] {
  return id === 'placement' ? (attempts % 2 ? [0.53, 0.97] : [0.03, 0.47]) : [0.03, 0.97];
}
