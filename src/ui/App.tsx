import { useCallback, useEffect, useState } from 'react';

import { stageById, stageOpen, STAGES } from '../core/campaign/journey';
import type { MatchResult } from '../core/modes/types';
import { setExitRequestHandler } from '../core/platform/back';
import { exitApp, isNativeShell } from '../core/platform/shell';
import { profileStore } from '../core/profile/store';
import { AbilityBar } from './AbilityBar';
import { GameCanvas } from './GameCanvas';
import { Hud } from './Hud';
import { MatchHud } from './MatchHud';
import { TutorialCoach } from './TutorialCoach';
import { Overlay } from './Overlay';
import { UltimateFlare } from './UltimateFlare';
import { useAccount } from './hooks/useAccount';
import { useAccountLink } from './hooks/useAccountLink';
import { useBackHandler } from './hooks/useBackHandler';
import { useCoarsePointer } from './hooks/useCoarsePointer';
import { useGameEngine } from './hooks/useGameEngine';
import { useGameFlow, type GameFlow } from './hooks/useGameFlow';
import { useDemoLevel, useLoadout, useProfile, useTheme } from './hooks/useProfile';
import { useSettings } from './hooks/useSettings';
import { ExitPanel } from './panels/ExitPanel';
import { PausePanel } from './panels/PausePanel';
import { HomeScreen } from './screens/HomeScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { MenuBoundary } from './components/MenuBoundary';
import {
  AccountScreen,
  AchievementsScreen,
  ChallengeScreen,
  CustomizeScreen,
  DailyScreen,
  GauntletScreen,
  JourneyScreen,
  ModesScreen,
  DemoScreen,
  DifficultyScreen,
  HowToPlayScreen,
  ProfileScreen,
  ResultScreen,
  SettingsScreen,
  TalentScreen,
  TournamentScreen
} from './screens/deferred';

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

  if (result.mode === 'campaign') {
    const journey = profileStore.getSnapshot().progress.journey;
    const played = result.stageId ? stageById(result.stageId) : undefined;
    // After a win, the stage straight after this one - which the win may just
    // have opened - otherwise the same stage again.
    const after = played ? STAGES[STAGES.indexOf(played) + 1] : undefined;
    const next = result.won && after && stageOpen(journey, after) ? after : null;
    return {
      secondaryLabel: 'Journey',
      onSecondary: () => flow.leaveResult('journey'),
      primaryLabel: next ? `Next · ${next.name}` : result.won ? 'Play again' : 'Try again',
      onPrimary: next ? () => flow.startStage(next.id) : flow.replay
    };
  }

  if (result.mode === 'daily') {
    return {
      secondaryLabel: 'Daily',
      onSecondary: () => flow.leaveResult('daily'),
      primaryLabel: result.won ? 'Play again' : 'Try again',
      onPrimary: flow.replay
    };
  }

  if (result.mode === 'run') {
    const run = profileStore.getSnapshot().progress.run;
    if (run && run.offer) {
      return {
        ...menu,
        primaryLabel: 'Choose a boon',
        onPrimary: () => flow.leaveResult('gauntlet')
      };
    }
    if (run) {
      return {
        secondaryLabel: 'Gauntlet',
        onSecondary: () => flow.leaveResult('gauntlet'),
        primaryLabel: 'Rematch',
        onPrimary: flow.playRun
      };
    }
    return { ...menu, primaryLabel: 'Gauntlet', onPrimary: () => flow.leaveResult('gauntlet') };
  }

  if (result.mode === 'versus') {
    return { ...menu, primaryLabel: 'Rematch', onPrimary: flow.replay };
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
  const settings = useSettings();
  const coarse = useCoarsePointer();
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

  useEffect(() => {
    engine?.setPlayerName(profile.name);
  }, [engine, profile.name]);

  // Volumes, camera, vibration and replays: this device's, handed over whole.
  useEffect(() => {
    engine?.setPreferences(settings);
  }, [engine, settings]);

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
        onToggleMute={() => engine?.toggleMute()}
        onPause={() => engine?.pause()}
        serving={playing && !snapshot.tutorialStep && snapshot.status === 'serve'}
        manualServe={!settings.autoServe}
        resumeIn={playing ? snapshot.resumeIn : 0}
        onServe={() => engine?.serve()}
      />

      {playing && !paused && !snapshot.tutorialStep && (
        <MatchHud
          snapshot={snapshot}
          objective={(coarse && snapshot.objectiveTouch) || snapshot.objective}
          onGoals={() => engine?.pause()}
        />
      )}
      {playing && snapshot.tutorialStep && !paused && snapshot.status !== 'resuming' && (
        <TutorialCoach
          snapshot={snapshot}
          onSend={() => engine?.serve()}
          onNext={() => engine?.nextLesson()}
          onPractice={() => flow.startPractice('rookie')}
          onRestart={flow.startTutorial}
          onExit={() => flow.leaveResult('help')}
        />
      )}

      <AbilityBar
        abilities={snapshot.abilities}
        show={playing && (snapshot.status === 'play' || snapshot.status === 'serve')}
        side={settings.skillSide}
        onUse={(slot) => engine?.useAbility(slot)}
      />

      {/* Above the bar and the HUD, so a capstone reaches the whole page and
          not only the part of it the renderer owns. */}
      <UltimateFlare
        castId={snapshot.ultimateCastId}
        hue={snapshot.ultimateHue}
        active={snapshot.ultimateActive}
        show={playing && !paused && snapshot.status !== 'resuming' && settings.effects !== 'calm'}
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
          onModes={() => flow.go('modes')}
          onExitDemo={flow.exitDemo}
          onProfile={() => flow.go('profile')}
          onTalents={() => flow.go('talents')}
          onSettings={() => flow.go('settings')}
          onHelp={() => flow.go('help')}
        />
      )}

      {flow.screen !== 'home' && flow.screen !== 'onboarding' && flow.screen !== 'playing' && (
        <MenuBoundary key={flow.screen} screen={flow.screen} onBack={goBack}>
          {flow.screen === 'modes' && (
            <ModesScreen profile={profile} onPick={flow.pickMode} onBack={flow.back} />
          )}

          {flow.screen === 'help' && (
            <HowToPlayScreen
              onTutorial={flow.startTutorial}
              onPractice={() => flow.startPractice('rookie')}
              onBack={flow.back}
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

          {flow.screen === 'journey' && (
            <JourneyScreen profile={profile} onPlay={flow.startStage} onBack={flow.back} />
          )}

          {flow.screen === 'daily' && (
            <DailyScreen profile={profile} onPlay={flow.startDaily} onBack={flow.back} />
          )}

          {flow.screen === 'gauntlet' && (
            <GauntletScreen
              profile={profile}
              onStart={flow.startRun}
              onPlay={flow.playRun}
              onPick={flow.pickBoon}
              onAbandon={flow.abandonRun}
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
              onSettings={() => flow.go('settings')}
              onDemo={() => flow.go('demo')}
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

          {flow.screen === 'settings' && (
            <SettingsScreen
              onPreview={() => engine?.chime(1)}
              onMusicPreview={engine?.previewMusic ?? (() => {})}
              onStopPreview={engine?.stopAudioPreview ?? (() => {})}
              onBack={flow.back}
            />
          )}

          {flow.screen === 'result' && flow.result && (
            <ResultScreen
              result={flow.result}
              summary={flow.summary}
              label={snapshot.label}
              onHelp={() => flow.go('help')}
              onTutorial={flow.startTutorial}
              onStar={(index) => engine?.chime(index)}
              onTalents={() => flow.leaveResult('talents')}
              {...resultActions(flow.result, flow)}
            />
          )}
        </MenuBoundary>
      )}

      <Overlay show={paused && !leaving}>
        <PausePanel
          label={snapshot.label}
          score={
            !snapshot.tutorialStep && snapshot.winScore > 0
              ? { you: snapshot.scoreYou, bot: snapshot.scoreBot }
              : null
          }
          lives={snapshot.maxLives > 0 ? { left: snapshot.lives, max: snapshot.maxLives } : null}
          onResume={() => engine?.resume()}
          onRestart={flow.replay}
          onQuit={flow.quitToMenu}
          versus={snapshot.mode === 'versus'}
          objective={(coarse && snapshot.objectiveTouch) || snapshot.objective}
          goals={snapshot.goals}
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
