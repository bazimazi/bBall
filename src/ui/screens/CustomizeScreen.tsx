import { achievementById } from '../../core/achievements/catalog';
import {
  EQUIP_SLOTS,
  cosmeticsOfKind,
  unlockLabel,
  type CosmeticKind,
  type Equipped
} from '../../core/cosmetics/catalog';
import { profileStore } from '../../core/profile/store';
import type { PlayerProfile } from '../../core/profile/types';
import { Screen } from '../components/Screen';
import styles from '../Screens.module.css';

interface CustomizeScreenProps {
  profile: PlayerProfile;
  onBack: () => void;
}

const SECTION_NAMES: Record<CosmeticKind, string> = {
  accent: 'Colour',
  ball: 'Ball',
  paddle: 'Paddle',
  trail: 'Trail',
  arena: 'Arena'
};

export function CustomizeScreen({ profile, onBack }: CustomizeScreenProps) {
  const owned = new Set(profile.unlocks);
  const ownedCount = profile.unlocks.length;

  return (
    <Screen
      title="Customise"
      subtitle={`${ownedCount} items unlocked · cosmetic only`}
      onBack={onBack}
    >
      {EQUIP_SLOTS.map((slot) => (
        <div key={slot}>
          <p className={styles.sectionLabel}>{SECTION_NAMES[slot as CosmeticKind]}</p>
          <div className={styles.swatchGrid}>
            {cosmeticsOfKind(slot as CosmeticKind).map((cosmetic) => {
              const have = owned.has(cosmetic.id);
              const equipped = profile.equipped[slot as keyof Equipped] === cosmetic.id;
              const requirement =
                cosmetic.unlock.type === 'achievement'
                  ? achievementById(cosmetic.unlock.id)?.name
                  : undefined;

              return (
                <button
                  key={cosmetic.id}
                  type="button"
                  disabled={!have}
                  aria-pressed={equipped}
                  className={equipped ? `${styles.swatch} ${styles.selected}` : styles.swatch}
                  onClick={() => profileStore.equip(slot as keyof Equipped, cosmetic.id)}
                >
                  <span
                    className={styles.swatchDisc}
                    style={{
                      background: `linear-gradient(140deg, ${cosmetic.swatch[0]}, ${cosmetic.swatch[1]})`
                    }}
                  />
                  <span className={styles.swatchName}>{cosmetic.name}</span>
                  {!have && (
                    <span className={styles.swatchLock}>
                      {unlockLabel(cosmetic.unlock, requirement)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </Screen>
  );
}
