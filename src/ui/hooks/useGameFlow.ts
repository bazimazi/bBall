import { useCallback, useEffect, useRef, useState } from 'react';

import type { BotLevelId } from '../../core/bots/types';
import {
  challengeRulesById,
  endlessRules,
  practiceRules,
  quickMatchRules,
  tournamentRules
} from '../../core/modes/rules';
import type { MatchResult, MatchRules, ModeId } from '../../core/modes/types';
import * as progression from '../../core/account/progression';
import { profileStore, type ProgressSummary } from '../../core/profile/store';
import { levelOf } from '../../core/progression/levels';
import { tierForLevel } from '../../core/tournament/bracket';
import type { GameEngine } from '../../game/engine';
import type { GameSnapshot } from '../../game/types';

export type ScreenId =
  | 'onboarding'
  | 'home'
  | 'quick'
  | 'practice'
  | 'challenges'
  | 'tournament'
  | 'profile'
  | 'account'
  | 'achievements'
  | 'customize'
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
  summary: ProgressSummary | null;
  pickMode: (mode: ModeId) => void;
  startQuick: (bot: BotLevelId) => void;
  startPractice: (bot: BotLevelId) => void;
  startChallenge: (id: string) => void;
  startCup: (tier?: number) => void;
  abandonCup: () => void;
  /** Enter Demo mode at `level`. Nothing played there is ever saved. */
  startDemo: (level: number) => void;
  exitDemo: () => void;
  replay: () => void;
  quitToMenu: () => void;
  leaveResult: (screen: ScreenId) => void;
}

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
  const [stack, setStack] = useState<ScreenId[]>(() =>
    profileStore.getSnapshot().onboarded ? ['home'] : ['onboarding']
  );
  const screen = stack[stack.length - 1] as ScreenId;
  const setScreen = useCallback(
    (next: ScreenId) =>
      setStack((current) => (current.at(-1) === next ? current : [...current, next])),
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
  const [result, setResult] = useState<MatchResult | null>(null);
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const handled = useRef(0);

  // A finished match arrives exactly once, tagged with an id.
  useEffect(() => {
    const finished = snapshot.result;
    if (!finished || snapshot.resultId === handled.current) return;
    handled.current = snapshot.resultId;
    setResult(finished);
    setSummary(progression.recordMatch(finished));
    replace('result');
  }, [snapshot.result, snapshot.resultId, replace]);

  const play = useCallback(
    (rules: MatchRules) => {
      engine?.play(rules);
      setScreen('playing');
    },
    [engine, setScreen]
  );

  const startQuick = useCallback(
    (bot: BotLevelId) => {
      progression.setLastBot(bot);
      play(quickMatchRules(bot));
    },
    [play]
  );

  const startPractice = useCallback(
    (bot: BotLevelId) => {
      progression.setLastPracticeBot(bot);
      play(practiceRules(bot));
    },
    [play]
  );

  const startChallenge = useCallback(
    (id: string) => {
      const rules = challengeRulesById(id);
      if (rules) play(rules);
    },
    [play]
  );

  const startCup = useCallback(
    (tier?: number) => {
      const profile = profileStore.getSnapshot();
      const save =
        profile.tournament ??
        progression.startTournament(tier ?? tierForLevel(levelOf(profile.xp)).id);
      play(tournamentRules(save));
    },
    [play]
  );

  const abandonCup = useCallback(() => {
    progression.abandonTournament();
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
    (mode: ModeId) => {
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
          play(endlessRules());
          break;
      }
    },
    [play, setScreen]
  );

  const quitToMenu = useCallback(() => {
    engine?.quitToMenu();
    setStack(['home']);
  }, [engine]);

  const replay = useCallback(() => {
    engine?.replay();
    replace('playing');
  }, [engine, replace]);

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
    summary,
    pickMode,
    startQuick,
    startPractice,
    startChallenge,
    startCup,
    abandonCup,
    startDemo,
    exitDemo,
    replay,
    quitToMenu,
    leaveResult
  };
}
