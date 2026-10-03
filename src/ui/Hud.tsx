import type { MouseEvent, ReactNode } from 'react';

import styles from './Hud.module.css';
import { PauseIcon } from './icons/PauseIcon';
import { SoundIcon } from './icons/SoundIcon';
import { useSettings } from './hooks/useSettings';
import { useCoarsePointer } from './hooks/useCoarsePointer';
import { keyList } from '../core/settings/controls';

interface HudProps {
  muted: boolean;
  canPause: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  serving?: boolean;
  manualServe?: boolean;
  resumeIn?: number;
  onServe?: () => void;
}

interface IconButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
}

/**
 * A pointer click must not leave focus parked on an icon button, or Space
 * would keep activating it instead of serving. Keyboard activation (detail 0)
 * deliberately keeps focus where it is.
 */
function IconButton({ label, onClick, children, pressed }: IconButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) event.currentTarget.blur();
    onClick();
  };

  return (
    <button
      type="button"
      className={styles.button}
      aria-label={label}
      aria-pressed={pressed}
      onClick={handleClick}
    >
      {children}
    </button>
  );
}

/** Sound and pause controls, floating above everything else. */
export function Hud({
  muted,
  canPause,
  onToggleMute,
  onPause,
  serving,
  manualServe,
  resumeIn = 0,
  onServe
}: HudProps) {
  const { keyBindings } = useSettings();
  const coarse = useCoarsePointer();
  return (
    <>
      <div className={styles.hud}>
        <IconButton
          label={muted ? 'Unmute sound' : 'Mute sound'}
          pressed={muted}
          onClick={onToggleMute}
        >
          <SoundIcon muted={muted} />
        </IconButton>

        {canPause && (
          <IconButton label="Pause game" onClick={onPause}>
            <PauseIcon />
          </IconButton>
        )}
      </div>
      {resumeIn > 0 && (
        <div className={styles.countdown} role="status" aria-live="polite" aria-atomic="true">
          <span>Ready</span>
          <strong>{resumeIn}</strong>
        </div>
      )}
      {serving && onServe && (
        <button type="button" className={styles.serve} onClick={onServe}>
          {manualServe ? 'Serve when ready' : 'Serve now'}
          <span>{coarse ? 'Tap' : keyList(keyBindings, 'serve')}</span>
        </button>
      )}
    </>
  );
}
