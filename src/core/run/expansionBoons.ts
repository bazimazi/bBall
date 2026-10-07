import type { BoonDef } from './boons';
import type { TalentEffects } from '../talents/types';

// Every recipe changes a named, capped part of the existing combat economy.
const RECIPES: readonly (readonly [
  string,
  string,
  string,
  (e: TalentEffects, r: number) => void
])[] = [
  [
    'rail-focus',
    'Rail Focus',
    'Wall banks gain 3% angle',
    (e, r) => {
      e.bankShot += 0.03 * r;
    }
  ],
  [
    'precision',
    'Precision',
    '3% wider angles; 3% less spin',
    (e, r) => {
      e.angleMul *= 1 + 0.03 * r;
      e.spinMul *= 1 - 0.03 * r;
    }
  ],
  [
    'patient-guard',
    'Patient Guard',
    'Guard window +0.06s',
    (e, r) => {
      e.guardWindow += 0.06 * r;
    }
  ],
  [
    'quick-step',
    'Quick Step',
    'Dash distance +12 units',
    (e, r) => {
      e.dashDistance += 12 * r;
    }
  ],
  [
    'relay-coil',
    'Relay Coil',
    'Return recovery +0.12s',
    (e, r) => {
      e.tempo += 0.12 * r;
    }
  ],
  [
    'reserve-cell',
    'Reserve Cell',
    'Strike window +0.5s',
    (e, r) => {
      e.powerStrikeWindow += 0.5 * r;
    }
  ],
  [
    'breach-edge',
    'Breach Edge',
    'Critical pace +3%',
    (e, r) => {
      e.critGrowth += 0.03 * r;
    }
  ],
  [
    'storm-lens',
    'Storm Lens',
    'Curve +40 units',
    (e, r) => {
      e.swerve += 40 * r;
    }
  ],
  [
    'return-spring',
    'Return Spring',
    'Shield recovery on returns +0.3s',
    (e, r) => {
      e.shieldTempo += 0.3 * r;
    }
  ],
  [
    'flow-lens',
    'Flow Lens',
    'Flow angle +0.5%',
    (e, r) => {
      e.flowAngle += 0.005 * r;
    }
  ],
  [
    'flow-coil',
    'Flow Coil',
    'Flow recovery +5%',
    (e, r) => {
      e.flowRecharge += 0.05 * r;
    }
  ],
  [
    'flow-weight',
    'Flow Weight',
    'Flow heft +1%',
    (e, r) => {
      e.flowHeft += 0.01 * r;
    }
  ],
  [
    'cast-link',
    'Cast Link',
    'Alternating cast recovery +0.2s',
    (e, r) => {
      e.castTempo += 0.2 * r;
    }
  ],
  [
    'afterlight',
    'Afterlight',
    'Afterglow +0.7s',
    (e, r) => {
      e.afterglowSeconds += 0.7 * r;
    }
  ],
  [
    'afterreach',
    'Afterreach',
    'Afterglow length +3%',
    (e, r) => {
      e.afterglowLength += 0.03 * r;
    }
  ],
  [
    'aftertempo',
    'Aftertempo',
    'Afterglow return recovery +0.15s',
    (e, r) => {
      e.afterglowTempo += 0.15 * r;
    }
  ],
  [
    'counterweight',
    'Counterweight',
    'Saved ball counter pace +3%',
    (e, r) => {
      e.counterPace += 0.03 * r;
    }
  ],
  [
    'parry-coil',
    'Parry Coil',
    'Parry recovery +0.3s',
    (e, r) => {
      e.parryTempo += 0.3 * r;
    }
  ],
  [
    'guard-tip',
    'Guard Tip',
    'Guard reach +6 units',
    (e, r) => {
      e.guardReach += 6 * r;
    }
  ],
  [
    'guard-clock',
    'Guard Clock',
    'Guard cooldown -0.4s',
    (e, r) => {
      e.guardCooldown -= 0.4 * r;
    }
  ],
  [
    'dash-clock',
    'Dash Clock',
    'Dash cooldown -0.4s',
    (e, r) => {
      e.dashCooldown -= 0.4 * r;
    }
  ],
  [
    'strike-clock',
    'Strike Clock',
    'Strike cooldown -0.4s',
    (e, r) => {
      e.powerStrikeCooldown -= 0.4 * r;
    }
  ],
  [
    'blink-cell',
    'Blink Cell',
    'Dash follow-up charge lasts +0.15s',
    (e, r) => {
      e.blinkSeconds += 0.15 * r;
    }
  ],
  [
    'coolant',
    'Coolant',
    'Passive skill recovery +4%',
    (e, r) => {
      e.recharge += 0.04 * r;
    }
  ],
  [
    'clutch-reach',
    'Clutch Reach',
    'At match point, length +4%',
    (e, r) => {
      e.clutchLength += 0.04 * r;
    }
  ],
  [
    'clutch-calm',
    'Clutch Calm',
    'At match point, incoming clock -2%',
    (e, r) => {
      e.clutchSlow += 0.02 * r;
    }
  ],
  [
    'combo-band',
    'Combo Band',
    'Combo length +1%',
    (e, r) => {
      e.comboLength += 0.01 * r;
    }
  ],
  [
    'drive-memory',
    'Drive Memory',
    'Retain 8% more drive on a miss',
    (e, r) => {
      e.driveKeep += 0.08 * r;
    }
  ],
  [
    'heavy-edge',
    'Heavy Edge',
    'Critical heft +4%',
    (e, r) => {
      e.critHeft += 0.04 * r;
    }
  ],
  [
    'strike-cell',
    'Strike Cell',
    'Charged pace +3%',
    (e, r) => {
      e.powerStrikeSpeed += 0.03 * r;
    }
  ],
  [
    'wall-recovery',
    'Wall Recovery',
    'Shield recharge 4% faster',
    (e, r) => {
      e.shieldRecharge *= 1 - 0.04 * r;
    }
  ],
  [
    'corner-wall',
    'Corner Wall',
    'Corner protection +8 units',
    (e, r) => {
      e.bastion += 8 * r;
    }
  ],
  [
    'dash-drift',
    'Dash Drift',
    'Dash slowdown +2%',
    (e, r) => {
      e.dashSlow += 0.02 * r;
    }
  ],
  [
    'rhythm',
    'Rhythm',
    'Charge every sixth rally return',
    (e) => {
      e.momentumEvery = e.momentumEvery ? Math.min(6, e.momentumEvery) : 6;
    }
  ],
  [
    'guard-refund',
    'Guard Refund',
    'Parries refund a shield when one is owned',
    (e) => {
      e.guardGrantsShield = true;
    }
  ],
  [
    'charged-edge',
    'Charged Edge',
    'Charged returns become critical',
    (e) => {
      e.chargedCrits = true;
    }
  ]
];
const families = ['control', 'power', 'defense', 'tempo'] as const;
export const EXPANSION_BOONS: readonly BoonDef[] = RECIPES.map(([id, name, blurb, effects], i) => ({
  id,
  name,
  blurb,
  family: families[i % 4]!,
  maxRank: i >= 33 ? 1 : 2,
  effects
}));
export const EXPANSION_DUOS: readonly BoonDef[] = Array.from({ length: 21 }, (_, i) => {
  const a = EXPANSION_BOONS[i]!,
    b = EXPANSION_BOONS[(i + 11) % 36]!;
  return {
    id: `duo-${i + 1}`,
    name: `${a.name} + ${b.name}`,
    blurb: `Combine ${a.name} and ${b.name}: one extra rank of each effect`,
    family: 'duo',
    maxRank: 1,
    requires: [
      [a.id, 2],
      [b.id, 2]
    ],
    effects: (e) => {
      a.effects?.(e, 1);
      b.effects?.(e, 1);
    }
  };
});
// Relics are scarce sidegrades: three sockets, each recipe has a visible cost.
export const RELICS: readonly BoonDef[] = Array.from({ length: 24 }, (_, i) => {
  const base = EXPANSION_BOONS[i]!;
  const cost = i % 4;
  const drawback = [
    '8% shorter paddle',
    '8% larger opponent',
    '10% faster serves',
    '10% faster rally growth'
  ][cost]!;
  return {
    id: `relic-${i + 1}`,
    name: `${base.name} Relic`,
    blurb: `Double ${base.name.toLowerCase()} effect; ${drawback}`,
    family: 'relic',
    maxRank: 1,
    effects: (e) => {
      base.effects?.(e, 2);
    },
    modifiers: (m) => {
      if (cost === 0) m.playerPaddleScale *= 0.92;
      if (cost === 1) m.botPaddleScale *= 1.08;
      if (cost === 2) m.serveSpeedScale *= 1.1;
      if (cost === 3) m.speedPerHitScale *= 1.1;
    }
  };
});
