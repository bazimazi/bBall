import { botProfile } from '../../core/bots/levels';
import { MODES, type ModeInfo } from '../../core/modes/catalog';
import { CHALLENGES } from '../../core/modes/challenges';
import type { ModeId } from '../../core/modes/types';
import { levelOf } from '../../core/progression/levels';
import type { PlayerProfile } from '../../core/profile/types';
import { roundFor, tierForLevel } from '../../core/tournament/bracket';
import { Screen } from '../components/Screen';
import modes from '../Modes.module.css';
import styles from '../Screens.module.css';

interface ModesScreenProps {
  profile: PlayerProfile;
  onPick: (mode: ModeId) => void;
  onBack: () => void;
}

/** The modes Home already has a card for, so this list skips them. */
const HOME_MODES: readonly ModeId[] = ['campaign', 'daily', 'run'];

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
    case 'versus':
      return '2 players';
    case 'practice':
      return 'No XP';
    default:
      return '';
  }
}

/**
 * Every mode Home does not feature, one row each. Home stays down to a Play
 * button and a couple of cards; the rest of the game lives one tap away here.
 */
export function ModesScreen({ profile, onPick, onBack }: ModesScreenProps) {
  return (
    <Screen title="More modes" subtitle="Quick games, cups and couch play" onBack={onBack}>
      <div className={`${styles.grid} ${modes.stagger}`}>
        {MODES.filter((mode) => !HOME_MODES.includes(mode.id)).map((mode) => (
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
    </Screen>
  );
}
