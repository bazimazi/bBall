import { levelOf } from '../../core/progression/levels';
import { MASTERY_TRACKS, MASTERY_CYCLE } from '../../core/progression/mastery';
import { useState } from 'react';

import { ACHIEVEMENTS } from '../../core/achievements/catalog';
import { cleanName, NAME_MAX } from '../../core/profile/defaults';
import { setIdentity } from '../../core/account/progression';
import { profileStore } from '../../core/profile/store';
import { AVATARS, type AvatarId, type PlayerProfile } from '../../core/profile/types';
import type { AccountState } from '../../core/account/store';
import { Avatar } from '../components/Avatar';
import { Screen } from '../components/Screen';
import { ConfirmAction } from '../components/ConfirmAction';
import { SyncBadge } from '../components/SyncBadge';
import { XpBar } from '../components/XpBar';
import { useDemoLevel } from '../hooks/useProfile';
import styles from '../Screens.module.css';

interface ProfileScreenProps {
  profile: PlayerProfile;
  account: AccountState;
  onAccount: () => void;
  onAchievements: () => void;
  onCustomize: () => void;
  onSettings: () => void;
  onDemo: () => void;
  onBack: () => void;
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function playTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Unmount on account/demo changes so a previous reset request cannot become active again. */
function GuestReset({ onReset }: { onReset: () => void }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`${styles.ghost} ${styles.danger}`}
        onClick={() => setShow(true)}
      >
        Reset progress
      </button>
      <ConfirmAction
        show={show}
        title="Reset guest progress?"
        description="This erases this device's guest profile and starts over. XP, records, Journey stars, talents, achievements and cosmetic unlocks will be lost. This cannot be undone. Device settings stay."
        cancelLabel="Keep progress"
        confirmLabel="Erase guest progress"
        onCancel={() => setShow(false)}
        onConfirm={() => {
          setShow(false);
          onReset();
        }}
      />
    </>
  );
}

