import { PERSONALITIES } from '../modes/recipes';
import { ARENA_PRESETS } from '../modes/arenas';
import { bossById } from '../modes/bosses';
import { COURT_THEMES } from '../modes/expansionCourts';
import { TALENT_BRANCHES } from '../talents/catalog';
import type { BranchId } from '../talents/types';
import type { MatchResult, MatchRules } from '../modes/types';

export const MASTERY_TRACKS = [
  { id: 'flick', name: 'Flick technique' },
  { id: 'guard', name: 'Guard timing' },
  ...PERSONALITIES.map((id) => ({
    id: `school-${id}`,
    name: `${id[0]!.toUpperCase() + id.slice(1)} school`
  })),
  ...COURT_THEMES.map(([id, name]) => ({ id: `court-${id}`, name: `${name} routes` })),
  ...TALENT_BRANCHES.map((b) => ({ id: `build-${b.id}`, name: `${b.name} build` }))
];
const IDS = new Set(MASTERY_TRACKS.map((t) => t.id));
export const MASTERY_CYCLE = 250;
export interface MasteryTags {
  school: string;
  court: string | null;
  build: BranchId | null;
}
export function masteryTags(rules: MatchRules, build: BranchId | null): MasteryTags {
  const arena = JSON.stringify(
    rules.boss ? bossById(rules.boss.id)?.modifiers.arena : rules.modifiers.arena
  );
  const preset = ARENA_PRESETS.find((p) => JSON.stringify(p.arena) === arena);
  const court = rules.courtFamily ?? preset?.id.replace(/-\d+$/, '') ?? null;
  return { school: rules.bot.personality ?? 'opportunist', court, build };
}
export function masteryOf(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (value && typeof value === 'object')
    for (const [id, n] of Object.entries(value))
      if (IDS.has(id) && typeof n === 'number' && Number.isFinite(n) && n > 0)
        out[id] = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n));
  return out;
}
/** Only successful Pro-or-harder scored encounters train these tracks. */
export function trainMastery(tracks: Record<string, number>, result: MatchResult): void {
  if (
    !result.ranked ||
    result.abandoned ||
    !result.won ||
    result.botRank < 3 ||
    result.mode === 'endless'
  )
    return;
  const add = (id: string, n: number) => {
    if (IDS.has(id) && n > 0) tracks[id] = Math.min(Number.MAX_SAFE_INTEGER, (tracks[id] ?? 0) + n);
  };
  add('flick', Math.min(8, result.flicks));
  add('guard', Math.min(5, result.talent.perfectGuards));
  const tags = result.mastery;
  if (!tags) return;
  add(`school-${tags.school}`, result.botRank >= 5 ? 3 : 2);
  if (tags.build) add(`build-${tags.build}`, result.botRank >= 5 ? 3 : 2);
  if (tags.court) {
    const contacts = result.court;
    add(
      `court-${tags.court}`,
      Math.min(
        5,
        1 +
          (contacts?.banks ?? 0) +
          (contacts?.switches ?? 0) +
          (contacts?.gates ?? 0) +
          (contacts?.breaks ?? 0)
      )
    );
  }
}
