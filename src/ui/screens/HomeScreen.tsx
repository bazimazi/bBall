import { abilitySlotsForLevel } from '../../core/balance/config';
import { botProfile } from '../../core/bots/levels';
import { MODES, type ModeInfo } from '../../core/modes/catalog';
import { CHALLENGES } from '../../core/modes/challenges';
import type { ModeId } from '../../core/modes/types';
import { levelOf } from '../../core/progression/levels';
import type { PlayerProfile } from '../../core/profile/types';
import { roundFor, tierById, tierForLevel } from '../../core/tournament/bracket';
import type { AccountState } from '../../core/account/store';
import { ProfileChip } from '../components/ProfileChip';
import { SyncBadge } from '../components/SyncBadge';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import accountStyles from '../Account.module.css';
import styles from '../Screens.module.css';

interface HomeScreenProps {
  profile: PlayerProfile;
  account: AccountState;
  /** The level being demoed, or null when the real save is in play. */
  demoLevel: number | null;
  onPick: (mode: ModeId) => void;
  onDemo: () => void;
  onExitDemo: () => void;
  onAccount: () => void;
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
  account,
  demoLevel,
  onPick,
  onDemo,
  onExitDemo,
  onAccount,
  onProfile,
  onTalents,
  onAchievements,
  onCustomize
}: HomeScreenProps) {
  const coarse = useCoarsePointer();
  const cup = profile.tournament ? tierById(profile.tournament.tier) : null;
  const points = profile.talents.points;
  const skills = profile.talents.equipped.filter(Boolean).length;
  // The hint lists exactly the keys this level has slots for.
  const keys = Array.from({ length: abilitySlotsForLevel(levelOf(profile.xp)) }, (_, i) => i + 1);

  return (
    <section className={styles.screen}>
      <h1 className={styles.logo}>
        <span>b</span>Ball
      </h1>
      <p className={styles.tagline}>
        {demoLevel !== null
          ? 'Demo · nothing is saved'
          : cup
            ? `${cup.name} in progress`
            : 'Pick a mode and play'}
      </p>

      <div className={styles.body}>
        <div className={styles.stack}>
          {demoLevel !== null && (
            <div className={styles.demoBar}>
              <span>Demo · level {demoLevel}</span>
              <button type="button" className={styles.demoExit} onClick={onExitDemo}>
                Exit
              </button>
            </div>
          )}

          <ProfileChip profile={profile} onClick={onProfile} />

          {/* One row, always in the same place: signed in or not, a player can
              see at a glance where their progress is going. Demo mode hides it,
              because nothing a demo does is saved anywhere. */}
          {demoLevel === null && (
            <button type="button" className={accountStyles.entry} onClick={onAccount}>
              <span className={accountStyles.entryText}>
                {account.status === 'authenticated'
                  ? (account.email ?? 'Your account')
                  : 'Sign in or create an account'}
              </span>
              <span className={accountStyles.entryMeta}>
                {account.status === 'authenticated' ? 'Account' : 'Optional'}
              </span>
            </button>
          )}

          {demoLevel === null && <SyncBadge account={account} />}

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
        <button type="button" className={styles.ghost} onClick={onDemo}>
          {demoLevel === null ? 'Demo a level' : 'Change demo level'}
        </button>
        <p className={styles.note}>
          {coarse ? 'Drag anywhere to move' : 'Move the mouse or use ↑ ↓'}
          {skills > 0 &&
            (coarse ? ' · tap the corner for skills' : ` · ${keys.join(' ')} for skills`)}
        </p>
      </footer>
    </section>
  );
}
