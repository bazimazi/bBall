import { t } from '../../core/i18n/index';
import type { GoalView } from '../../game/types';
import styles from './GoalList.module.css';
import { GOAL_STATUS } from './goalStatus';

export function GoalList({ goals }: { goals: readonly GoalView[] }) {
  if (goals.length === 0) return null;
  return (
    <div className={styles.goals}>
      <h3>{t('Star goals')}</h3>
      <ul>
        {goals.map((goal) => (
          <li key={goal.id}>
            <span>{t(goal.label)}</span>
            <small>
              {t(goal.progress)}
              {t(' · ')}
              {t(GOAL_STATUS[goal.state])}
            </small>
          </li>
        ))}
      </ul>
    </div>
  );
}
