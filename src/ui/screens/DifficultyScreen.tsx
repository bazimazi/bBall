import { SELECTABLE_BOTS } from '../../core/bots/levels';
import type { BotLevelId } from '../../core/bots/types';
import type { PlayerProfile } from '../../core/profile/types';
import { Screen } from '../components/Screen';
import styles from '../Screens.module.css';

interface DifficultyScreenProps {
  profile: PlayerProfile;
  /** Practice runs the same bots without touching progression. */
  practice: boolean;
  onPick: (bot: BotLevelId) => void;
  onBack: () => void;
}

function RankDots({ rank }: { rank: number }) {
  return (
    <span className={styles.rank} aria-label={`Difficulty ${rank} of 5`}>
      {[1, 2, 3, 4, 5].map((step) => (
        <i
          key={step}
          className={step <= rank ? `${styles.rankDot} ${styles.rankOn}` : styles.rankDot}
        />
      ))}
    </span>
  );
}

/** One tap per bot: picking a difficulty starts the match straight away. */
export function DifficultyScreen({ profile, practice, onPick, onBack }: DifficultyScreenProps) {
  const last = practice ? profile.preferences.lastPracticeBot : profile.preferences.lastBot;

  return (
    <Screen
      title={practice ? 'Practice' : 'Quick Match'}
      subtitle={practice ? 'Nothing is recorded' : 'First to 5 wins'}
      onBack={onBack}
    >
      <div className={styles.grid}>
        {SELECTABLE_BOTS.map((bot) => {
          const wins = profile.stats.winsByBot[bot.id] ?? 0;
          return (
            <button
              key={bot.id}
              type="button"
              className={bot.id === last ? `${styles.row} ${styles.selected}` : styles.row}
              onClick={() => onPick(bot.id)}
            >
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{bot.name}</span>
                <span className={styles.rowBlurb}>{bot.blurb}</span>
              </span>
              <span className={styles.rowMeta}>
                <RankDots rank={bot.rank} />
                <span>
                  {practice ? 'Free play' : wins > 0 ? `${wins} won` : `${bot.xpFactor}x XP`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </Screen>
  );
}
