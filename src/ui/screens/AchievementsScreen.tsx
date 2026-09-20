import { ACHIEVEMENTS } from '../../core/achievements/catalog';
import { levelOf } from '../../core/progression/levels';
import type { PlayerProfile } from '../../core/profile/types';
import { Screen } from '../components/Screen';
import styles from '../Screens.module.css';

interface AchievementsScreenProps {
  profile: PlayerProfile;
  onBack: () => void;
}

export function AchievementsScreen({ profile, onBack }: AchievementsScreenProps) {
  const context = { profile, level: levelOf(profile.xp), result: null };
  const earned = Object.keys(profile.achievements).length;

  // Unlocked first, then whatever the player is closest to finishing.
  const ordered = [...ACHIEVEMENTS].sort((a, b) => {
    const aDone = profile.achievements[a.id] !== undefined ? 1 : 0;
    const bDone = profile.achievements[b.id] !== undefined ? 1 : 0;
    if (aDone !== bDone) return bDone - aDone;
    return (b.progress?.(context) ?? 0) - (a.progress?.(context) ?? 0);
  });

  return (
    <Screen
      title="Achievements"
      subtitle={`${earned} of ${ACHIEVEMENTS.length} unlocked`}
      onBack={onBack}
    >
      {ordered.map((achievement) => {
        const done = profile.achievements[achievement.id] !== undefined;
        const progress = done ? 1 : (achievement.progress?.(context) ?? 0);
        return (
          <div
            key={achievement.id}
            className={
              done ? styles.achievement : `${styles.achievement} ${styles.achievementLocked}`
            }
          >
            <span className={done ? `${styles.tick} ${styles.tickOn}` : styles.tick}>
              {done ? '✓' : '·'}
            </span>
            <span className={styles.rowText}>
              <span className={styles.rowTitle}>{achievement.name}</span>
              <span className={styles.rowBlurb}>{achievement.description}</span>
              {!done && progress > 0 && (
                <span className={styles.miniTrack}>
                  <span
                    className={styles.miniFill}
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </span>
              )}
            </span>
            {achievement.xp > 0 && <span className={styles.rowMeta}>{achievement.xp} XP</span>}
          </div>
        );
      })}
    </Screen>
  );
}
