import type { MatchRules, MatchResult } from '../modes/types';
import type { PlayerProfile } from '../profile/types';
import { EQUIPMENT_VERSION, NEUTRAL_KIT, type EquipmentSnapshot, type PaddleKit } from './types';
import { kitOf } from './catalog';

export function encounterIdentity(
  match: Pick<MatchResult, 'mode'> &
    Partial<
      Pick<
        MatchResult,
        | 'botId'
        | 'stageId'
        | 'challengeId'
        | 'dailyKey'
        | 'runStage'
        | 'tournamentTier'
        | 'tournamentRound'
        | 'options'
      >
    >
): string {
  return JSON.stringify([
    match.mode,
    match.botId ?? '',
    match.stageId ?? '',
    match.challengeId ?? '',
    match.dailyKey ?? '',
    match.runStage ?? -1,
    match.tournamentTier ?? -1,
    match.tournamentRound ?? -1,
    match.options?.arenaId ?? '',
    match.options?.personality ?? '',
    match.options?.contract ?? '',
    match.options?.waves ?? false,
    match.options?.series ?? 1,
    match.options?.mirror ?? false,
    match.options?.duel ?? '',
    match.options?.bossId ?? '',
    match.options?.bossPhase ?? -1
  ]);
}
export function rulesIdentity(rules: MatchRules): string {
  return encounterIdentity({ ...rules, botId: rules.bot.id });
}
export function fixedDailyKit(key: string): PaddleKit {
  let hash = 0;
  // An archive and its original card use the same date-defined material kit.
  for (const char of key.replace(/^(m2|a2)-/, '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return {
    ...NEUTRAL_KIT,
    core: ['balanced-core', 'springsteel', 'cork'][hash % 3]!,
    surface: ['balanced-surface', 'rubber', 'ceramic'][Math.floor(hash / 3) % 3]!
  };
}
export function playerEquipment(profile: PlayerProfile, rules: MatchRules): EquipmentSnapshot {
  if (rules.mode === 'versus' || rules.mode === 'challenge')
    return { version: EQUIPMENT_VERSION, kit: { ...NEUTRAL_KIT } };
  if (rules.dailyKey) return { version: EQUIPMENT_VERSION, kit: fixedDailyKit(rules.dailyKey) };
  if (rules.mode === 'run')
    return profile.progress.run?.equipment ?? { version: 0, kit: { ...NEUTRAL_KIT } };
  if (rules.mode === 'tournament')
    return profile.tournament?.equipment ?? { version: 0, kit: { ...NEUTRAL_KIT } };
  return { version: EQUIPMENT_VERSION, kit: { ...profile.progress.workshop.equipped } };
}
export function opponentKit(rules: MatchRules): PaddleKit {
  if (
    rules.bot.rank < 2 ||
    rules.mode === 'versus' ||
    rules.mode === 'challenge' ||
    rules.mode === 'endless'
  )
    return { ...NEUTRAL_KIT };
  const school = rules.bot.personality ?? 'opportunist';
  return kitOf({
    ...NEUTRAL_KIT,
    core: school === 'anchor' ? 'cork' : school === 'aggressor' ? 'springsteel' : 'balanced-core',
    surface: school === 'curver' ? 'rubber' : school === 'banker' ? 'ceramic' : 'balanced-surface'
  });
}
export function withEquipmentRules(profile: PlayerProfile, rules: MatchRules): MatchRules {
  const equipment = rules.equipment ?? playerEquipment(profile, rules);
  return {
    ...rules,
    equipment,
    opponentEquipment: equipment.version > 0 ? opponentKit(rules) : { ...NEUTRAL_KIT }
  };
}
