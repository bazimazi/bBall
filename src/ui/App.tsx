import { useCallback, useEffect, useState } from 'react';

import type { MatchResult } from '../core/modes/types';
import { setExitRequestHandler } from '../core/platform/back';
import { exitApp, isNativeShell } from '../core/platform/shell';
import { profileStore } from '../core/profile/store';
import { AbilityBar } from './AbilityBar';
import { GameCanvas } from './GameCanvas';
import { Hud } from './Hud';
import { Overlay } from './Overlay';
import { UltimateFlare } from './UltimateFlare';
import { useAccount } from './hooks/useAccount';
import { useAccountLink } from './hooks/useAccountLink';
import { useBackHandler } from './hooks/useBackHandler';
import { useGameEngine } from './hooks/useGameEngine';
import { useGameFlow, type GameFlow } from './hooks/useGameFlow';
import { useDemoLevel, useLoadout, useProfile, useTheme } from './hooks/useProfile';
import { ExitPanel } from './panels/ExitPanel';
import { PausePanel } from './panels/PausePanel';
import { AccountScreen } from './screens/AccountScreen';
import { AchievementsScreen } from './screens/AchievementsScreen';
import { ChallengeScreen } from './screens/ChallengeScreen';
import { CustomizeScreen } from './screens/CustomizeScreen';
import { DemoScreen } from './screens/DemoScreen';
import { DifficultyScreen } from './screens/DifficultyScreen';
import { HomeScreen } from './screens/HomeScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ResultScreen } from './screens/ResultScreen';
import { TalentScreen } from './screens/TalentScreen';
import { TournamentScreen } from './screens/TournamentScreen';

interface ResultActions {
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
}

/** What "next" means depends on the mode the player just finished. */
function resultActions(result: MatchResult, flow: GameFlow): ResultActions {
  const menu = { secondaryLabel: 'Menu', onSecondary: () => flow.leaveResult('home') };

  if (result.mode === 'tournament') {
    const running = profileStore.getSnapshot().tournament !== null;
    return {
      ...menu,
      primaryLabel: running ? 'Next round' : 'Tournament',
      onPrimary: running ? () => flow.startCup() : () => flow.leaveResult('tournament')
    };
  }

  if (result.mode === 'challenge') {
    return {
      ...menu,
      primaryLabel: result.objectiveMet ? 'More challenges' : 'Try again',
      onPrimary: result.objectiveMet ? () => flow.leaveResult('challenges') : flow.replay
    };
  }

  return {
    ...menu,
    primaryLabel: result.mode === 'endless' ? 'Run again' : 'Play again',
    onPrimary: flow.replay
  };
}

/**
 * The canvas owns the game; React owns the chrome around it. Everything the
 * UI shows arrives as an immutable snapshot, and every action it takes is an
 * engine command or a profile-store call.
 */
