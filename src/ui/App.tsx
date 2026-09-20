import { useEffect } from 'react';

import type { MatchResult } from '../core/modes/types';
import { profileStore } from '../core/profile/store';
import { AbilityBar } from './AbilityBar';
import { GameCanvas } from './GameCanvas';
import { Hud } from './Hud';
import { Overlay } from './Overlay';
import { useGameEngine } from './hooks/useGameEngine';
import { useGameFlow, type GameFlow } from './hooks/useGameFlow';
import { useDemoLevel, useLoadout, useProfile, useTheme } from './hooks/useProfile';
import { PausePanel } from './panels/PausePanel';
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

      {flow.screen === 'onboarding' && (
        <OnboardingScreen profile={profile} onDone={() => flow.go('home')} />
      )}

      {flow.screen === 'home' && (
        <HomeScreen
          profile={profile}
          demoLevel={demoLevel}
          onPick={flow.pickMode}
          onDemo={() => flow.go('demo')}
          onExitDemo={flow.exitDemo}
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
          onBack={() => flow.go('home')}
        />
      )}

      {flow.screen === 'challenges' && (
        <ChallengeScreen
          profile={profile}
          onPick={flow.startChallenge}
          onBack={() => flow.go('home')}
        />
      )}

      {flow.screen === 'tournament' && (
        <TournamentScreen
          profile={profile}
          onPlay={() => flow.startCup()}
          onStart={(tier) => flow.startCup(tier)}
          onAbandon={flow.abandonCup}
          onBack={() => flow.go('home')}
        />
      )}

      {flow.screen === 'profile' && (
        <ProfileScreen
          profile={profile}
          onAchievements={() => flow.go('achievements')}
          onCustomize={() => flow.go('customize')}
          onTalents={() => flow.go('talents')}
          onBack={() => flow.go('home')}
        />
      )}

      {flow.screen === 'talents' && (
        <TalentScreen profile={profile} onBack={() => flow.go('home')} />
      )}

      {flow.screen === 'achievements' && (
        <AchievementsScreen profile={profile} onBack={() => flow.go('home')} />
      )}

      {flow.screen === 'demo' && (
        <DemoScreen
          demoLevel={demoLevel}
          onStart={flow.startDemo}
          onExit={flow.exitDemo}
          onBack={() => flow.go('home')}
        />
      )}

      {flow.screen === 'customize' && (
        <CustomizeScreen profile={profile} onBack={() => flow.go('home')} />
      )}

      {flow.screen === 'result' && flow.result && (
        <ResultScreen
          result={flow.result}
          summary={flow.summary}
          label={snapshot.label}
          onTalents={() => flow.leaveResult('talents')}
          {...resultActions(flow.result, flow)}
        />
      )}

      <Overlay show={paused}>
        <PausePanel
          label={snapshot.label}
          onResume={() => engine?.resume()}
          onRestart={flow.replay}
          onQuit={flow.quitToMenu}
        />
      </Overlay>
    </>
  );
}
