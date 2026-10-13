import { useState } from 'react';
import { loadRoutes, SESSION_ROUTES, type RouteId } from '../../core/modes/routes';
import { t, msg } from '../../core/i18n';
import { Screen } from '../components/Screen';
import styles from '../Screens.module.css';

export function RoutesScreen({
  profileId,
  onStart,
  onBack
}: {
  profileId: string;
  onStart: (id: RouteId) => void;
  onBack: () => void;
}) {
  const [saved] = useState(() => loadRoutes(profileId));
  return (
    <Screen
      title={t('Short sessions')}
      subtitle={t('Three encounters · save between matches')}
      onBack={onBack}
    >
      <p className={styles.note}>
        {t(
          'Complete each step to continue. Practice pays no rewards; ordinary matches keep their usual rewards. Progress stays on this device. Unfinished matches restart.'
        )}
      </p>
      <div className={styles.stack}>
        {SESSION_ROUTES.map((route) => {
          const progress = saved.find((item) => item.id === route.id);
          const step = progress?.step ?? 0;
          return (
            <div className={styles.card} key={route.id}>
              <h3>{t(route.name)}</h3>
              <p>{t(route.hint)}</p>
              <ol>
                {route.steps.map((item, i) => (
                  <li key={item.name}>
                    {t(item.name)}
                    {i < step ? ` · ${t('Complete')}` : ''}
                  </li>
                ))}
              </ol>
              <p>
                {t(
                  msg('{0}/3 completed · {1} attempts · {2} route clears', [
                    t(step),
                    t(progress?.attempts ?? 0),
                    t(progress?.completions ?? 0)
                  ])
                )}
              </p>
              <button type="button" className={styles.primary} onClick={() => onStart(route.id)}>
                {t(step === 3 ? 'Replay route' : step > 0 ? 'Resume route' : 'Start route')}
              </button>
            </div>
          );
        })}
      </div>
    </Screen>
  );
}
