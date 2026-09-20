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
  | 'achievements'
  | 'customize'
  | 'playing'
  | 'result';

export interface GameFlow {
  screen: ScreenId;
  go: (screen: ScreenId) => void;
  /** The finished match being shown on the result screen. */
  result: MatchResult | null;
  summary: ProgressSummary | null;
  pickMode: (mode: ModeId) => void;
  startQuick: (bot: BotLevelId) => void;
  startPractice: (bot: BotLevelId) => void;
  startChallenge: (id: string) => void;
  startCup: (tier?: number) => void;
  abandonCup: () => void;
  replay: () => void;
  quitToMenu: () => void;
  leaveResult: (screen: ScreenId) => void;
}

/**
 * Routing and match start-up: which screen is showing, and what each mode
 * does when it is picked. Keeping it here means the screens stay presentational
 * and the engine keeps knowing nothing about menus.
 */
export function useGameFlow(engine: GameEngine | null, snapshot: GameSnapshot): GameFlow {
  const [screen, setScreen] = useState<ScreenId>(() =>
    profileStore.getSnapshot().onboarded ? 'home' : 'onboarding'
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
    setSummary(profileStore.applyResult(finished));
    setScreen('result');
  }, [snapshot.result, snapshot.resultId]);

  const play = useCallback(
    (rules: MatchRules) => {
      engine?.play(rules);
      setScreen('playing');
    },
    [engine]
  );

  const startQuick = useCallback(
    (bot: BotLevelId) => {
      profileStore.setLastBot(bot);
      play(quickMatchRules(bot));
    },
    [play]
  );

  const startPractice = useCallback(
    (bot: BotLevelId) => {
      profileStore.setLastPracticeBot(bot);
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
        profileStore.startTournament(tier ?? tierForLevel(levelOf(profile.xp)).id);
      play(tournamentRules(save));
    },
    [play]
  );

  const abandonCup = useCallback(() => {
    profileStore.abandonTournament();
  }, []);

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
    [play]
  );

  const quitToMenu = useCallback(() => {
    engine?.quitToMenu();
    setScreen('home');
  }, [engine]);

  const replay = useCallback(() => {
    engine?.replay();
    setScreen('playing');
  }, [engine]);

  /** Leave the result card for a menu, tidying the finished match away. */
  const leaveResult = useCallback(
    (next: ScreenId) => {
      engine?.quitToMenu();
      setScreen(next);
    },
    [engine]
  );

  return {
    screen,
    go: setScreen,
    result,
    summary,
    pickMode,
    startQuick,
    startPractice,
    startChallenge,
    startCup,
    abandonCup,
    replay,
    quitToMenu,
    leaveResult
  };
}
