import { useEffect, useMemo, useState } from 'react';

import { levelFromXp } from '../../core/progression/levels';
import styles from '../Screens.module.css';

interface XpBarProps {
  xp: number;
  /**
   * XP before the match. When given, the bar animates from there to `xp`,
   * which is what makes the result card feel like a reward rather than a
   * table of numbers.
   */
  from?: number;
  /** Show the "Level n" / "x / y XP" line under the bar. */
  labels?: boolean;
}

export function XpBar({ xp, from, labels = true }: XpBarProps) {
  const info = levelFromXp(xp);

  const start = useMemo(() => {
    if (from === undefined) return info.progress;
    const before = levelFromXp(from);
    // A level-up rewinds the bar to empty, then fills it again.
    return before.level === info.level ? before.progress : 0;
  }, [from, info.level, info.progress]);

  const [fill, setFill] = useState(start);

  useEffect(() => {
    // One tick after mount so the CSS transition has something to animate.
    const id = window.setTimeout(() => setFill(info.progress), 80);
    return () => window.clearTimeout(id);
  }, [info.progress]);

  return (
    <div>
      <div
        className={styles.xpTrack}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(info.progress * 100)}
        aria-label={`Level ${info.level} progress`}
      >
        <div className={styles.xpFill} style={{ width: `${Math.round(fill * 100)}%` }} />
      </div>
      {labels && (
        <p className={styles.xpMeta} style={{ marginTop: 5 }}>
          <span>Level {info.level}</span>
          <span>{`${info.into} / ${info.span} XP`}</span>
        </p>
      )}
    </div>
  );
}
