import { t } from '../core/i18n/index';
import type { Ref } from 'react';

import styles from './GameCanvas.module.css';

interface GameCanvasProps {
  ref: Ref<HTMLCanvasElement>;
}

/** The playfield. Everything inside it is drawn by the engine, not by React. */
export function GameCanvas({ ref }: GameCanvasProps) {
  return (
    <canvas
      dir="ltr"
      ref={ref}
      className={styles.canvas}
      role="img"
      aria-label={t('bBall playfield')}
      tabIndex={-1}
    />
  );
}
