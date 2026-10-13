import {
  clearDemoRoutes,
  advanceRoute,
  loadRoutes,
  saveRoute,
  resumeRoute,
  routeById,
  type RouteId,
  type RouteProgress
} from '../../core/modes/routes';
import { sharedChallengeRules } from '../../core/modes/sharedChallenge';
import { techniqueRules, type TechniqueId } from '../../core/modes/drills';
import type { PaddleKit } from '../../core/equipment/types';
import { specializationBuilds } from '../../core/loot/ops';
import { hasResearch } from '../../core/loot/state';
import { trialOpen } from '../../core/loot/trials';
import { resolveLoadout, type ResolvedLoadout } from '../../core/talents/effects';
import { advanceSeries, seriesComplete, type MatchSeries } from '../../core/modes/sessions';
import type { TournamentFormat } from '../../core/tournament/bracket';
import type { MatchOptions } from '../../core/modes/types';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore
} from 'react';

import type { BotLevelId } from '../../core/bots/types';
import { stageById } from '../../core/campaign/journey';
import {
  campaignRules,
  challengeRulesById,
  dailyRules,
  endlessRules,
  practiceRules,
  quickMatchRules,
  runRules,
  tournamentRules,
  versusRules
} from '../../core/modes/rules';
import { dayKey } from '../../core/progression/xp';
import { isRunActive } from '../../core/run/run';
import type { RunFormat } from '../../core/run/formats';
import type { MatchResult, MatchRules, ModeId } from '../../core/modes/types';
import * as progression from '../../core/account/progression';
import { profileStore, type ProgressSummary } from '../../core/profile/store';
import { levelOf } from '../../core/progression/levels';
import { tierForLevel } from '../../core/tournament/bracket';
import type { GameEngine } from '../../game/engine';
import type { GameSnapshot } from '../../game/types';
import { settingsStore } from '../../core/settings/store';
import { enterPreferredFullscreen } from '../../core/platform/fullscreen';
import { encounterPracticeRules } from '../../core/modes/encounterPractice';

export type ScreenId =
  | 'routes'
  | 'shared'
  | 'onboarding'
  | 'home'
  | 'modes'
  | 'quick'
  | 'practice'
  | 'challenges'
  | 'tournament'
  | 'journey'
  | 'daily'
  | 'gauntlet'
  | 'profile'
  | 'account'
  | 'achievements'
  | 'customize'
  | 'settings'
  | 'help'
  | 'talents'
  | 'workshop'
  | 'lab'
  | 'demo'
  | 'playing'
  | 'result';

export interface GameFlow {
  screen: ScreenId;
  /** Open a screen on top of the one showing, so back returns to it. */
  go: (screen: ScreenId) => void;
  /** Swap the screen showing for another, with no way back to it. */
  replace: (screen: ScreenId) => void;
  /** Step back one screen. Does nothing when this one is the bottom. */
  back: () => void;
  /** Is there a screen behind this one? */
  canGoBack: boolean;
  /** The finished match being shown on the result screen. */
  result: MatchResult | null;
  resultLabel: string;
  canPractiseEncounter: boolean;
  practisingEncounter: boolean;
  startEncounterPractice: () => void;
  series: MatchSeries | null;
  summary: ProgressSummary | null;
  pickMode: (mode: ModeId, options?: MatchOptions) => void;
  startQuick: (bot: BotLevelId, options?: MatchOptions) => void;
  startPractice: (bot: BotLevelId, options?: MatchOptions) => void;
  routeResult: RouteProgress | null;
  startRoute: (id: RouteId) => void;
  startShared: (code: string) => void;
  startTechnique: (id: TechniqueId) => void;
  startBench: (kit: PaddleKit, serve: 'routine' | 'attack' | 'edge') => void;
  /** Trial kit restored when returning from Workshop practice. */
  workshopKit: PaddleKit | null;
  startTutorial: () => void;
  startChallenge: (id: string) => void;
  startCup: (tier?: number, format?: TournamentFormat) => void;
  abandonCup: () => void;
  startStage: (id: string) => void;
  startDaily: (day?: string) => void;
  /** Begin a Gauntlet run at `pressure`, straight into its first match. */
  startRun: (pressure: number, format?: RunFormat) => void;
  /** Play the run's next match. */
  playRun: () => void;
  pickBoon: (id: string) => void;
  abandonRun: () => void;
  /** Enter Demo mode at `level`. Nothing played there is ever saved. */
  startDemo: (level: number) => void;
  exitDemo: () => void;
  replay: () => void;
  quitToMenu: () => void;
  leaveResult: (screen: ScreenId) => void;
}

