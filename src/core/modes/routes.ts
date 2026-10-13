import { techniqueRules } from './drills';
import { challengeRulesById, practiceRules, quickMatchRules } from './rules';
import type { MatchResult, MatchRules } from './types';
import { loadRecord, saveRecord, type StoreSpec } from '../storage/localStore';

export const SESSION_ROUTES = [
  {
    id: 'placement',
    name: 'Find the corners',
    hint: 'Learn placement, face an Amateur, then test a Pro anchor.',
    steps: [
      { name: 'Placement drill', rules: () => techniqueRules('placement') },
      { name: 'Amateur · open court', rules: () => quickMatchRules('amateur') },
      { name: 'Pro · Anchor', rules: () => quickMatchRules('pro', { personality: 'anchor' }) }
    ]
  },
  {
    id: 'banks',
    name: 'Learn the bank',
    hint: 'Practise a rail return, read a bumper, then face the Architect.',
    steps: [
      { name: 'Bank-shot drill', rules: () => techniqueRules('bank') },
      {
        name: 'Amateur · Centre Post',
        rules: () => quickMatchRules('amateur', { arenaId: 'post' })
      },
      {
        name: 'Architect · Opening phase',
        rules: () => practiceRules('pro', 'normal', { bossId: 'architect' })
      }
    ]
  },
  {
    id: 'timing',
    name: 'Read the opening',
    hint: 'Practise timing, clear Switchback, then face the Gatekeeper.',
    steps: [
      { name: 'Gate-timing drill', rules: () => techniqueRules('gate') },
      { name: 'Switchback', rules: () => challengeRulesById('switchback')! },
      {
        name: 'Gatekeeper · Opening phase',
        rules: () => practiceRules('pro', 'normal', { bossId: 'gatekeeper' })
      }
    ]
  }
] as const;
export type RouteId = (typeof SESSION_ROUTES)[number]['id'];
export interface RouteProgress {
  id: RouteId;
  step: number;
  attempts: number;
  completions: number;
  replays: number;
}
export function routeById(id: string) {
  return SESSION_ROUTES.find((route) => route.id === id);
}
function spec(profileId: string): StoreSpec<RouteProgress[]> {
  return {
    key: `bball.routes.${profileId}`,
    version: 1,
    create: () => [],
    migrate: (data) => data,
    validate: (data) => {
      if (!Array.isArray(data)) return null;
      return SESSION_ROUTES.flatMap((route) => {
        const item = data.find((item) => item && item.id === route.id);
        if (!item) return [];
        const bounded = (value: unknown, max: number) =>
          typeof value === 'number' && Number.isSafeInteger(value)
            ? Math.max(0, Math.min(max, value))
            : 0;
        return [
          {
            id: route.id,
            step: bounded(item.step, route.steps.length),
            attempts: bounded(item.attempts, 999999),
            completions: bounded(item.completions, 999999),
            replays: bounded(item.replays, 999999)
          }
        ];
      });
    }
  };
}
const demo = new Map<string, RouteProgress[]>();
export const clearDemoRoutes = () => demo.clear();
export function loadRoutes(profileId: string): RouteProgress[] {
  return profileId.startsWith('demo:')
    ? (demo.get(profileId) ?? [])
    : loadRecord(spec(profileId)).value;
}
export function saveRoute(profileId: string, progress: RouteProgress): void {
  const next = [...loadRoutes(profileId).filter((item) => item.id !== progress.id), progress];
  if (profileId.startsWith('demo:')) {
    demo.set(profileId, next);
    return;
  }
  saveRecord(spec(profileId), next);
}
export function resumeRoute(id: RouteId, stored?: RouteProgress): RouteProgress {
  return {
    id,
    step: stored && stored.step < routeById(id)!.steps.length ? stored.step : 0,
    attempts: stored && stored.step < 3 ? stored.attempts : 0,
    completions: stored?.completions ?? 0,
    replays: Math.min(999999, (stored?.replays ?? 0) + Number(!!stored && stored.step === 3))
  };
}
export function advanceRoute(
  progress: RouteProgress,
  rules: MatchRules,
  result: MatchResult
): RouteProgress {
  if (progress.step >= 3 || result.abandoned || result.mode !== rules.mode) return progress;
  const passed = result.mode === 'challenge' ? result.objectiveMet : result.won;
  const step = Math.min(3, progress.step + Number(passed));
  return {
    ...progress,
    step,
    attempts: Math.min(999999, progress.attempts + 1),
    completions: Math.min(999999, progress.completions + Number(passed && step === 3))
  };
}
