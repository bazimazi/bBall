import type { TalentSave } from '../talents/types';

export const EQUIPMENT_VERSION = 1;
export const EQUIPMENT_SLOTS = ['core', 'surface', 'frame', 'insert'] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];
export type Tuning = 'standard' | 'firm' | 'grip';
export interface PaddleKit {
  core: string;
  surface: string;
  frame: string;
  insert: string;
  tuning: Tuning;
}
export interface EquipmentSnapshot {
  version: number;
  kit: PaddleKit;
  attemptId?: string | undefined;
}
export interface MaterialStats {
  centres: number;
  moving: number;
  edges: number;
  absorbed: number;
  releases: number;
}
export interface MaterialRuntime {
  stored: number;
  switchCharge: boolean;
  switchesSeen: number;
  stats: MaterialStats;
}
export interface WorkshopAttempt {
  equipment: EquipmentSnapshot;
  identity: string;
  talents: TalentSave;
  xp: number;
}
export interface WorkshopState {
  version: number;
  marks: number;
  introduced: boolean;
  compared: string[];
  owned: string[];
  equipped: PaddleKit;
  presets: Array<{ name: string; kit: PaddleKit } | null>;
  contracts: Record<string, number>;
  surfaces: string[];
  signatures: number;
  attempts: Record<string, WorkshopAttempt>;
  endless: Record<string, { rally: number; waves: number; kit: PaddleKit }>;
}
export type WorkshopAction =
  | { type: 'service'; kit: PaddleKit }
  | { type: 'compare'; kit: PaddleKit }
  | { type: 'craft'; component: string }
  | { type: 'equip'; kit: PaddleKit }
  | { type: 'preset'; slot: number; action: 'save' | 'load'; name?: string | undefined };

export const NEUTRAL_KIT: Readonly<PaddleKit> = {
  core: 'balanced-core',
  surface: 'balanced-surface',
  frame: 'balanced-frame',
  insert: 'empty-insert',
  tuning: 'standard'
};
export function materialRuntime(): MaterialRuntime {
  return {
    stored: 0,
    switchCharge: false,
    switchesSeen: 0,
    stats: { centres: 0, moving: 0, edges: 0, absorbed: 0, releases: 0 }
  };
}
