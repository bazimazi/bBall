import { t, msg } from '../../core/i18n/index';
import { dayKey } from '../../core/progression/xp';
import { QUEST_BONUS_XP, QUEST_XP, questById, questStateFor } from '../../core/quests/quests';
import type { PlayerProfile } from '../../core/profile/types';
import styles from '../Modes.module.css';

interface QuestListProps {
  profile: PlayerProfile;
  /** A heading over the list; omitted on the result card. */
  title?: string;
  /** A Daily preview supplies its own clock so its quests show the same day. */
  day?: string;
}

/**
 * Today's three quests, with how far along each one is. A day that has
 * rolled over shows the new day's set at zero rather than yesterday's.
 */
export function QuestList({ profile, title = "Today's quests", day = dayKey() }: QuestListProps) {
  const state = questStateFor(profile.progress.quests, day);
  const done = state.done.filter(Boolean).length;

  return (
    <div className={styles.quests}>
      <div className={styles.questHead}>
        <span>{t(title)}</span>
        <span>
          {t(
            done === state.ids.length
              ? msg('All done · +{0} bonus', [t(QUEST_BONUS_XP)])
              : msg('{0} / {1}', [t(done), t(state.ids.length)])
          )}
        </span>
      </div>
      {state.ids.map((id, i) => {
        const quest = questById(id);
        if (!quest) return null;
        const progress = state.progress[i] ?? 0;
        const complete = state.done[i] ?? false;
        return (
          <div key={id} className={complete ? `${styles.quest} ${styles.questDone}` : styles.quest}>
            <span>{t(quest.label)}</span>
            <span className={styles.questXp}>
              {t(complete ? '✓' : msg('{0}/{1}', [t(progress), t(quest.target)]))}
              {t(' · ')}
              {t(QUEST_XP[quest.tier])}
              {t(' XP')}
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
