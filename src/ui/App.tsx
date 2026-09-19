import { GameCanvas } from './GameCanvas';
import { Hud } from './Hud';
import { Overlay } from './Overlay';
import { useGameEngine } from './hooks/useGameEngine';

/**
 * The canvas owns the game; React owns the chrome around it. Everything the
 * UI shows arrives as an immutable snapshot, and every action it takes is an
 * engine command.
 */
export function App() {
  const { canvasRef, snapshot, engine } = useGameEngine();

  return (
    <>
      <GameCanvas ref={canvasRef} />
      <Hud
        muted={snapshot.muted}
        canPause={snapshot.canPause}
        onToggleMute={() => engine?.toggleMute()}
        onPause={() => engine?.pause()}
      />
      <Overlay
        snapshot={snapshot}
        onPlay={() => engine?.newMatch()}
        onResume={() => engine?.resume()}
        onQuit={() => engine?.quitToMenu()}
      />
    </>
  );
}
