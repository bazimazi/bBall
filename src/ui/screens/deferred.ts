import { lazy } from 'react';
import { loadMenu } from '../../dev/experienceBridge';

// Stable declarations: switching menus never recreates a lazy component.
// Only opening a page requests its code and page-specific CSS.
export const AccountScreen = lazy(() =>
  loadMenu('Account', () =>
    import('./AccountScreen').then((page) => ({ default: page.AccountScreen }))
  )
);
export const AchievementsScreen = lazy(() =>
  loadMenu('Achievements', () =>
    import('./AchievementsScreen').then((page) => ({ default: page.AchievementsScreen }))
  )
);
export const ChallengeScreen = lazy(() =>
  loadMenu('Challenge', () =>
    import('./ChallengeScreen').then((page) => ({ default: page.ChallengeScreen }))
  )
);
export const CustomizeScreen = lazy(() =>
  loadMenu('Customize', () =>
    import('./CustomizeScreen').then((page) => ({ default: page.CustomizeScreen }))
  )
);
export const DailyScreen = lazy(() =>
  loadMenu('Daily', () => import('./DailyScreen').then((page) => ({ default: page.DailyScreen })))
);
export const DemoScreen = lazy(() =>
  loadMenu('Demo', () => import('./DemoScreen').then((page) => ({ default: page.DemoScreen })))
);
export const DifficultyScreen = lazy(() =>
  loadMenu('Difficulty', () =>
    import('./DifficultyScreen').then((page) => ({ default: page.DifficultyScreen }))
  )
);
export const GauntletScreen = lazy(() =>
  loadMenu('Gauntlet', () =>
    import('./GauntletScreen').then((page) => ({ default: page.GauntletScreen }))
  )
);
export const HowToPlayScreen = lazy(() =>
  loadMenu('HowToPlay', () =>
    import('./HowToPlayScreen').then((page) => ({ default: page.HowToPlayScreen }))
  )
);
export const JourneyScreen = lazy(() =>
  loadMenu('Journey', () =>
    import('./JourneyScreen').then((page) => ({ default: page.JourneyScreen }))
  )
);
export const ModesScreen = lazy(() =>
  loadMenu('Modes', () => import('./ModesScreen').then((page) => ({ default: page.ModesScreen })))
);
export const ProfileScreen = lazy(() =>
  loadMenu('Profile', () =>
    import('./ProfileScreen').then((page) => ({ default: page.ProfileScreen }))
  )
);
export const ResultScreen = lazy(() =>
  loadMenu('Result', () =>
    import('./ResultScreen').then((page) => ({ default: page.ResultScreen }))
  )
);
export const SettingsScreen = lazy(() =>
  loadMenu('Settings', () =>
    import('./SettingsScreen').then((page) => ({ default: page.SettingsScreen }))
  )
);
export const TalentScreen = lazy(() =>
  loadMenu('Talent', () =>
    import('./TalentScreen').then((page) => ({ default: page.TalentScreen }))
  )
);
export const TournamentScreen = lazy(() =>
  loadMenu('Tournament', () =>
    import('./TournamentScreen').then((page) => ({ default: page.TournamentScreen }))
  )
);
