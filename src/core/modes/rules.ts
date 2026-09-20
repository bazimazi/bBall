import { botProfile } from '../bots/levels';
import type { BotLevelId } from '../bots/types';
import { opponentFor, roundFor, tierById, type TournamentSave } from '../tournament/bracket';
import { challengeById, type Challenge } from './challenges';
import {
  NEUTRAL_MODIFIERS,
  type MatchModifiers,
  type MatchObjective,
  type MatchResult,
  type MatchRules
} from './types';

export const QUICK_WIN_SCORE = 5;
export const ENDLESS_LIVES = 3;

function modifiers(overrides: Partial<MatchModifiers> = {}): MatchModifiers {
  return {
    ...NEUTRAL_MODIFIERS,
    ...overrides,
    startScore: { ...(overrides.startScore ?? NEUTRAL_MODIFIERS.startScore) }
  };
}

export function quickMatchRules(bot: BotLevelId): MatchRules {
  return {
    mode: 'quick',
    bot: botProfile(bot),
    winScore: QUICK_WIN_SCORE,
    lives: 0,
    modifiers: modifiers(),
    ranked: true,
    label: 'Quick Match',
    objective: null
  };
}

export function practiceRules(bot: BotLevelId): MatchRules {
  return {
    mode: 'practice',
    bot: botProfile(bot),
    winScore: QUICK_WIN_SCORE,
    lives: 0,
    modifiers: modifiers(),
    ranked: false,
    label: 'Practice',
    objective: null
  };
}

export function endlessRules(): MatchRules {
  return {
    mode: 'endless',
    bot: botProfile('wall'),
    winScore: 0,
    lives: ENDLESS_LIVES,
    modifiers: modifiers({ maxSpeedScale: 1.5, speedPerHitScale: 1.35 }),
    ranked: true,
    label: 'Endless',
    objective: { id: 'survive', label: 'Keep the rally alive', value: 0 }
  };
}

export function challengeRules(challenge: Challenge): MatchRules {
  return {
    mode: 'challenge',
    bot: botProfile(challenge.bot),
    winScore: challenge.winScore,
    lives: 0,
    modifiers: modifiers(challenge.modifiers),
    ranked: true,
    label: challenge.name,
    objective: challenge.objective,
    challengeId: challenge.id
  };
}

export function challengeRulesById(id: string): MatchRules | null {
  const challenge = challengeById(id);
  return challenge ? challengeRules(challenge) : null;
}

export function tournamentRules(save: TournamentSave): MatchRules {
  const round = roundFor(save.round);
  const tier = tierById(save.tier);
  return {
    mode: 'tournament',
    bot: botProfile(opponentFor(save)),
    winScore: round.winScore,
    lives: 0,
    modifiers: modifiers(),
    ranked: true,
    label: `${tier.name} · ${round.name}`,
    objective: { id: 'win', label: `Win ${round.name.toLowerCase()}`, value: 0 },
    tournamentRound: save.round,
    tournamentTier: save.tier
  };
}

/** Did the match satisfy its stated goal? Pure, so the UI can re-check it. */
export function objectiveMet(
  objective: MatchObjective | null,
  result: Omit<MatchResult, 'objectiveMet'>
): boolean {
  if (!objective) return result.won;
  switch (objective.id) {
    case 'win':
      return result.won;
    case 'shutout':
      return result.won && result.scoreBot === 0;
    case 'rally':
      return result.bestRally >= objective.value;
    case 'quick-win':
      return result.won && result.seconds <= objective.value;
    case 'survive':
      return result.bestRally > 0;
  }
}
