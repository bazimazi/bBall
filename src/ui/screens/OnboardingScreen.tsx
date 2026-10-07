import { t, msg } from '../../core/i18n/index';
import { useState } from 'react';

import { ACCENTS } from '../../core/cosmetics/catalog';
import { NAME_MAX } from '../../core/profile/defaults';
import { equipCosmetic, setIdentity } from '../../core/account/progression';
import { profileStore } from '../../core/profile/store';
import { AVATARS, type AvatarId, type PlayerProfile } from '../../core/profile/types';
import { Avatar } from '../components/Avatar';
import { BrandLogo } from '../components/BrandLogo';
import { SaveNotice } from '../components/SaveNotice';
import { LanguageChoice } from '../components/LanguageChoice';
import { useSettings } from '../hooks/useSettings';
import styles from '../Screens.module.css';

interface OnboardingScreenProps {
  profile: PlayerProfile;
  onDone: () => void;
}

/**
 * First run only. Everything here is optional - "Skip" takes the defaults and
 * gets out of the way, because nobody installs a ball game to fill in a form.
 */
export function OnboardingScreen({ profile, onDone }: OnboardingScreenProps) {
  useSettings();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>(profile.avatar);
  const [accent, setAccent] = useState(profile.equipped.accent);

  const canComplete = () => {
    const current = profileStore.getSnapshot();
    // A restoration can arrive before React removes the old form. Its draft
    // belongs only to this uncompleted profile, including the Skip action.
    return current.id === profile.id && !current.onboarded;
  };

  const start = () => {
    if (!canComplete()) return;
    setIdentity(name, avatar);
    equipCosmetic('accent', accent);
    onDone();
  };

  const skip = () => {
    if (!canComplete()) return;
    profileStore.skipOnboarding();
    onDone();
  };

  return (
    <section className={styles.screen}>
      <BrandLogo />
      <p className={styles.tagline}>{t('Make it yours - or skip and play')}</p>

      <div className={styles.body}>
        <LanguageChoice />
        <SaveNotice />
        <div className={styles.field}>
          <label className={styles.label} htmlFor="player-name">
            {t('Name')}
          </label>
          <input
            id="player-name"
            dir="auto"
            className={styles.input}
            value={name}
            maxLength={NAME_MAX}
            placeholder={t('Player')}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <p className={styles.sectionLabel}>{t('Avatar')}</p>
        <div className={styles.swatchGrid}>
          {AVATARS.map((id) => (
            <button
              key={id}
              type="button"
              aria-label={t(msg('Avatar {0}', [t(id)]))}
              aria-pressed={id === avatar}
              className={id === avatar ? `${styles.swatch} ${styles.selected}` : styles.swatch}
              onClick={() => setAvatar(id)}
            >
              <Avatar avatar={id} color={ACCENTS.find((item) => item.id === accent)?.css} />
            </button>
          ))}
        </div>

        <p className={styles.sectionLabel}>{t('Colour')}</p>
        <div className={styles.swatchGrid}>
          {ACCENTS.filter((item) => item.unlock.type === 'default').map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={t(item.name)}
              aria-pressed={item.id === accent}
              className={item.id === accent ? `${styles.swatch} ${styles.selected}` : styles.swatch}
              onClick={() => setAccent(item.id)}
            >
              <span className={styles.swatchDisc} style={{ background: item.css }} />
              <span className={styles.swatchName}>{t(item.name)}</span>
            </button>
          ))}
        </div>
      </div>

      <footer className={styles.footer}>
        <button type="button" className={styles.primary} onClick={start}>
          {t('Start playing')}
        </button>
        <button type="button" className={styles.ghost} onClick={skip}>
          {t('Skip')}
        </button>
      </footer>
    </section>
  );
}
