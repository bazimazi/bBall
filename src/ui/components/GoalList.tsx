import type { GoalView } from '../../game/types';
import styles from './GoalList.module.css';

const STATUS = {
  active: 'In progress',
  reached: 'Target reached · win to earn',
  missed: 'Missed this match',
  earned: 'Star earned'
};

export function GoalList({ goals }: { goals: readonly GoalView[] }) {
  if (goals.length === 0) return null;
  return (
    <div className={styles.goals}>
      <h3>Star goals</h3>
      <ul>
        {goals.map((goal) => (
          <li key={goal.id}>
            <span>{goal.label}</span>
            <small>
              {goal.progress} · {STATUS[goal.state]}
            </small>
          </li>
        ))}
      </ul>
    </div>
  );
}
