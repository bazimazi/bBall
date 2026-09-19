import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { GameEngine, idleSnapshot } from '../../game/engine';
import type { GameSnapshot } from '../../game/types';

const noop = () => () => {};

export interface UseGameEngine {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  snapshot: GameSnapshot;
  engine: GameEngine | null;
}

/**
 * Creates one {@link GameEngine} for the mounted canvas and exposes its state
 * as a React store. The engine keeps running on its own animation frame; the
 * component only re-renders when the snapshot it shows actually changes.
 */
export function useGameEngine(): UseGameEngine {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<GameEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const instance = new GameEngine(canvas);
    const dispose = instance.start();
    setEngine(instance);

    return () => {
      dispose();
      setEngine(null);
    };
  }, []);

  const subscribe = useCallback(
    (onChange: () => void) => (engine ? engine.subscribe(onChange) : noop()),
    [engine]
  );
  const getSnapshot = useCallback(() => engine?.getSnapshot() ?? idleSnapshot(), [engine]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return { canvasRef, snapshot, engine };
}
