import { Component, Suspense, type ReactNode } from 'react';
import type { ScreenId } from '../hooks/useGameFlow';
import { Screen } from './Screen';
import styles from '../Screens.module.css';

export type MenuScreenId = Exclude<ScreenId, 'home' | 'onboarding' | 'playing'>;

const TITLES: Record<MenuScreenId, string> = {
  modes: 'Modes',
  help: 'How to play',
  quick: 'Quick Match',
  practice: 'Practice',
  challenges: 'Challenges',
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
  demo: 'Demo a level',
  result: 'Results'
};

interface MenuBoundaryProps {
  screen: MenuScreenId;
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
    const { screen, onBack, children } = this.props;
    const title = TITLES[screen];
    if (this.state.failed)
      return (
        <Screen
          title={title}
          onBack={onBack}
          footer={
            <>
              <button
                type="button"
                className={styles.primary}
                onClick={() => window.location.reload()}
              >
                Reload game
              </button>
              <button type="button" className={styles.ghost} onClick={onBack}>
                Back
              </button>
            </>
          }
        >
          <p role="alert">
            This page couldn’t be opened. Go back, or reload the game to try again.
          </p>
        </Screen>
      );
    return (
      <Suspense
        fallback={
          <Screen title={title} onBack={onBack}>
            <p role="status" aria-live="polite">
              Opening {title}…
            </p>
          </Screen>
        }
      >
        {children}
      </Suspense>
    );
  }
}
