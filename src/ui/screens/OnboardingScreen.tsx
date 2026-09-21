import { useState } from 'react';

import { ACCENTS } from '../../core/cosmetics/catalog';
import { NAME_MAX } from '../../core/profile/defaults';
import { equipCosmetic, setIdentity } from '../../core/account/progression';
import { profileStore } from '../../core/profile/store';
import { AVATARS, type AvatarId, type PlayerProfile } from '../../core/profile/types';
import { Avatar } from '../components/Avatar';
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
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<AvatarId>(profile.avatar);
  const [accent, setAccent] = useState(profile.equipped.accent);

  const start = () => {
    setIdentity(name, avatar);
    equipCosmetic('accent', accent);
    onDone();
  };

  const skip = () => {
    profileStore.skipOnboarding();
    onDone();
  };

  return (
    <section className={styles.screen}>
      <h1 className={styles.logo}>
        <span>b</span>Ball
      </h1>
      <p className={styles.tagline}>Make it yours - or skip and play</p>

      <div className={styles.body}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="player-name">
            Name
          </label>
          <input
            id="player-name"
            className={styles.input}
            value={name}
            maxLength={NAME_MAX}
            placeholder="Player"
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <p className={styles.sectionLabel}>Avatar</p>
        <div className={styles.swatchGrid}>
          {AVATARS.map((id) => (
            <button
              key={id}
              type="button"
              aria-label={`Avatar ${id}`}
              aria-pressed={id === avatar}
              className={id === avatar ? `${styles.swatch} ${styles.selected}` : styles.swatch}
              onClick={() => setAvatar(id)}
            >
              <Avatar avatar={id} color={ACCENTS.find((item) => item.id === accent)?.css} />
            </button>
          ))}
        </div>

        <p className={styles.sectionLabel}>Colour</p>
        <div className={styles.swatchGrid}>
          {ACCENTS.filter((item) => item.unlock.type === 'default').map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={item.name}
              aria-pressed={item.id === accent}
              className={item.id === accent ? `${styles.swatch} ${styles.selected}` : styles.swatch}
              onClick={() => setAccent(item.id)}
            >
              <span className={styles.swatchDisc} style={{ background: item.css }} />
              <span className={styles.swatchName}>{item.name}</span>
            </button>
          ))}
        </div>
      </div>

      <footer className={styles.footer}>
        <button type="button" className={styles.primary} onClick={start}>
          Start playing
        </button>
        <button type="button" className={styles.ghost} onClick={skip}>
          Skip
        </button>
      </footer>
    </section>
  );
}