export function App() {
  const profile = useProfile();
  const demoLevel = useDemoLevel();
  const theme = useTheme(profile);
  const loadout = useLoadout(profile);
  const { canvasRef, snapshot, engine } = useGameEngine(theme);
  const flow = useGameFlow(engine, snapshot);
  const account = useAccount();
  const openAccount = useCallback(() => flow.go('account'), [flow]);
  const accountLink = useAccountLink(openAccount);
  const [leaving, setLeaving] = useState(false);

  // Keep the React chrome on the same accent as the court.
  useEffect(() => {
    document.documentElement.style.setProperty('--you', theme.accentCss);
  }, [theme.accentCss]);

  // The build is pushed the same way the theme is: resolved in React, read
  // by the engine, and never looked up from inside the simulation.
  useEffect(() => {
    engine?.setLoadout(loadout);
  }, [engine, loadout]);

  const playing = flow.screen === 'playing';
  const paused = playing && snapshot.status === 'paused';

  // The back button - the browser's, or Android's - reads as "up one level",
  // and only the very last press is allowed to mean "leave".
  const goBack = useCallback(() => {
    if (playing) {
      // Back out of a match the way the pause button does, so a stray press
      // never costs a game: pause first, and quit only from the pause menu.
      if (paused) flow.quitToMenu();
      else if (snapshot.canPause) engine?.pause();
      else flow.quitToMenu();
      return;
    }
    // The match behind a result card is over, so the screens that started it
    // are not somewhere to go back to.
    if (flow.screen === 'result') {
      flow.leaveResult('home');
      return;
    }
    if (flow.canGoBack) flow.back();
    else setLeaving(true);
  }, [engine, flow, paused, playing, snapshot.canPause]);

  useBackHandler(!leaving, goBack);
  useBackHandler(leaving, () => setLeaving(false));

  // Back pressed with nothing left to leave but the app itself.
  useEffect(() => {
    setExitRequestHandler(() => setLeaving(true));
    return () => setExitRequestHandler(null);
  }, []);

  return (
    <>
      <GameCanvas ref={canvasRef} />

      <Hud
        muted={snapshot.muted}
        canPause={playing && snapshot.canPause}
        label={playing && !paused ? snapshot.objective : null}
        onToggleMute={() => engine?.toggleMute()}
        onPause={() => engine?.pause()}
      />

      <AbilityBar
        abilities={snapshot.abilities}
        show={playing && !paused}
        onUse={(slot) => engine?.useAbility(slot)}
      />

      {/* Above the bar and the HUD, so a capstone reaches the whole page and
          not only the part of it the renderer owns. */}
      <UltimateFlare
        castId={snapshot.ultimateCastId}
        hue={snapshot.ultimateHue}
        active={snapshot.ultimateActive}
        show={playing && !paused}
      />

      {flow.screen === 'onboarding' && (
        <OnboardingScreen profile={profile} onDone={() => flow.replace('home')} />
      )}

      {flow.screen === 'home' && (
        <HomeScreen
          profile={profile}
          account={account}
          demoLevel={demoLevel}
          onPick={flow.pickMode}
          onDemo={() => flow.go('demo')}
          onExitDemo={flow.exitDemo}
          onAccount={openAccount}
          onProfile={() => flow.go('profile')}
          onTalents={() => flow.go('talents')}
          onAchievements={() => flow.go('achievements')}
          onCustomize={() => flow.go('customize')}
        />
      )}

      {(flow.screen === 'quick' || flow.screen === 'practice') && (
        <DifficultyScreen
          profile={profile}
          practice={flow.screen === 'practice'}
          onPick={flow.screen === 'practice' ? flow.startPractice : flow.startQuick}
          onBack={flow.back}
        />
      )}

      {flow.screen === 'challenges' && (
        <ChallengeScreen profile={profile} onPick={flow.startChallenge} onBack={flow.back} />
      )}

      {flow.screen === 'tournament' && (
        <TournamentScreen
          profile={profile}
          onPlay={() => flow.startCup()}
          onStart={(tier) => flow.startCup(tier)}
          onAbandon={flow.abandonCup}
          onBack={flow.back}
        />
      )}

      {flow.screen === 'profile' && (
        <ProfileScreen
          profile={profile}
          account={account}
          onAccount={openAccount}
          onAchievements={() => flow.go('achievements')}
          onCustomize={() => flow.go('customize')}
          onTalents={() => flow.go('talents')}
          onBack={flow.back}
        />
      )}

      {flow.screen === 'account' && (
        <AccountScreen
          token={accountLink.token}
          onTokenUsed={accountLink.clear}
          onBack={flow.back}
        />
      )}

      {flow.screen === 'talents' && <TalentScreen profile={profile} onBack={flow.back} />}

      {flow.screen === 'achievements' && (
        <AchievementsScreen profile={profile} onBack={flow.back} />
      )}

      {flow.screen === 'demo' && (
        <DemoScreen
          demoLevel={demoLevel}
          onStart={flow.startDemo}
          onExit={flow.exitDemo}
          onBack={flow.back}
        />
      )}

      {flow.screen === 'customize' && <CustomizeScreen profile={profile} onBack={flow.back} />}

      {flow.screen === 'result' && flow.result && (
        <ResultScreen
          result={flow.result}
          summary={flow.summary}
          label={snapshot.label}
          onTalents={() => flow.leaveResult('talents')}
          {...resultActions(flow.result, flow)}
        />
      )}

      <Overlay show={paused && !leaving}>
        <PausePanel
          label={snapshot.label}
          onResume={() => engine?.resume()}
          onRestart={flow.replay}
          onQuit={flow.quitToMenu}
        />
      </Overlay>

      <Overlay show={leaving}>
        <ExitPanel
          native={isNativeShell}
          onExit={() => void exitApp()}
          onCancel={() => setLeaving(false)}
        />
      </Overlay>
    </>
  );
}