export function ProfileScreen({
  profile,
  account,
  onAccount,
  onAchievements,
  onCustomize,
  onSettings,
  onDemo,
  onBack
}: ProfileScreenProps) {
  const [nameDraft, setNameDraft] = useState({
    owner: profile.id,
    saved: profile.name,
    value: profile.name
  });
  const edited = nameDraft.value !== nameDraft.saved;
  // Follow new names while untouched, retain edits only for the same player.
  // Adjust before commit so a replaced profile never displays another player's draft.
  if (nameDraft.owner !== profile.id || nameDraft.saved !== profile.name) {
    setNameDraft({
      owner: profile.id,
      saved: profile.name,
      value: nameDraft.owner === profile.id && edited ? nameDraft.value : profile.name
    });
  }
  const demoLevel = useDemoLevel();

  const stats = profile.stats;
  const talents = profile.talents.stats;
  const played = stats.matches;
  const winRate = played > 0 ? Math.round((stats.wins / played) * 100) : 0;
  const earned = Object.keys(profile.achievements).length;

  const saveIdentity = (avatar?: AvatarId) => {
    const current = profileStore.getSnapshot();
    // A restore/sign-out may arrive before React has committed its next render.
    if (current.id !== nameDraft.owner) return;
    const name = edited ? cleanName(nameDraft.value) : current.name;
    const nextAvatar = avatar ?? current.avatar;
    if (name !== current.name || nextAvatar !== current.avatar) setIdentity(name, nextAvatar);
    setNameDraft({ owner: current.id, saved: name, value: name });
  };

  return (
    <Screen title="Profile" onBack={onBack}>
      <div className={styles.card} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Avatar avatar={profile.avatar} large />
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <input
            className={styles.input}
            value={nameDraft.value}
            maxLength={NAME_MAX}
            aria-label="Player name"
            onChange={(event) => setNameDraft({ ...nameDraft, value: event.target.value })}
            onBlur={() => saveIdentity()}
            onKeyDown={(event) => {
              // IME confirmation can arrive just after compositionend with keyCode 229.
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                event.nativeEvent.keyCode !== 229
              ) {
                event.currentTarget.blur();
              }
            }}
          />
        </div>
      </div>

      <div className={styles.card}>
        <XpBar xp={profile.xp} />
      </div>

      {demoLevel === null && (
        <>
          <p className={styles.sectionLabel}>Account</p>
          <button type="button" className={styles.ghost} onClick={onAccount}>
            {account.status === 'authenticated' ? (account.email ?? 'Account') : 'Sign in'}
            {account.pending > 0 && <span className={styles.badge}>{account.pending}</span>}
          </button>
          <SyncBadge account={account} showGuest />
        </>
      )}

      <p className={styles.sectionLabel}>Avatar</p>
      <div className={styles.swatchGrid}>
        {AVATARS.map((avatar) => (
          <button
            key={avatar}
            type="button"
            className={
              avatar === profile.avatar ? `${styles.swatch} ${styles.selected}` : styles.swatch
            }
            aria-label={`Avatar ${avatar}`}
            aria-pressed={avatar === profile.avatar}
            onClick={() => saveIdentity(avatar)}
          >
            <Avatar avatar={avatar} />
          </button>
        ))}
      </div>

      <p className={styles.sectionLabel}>Record</p>
      <div className={styles.card}>
        <p className={styles.sectionLabel}>Mastery</p>
        <p className={styles.note}>
          Rank {Math.max(0, Math.floor((levelOf(profile.xp) - 50) / 5))} · Frontier{' '}
          {profile.progress.journey['frontier-v2'] ?? 0} · {profile.progress.contracts ?? 0}{' '}
          contracts · {profile.progress.dailyMaster.clears} Master Daily clears. Combat points cap
          at level 50; mastery unlocks achievements, records and colours.
        </p>
      </div>
      <details className={styles.card}>
        <summary>Technique, school, court and build mastery</summary>
        <p className={styles.rowBlurb}>
          Win scored matches against Pro or harder opponents. Relevant actions earn marks; every 250
          marks opens another numbered cycle. Combat power stays capped.
        </p>
        {MASTERY_TRACKS.map((t) => {
          const marks = profile.progress.mastery[t.id] ?? 0;
          return (
            <p className={styles.rowBlurb} key={t.id}>
              {t.name} · cycle {Math.floor(marks / MASTERY_CYCLE) + 1} · {marks % MASTERY_CYCLE}/
              {MASTERY_CYCLE} marks
            </p>
          );
        })}
      </details>
      <div className={styles.stats}>
        <Stat value={played} label="Matches" />
        <Stat value={stats.wins} label="Wins" />
        <Stat value={`${winRate}%`} label="Win rate" />
        <Stat value={stats.bestRally} label="Best rally" />
        <Stat value={stats.endlessBest} label="Endless" />
        <Stat value={stats.bestStreak} label="Streak" />
        <Stat value={stats.cupsWon} label="Cups won" />
        <Stat value={stats.challengesCleared} label="Challenges" />
        <Stat value={playTime(stats.playSeconds)} label="Played" />
      </div>

      <p className={styles.sectionLabel}>Build</p>
      <div className={styles.stats}>
        <Stat value={profile.talents.points} label="Points" />
        <Stat value={talents.bestDrive} label="Best drive" />
        <Stat value={talents.abilitiesUsed} label="Skills used" />
        <Stat value={talents.crits} label="Criticals" />
        <Stat value={talents.shieldSaves} label="Shields" />
        <Stat value={talents.perfectGuards} label="Guards" />
      </div>

      <div className={styles.buttonRow}>
        <button type="button" className={styles.ghost} onClick={onAchievements}>
          Achievements {earned}/{ACHIEVEMENTS.length}
        </button>
        <button type="button" className={styles.ghost} onClick={onCustomize}>
          Customise
        </button>
      </div>
      <button type="button" className={styles.ghost} onClick={onSettings}>
        Settings
      </button>

      {demoLevel !== null ? (
        // There is nothing here to erase: a demo profile is never written.
        <p className={styles.note}>Demo profile · level {demoLevel}. Nothing here is saved.</p>
      ) : account.status !== 'guest' ? (
        // The server owns this save, so wiping the local copy would achieve
        // nothing but a re-download. Deleting the account is the real action,
        // and it lives on the account screen where it can be confirmed.
        <p className={styles.note}>
          {account.status === 'authenticated'
            ? 'This progress lives on your account. To erase it, delete the account from the account screen.'
            : 'Restoring your account. Progress reset is unavailable until this finishes.'}
        </p>
      ) : (
        <GuestReset
          key={profile.id}
          onReset={() => {
            profileStore.reset();
          }}
        />
      )}

      <button type="button" className={styles.ghost} onClick={onDemo}>
        {demoLevel === null ? 'Demo a level' : 'Change demo level'}
      </button>
    </Screen>
  );
}
