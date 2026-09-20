import { botProfile } from '../../core/bots/levels';
import { MODES, type ModeInfo } from '../../core/modes/catalog';
import { CHALLENGES } from '../../core/modes/challenges';
import type { ModeId } from '../../core/modes/types';
import { levelOf } from '../../core/progression/levels';
import type { PlayerProfile } from '../../core/profile/types';
import { roundFor, tierById, tierForLevel } from '../../core/tournament/bracket';
import { ProfileChip } from '../components/ProfileChip';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import styles from '../Screens.module.css';

interface HomeScreenProps {
  profile: PlayerProfile;
  onPick: (mode: ModeId) => void;
  onProfile: () => void;
  onTalents: () => void;
  onAchievements: () => void;
  onCustomize: () => void;
}

/** A one-line hint per mode, so nothing needs a sub-menu to be understood. */
function metaFor(mode: ModeInfo, profile: PlayerProfile): string {
  switch (mode.id) {
    case 'quick':
      return botProfile(profile.preferences.lastBot).name;
    case 'endless':
      return profile.stats.endlessBest > 0 ? `Best ${profile.stats.endlessBest}` : '3 lives';
    case 'challenge': {
      const cleared = CHALLENGES.filter((item) => profile.challenges[item.id]?.cleared).length;
      return `${cleared} / ${CHALLENGES.length}`;
    }
    case 'tournament': {
      const active = profile.tournament;
      if (active) return roundFor(active.round).name;
      return tierForLevel(levelOf(profile.xp)).name;
    }
    case 'practice':
      return 'No XP';
  }
}

export function HomeScreen({
  profile,
  onPick,
  onProfile,
  onTalents,
  onAchievements,
  onCustomize
}: HomeScreenProps) {
  const coarse = useCoarsePointer();
  const cup = profile.tournament ? tierById(profile.tournament.tier) : null;
  const points = profile.talents.points;
  const skills = profile.talents.equipped.filter(Boolean).length;

  return (
    <section className={styles.screen}>
      <h1 className={styles.logo}>
        <span>b</span>Ball
      </h1>
      <p className={styles.tagline}>{cup ? `${cup.name} in progress` : 'Pick a mode and play'}</p>

      <div className={styles.body}>
        <div className={styles.stack}>
          <ProfileChip profile={profile} onClick={onProfile} />

          <div className={styles.grid}>
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={styles.row}
                onClick={() => onPick(mode.id)}
              >
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{mode.name}</span>
                  <span className={styles.rowBlurb}>{mode.blurb}</span>
                </span>
                <span className={styles.rowMeta}>{metaFor(mode, profile)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <footer className={styles.footer}>
        <button type="button" className={styles.ghost} onClick={onTalents}>
          Talents
          {points > 0 && <span className={styles.badge}>{points}</span>}
        </button>
        <div className={styles.buttonRow}>
          <button type="button" className={styles.ghost} onClick={onAchievements}>
            Achievements
          </button>
          <button type="button" className={styles.ghost} onClick={onCustomize}>
            Customise
          </button>
        </div>
        <p className={styles.note}>
          {coarse ? 'Drag anywhere to move' : 'Move the mouse or use ↑ ↓'}
          {skills > 0 && (coarse ? ' · tap the corner for skills' : ' · 1 2 3 for skills')}
        </p>
      </footer>
    </section>
  );
}
