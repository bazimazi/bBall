import { dayKey } from '../../core/progression/xp';
import { QUEST_BONUS_XP, QUEST_XP, questById, questStateFor } from '../../core/quests/quests';
import type { PlayerProfile } from '../../core/profile/types';
import styles from '../Modes.module.css';

interface QuestListProps {
  profile: PlayerProfile;
  /** A heading over the list; omitted on the result card. */
  title?: string;
}

/**
 * Today's three quests, with how far along each one is. A day that has
 * rolled over shows the new day's set at zero rather than yesterday's.
 */
export function QuestList({ profile, title = "Today's quests" }: QuestListProps) {
  const state = questStateFor(profile.progress.quests, dayKey());
  const done = state.done.filter(Boolean).length;

  return (
    <div className={styles.quests}>
      <div className={styles.questHead}>
        <span>{title}</span>
        <span>
          {done === state.ids.length
            ? `All done · +${QUEST_BONUS_XP} bonus`
            : `${done} / ${state.ids.length}`}
        </span>
      </div>
      {state.ids.map((id, i) => {
        const quest = questById(id);
        if (!quest) return null;
        const progress = state.progress[i] ?? 0;
        const complete = state.done[i] ?? false;
        return (
          <div key={id} className={complete ? `${styles.quest} ${styles.questDone}` : styles.quest}>
            <span>{quest.label}</span>
            <span className={styles.questXp}>
              {complete ? '✓' : `${progress}/${quest.target}`} · {QUEST_XP[quest.tier]} XP
            </span>
            <span className={styles.questBar}>
              <span
                className={styles.questFill}
                style={{ transform: `scaleX(${Math.min(1, progress / quest.target)})` }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}
