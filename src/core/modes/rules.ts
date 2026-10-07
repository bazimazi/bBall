import { mirroredCourt } from './couch';
import { arenaPreset } from './arenas';
import { recipe } from './recipes';
import { waveRecipe } from './sessions';
import { actLength } from '../run/formats';
import { botProfile } from '../bots/levels';
import { BALANCE } from '../balance/config';
import type { BotLevelId } from '../bots/types';
import type { Stage } from '../campaign/journey';
import { dailySpec, dailyIdentity } from '../daily/daily';
import { applyBoonModifiers } from '../run/boons';
import { applyPressure, encounterFor, type RunSave } from '../run/run';
import { bossById } from './bosses';
import { starGoalLabel, type StarGoal } from './stars';
import { opponentFor, roundsFor, tierById, type TournamentSave } from '../tournament/bracket';
import { challengeById, type Challenge } from './challenges';
import {
  NEUTRAL_MODIFIERS,
  type MatchModifiers,
  type MatchObjective,
  type MatchResult,
  type MatchRules,
  type MatchOptions,
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

function optionModifiers(options?: MatchOptions): Partial<MatchModifiers> {
  const arena = options?.arenaId ? arenaPreset(options.arenaId)?.arena : undefined;
  return {
    ...(arena ? { arena } : {}),
    ...(options?.contract
      ? {
          playerPaddleScale: options.contract === 'mythic' ? 0.8 : 0.9,
          botPaddleScale: options.contract === 'mythic' ? 1.12 : 1.05,
          serveSpeedScale: options.contract === 'mythic' ? 1.12 : 1.08
        }
      : {})
  };
}

export function quickMatchRules(bot: BotLevelId, options?: MatchOptions): MatchRules {
  return {
    mode: 'quick',
    bot: {
      ...botProfile(options?.contract ? 'legend' : bot),
      ...(options?.personality ? { personality: options.personality } : {})
    },
    ...(options ? { options } : {}),
    winScore:
      options?.contract === 'mythic' ? 9 : options?.contract === 'master' ? 7 : QUICK_WIN_SCORE,
    lives: 0,
    modifiers: modifiers(optionModifiers(options)),
    ranked: true,
    label: 'Quick Match',
    objective: {
      id: 'win',
      label: 'Rally pressure: after 24 returns both paddles narrow, up to 40%',
      value: 0
    }
  };
}

export function practiceRules(
  bot: BotLevelId,
  pace: PracticePace = 'normal',
  options?: MatchOptions
): MatchRules {
  const relaxed = pace === 'relaxed';
  const scales = BALANCE.practice.relaxed;
  const boss = options?.bossId ? bossById(options.bossId) : undefined;
  const phase = options?.bossPhase ? boss?.spec.phases[options.bossPhase - 1] : undefined;
  const court = phase?.arena ?? boss?.modifiers.arena;
  const practiceOptions = optionModifiers(options);
  const practiceMods = {
    ...practiceOptions,
    ...(boss
      ? {
          ...boss.modifiers,
          ...(phase?.botPaddleScale ? { botPaddleScale: phase.botPaddleScale } : {}),
          ...(court ? { arena: court } : {})
        }
      : {})
  };
  return {
    mode: 'practice',
    bot: {
      ...botProfile(phase?.bot ?? boss?.bot ?? bot),
      ...(options?.personality ? { personality: options.personality } : {})
    },
    ...(options ? { options } : {}),
    winScore: QUICK_WIN_SCORE,
    lives: 0,
    modifiers: modifiers(
      relaxed
        ? {
            ...practiceMods,
            serveSpeedScale: (practiceMods.serveSpeedScale ?? 1) * scales.serveScale,
            maxSpeedScale: (practiceMods.maxSpeedScale ?? 1) * scales.maxScale,
            speedPerHitScale: scales.growthScale
          }
        : practiceMods
    ),
    ranked: false,
    ...(phase?.intensity ? { arenaIntensity: phase.intensity } : {}),
    label: relaxed ? 'Practice · Relaxed' : 'Practice',
    objective: null,
    ...(boss
      ? {
          boss: { ...boss.spec, swerve: phase?.swerve ?? boss.spec.swerve ?? 0, phases: [] },
          intro: {
            title: `${boss.spec.name} · ${phase?.label ?? 'Opening phase'}`,
            sub: 'Practice · isolated phase · no rewards'
          }
        }
      : {})
  };
}

export function endlessRules(options?: MatchOptions): MatchRules {
  return {
    mode: 'endless',
    ...(options ? { options } : {}),
    bot: botProfile('wall'),
    winScore: 0,
    lives: ENDLESS_LIVES,
    modifiers: modifiers({
      maxSpeedScale: 1.5,
      speedPerHitScale: 1.35,
      ...optionModifiers(options),
      ...(options?.waves ? { arena: waveRecipe(options, 0).modifiers.arena } : {})
    }),
    ranked: true,
    label: options?.waves ? 'Endless · Wave 1' : 'Endless',
    objective: {
      id: 'survive',
      label: options?.waves
        ? '12 returns clear a wave · courts change between rallies · 3 lives'
        : 'Keep the rally alive',
      value: 0
    }
  };
}

export function challengeRules(challenge: Challenge): MatchRules {
  return {
    mode: 'challenge',
    ...(challenge.courtFamily ? { courtFamily: challenge.courtFamily } : {}),
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
  const round = roundsFor(save)[save.round]!;
  const tier = tierById(save.tier);
  const generated =
    save.tier >= 3
      ? recipe(`cup-${save.tier}-${save.season ?? 0}`, save.round, Math.min(4, save.tier - 2))
      : undefined;
  return {
    mode: 'tournament',
    bot: {
      ...botProfile(opponentFor(save)),
      ...(generated ? { personality: generated.personality } : {})
    },
    ...(generated ? { courtFamily: generated.courtFamily } : {}),
    winScore: round.winScore,
    lives: 0,
    modifiers: modifiers(generated?.modifiers),
    ranked: true,
    label: `${tier.name} · ${round.name}`,
    objective: { id: 'win', label: `Win ${round.name.toLowerCase()}`, value: 0 },
    tournamentRound: save.round,
    ...(save.format ? { tournamentFormat: save.format } : {}),
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
    ...(stage.courtFamily && !boss ? { courtFamily: stage.courtFamily } : {}),
    bot: {
      ...botProfile(stage.bot),
      ...(stage.personality ? { personality: stage.personality } : {})
    },
    seed: stage.id,
    winScore: stage.winScore,
    lives: 0,
    modifiers: modifiers(
      boss && stage.world > 5
        ? { ...boss.modifiers, ...stage.modifiers, arena: boss.modifiers.arena }
        : stage.modifiers
    ),
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
    ...(dailyIdentity(key).kind === 'master' ? { fixedBuild: true } : {}),
    ...(spec.courtFamily ? { courtFamily: spec.courtFamily } : {}),
    mode: 'daily',
    bot: botProfile(spec.bot),
    winScore: spec.winScore,
    lives: 0,
    modifiers: modifiers(spec.modifiers),
    ranked: dailyIdentity(key).kind !== 'archive',
    label: `Daily · ${spec.title}`,
    objective: { id: 'win', label: goalLine(spec.goals), value: 0 },
    dailyKey: key,
    seed: key,
    goals: spec.goals,
    intro: {
      title: spec.title,
      sub:
        dailyIdentity(key).kind === 'archive' ? 'Archive practice · no rewards' : 'Daily challenge'
    }
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
  const act = encounter.act + 1;
  const length = actLength(save);
  const match = ((save.stage - (save.actOffset ?? 0)) % length) + 1;
  return {
    mode: 'run',
    ...(encounter.courtFamily ? { courtFamily: encounter.courtFamily } : {}),
    bot: {
      ...botProfile(encounter.bot),
      ...(encounter.personality ? { personality: encounter.personality } : {})
    },
    seed: `${save.seed}-${save.stage}-${save.route ?? 'safe'}`,
    winScore: encounter.winScore,
    lives: 0,
    modifiers: mods,
    ranked: true,
    label: `Gauntlet · Act ${act}`,
    objective: {
      id: 'win',
      label: `${hearts(save)} · Act ${act}, ${boss ? 'boss' : `match ${match} of ${length}`}`,
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
export function versusRules(winScore = QUICK_WIN_SCORE, options?: MatchOptions): MatchRules {
  return {
    mode: 'versus',
    ...(options ? { options } : {}),
    bot: botProfile('pro'),
    winScore,
    lives: 0,
    modifiers: modifiers({
      ...optionModifiers(options),
      ...(options?.mirror && options.arenaId
        ? { arena: mirroredCourt(arenaPreset(options.arenaId)!.arena) }
        : {}),
      ...(options?.duel === 'speed'
        ? { serveSpeedScale: 1.15, maxSpeedScale: 1.15 }
        : options?.duel === 'precision'
          ? { playerPaddleScale: 0.8, botPaddleScale: 0.8 }
          : {})
    }),
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
    case 'banks':
    case 'switches':
    case 'breaks':
    case 'gates':
      return result.won && (result.court?.[objective.id] ?? 0) >= objective.value;
  }
}
