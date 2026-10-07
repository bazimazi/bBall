import type { PlayerProfile } from '../../core/profile/types';
import { kitName } from '../../core/equipment/catalog';
import { fixedDailyKit } from '../../core/equipment/policy';
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
    <p className={styles.note} style={{ textAlign: 'left', marginTop: 0 }}>
      {text}
    </p>
  );
}
