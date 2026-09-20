import { botProfile } from '../../core/bots/levels';
import { CHALLENGES } from '../../core/modes/challenges';
import type { PlayerProfile } from '../../core/profile/types';
import { Screen } from '../components/Screen';
import styles from '../Screens.module.css';

interface ChallengeScreenProps {
  profile: PlayerProfile;
  onPick: (id: string) => void;
  onBack: () => void;
}

export function ChallengeScreen({ profile, onPick, onBack }: ChallengeScreenProps) {
  const cleared = CHALLENGES.filter((item) => profile.challenges[item.id]?.cleared).length;

  return (
    <Screen
      title="Challenge"
      subtitle={`${cleared} of ${CHALLENGES.length} cleared`}
      onBack={onBack}
    >
      <div className={styles.grid}>
        {CHALLENGES.map((challenge) => {
          const record = profile.challenges[challenge.id];
          const done = record?.cleared ?? false;
          return (
            <button
              key={challenge.id}
              type="button"
              className={styles.row}
              onClick={() => onPick(challenge.id)}
            >
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>
                  {challenge.name}
                  {done ? ' ✓' : ''}
                </span>
                <span className={styles.rowBlurb}>{challenge.blurb}</span>
                <span className={styles.rowBlurb}>
                  {challenge.objective.label} · vs {botProfile(challenge.bot).name}
                </span>
              </span>
              <span className={done ? `${styles.rowMeta} ${styles.done}` : styles.rowMeta}>
                {done ? 'Cleared' : `${challenge.xp} XP`}
              </span>
            </button>
          );
        })}
      </div>
    </Screen>
  );
}
