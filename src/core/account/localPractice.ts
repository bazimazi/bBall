import type { MatchSubmissionDto } from '../../../shared/protocol';
const key = (userId: string) => `bball.local-practice.${userId}`;
export interface LocalPracticeRecord {
  id: string;
  mode: string;
  scoreYou: number;
  scoreBot: number;
  seconds: number;
  playedAt: number;
  reason: string;
}
export function localPracticeRecords(userId: string): LocalPracticeRecord[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key(userId)) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.slice(-20).filter((record): record is LocalPracticeRecord => {
      if (!record || typeof record !== 'object') return false;
      const r = record as Record<string, unknown>;
      return (
        ['id', 'mode', 'reason'].every((field) => typeof r[field] === 'string') &&
        ['scoreYou', 'scoreBot', 'seconds', 'playedAt'].every(
          (field) => typeof r[field] === 'number' && Number.isFinite(r[field]) && r[field] >= 0
        )
      );
    });
  } catch {
    return [];
  }
}
export function keepLocalPractice(userId: string, match: MatchSubmissionDto, reason: string): void {
  try {
    const records = localPracticeRecords(userId).filter((r) => r.id !== match.clientMatchId);
    records.push({
      id: match.clientMatchId,
      mode: match.mode,
      scoreYou: match.scoreYou,
      scoreBot: match.scoreBot,
      seconds: match.seconds,
      playedAt: match.playedAt,
      reason
    });
    window.localStorage.setItem(key(userId), JSON.stringify(records.slice(-20)));
  } catch {
    /* Device storage is optional; cloud rejection still remains visible. */
  }
}
