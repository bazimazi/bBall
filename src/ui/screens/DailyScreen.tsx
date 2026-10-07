import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { botProfile } from '../../core/bots/levels';
import { dailySpec, MAX_FREEZES, streakAlive } from '../../core/daily/daily';
import { starGoalLabel } from '../../core/modes/stars';
import { dayKey } from '../../core/progression/xp';
import type { PlayerProfile } from '../../core/profile/types';
import { DailyResultCopy } from '../components/DailyResultCopy';
import { QuestList } from '../components/QuestList';
import { Screen } from '../components/Screen';
import { useLocalClock } from '../hooks/useLocalClock';
import { FlameIcon, SnowIcon, StarIcon } from '../icons/ModeIcons';
import modes from '../Modes.module.css';
import styles from '../Screens.module.css';

interface DailyScreenProps {
  profile: PlayerProfile;
  onPlay: (day: string) => void;
  onBack: () => void;
}

/** "5h 12m" until local midnight, when the next challenge rolls in. */
function untilTomorrow(now: Date): string {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const minutes = Math.max(0, Math.round((next.getTime() - now.getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/**
 * Today's challenge, the streak it feeds, and the day's quests - the three
 * things that change every day, on one screen.
 */
export function DailyScreen({ profile, onPlay, onBack }: DailyScreenProps) {
  const { now, refresh } = useLocalClock();
  const [changed, setChanged] = useState(false);
  const playButton = useRef<HTMLButtonElement>(null);
  const copyFocused = useRef(false);

  const today = dayKey(now);
  const [kind, setKind] = useState<'standard' | 'master'>('standard');
  const [archive, setArchive] = useState('');
  const key = kind === 'master' ? `m2-${today}` : today;
  const spec = dailySpec(key);
  const record = kind === 'master' ? profile.progress.dailyMaster : profile.progress.daily;
  const medals = record.day === today ? record.medals : 0;
  const attempts = record.day === today ? record.attempts : 0;
  const alive = streakAlive(record, today);
  const streak = alive ? record.streak : 0;
  const cleared = (medals & 1) === 1;

  useEffect(() => {
    if (cleared || !copyFocused.current) return;
    copyFocused.current = false;
    playButton.current?.focus();
  }, [cleared]);

  const goals = [
    { bit: 1, label: 'Win the match' },
    { bit: 2, label: starGoalLabel(spec.goals[0]) },
    { bit: 4, label: starGoalLabel(spec.goals[1]) }
  ];

  const stars = goals.map((goal) => (medals & goal.bit ? '★' : '☆')).join('');
  const shareText = `bBall Daily ${today} · ${spec.title}\n${stars}${streak > 1 ? ` · streak ${streak}` : ''}`;
  const play = () => {
    const clock = new Date();
    if (dayKey(clock) !== today) {
      refresh(clock);
      setChanged(true);
      return;
    }
    setChanged(false);
    onPlay(key);
  };

  return (
    <Screen
      title="Daily"
      subtitle={`New challenge in ${untilTomorrow(now)}`}
      onBack={onBack}
      footer={
        <>
          <button
            ref={playButton}
            type="button"
            className={styles.primary}
            onFocus={() => {
              copyFocused.current = false;
            }}
            onClick={play}
          >
            {cleared ? 'Play again' : attempts > 0 ? 'Try again' : "Play today's challenge"}
          </button>
        </>
      }
    >
      <div className={styles.tabs}>
        {(['standard', 'master'] as const).map((k) => (
          <button
            type="button"
            key={k}
            className={kind === k ? styles.tabActive : styles.tab}
            onClick={() => setKind(k)}
          >
            {k === 'standard' ? 'Standard' : 'Master · Legend'}
          </button>
        ))}
      </div>
      <div className={styles.card}>
        <label>
          Daily archive · practice without streak or XP{' '}
          <input
            type="date"
            aria-label="Archive date"
            value={archive}
            max={today}
            min={dayKey(new Date(now.getTime() - 30 * 86400000))}
            onChange={(e) => setArchive(e.target.value)}
          />
        </label>
        <button
          type="button"
          className={styles.ghost}
          disabled={
            !archive || archive > today || archive < dayKey(new Date(now.getTime() - 30 * 86400000))
          }
          onClick={() => onPlay(`a2-${archive}`)}
        >
          Play archive
        </button>
      </div>
      <div className={modes.stagger} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p role="status" aria-atomic="true" className={styles.note}>
          {changed ? 'A new Daily challenge is ready. Review its goals, then play when ready.' : ''}
        </p>
        <div className={modes.detail} style={{ '--accent': 'hsl(28 95% 64%)' } as CSSProperties}>
          <div className={modes.detailHead}>
            <span className={modes.stageNum}>{today}</span>
            <h3 className={modes.detailName}>{spec.title}</h3>
            <p className={modes.detailBlurb}>{spec.blurb}.</p>
            <p className={modes.detailBlurb}>
              vs {botProfile(spec.bot).name} · first to {spec.winScore}
              {attempts > 0 ? ` · ${attempts} attempt${attempts > 1 ? 's' : ''} today` : ''}
            </p>
          </div>
          <div className={modes.goals}>
            {goals.map((goal) => (
              <span
                key={goal.bit}
                className={medals & goal.bit ? `${modes.goal} ${modes.goalOn}` : modes.goal}
              >
                <StarIcon />
                {goal.label}
              </span>
            ))}
          </div>
        </div>

        {cleared && (
          <div
            onFocusCapture={() => {
              copyFocused.current = true;
            }}
            onBlurCapture={(event) => {
              if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
                copyFocused.current = false;
              }
            }}
          >
            <DailyResultCopy text={shareText} />
          </div>
        )}

        <div className={modes.streak}>
          <span
            className={`${modes.flame} ${streak > 0 ? modes.flameLive : modes.flameCold}`}
            aria-hidden="true"
          >
            <FlameIcon />
          </span>
          <span className={modes.streakText}>
            <span className={modes.streakCount}>
              {streak} day{streak === 1 ? '' : 's'}
            </span>
            <span className={styles.rowBlurb}>
              {cleared
                ? 'Streak kept for today'
                : streak > 0
                  ? 'Clear today to keep it going'
                  : 'Clear today to start a streak'}
              {record.bestStreak > 0 ? ` · best ${record.bestStreak}` : ''}
            </span>
          </span>
          <span
            className={modes.freezes}
            title="Freezes cover a missed day. One banked every 7 days."
          >
            {Array.from({ length: MAX_FREEZES }, (_, i) => (
              <span key={i} className={i < record.freezes ? undefined : modes.freezeEmpty}>
                <SnowIcon />
              </span>
            ))}
          </span>
        </div>

        <QuestList profile={profile} day={today} />

        <p className={styles.note}>
          Everyone plays the same court today. Clear it for a bonus and to grow your streak; every
          seven days banks a freeze that covers a missed day.
        </p>
      </div>
    </Screen>
  );
}
