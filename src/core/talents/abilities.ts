import { ABILITIES, type AbilityId, type TalentEffects, type TalentId } from './types';

/**
 * The active abilities, as data.
 *
 * An ability is described here and executed in `game/abilities.ts`. Adding
 * one means an entry in this list, a case in the engine's `fire` switch and
 * nothing else - the HUD, the equip screen and the cooldown plumbing are all
 * driven from these fields.
 */
export interface AbilityDef {
  readonly id: AbilityId;
  readonly name: string;
  /** One line, written for a player mid-rally rather than a spreadsheet. */
  readonly blurb: string;
  /** The talent that unlocks it; its rank is the ability's rank. */
  readonly talent: TalentId;
  /** Single glyph for the in-game button. Kept to one character. */
  readonly glyph: string;
  /** Cooldown in seconds for this build. */
  cooldown(effects: TalentEffects): number;
  /** The live effect, in the player's words, for the talent screen. */
  summary(effects: TalentEffects): string;
}

function pct(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function seconds(value: number): string {
  return `${Math.round(value * 10) / 10}s`;
}

export const ABILITY_DEFS: readonly AbilityDef[] = [
  {
    id: 'power-strike',
    name: 'Power Strike',
    blurb: 'Charges your next return',
    talent: 'power-strike',
    glyph: '⚡',
    cooldown: (effects) => effects.powerStrikeCooldown,
    summary: (effects) =>
      `Next return +${pct(effects.powerStrikeSpeed)} ball speed · holds ${seconds(effects.powerStrikeWindow)}`
  },
  {
    id: 'dash',
    name: 'Dash',
    blurb: 'Jumps the paddle where you are heading',
    talent: 'dash',
    glyph: '»',
    cooldown: (effects) => effects.dashCooldown,
    summary: (effects) => `${Math.round(effects.dashDistance)} units, instantly`
  },
  {
    id: 'perfect-guard',
    name: 'Perfect Guard',
    blurb: 'A timing window that rewards the read',
    talent: 'perfect-guard',
    glyph: '◇',
    cooldown: (effects) => effects.guardCooldown,
    summary: (effects) =>
      `${seconds(effects.guardWindow)} window · +${pct(effects.guardPaddle)} paddle for ${seconds(effects.guardSeconds)}`
  }
];

const BY_ID = new Map<string, AbilityDef>(ABILITY_DEFS.map((ability) => [ability.id, ability]));

export function abilityById(id: string): AbilityDef | undefined {
  return BY_ID.get(id);
}

export function isAbilityId(value: unknown): value is AbilityId {
  return typeof value === 'string' && ABILITIES.includes(value as AbilityId);
}
