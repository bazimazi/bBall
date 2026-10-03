import type { MatchCoaching } from '../../core/modes/coaching';
import styles from '../Screens.module.css';
import coachStyles from './ResultCoaching.module.css';

interface ResultCoachingProps {
  coaching: MatchCoaching;
  onTutorial: () => void;
  onHelp: () => void;
}

/** A suggestion in the result card; retry remains the pinned primary action. */
export function ResultCoaching({ coaching, onTutorial, onHelp }: ResultCoachingProps) {
  const lesson = coaching.help === 'lesson';
  return (
    <section className={`${styles.card} ${coachStyles.card}`} aria-labelledby="next-attempt-title">
      <p className={coachStyles.caption}>Next attempt</p>
      <h3 id="next-attempt-title">{coaching.title}</h3>
      <p className={coachStyles.evidence}>{coaching.evidence}</p>
      <p>{coaching.tip}</p>
      <button type="button" className={styles.ghost} onClick={lesson ? onTutorial : onHelp}>
        {lesson ? 'Try the first-rally lesson' : 'Review technique'}
      </button>
    </section>
  );
}
