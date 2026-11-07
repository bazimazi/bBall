import { t } from '../../core/i18n/index';
import type { PlayerProfile } from '../../core/profile/types';
import { kitName } from '../../core/equipment/catalog';
import { fixedDailyKit } from '../../core/equipment/policy';
import { NEUTRAL_KIT, type PaddleKit } from '../../core/equipment/types';
import styles from '../Screens.module.css';

export function PaddleNotice({
  profile,
  policy = 'owned',
  dailyKey
}: {
  profile: PlayerProfile;
  policy?: 'owned' | 'daily' | 'neutral' | 'run' | 'cup';
  dailyKey?: string;
}) {
  const session =
    policy === 'run'
      ? profile.progress.run?.equipment
      : policy === 'cup'
        ? profile.tournament?.equipment
        : undefined;
  const active =
    policy === 'run' ? !!profile.progress.run : policy === 'cup' ? !!profile.tournament : false;
  // A player who has only ever had the neutral paddle has nothing to be told
  // about it: the line appears once there is a choice it describes.
  const plain = (kit?: PaddleKit) =>
    !kit ||
    (Object.keys(NEUTRAL_KIT) as (keyof PaddleKit)[]).every((key) => kit[key] === NEUTRAL_KIT[key]);
  const unsupported = !!session && session.version > 1;
  if (
    policy !== 'daily' &&
    !unsupported &&
    plain(profile.progress.workshop.equipped) &&
    plain(session?.kit)
  )
    return null;
  const text =
    policy === 'daily'
      ? `${dailyKey ? kitName(fixedDailyKit(dailyKey)) : 'Date-defined paddle'} · Daily supplies the same equipment to everyone.`
      : policy === 'neutral'
        ? 'This mode uses the neutral paddle.'
        : session && session.version > 1
          ? 'This session uses unsupported paddle rules. End the session and start a new one; your banked rewards stay.'
          : active && (!session || session.version === 0)
            ? 'Legacy neutral paddle · starting kit saved for this session.'
            : session
              ? `${kitName(session.kit)} · starting kit saved for this ${policy === 'run' ? 'run' : 'cup'}.`
              : `${kitName(profile.progress.workshop.equipped)} · ${policy === 'run' || policy === 'cup' ? 'saved when you start' : 'equipped for this match'}.`;
  return (
    <p className={styles.note} style={{ textAlign: 'start', marginTop: 0 }}>
      {t(text)}
    </p>
  );
}
