import { BALANCE } from '../balance/config';
import { atBoundary } from '../run/formats';
import type { RunAdvance, RunSave } from '../run/run';
import type { MatchResult } from '../modes/types';
import type { PlayerProfile } from '../profile/types';
import { cloneTalentSave, talentSaveOf } from '../talents/save';
import { levelOf } from '../progression/levels';
import { COMPONENTS, componentById, kitOf, sameKit, neutralKit } from './catalog';
import {
  EQUIPMENT_VERSION,
  EQUIPMENT_SLOTS,
  NEUTRAL_KIT,
  type PaddleKit,
  type WorkshopState,
  type WorkshopAction,
  type WorkshopAttempt
} from './types';

export const WORKSHOP_CONTRACTS = [
  {
    id: 'centre',
    name: 'Clean contact',
    target: 30,
    reward: 6,
    description: 'Land 30 clean centre returns.'
  },
  {
    id: 'motion',
    name: 'Moving craft',
    target: 20,
    reward: 6,
    description: 'Land 20 moving paddle contacts.'
  },
  {
    id: 'edge',
    name: 'Edge craft',
    target: 20,
    reward: 6,
    description: 'Land 20 genuine outer contacts.'
  },
  {
    id: 'absorb',
    name: 'Material craft',
    target: 12,
    reward: 8,
    description: 'Absorb bonus pace 12 times against Pro or harder.'
  },
  {
    id: 'school',
    name: 'Opponent craft',
    target: 6,
    reward: 8,
    description: 'Complete 6 Pro-or-harder encounters with a material paddle.'
  },
  {
    id: 'route',
    name: 'Signature craft',
    target: 10,
    reward: 8,
    description: 'Win 10 Pro-or-harder hazard encounters.'
  }
] as const;
export function createWorkshop(): WorkshopState {
  return {
    version: EQUIPMENT_VERSION,
    marks: 0,
    introduced: false,
    compared: [],
    owned: COMPONENTS.filter((p) => p.cost === 0).map((p) => p.id),
    equipped: { ...NEUTRAL_KIT },
    presets: [null, null, null],
    contracts: {},
    surfaces: [],
    signatures: 0,
    attempts: {},
    endless: {}
  };
}
const bag = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const count = (v: unknown, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0;
export function workshopMilestone(w: WorkshopState): number {
  if (!w.introduced) return 0;
  const done = (id: string) =>
    (w.contracts[id] ?? 0) >= WORKSHOP_CONTRACTS.find((c) => c.id === id)!.target;
  if (!done('centre') && !done('motion')) return 1;
  if (!done('centre') || !done('motion') || w.surfaces.length < 2) return 2;
  if (!done('edge') || !done('school')) return 3;
  if (done('route')) return 5;
  return 4;
}
export function ownsKit(w: WorkshopState, kit: PaddleKit): boolean {
  const repaired = kitOf(kit);
  if (!sameKit(kit, repaired)) return false;
  const stage = workshopMilestone(w);
  return (
    EQUIPMENT_SLOTS.every(
      (s) => w.owned.includes(kit[s]) && (componentById(kit[s])?.milestone ?? 99) <= stage
    ) &&
    (kit.tuning === 'standard' || stage >= 2)
  );
}
export function workshopOf(value: unknown): WorkshopState {
  const w = createWorkshop(),
    b = bag(value);
  w.introduced = b.introduced === true;
  w.marks = count(b.marks, BALANCE.equipment.maxMarks);
  if (Array.isArray(b.owned))
    w.owned = [
      ...new Set([
        ...w.owned,
        ...b.owned.filter((id): id is string => typeof id === 'string' && !!componentById(id))
      ])
    ];
  w.compared = Array.isArray(b.compared)
    ? b.compared
        .filter((id): id is string => typeof id === 'string' && COMPONENTS.some((p) => p.id === id))
        .slice(0, COMPONENTS.length)
    : [];
  for (const c of WORKSHOP_CONTRACTS) w.contracts[c.id] = count(bag(b.contracts)[c.id], c.target);
  w.surfaces = Array.isArray(b.surfaces)
    ? [
        ...new Set(
          b.surfaces.filter(
            (id): id is string => typeof id === 'string' && componentById(id)?.slot === 'surface'
          )
        )
      ]
    : [];
  w.signatures = count(b.signatures, Number.MAX_SAFE_INTEGER);
  const equipped = kitOf(b.equipped);
  w.equipped = ownsKit(w, equipped) ? equipped : { ...NEUTRAL_KIT };
  w.presets = Array.from({ length: 3 }, (_, i) => {
    const p = bag(Array.isArray(b.presets) ? b.presets[i] : null),
      kit = kitOf(p.kit);
    return typeof p.name === 'string' && ownsKit(w, kit)
      ? { name: p.name.slice(0, 24), kit }
      : null;
  });
  for (const [id, value] of Object.entries(bag(b.attempts)).slice(-BALANCE.equipment.maxAttempts)) {
    const a = bag(value),
      e = bag(a.equipment);
    if (
      !/^[A-Za-z0-9_:.-]{8,64}$/.test(id) ||
      (e.version !== EQUIPMENT_VERSION && e.version !== 0) ||
      typeof a.identity !== 'string'
    )
      continue;
    w.attempts[id] = {
      equipment: { version: e.version, kit: kitOf(e.kit), attemptId: id },
      identity: a.identity.slice(0, 512),
      talents: talentSaveOf(a.talents, levelOf(count(a.xp, Number.MAX_SAFE_INTEGER))),
      xp: count(a.xp, Number.MAX_SAFE_INTEGER)
    };
  }
  for (const [id, value] of Object.entries(bag(b.endless)).slice(0, 64)) {
    const record = bag(value);
    if (/^[a-z0-9-]{1,64}$/.test(id))
      w.endless[id] = {
        rally: count(record.rally, 100000),
        waves: count(record.waves, 100000),
        kit: kitOf(record.kit)
      };
  }
  return w;
}
export function cloneWorkshop(w: WorkshopState): WorkshopState {
  return workshopOf(w);
}
export function workshopServiceRun(profile: PlayerProfile, kit: PaddleKit): RunSave | null {
  const run = profile.progress.run;
  return run &&
    !run.finished &&
    !run.offer &&
    !run.attempt &&
    run.stage > 0 &&
    atBoundary(run) &&
    (run.credits ?? 0) >= 2 &&
    ownsKit(profile.progress.workshop, kit) &&
    run.equipment?.version === 1
    ? run
    : null;
}
export function workshopActionOn(
  profile: PlayerProfile,
  action: WorkshopAction
): PlayerProfile | null {
  const w = cloneWorkshop(profile.progress.workshop);
  if (action.type === 'service') {
    const run = workshopServiceRun(profile, action.kit);
    if (!run) return null;
    return {
      ...profile,
      progress: {
        ...profile.progress,
        workshop: w,
        run: {
          ...run,
          credits: (run.credits ?? 0) - 2,
          equipment: { version: 1, kit: { ...action.kit } }
        }
      }
    };
  }
  if (action.type === 'compare') {
    const kit = kitOf(action.kit);
    if (!sameKit(kit, action.kit)) return null;
    w.compared = [...new Set([...w.compared, kit.core, kit.surface])];
    if (!w.introduced && w.compared.length >= 3) {
      w.introduced = true;
      w.marks = Math.min(BALANCE.equipment.maxMarks, w.marks + BALANCE.equipment.starterMarks);
    }
  } else if (action.type === 'craft') {
    const part = componentById(action.component);
    if (
      !part ||
      part.cost === 0 ||
      w.owned.includes(part.id) ||
      part.milestone > workshopMilestone(w) ||
      w.marks < part.cost
    )
      return null;
    w.marks -= part.cost;
    w.owned.push(part.id);
  } else if (action.type === 'equip') {
    if (!ownsKit(w, action.kit)) return null;
    w.equipped = { ...action.kit };
  } else {
    if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot >= 3) return null;
    if (action.action === 'save')
      w.presets[action.slot] = {
        name: action.name?.trim().slice(0, 24) || `Paddle ${action.slot + 1}`,
        kit: { ...w.equipped }
      };
    else {
      const preset = w.presets[action.slot];
      if (!preset || !ownsKit(w, preset.kit)) return null;
      w.equipped = { ...preset.kit };
    }
  }
  return { ...profile, progress: { ...profile.progress, workshop: w } };
}
export function withAttempt(
  profile: PlayerProfile,
  id: string,
  attempt: WorkshopAttempt
): PlayerProfile {
  const w = cloneWorkshop(profile.progress.workshop);
  w.attempts[id] = {
    ...attempt,
    talents: cloneTalentSave(attempt.talents),
    equipment: { ...attempt.equipment, kit: { ...attempt.equipment.kit } }
  };
  const keys = Object.keys(w.attempts);
  for (const key of keys.slice(0, Math.max(0, keys.length - BALANCE.equipment.maxAttempts)))
    delete w.attempts[key];
  return { ...profile, progress: { ...profile.progress, workshop: w } };
}
export interface WorkshopReward {
  marks: number;
  contracts: string[];
}
export function nextWorkshopRecipe(w: WorkshopState): string {
  const stage = workshopMilestone(w);
  const remaining = COMPONENTS.filter((part) => part.cost > 0 && !w.owned.includes(part.id));
  const next = remaining
    .filter((part) => part.milestone <= stage)
    .sort((a, b) => a.cost - b.cost)[0];
  if (next)
    return `${next.name} · ${next.cost} Marks${next.cost > w.marks ? ` · ${next.cost - w.marks} more needed` : ' · ready to craft'}`;
  return remaining.length
    ? 'Complete the next technique contracts to unlock more recipes.'
    : 'All functional recipes crafted. Continue for signatures and engravings.';
}
export function applyWorkshopReward(
  profile: PlayerProfile,
  result: MatchResult,
  run: RunAdvance | null
): WorkshopReward {
  const w = profile.progress.workshop;
  const reward: WorkshopReward = { marks: 0, contracts: [] };
  if (result.equipment?.attemptId) delete w.attempts[result.equipment.attemptId];
  if (!result.ranked || result.abandoned || result.mode === 'endless') return reward;
  if (result.mode === 'run') {
    if (run) {
      run.save.workshopActHits = Math.min(
        BALANCE.equipment.minHits,
        (run.save.workshopActHits ?? 0) + result.hits
      );
      if (result.hits >= BALANCE.equipment.minHits) run.save.workshopEligible = true;
      const boundary =
        run.save.version === 2
          ? atBoundary(run.save)
          : run.save.stage > 0 && run.save.stage % 3 === 0;
      if (result.won && boundary && run.save.workshopActHits >= BALANCE.equipment.minHits) {
        reward.marks = BALANCE.equipment.winMarks;
        run.save.workshopActs = (run.save.workshopActs ?? 0) + 1;
        run.save.workshopActHits = 0;
      } else if (
        run.ended &&
        !run.cleared &&
        !(run.save.workshopActs ?? 0) &&
        run.save.workshopEligible
      )
        reward.marks = BALANCE.equipment.lossMarks;
    }
  } else if (result.hits >= BALANCE.equipment.minHits)
    reward.marks = result.won ? BALANCE.equipment.winMarks : BALANCE.equipment.lossMarks;
  if (result.hits < BALANCE.equipment.minHits) {
    const before = w.marks;
    w.marks = Math.min(BALANCE.equipment.maxMarks, w.marks + reward.marks);
    reward.marks = w.marks - before;
    return reward;
  }
  const kit = result.equipment?.kit ?? { ...NEUTRAL_KIT };
  if (!neutralKit(kit)) w.surfaces = [...new Set([...w.surfaces, kit.surface])];
  const stats = result.material;
  const additions: Record<string, number> = {
    centre: Math.min(8, stats?.centres ?? 0),
    motion: Math.min(6, stats?.moving ?? 0),
    edge: Math.min(6, stats?.edges ?? 0),
    absorb: result.botRank >= 3 ? Math.min(4, stats?.absorbed ?? 0) : 0,
    school: result.botRank >= 3 && !neutralKit(kit) ? 1 : 0,
    route:
      result.botRank >= 3 &&
      result.won &&
      !!result.court &&
      Object.values(result.court).some((n) => n > 0)
        ? 1
        : 0
  };
  for (const c of WORKSHOP_CONTRACTS) {
    const before = w.contracts[c.id] ?? 0;
    w.contracts[c.id] = Math.min(c.target, before + additions[c.id]!);
    if (before < c.target && w.contracts[c.id]! >= c.target) {
      reward.marks += c.reward;
      reward.contracts.push(c.name);
    }
  }
  if ((additions.route ?? 0) > 0 && workshopMilestone(w) >= 5)
    w.signatures = Math.min(Number.MAX_SAFE_INTEGER, w.signatures + 1);
  const before = w.marks;
  w.marks = Math.min(BALANCE.equipment.maxMarks, w.marks + reward.marks);
  reward.marks = w.marks - before;
  return reward;
}
