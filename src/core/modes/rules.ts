import { botProfile } from '../bots/levels';
import { BALANCE } from '../balance/config';
import type { BotLevelId } from '../bots/types';
import type { Stage } from '../campaign/journey';
import { dailySpec } from '../daily/daily';
import { applyBoonModifiers } from '../run/boons';
import { actOf, applyPressure, encounterFor, type RunSave } from '../run/run';
import { bossById } from './bosses';
import { starGoalLabel, type StarGoal } from './stars';
import { opponentFor, roundFor, tierById, type TournamentSave } from '../tournament/bracket';
import { challengeById, type Challenge } from './challenges';
import {
  NEUTRAL_MODIFIERS,
  type MatchModifiers,
  type MatchObjective,
  type MatchResult,
  type MatchRules,
  type PracticePace
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

export function practiceRules(bot: BotLevelId, pace: PracticePace = 'normal'): MatchRules {
  const relaxed = pace === 'relaxed';
  const scales = BALANCE.practice.relaxed;
  return {
    mode: 'practice',
    bot: botProfile(bot),
    winScore: QUICK_WIN_SCORE,
    lives: 0,
    modifiers: modifiers(
      relaxed
        ? {
            serveSpeedScale: scales.serveScale,
            maxSpeedScale: scales.maxScale,
            speedPerHitScale: scales.growthScale
          }
        : {}
    ),
    ranked: false,
    label: relaxed ? 'Practice · Relaxed' : 'Practice',
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

function goalLine(goals: readonly [StarGoal, StarGoal]): string {
  return `${starGoalLabel(goals[0])} · ${starGoalLabel(goals[1])}`;
}

/** A Journey stage. A boss stage brings its boss's court, brain and phases. */
export function campaignRules(stage: Stage): MatchRules {
  const boss = stage.boss ? bossById(stage.boss) : undefined;
  return {
    mode: 'campaign',
    bot: botProfile(stage.bot),
    winScore: stage.winScore,
    lives: 0,
    modifiers: modifiers(stage.modifiers),
    ranked: true,
    label: `${stage.world}-${stage.index + 1} · ${stage.name}`,
    objective: { id: 'win', label: goalLine(stage.goals), value: 0 },
    stageId: stage.id,
    goals: stage.goals,
    boss: boss?.spec,
    intro: boss ? undefined : { title: stage.name, sub: `Stage ${stage.world}-${stage.index + 1}` }
  };
}

/** The daily challenge for `key`, the same on every device. */
export function dailyRules(key: string): MatchRules {
  const spec = dailySpec(key);
  return {
    mode: 'daily',
    bot: botProfile(spec.bot),
    winScore: spec.winScore,
    lives: 0,
    modifiers: modifiers(spec.modifiers),
    ranked: true,
    label: `Daily · ${spec.title}`,
    objective: { id: 'win', label: goalLine(spec.goals), value: 0 },
    dailyKey: key,
    goals: spec.goals,
    intro: { title: spec.title, sub: 'Daily challenge' }
  };
}

function hearts(save: RunSave): string {
  return '♥'.repeat(save.hearts);
}

/** The next Gauntlet match: its encounter, with Pressure and the run's boons folded in. */
export function runRules(save: RunSave): MatchRules {
  const encounter = encounterFor(save);
  const boss = encounter.boss ? bossById(encounter.boss) : undefined;
  const mods = modifiers(encounter.modifiers);
  applyBoonModifiers(mods, save.boons);
  applyPressure(mods, save.pressure);
  const act = actOf(save.stage) + 1;
  const match = (save.stage % 3) + 1;
  return {
    mode: 'run',
    bot: botProfile(encounter.bot),
    winScore: encounter.winScore,
    lives: 0,
    modifiers: mods,
    ranked: true,
    label: `Gauntlet · Act ${act}`,
    objective: {
      id: 'win',
      label: `${hearts(save)} · Act ${act}, ${boss ? 'boss' : `match ${match} of 3`}`,
      value: 0
    },
    runStage: save.stage,
    boons: save.boons,
    boss: boss?.spec,
    intro:
      boss || !encounter.courtName
        ? undefined
        : { title: encounter.courtName, sub: `Act ${act} · match ${match}` }
  };
}

/** Two people, one screen. Plain paddles on both sides, nothing recorded. */
export function versusRules(winScore = QUICK_WIN_SCORE): MatchRules {
  return {
    mode: 'versus',
    bot: botProfile('pro'),
    winScore,
    lives: 0,
    modifiers: modifiers(),
    ranked: false,
    label: 'Versus',
    // The engine adds the current keyboard bindings to its desktop snapshot.
    objective: {
      id: 'win',
      label: 'Each player steers on their own half',
      touchLabel: 'Each player steers on their own half',
      value: 0
    },
    versus: true
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
