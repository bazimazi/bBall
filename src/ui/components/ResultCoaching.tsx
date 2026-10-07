import { t } from '../../core/i18n/index';
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
      <p className={coachStyles.caption}>{t('Next attempt')}</p>
      <h3 id="next-attempt-title">{t(coaching.title)}</h3>
      <p className={coachStyles.evidence}>{t(coaching.evidence)}</p>
      <p>{t(coaching.tip)}</p>
      <button type="button" className={styles.ghost} onClick={lesson ? onTutorial : onHelp}>
        {t(lesson ? 'Try the first-rally lesson' : 'Review technique')}
      </button>
    </section>
  );
}
