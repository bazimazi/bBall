import type { Challenge } from '../modes/challenges';
import { arenaPreset } from '../modes/arenas';
import type { PlayerProfile } from '../profile/types';
import { hasResearch } from './state';

export const RESONANCE_TRIALS: readonly Challenge[] = [
  {
    id: 'resonance-velocity',
    name: 'Velocity Crucible',
    blurb:
      'A short paddle against an Elite at extreme pace. Pulse Brake buys a precise recovery window.',
    bot: 'elite',
    winScore: 5,
    objective: { id: 'win', label: 'Win the match', value: 0 },
    modifiers: {
      playerPaddleScale: 0.7,
      serveSpeedScale: 1.5,
      speedPerHitScale: 1.5,
      maxSpeedScale: 1.2
    },
    xp: 280
  },
  {
    id: 'resonance-parallax',
    name: 'Parallax Chamber',
    blurb:
      'Gravity and portals against an Elite. Phase Lens turns one chaotic approach into a clean read.',
    bot: 'elite',
    winScore: 5,
    objective: { id: 'win', label: 'Win the match', value: 0 },
    modifiers: {
      arena: arenaPreset('rift-tide')!.arena,
      playerPaddleScale: 0.75,
      serveSpeedScale: 1.3
    },
    xp: 300
  },
  {
    id: 'resonance-convergence',
    name: 'Convergence Engine',
    blurb:
      'Beat a Legend through moving gates and wind. Switch specialties between points to adapt.',
    bot: 'legend',
    winScore: 5,
    objective: { id: 'win', label: 'Win the match', value: 0 },
    modifiers: {
      arena: arenaPreset('storm-gates')!.arena,
      playerPaddleScale: 0.7,
      maxSpeedScale: 1.15
    },
    xp: 340
  }
];
export const isResonanceTrial = (id: string) => RESONANCE_TRIALS.some((trial) => trial.id === id);
export const trialOpen = (profile: PlayerProfile, id: string) =>
  !isResonanceTrial(id) || hasResearch(profile.progress.loot, 'resonance-trials');
