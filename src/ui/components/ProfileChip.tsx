import { t, msg } from '../../core/i18n/index';
import { levelFromXp } from '../../core/progression/levels';
import type { PlayerProfile } from '../../core/profile/types';
import styles from '../Screens.module.css';
import { Avatar } from './Avatar';
import { XpBar } from './XpBar';

interface ProfileChipProps {
  profile: PlayerProfile;
  onClick: () => void;
}

/** The player's identity and level, and the way into the profile screen. */
export function ProfileChip({ profile, onClick }: ProfileChipProps) {
  const info = levelFromXp(profile.xp);

  return (
    <button type="button" className={styles.chip} onClick={onClick}>
      <Avatar avatar={profile.avatar} />
      <span className={styles.chipText}>
        <span className={styles.chipName}>
          <bdi>{profile.name}</bdi>
        </span>
        <XpBar xp={profile.xp} labels={false} />
        <span className={styles.xpMeta}>
          <span>
            {t('Level ')}
            {t(info.level)}
          </span>
          <span>{t(msg('{0} / {1} XP', [t(info.into), t(info.span)]))}</span>
        </span>
      </span>
    </button>
  );
}
