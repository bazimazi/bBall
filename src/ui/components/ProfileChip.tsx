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
        <span className={styles.chipName}>{profile.name}</span>
        <XpBar xp={profile.xp} labels={false} />
        <span className={styles.xpMeta}>
          <span>Level {info.level}</span>
          <span>{info.maxed ? 'Max level' : `${info.into} / ${info.span} XP`}</span>
        </span>
      </span>
    </button>
  );
}
