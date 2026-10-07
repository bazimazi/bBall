import { t, msg } from '../../core/i18n/index';
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
import { MenuDisclosure } from '../components/MenuDisclosure';
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
  onWorkshop?: () => void;
  onSettings: () => void;
  onDemo: () => void;
  onBack: () => void;
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue}>{t(value)}</div>
      <div className={styles.statLabel}>{t(label)}</div>
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
        {t('Reset progress')}
      </button>
      <ConfirmAction
        show={show}
        title={t('Reset guest progress?')}
        description={t(
          "This erases this device's guest profile and starts over. XP, records, Journey stars, talents, achievements and cosmetic unlocks will be lost. This cannot be undone. Device settings stay."
        )}
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
  onWorkshop,
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
    <Screen title={t('Profile')} onBack={onBack}>
      <div className={styles.card} style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Avatar avatar={profile.avatar} large />
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <input
            className={styles.input}
            value={nameDraft.value}
            dir="auto"
            maxLength={NAME_MAX}
            aria-label={t('Player name')}
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
          <p className={styles.sectionLabel}>{t('Account')}</p>
          <button type="button" className={styles.ghost} onClick={onAccount}>
            {account.status === 'authenticated' ? (
              <bdi dir="ltr">{account.email ?? t('Account')}</bdi>
            ) : (
              t('Sign in')
            )}
            {account.pending > 0 && <span className={styles.badge}>{t(account.pending)}</span>}
          </button>
          <SyncBadge account={account} showGuest />
        </>
      )}

      <p className={styles.sectionLabel}>{t('Avatar')}</p>
      <div className={styles.swatchGrid}>
        {AVATARS.map((avatar) => (
          <button
            key={avatar}
            type="button"
            className={
              avatar === profile.avatar ? `${styles.swatch} ${styles.selected}` : styles.swatch
            }
            aria-label={t(msg('Avatar {0}', [t(avatar)]))}
            aria-pressed={avatar === profile.avatar}
            onClick={() => saveIdentity(avatar)}
          >
            <Avatar avatar={avatar} />
          </button>
        ))}
      </div>

      <p className={styles.sectionLabel}>{t('Record')}</p>
      <div className={styles.stats}>
        <Stat value={played} label={t('Matches')} />
        <Stat value={stats.wins} label={t('Wins')} />
        <Stat value={`${winRate}%`} label={t('Win rate')} />
        <Stat value={stats.bestRally} label={t('Best rally')} />
        <Stat value={stats.endlessBest} label={t('Legacy Endless')} />
        <Stat value={stats.bestStreak} label={t('Streak')} />
        <Stat value={stats.cupsWon} label={t('Cups won')} />
        <Stat value={stats.challengesCleared} label={t('Challenges')} />
        <Stat value={playTime(stats.playSeconds)} label={t('Played')} />
      </div>

      <MenuDisclosure
        title={t('Mastery')}
        hint={t(
          msg('Rank {0} · technique, schools, courts & builds', [
            t(Math.max(0, Math.floor((levelOf(profile.xp) - 50) / 5)))
          ])
        )}
      >
        <div className={styles.stats}>
          <Stat
            value={profile.progress.journey['frontier-v2'] ?? 0}
            label={t('Frontier sectors')}
          />
          <Stat value={profile.progress.contracts ?? 0} label={t('Contracts')} />
          <Stat value={profile.progress.dailyMaster.clears} label={t('Master Daily clears')} />
        </div>
        <p className={styles.rowBlurb}>
          {t('Win scored matches against Pro or harder. Each ')}
          {t(MASTERY_CYCLE)}{' '}
          {t(
            ' marks opens a new cycle. Combat points cap at level 50; mastery earns records, achievements and colours.'
          )}
        </p>
        <div className={styles.masteryTracks}>
          {MASTERY_TRACKS.map((track) => {
            const marks = profile.progress.mastery[track.id] ?? 0;
            return (
              <div key={track.id} className={styles.masteryTrack}>
                <span>{t(track.name)}</span>
                <small>
                  {t('Cycle ')}
                  {t(Math.floor(marks / MASTERY_CYCLE) + 1)}
                  {t(' · ')}
                  {t(marks % MASTERY_CYCLE)}
                  {t('/')}
                  {t(MASTERY_CYCLE)}
                </small>
                <progress
                  max={MASTERY_CYCLE}
                  value={marks % MASTERY_CYCLE}
                  aria-label={t(msg('{0} mastery', [t(track.name)]))}
                />
              </div>
            );
          })}
        </div>
      </MenuDisclosure>

      <p className={styles.sectionLabel}>{t('Build')}</p>
      <div className={styles.stats}>
        <Stat value={profile.talents.points} label={t('Points')} />
        <Stat value={talents.bestDrive} label={t('Best drive')} />
        <Stat value={talents.abilitiesUsed} label={t('Skills used')} />
        <Stat value={talents.crits} label={t('Criticals')} />
        <Stat value={talents.shieldSaves} label={t('Shields')} />
        <Stat value={talents.perfectGuards} label={t('Guards')} />
      </div>

      <div className={styles.buttonRow}>
        <button type="button" className={styles.ghost} onClick={onAchievements}>
          {t('Achievements ')}
          {t(earned)}
          {t('/')}
          {t(ACHIEVEMENTS.length)}
        </button>
        <button type="button" className={styles.ghost} onClick={onCustomize}>
          {t('Customise')}
        </button>
        <button type="button" className={styles.ghost} onClick={onWorkshop}>
          {t('Paddle Workshop · ')}
          {t(profile.progress.workshop.marks)}
          {t(' Marks')}
        </button>
      </div>
      <button type="button" className={styles.ghost} onClick={onSettings}>
        {t('Settings')}
      </button>

      {demoLevel !== null ? (
        // There is nothing here to erase: a demo profile is never written.
        <p className={styles.note}>
          {t('Demo profile · level ')}
          {t(demoLevel)}
          {t('. Nothing here is saved.')}
        </p>
      ) : account.status !== 'guest' ? (
        // The server owns this save, so wiping the local copy would achieve
        // nothing but a re-download. Deleting the account is the real action,
        // and it lives on the account screen where it can be confirmed.
        <p className={styles.note}>
          {t(
            account.status === 'authenticated'
              ? 'This progress lives on your account. To erase it, delete the account from the account screen.'
              : 'Restoring your account. Progress reset is unavailable until this finishes.'
          )}
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
        {t(demoLevel === null ? 'Demo a level' : 'Change demo level')}
      </button>
    </Screen>
  );
}
