import { lazy } from 'react';

// Stable declarations: switching menus never recreates a lazy component.
// Only opening a page requests its code and page-specific CSS.
export const AccountScreen = lazy(() =>
  import('./AccountScreen').then((page) => ({ default: page.AccountScreen }))
);
export const AchievementsScreen = lazy(() =>
  import('./AchievementsScreen').then((page) => ({ default: page.AchievementsScreen }))
);
export const ChallengeScreen = lazy(() =>
  import('./ChallengeScreen').then((page) => ({ default: page.ChallengeScreen }))
);
export const CustomizeScreen = lazy(() =>
  import('./CustomizeScreen').then((page) => ({ default: page.CustomizeScreen }))
);
export const DailyScreen = lazy(() =>
  import('./DailyScreen').then((page) => ({ default: page.DailyScreen }))
);
export const DemoScreen = lazy(() =>
  import('./DemoScreen').then((page) => ({ default: page.DemoScreen }))
);
export const DifficultyScreen = lazy(() =>
  import('./DifficultyScreen').then((page) => ({ default: page.DifficultyScreen }))
);
export const GauntletScreen = lazy(() =>
  import('./GauntletScreen').then((page) => ({ default: page.GauntletScreen }))
);
export const HowToPlayScreen = lazy(() =>
  import('./HowToPlayScreen').then((page) => ({ default: page.HowToPlayScreen }))
);
export const JourneyScreen = lazy(() =>
  import('./JourneyScreen').then((page) => ({ default: page.JourneyScreen }))
);
export const ModesScreen = lazy(() =>
  import('./ModesScreen').then((page) => ({ default: page.ModesScreen }))
);
export const ProfileScreen = lazy(() =>
  import('./ProfileScreen').then((page) => ({ default: page.ProfileScreen }))
);
export const ResultScreen = lazy(() =>
  import('./ResultScreen').then((page) => ({ default: page.ResultScreen }))
);
export const SettingsScreen = lazy(() =>
  import('./SettingsScreen').then((page) => ({ default: page.SettingsScreen }))
);
export const TalentScreen = lazy(() =>
  import('./TalentScreen').then((page) => ({ default: page.TalentScreen }))
);
export const TournamentScreen = lazy(() =>
  import('./TournamentScreen').then((page) => ({ default: page.TournamentScreen }))
);
