import { t } from '../../core/i18n/index';
import { Component, Suspense, type ReactNode } from 'react';
import type { ScreenId } from '../hooks/useGameFlow';
import { Screen } from './Screen';
import styles from '../Screens.module.css';

export type MenuScreenId = Exclude<ScreenId, 'home' | 'onboarding' | 'playing'>;

/** Each screen's own heading, so a loading or failed menu reads as the same place. */
const TITLES: Record<MenuScreenId, string> = {
  routes: 'Short sessions',
  shared: 'Shared rally challenge',
  modes: 'More modes',
  help: 'How to play',
  quick: 'Quick Match',
  practice: 'Practice',
  challenges: 'Challenge',
  journey: 'Journey',
  daily: 'Daily',
  gauntlet: 'Gauntlet',
  tournament: 'Tournament',
  profile: 'Profile',
  account: 'Account',
  achievements: 'Achievements',
  customize: 'Customise',
  settings: 'Settings',
  talents: 'Talents',
  workshop: 'Paddle Workshop',
  lab: 'Resonance Lab',
  demo: 'Demo',
  result: 'Results'
};

interface MenuBoundaryProps {
  screen: MenuScreenId;
  /** A failed settings download must offer a way to keep the paused match. */
  pausedGame?: boolean;
  onBack: () => void;
  children: ReactNode;
}

interface MenuBoundaryState {
  failed: boolean;
}

/**
 * Keyed by the route in App. A pending/failed menu has a way back, while the
 * canvas, engine and live HUD stay mounted outside this boundary.
 */
export class MenuBoundary extends Component<MenuBoundaryProps, MenuBoundaryState> {
  override state: MenuBoundaryState = { failed: false };

  static getDerivedStateFromError(): MenuBoundaryState {
    return { failed: true };
  }

  override render() {
    const { screen, pausedGame = false, onBack, children } = this.props;
    const title = TITLES[screen];
    if (this.state.failed)
      return (
        <Screen
          title={t(title)}
          subtitle={t(pausedGame ? 'Game paused' : '')}
          onBack={onBack}
          onEscape={pausedGame ? onBack : undefined}
          footer={
            <>
              {pausedGame && (
                <button type="button" className={styles.primary} onClick={onBack}>
                  {t('Return to paused game')}
                </button>
              )}
              <button
                type="button"
                className={pausedGame ? styles.ghost : styles.primary}
                onClick={() => window.location.reload()}
              >
                {t('Reload game')}
              </button>
              {!pausedGame && (
                <button type="button" className={styles.ghost} onClick={onBack}>
                  {t('Back')}
                </button>
              )}
            </>
          }
        >
          <p role="alert">
            {t(
              pausedGame
                ? 'This page couldn’t be opened. Return to your paused game, or reload to try again. Reload ends the current match.'
                : 'This page couldn’t be opened. Go back, or reload the game to try again.'
            )}
          </p>
        </Screen>
      );
    return (
      <Suspense
        fallback={
          <Screen
            title={t(title)}
            subtitle={t(pausedGame ? 'Game paused' : '')}
            onBack={onBack}
            onEscape={pausedGame ? onBack : undefined}
          >
            <p role="status" aria-live="polite">
              {t('Opening ')}
              {t(title)}
              {t('…')}
            </p>
          </Screen>
        }
      >
        {t(children)}
      </Suspense>
    );
  }
}