const profileKey = () =>
  `${profileStore.getDemoLevel() === null ? '' : 'demo:'}${profileStore.getSnapshot().id}`;
const onboardingComplete = () => profileStore.getSnapshot().onboarded;

/**
 * Routing and match start-up: which screen is showing, and what each mode
 * does when it is picked. Keeping it here means the screens stay presentational
 * and the engine keeps knowing nothing about menus.
 *
 * Screens are a stack rather than a single value, because "back" has to mean
 * the screen the player actually came from: Profile then Talents goes back to
 * Profile, while Home then Talents goes back to Home. The bottom of the stack
 * is always somewhere it is reasonable to stop - Home, or onboarding on a
 * first run - so the back button runs out exactly where leaving the app is
 * the honest next step.
 */
export function useGameFlow(engine: GameEngine | null, snapshot: GameSnapshot): GameFlow {
  const owner = useSyncExternalStore(profileStore.subscribe, profileKey, profileKey);
  const onboarded = useSyncExternalStore(
    profileStore.subscribe,
    onboardingComplete,
    onboardingComplete
  );
  const [stack, setStack] = useState<ScreenId[]>(() => (onboarded ? ['home'] : ['onboarding']));
  // A sign-in can complete over another menu. Replace the obsolete root before
  // commit, preserving that menu and preventing Back from reopening first-run edits.
  if (onboarded && stack[0] === 'onboarding') setStack(['home', ...stack.slice(1)]);
  const screen = stack[stack.length - 1] as ScreenId;
  const [workshopKit, setWorkshopKit] = useState<PaddleKit | null>(null);
  const setScreen = useCallback((next: ScreenId) => {
    if (next === 'workshop') setWorkshopKit(null);
    setStack((current) => {
      // A screen already on the way here is returned to rather than stacked
      // twice, so cross-links such as Talents and Lab never pile up - unless
      // a match sits above it, which only its own exits may tidy away.
      const index = current.lastIndexOf(next);
      if (index === current.length - 1) return current;
      if (index < 0) return [...current, next];
      const above = current.slice(index + 1);
      if (above.includes('playing') || above.includes('result')) return [...current, next];
      return current.slice(0, index + 1);
    });
  }, []);
  const replace = useCallback(
    (next: ScreenId) => setStack((current) => [...current.slice(0, -1), next]),
    []
  );
  const back = useCallback(() => {
    if (screen === 'workshop') setWorkshopKit(null);
    setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }, [screen]);
  const [routeResult, setRouteResult] = useState<RouteProgress | null>(null);
  const routeMatch = useRef<{ profileId: string; progress: RouteProgress } | null>(null);
  const [series, setSeries] = useState<MatchSeries | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [resultLabel, setResultLabel] = useState('');
  const [practisingEncounter, setPractisingEncounter] = useState(false);
  const [canPractiseEncounter, setCanPractiseEncounter] = useState(false);
  const practiceReturn = useRef<{
    profileId: string;
    rules: MatchRules;
    result: MatchResult;
    summary: ProgressSummary | null;
    label: string;
    series: MatchSeries | null;
    loadout: ResolvedLoadout | null;
  } | null>(null);
  const handled = useRef(0);
  const lastRules = useRef<MatchRules | null>(null);
  const matchOwner = useRef<string | null>(null);
  const encounterLoadout = useRef<ResolvedLoadout | null>(null);
  const previousOwner = useRef(owner);

  // An account restore can finish while a court or result is open. Its save
  // cannot inherit the old player's attempt, return card or route cursor.
  useEffect(() => {
    if (previousOwner.current === owner) return;
    previousOwner.current = owner;
    if (matchOwner.current === owner) return;
    if (!lastRules.current && !practiceReturn.current && !routeMatch.current) return;
    engine?.quitToMenu();
    lastRules.current = null;
    matchOwner.current = null;
    encounterLoadout.current = null;
    practiceReturn.current = null;
    routeMatch.current = null;
    setPractisingEncounter(false);
    setCanPractiseEncounter(false);
    setRouteResult(null);
    setWorkshopKit(null);
    setSeries(null);
    setResult(null);
    setSummary(null);
    setStack((current) => (current.includes('account') ? ['home', 'account'] : ['home']));
  }, [engine, owner]);

  const processFinished = useEffectEvent((finished: MatchResult) => {
    // Check the live store as well as the subscription: a sign-in and a final
    // engine snapshot can arrive in the same React batch.
    if (matchOwner.current !== profileKey()) return;
    if (!practiceReturn.current)
      encounterLoadout.current = engine?.capturePracticeLoadout?.() ?? null;
    setResult(finished);
    setResultLabel(snapshot.label);
    setCanPractiseEncounter(
      !!(
        lastRules.current &&
        !practiceReturn.current &&
        encounterPracticeRules(lastRules.current, finished)
      )
    );
    if (finished.options?.series && finished.options.series > 1)
      setSeries((current) => (current ? advanceSeries(current, finished.won) : null));
    setSummary(practiceReturn.current ? null : progression.recordMatch(finished));
    const route = routeMatch.current;
    if (!practiceReturn.current && route && route.profileId === profileKey() && lastRules.current) {
      const progress = advanceRoute(route.progress, lastRules.current, finished);
      saveRoute(route.profileId, progress);
      setRouteResult(progress);
      routeMatch.current = null;
    }
    replace('result');
  });
  // Synchronize the external engine's completed attempt exactly once.
  useEffect(() => {
    const finished = snapshot.result;
    if (!finished || snapshot.resultId === handled.current) return;
    handled.current = snapshot.resultId;
    processFinished(finished);
  }, [snapshot.result, snapshot.resultId]);

  const play = useCallback(
    (rules: MatchRules, rehearsal = false) => {
      setCanPractiseEncounter(false);
      if (!rehearsal) {
        routeMatch.current = null;
        setRouteResult(null);
        practiceReturn.current = null;
        setPractisingEncounter(false);
      }
      enterPreferredFullscreen();
      const prepared = progression.prepareMatch(rules);
      if (!prepared.options?.bench) setWorkshopKit(null);
      lastRules.current = prepared;
      matchOwner.current = profileKey();
      const profile = profileStore.getSnapshot();
      engine?.play(
        prepared,
        hasResearch(profile.progress.loot, 'board-switch')
          ? specializationBuilds(profile).map((entry) => ({
              name: entry.name,
              loadout: resolveLoadout(entry.talents, levelOf(profile.xp))
            }))
          : []
      );
      setScreen('playing');
    },
    [engine, setScreen]
  );

  const startRoute = useCallback(
    (id: RouteId) => {
      if (!engine) return;
      const route = routeById(id);
      if (!route) return;
      const profileId = profileKey();
      const progress = resumeRoute(
        id,
        loadRoutes(profileId).find((item) => item.id === id)
      );
      saveRoute(profileId, progress);
      setSeries(null);
      play(route.steps[progress.step]!.rules());
      routeMatch.current = { profileId, progress };
    },
    [engine, play]
  );
  const startShared = useCallback(
    (code: string) => {
      const rules = sharedChallengeRules(code);
      if (rules) {
        setSeries(null);
        play(rules);
      }
    },
    [play]
  );

  const startEncounterPractice = useCallback(() => {
    const source = lastRules.current;
    if (!engine || screen !== 'result' || !source || !result || practiceReturn.current) return;
    const rules = encounterPracticeRules(source, result, encounterLoadout.current);
    if (!rules) return;
    practiceReturn.current = {
      profileId: profileKey(),
      rules: source,
      result,
      summary,
      label: resultLabel,
      series,
      loadout: encounterLoadout.current
    };
    setPractisingEncounter(true);
    play(rules, true);
  }, [engine, screen, result, summary, resultLabel, series, play]);

  const startQuick = useCallback(
    (bot: BotLevelId, options?: MatchOptions) => {
      setSeries(
        options?.series && options.series > 1
          ? { length: options.series as 3 | 5, games: 0, you: 0, foe: 0 }
          : null
      );
      progression.setLastBot(bot);
      play(quickMatchRules(bot, options));
    },
    [play]
  );

  const startPractice = useCallback(
    (bot: BotLevelId, options?: MatchOptions) => {
      progression.setLastPracticeBot(bot);
      play(practiceRules(bot, settingsStore.getSnapshot().practicePace, options));
    },
    [play]
  );

  const startTechnique = useCallback(
    (id: TechniqueId) => {
      const source = lastRules.current;
      const rehearsal = !!(
        engine &&
        screen === 'result' &&
        result &&
        source &&
        !practiceReturn.current &&
        encounterPracticeRules(source, result)
      );
      if (rehearsal && source && result) {
        practiceReturn.current = {
          profileId: profileKey(),
          rules: source,
          result,
          summary,
          label: resultLabel,
          series,
          loadout: encounterLoadout.current
        };
        setPractisingEncounter(true);
      }
      setSeries(null);
      play(techniqueRules(id), rehearsal);
    },
    [engine, screen, result, summary, resultLabel, series, play]
  );

  const startTutorial = useCallback(() => {
    routeMatch.current = null;
    setRouteResult(null);
    practiceReturn.current = null;
    setPractisingEncounter(false);
    enterPreferredFullscreen();
    lastRules.current = null;
    matchOwner.current = profileKey();
    encounterLoadout.current = null;
    setWorkshopKit(null);
    engine?.learn();
    setScreen('playing');
  }, [engine, setScreen]);

  const startBench = useCallback(
    (kit: PaddleKit, serve: 'routine' | 'attack' | 'edge') => {
      setWorkshopKit({ ...kit });
      progression.workshopAction({ type: 'compare', kit });
      play({
        ...practiceRules('wall', 'normal', { bench: serve }),
        equipment: { version: 1, kit },
        opponentEquipment: {
          ...kit,
          core: 'balanced-core',
          surface: 'balanced-surface',
          frame: 'balanced-frame',
          insert: 'empty-insert',
          tuning: 'standard'
        },
        label: 'Workshop bench · no rewards',
        seed: `bench-${serve}`
      });
    },
    [play]
  );

  const startChallenge = useCallback(
    (id: string) => {
      if (!trialOpen(profileStore.getSnapshot(), id)) return;
      const rules = challengeRulesById(id);
      if (rules) play(rules);
    },
    [play]
  );

  const startCup = useCallback(
    (tier?: number, format?: TournamentFormat) => {
      const profile = profileStore.getSnapshot();
      const save =
        profile.tournament ??
        progression.startTournament(tier ?? tierForLevel(levelOf(profile.xp)).id, format);
      play(tournamentRules(save));
    },
    [play]
  );

  const abandonCup = useCallback(() => {
    progression.abandonTournament();
  }, []);

  const startStage = useCallback(
    (id: string) => {
      const stage = stageById(id);
      if (stage) play(campaignRules(stage));
    },
    [play]
  );

  const startDaily = useCallback((day = dayKey()) => play(dailyRules(day)), [play]);

  const playRun = useCallback(() => {
    const run = profileStore.getSnapshot().progress.run;
    // A draft must be picked before the next match: the server holds the run
    // to the same rule, so the client never offers the way round it.
    if (!isRunActive(run) || run.offer) return;
    if (!engine || (run.version === 2 && !progression.runAction('commit'))) return;
    play(runRules(run));
  }, [play, engine]);

  const startRun = useCallback(
    (pressure: number, format?: RunFormat) => {
      if (progression.startRun(pressure, format)) playRun();
    },
    [playRun]
  );

  const pickBoon = useCallback((id: string) => {
    progression.pickBoon(id);
  }, []);

  const abandonRun = useCallback(() => {
    progression.abandonRun();
  }, []);

  const startDemo = useCallback(
    (level: number) => {
      // A demo swaps the whole profile out, so any match in flight belongs to
      // the save being parked and is dropped rather than carried over.
      engine?.quitToMenu();
      practiceReturn.current = null;
      setPractisingEncounter(false);
      lastRules.current = null;
      matchOwner.current = null;
      encounterLoadout.current = null;
      setWorkshopKit(null);
      routeMatch.current = null;
      setRouteResult(null);
      clearDemoRoutes();
      profileStore.startDemo(level);
      setResult(null);
      setSummary(null);
      setStack(['home']);
    },
    [engine]
  );

  const exitDemo = useCallback(() => {
    engine?.quitToMenu();
    practiceReturn.current = null;
    setPractisingEncounter(false);
    lastRules.current = null;
    matchOwner.current = null;
    encounterLoadout.current = null;
    setWorkshopKit(null);
    routeMatch.current = null;
    setRouteResult(null);
    clearDemoRoutes();
    profileStore.endDemo();
    setResult(null);
    setSummary(null);
    setStack(['home']);
  }, [engine]);

  const pickMode = useCallback(
    (mode: ModeId, options?: MatchOptions) => {
      switch (mode) {
        case 'quick':
          setScreen('quick');
          break;
        case 'practice':
          setScreen('practice');
          break;
        case 'challenge':
          setScreen('challenges');
          break;
        case 'tournament':
          setScreen('tournament');
          break;
        case 'endless':
          play(endlessRules(options));
          break;
        case 'campaign':
          setScreen('journey');
          break;
        case 'daily':
          setScreen('daily');
          break;
        case 'run':
          setScreen('gauntlet');
          break;
        case 'versus':
          setSeries(
            options?.series && options.series > 1
              ? { length: options.series as 3 | 5, games: 0, you: 0, foe: 0 }
              : null
          );
          play(versusRules(undefined, options));
          break;
      }
    },
    [play, setScreen]
  );

  const quitToMenu = useCallback(() => {
    const origin = practiceReturn.current;
    if (origin) {
      engine?.quitToMenu();
      practiceReturn.current = null;
      setPractisingEncounter(false);
      if (origin.profileId === profileKey()) {
        lastRules.current = origin.rules;
        encounterLoadout.current = origin.loadout;
        setResult(origin.result);
        setSummary(origin.summary);
        setResultLabel(origin.label);
        setSeries(origin.series);
        setCanPractiseEncounter(true);
        setStack(['home', 'result']);
        return;
      }
    }
    routeMatch.current = null;
    setRouteResult(null);
    const bench = !!lastRules.current?.options?.bench;
    engine?.quitToMenu();
    lastRules.current = null;
    matchOwner.current = null;
    encounterLoadout.current = null;
    setSeries(null);
    setResult(null);
    setSummary(null);
    if (bench) {
      setStack((current) => {
        const workshop = current.lastIndexOf('workshop');
        return workshop >= 0 ? current.slice(0, workshop + 1) : ['home', 'workshop'];
      });
    } else {
      setWorkshopKit(null);
      setStack(['home']);
    }
  }, [engine]);

  const replay = useCallback(() => {
    if ((lastRules.current?.mode ?? snapshot.mode) === 'run') {
      const run = profileStore.getSnapshot().progress.run;
      if (run?.version === 2) {
        if (run.attempt && !progression.runAction('restart')) return;
        const current = profileStore.getSnapshot().progress.run;
        if (!isRunActive(current)) {
          engine?.quitToMenu();
          setStack(['home', 'gauntlet']);
          return;
        }
        playRun();
        return;
      }
      if (!isRunActive(run)) {
        engine?.quitToMenu();
        setStack(['home', 'gauntlet']);
        return;
      }
    }
    if (!practiceReturn.current && series && seriesComplete(series))
      setSeries({ ...series, games: 0, you: 0, foe: 0 });
    enterPreferredFullscreen();
    const route = routeMatch.current;
    if (lastRules.current) play(lastRules.current, !!practiceReturn.current);
    else engine?.replay();
    routeMatch.current = route;
    replace('playing');
  }, [engine, replace, snapshot.mode, playRun, series, play]);

  /**
   * Leave the result card for a menu, tidying the finished match away.
   *
   * The match that got here is over, so the screens that led to it are not
   * worth stepping back through: the stack is rebuilt as the menu itself,
   * reached from Home.
   */
  const leaveResult = useCallback(
    (next: ScreenId) => {
      routeMatch.current = null;
      setRouteResult(null);
      engine?.quitToMenu();
      practiceReturn.current = null;
      setPractisingEncounter(false);
      if (next !== 'workshop' || !lastRules.current?.options?.bench) setWorkshopKit(null);
      lastRules.current = null;
      matchOwner.current = null;
      encounterLoadout.current = null;
      setSeries(null);
      setStack(next === 'home' ? ['home'] : ['home', next]);
    },
    [engine]
  );

  return {
    screen,
    go: setScreen,
    replace,
    back,
    canGoBack: stack.length > 1,
    result,
    resultLabel,
    practisingEncounter,
    canPractiseEncounter,
    startEncounterPractice,
    series,
    summary,
    pickMode,
    startQuick,
    startPractice,
    routeResult,
    startRoute,
    startShared,
    startTechnique,
    startBench,
    workshopKit,
    startTutorial,
    startChallenge,
    startCup,
    abandonCup,
    startStage,
    startDaily,
    startRun,
    playRun,
    pickBoon,
    abandonRun,
    startDemo,
    exitDemo,
    replay,
    quitToMenu,
    leaveResult
  };
}
