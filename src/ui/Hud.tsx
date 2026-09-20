import type { MouseEvent, ReactNode } from 'react';

import styles from './Hud.module.css';
import { PauseIcon } from './icons/PauseIcon';
import { SoundIcon } from './icons/SoundIcon';

interface HudProps {
  muted: boolean;
  canPause: boolean;
  /** The objective of the match in play, if it has one. */
  label?: string | null;
  onToggleMute: () => void;
  onPause: () => void;
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
export function Hud({ muted, canPause, label, onToggleMute, onPause }: HudProps) {
  return (
    <>
      {label && <p className={styles.label}>{label}</p>}
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
    </>
  );
}
