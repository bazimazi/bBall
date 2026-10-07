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

export type ScreenId =
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
  series: MatchSeries | null;
  summary: ProgressSummary | null;
  pickMode: (mode: ModeId, options?: MatchOptions) => void;
  startQuick: (bot: BotLevelId, options?: MatchOptions) => void;
  startPractice: (bot: BotLevelId, options?: MatchOptions) => void;
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
  const setScreen = useCallback(
    (next: ScreenId) =>
      setStack((current) => (current[current.length - 1] === next ? current : [...current, next])),
    []
  );
  const replace = useCallback(
    (next: ScreenId) => setStack((current) => [...current.slice(0, -1), next]),
    []
  );
  const back = useCallback(
    () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current)),
    []
  );
  const [series, setSeries] = useState<MatchSeries | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const handled = useRef(0);

  const processFinished = useEffectEvent((finished: MatchResult) => {
    setResult(finished);
    if (finished.options?.series && finished.options.series > 1)
      setSeries((current) => (current ? advanceSeries(current, finished.won) : null));
    setSummary(progression.recordMatch(finished));
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
    (rules: MatchRules) => {
      enterPreferredFullscreen();
      engine?.play(rules);
      setScreen('playing');
    },
    [engine, setScreen]
  );

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

  const startTutorial = useCallback(() => {
    enterPreferredFullscreen();
    engine?.learn();
    setScreen('playing');
  }, [engine, setScreen]);

  const startChallenge = useCallback(
    (id: string) => {
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
      profileStore.startDemo(level);
      setResult(null);
      setSummary(null);
      setStack(['home']);
    },
    [engine]
  );

  const exitDemo = useCallback(() => {
    engine?.quitToMenu();
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
    engine?.quitToMenu();
    setSeries(null);
    setStack(['home']);
  }, [engine]);

  const replay = useCallback(() => {
    if (snapshot.mode === 'run') {
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
    if (series && seriesComplete(series)) setSeries({ ...series, games: 0, you: 0, foe: 0 });
    enterPreferredFullscreen();
    engine?.replay();
    replace('playing');
  }, [engine, replace, snapshot.mode, playRun, series]);

  /**
   * Leave the result card for a menu, tidying the finished match away.
   *
   * The match that got here is over, so the screens that led to it are not
   * worth stepping back through: the stack is rebuilt as the menu itself,
   * reached from Home.
   */
  const leaveResult = useCallback(
    (next: ScreenId) => {
      engine?.quitToMenu();
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
    series,
    summary,
    pickMode,
    startQuick,
    startPractice,
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
