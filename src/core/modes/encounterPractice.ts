import { botProfile } from '../bots/levels';
import type { MatchResult, MatchRules } from './types';
import type { ResolvedLoadout } from '../talents/effects';

const REHEARSAL_SCORE = 3;

/** Rehearse the reached court without retaining any ranked attempt identity. */
export function encounterPracticeRules(
  source: MatchRules,
  result: MatchResult,
  loadout?: ResolvedLoadout | null
): MatchRules | null {
  if (
    !source.ranked ||
    result.abandoned ||
    source.mode !== result.mode ||
    source.mode === 'practice' ||
    source.mode === 'versus' ||
    source.mode === 'endless'
  )
    return null;

  let bot = source.bot;
  let arenaIntensity = source.arenaIntensity ?? 1;
  let swerve = source.boss?.swerve ?? 0;
  // Traits accumulate phase by phase, exactly as the live fight adds them.
  let traits = source.boss?.traits ?? {};
  // A deficit the encounter opens on - Two Down's 0-2, Pressure's point - is
  // part of what is being rehearsed. It stays short of the rehearsal's three.
  const start = source.modifiers.startScore;
  const modifiers = {
    ...source.modifiers,
    startScore: {
      you: Math.min(REHEARSAL_SCORE - 1, start.you),
      bot: Math.min(REHEARSAL_SCORE - 1, start.bot)
    }
  };
  for (const phase of source.boss?.phases ?? []) {
    if (phase.at > result.scoreYou) break;
    if (phase.arena) modifiers.arena = phase.arena;
    if (phase.botPaddleScale !== undefined) modifiers.botPaddleScale = phase.botPaddleScale;
    if (phase.intensity !== undefined) arenaIntensity = phase.intensity;
    if (phase.swerve !== undefined) swerve = phase.swerve;
    if (phase.traits) traits = { ...traits, ...phase.traits };
    if (phase.bot && botProfile(phase.bot).rank > bot.rank)
      bot = {
        ...botProfile(phase.bot),
        ...(bot.personality ? { personality: bot.personality } : {})
      };
  }
  return {
    mode: 'practice',
    ranked: false,
    ...(loadout ? { practiceLoadout: loadout } : {}),
    label: 'Encounter practice',
    bot,
    practiceBallRank: source.bot.rank,
    winScore: REHEARSAL_SCORE,
    lives: 0,
    modifiers,
    arenaIntensity,
    seed: source.seed ?? 'encounter-practice',
    ...(source.fixedBuild ? { fixedBuild: true } : {}),
    ...(source.boons ? { boons: { ...source.boons } } : {}),
    ...(source.equipment
      ? { equipment: { version: source.equipment.version, kit: { ...source.equipment.kit } } }
      : {}),
    ...(source.opponentEquipment ? { opponentEquipment: { ...source.opponentEquipment } } : {}),
    ...(source.boss ? { boss: { ...source.boss, swerve, traits, phases: [] } } : {}),
    objective: {
      id: 'win',
      label: 'First to 3 · no rewards · return to your result anytime',
      value: 0
    }
  };
}
