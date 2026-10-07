import { t, msg, locale } from '../../core/i18n/index';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { botProfile } from '../../core/bots/levels';
import { dailySpec, MAX_FREEZES, streakAlive } from '../../core/daily/daily';
import { starGoalLabel } from '../../core/modes/stars';
import { dayKey } from '../../core/progression/xp';
import type { PlayerProfile } from '../../core/profile/types';
import { DailyResultCopy } from '../components/DailyResultCopy';
import { QuestList } from '../components/QuestList';
import { Screen } from '../components/Screen';
import { PaddleNotice } from '../components/PaddleNotice';
import { MenuDisclosure } from '../components/MenuDisclosure';
import { ChoiceGroup } from '../components/ChoiceGroup';
import { GamePicker } from '../components/GamePicker';
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
  const shareText = t(
    msg('bBall Daily {0} · {1}\n{2}{3}', [
      t(today),
      t(spec.title),
      t(stars),
      t(streak > 1 ? ` · streak ${streak}` : '')
    ])
  );
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
      title={t('Daily')}
      subtitle={t(msg('New challenge in {0}', [t(untilTomorrow(now))]))}
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
            {t(cleared ? 'Play again' : attempts > 0 ? 'Try again' : "Play today's challenge")}
          </button>
        </>
      }
    >
      <ChoiceGroup<'standard' | 'master'>
        label={t('Challenge tier')}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'standard', name: 'Standard' },
          { value: 'master', name: 'Master · Legend' }
        ]}
      />
      <PaddleNotice profile={profile} policy="daily" dailyKey={key} />
      <div className={modes.stagger} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p role="status" aria-atomic="true" className={styles.note}>
          {t(
            changed ? 'A new Daily challenge is ready. Review its goals, then play when ready.' : ''
          )}
        </p>
        <div className={modes.detail} style={{ '--accent': 'hsl(28 95% 64%)' } as CSSProperties}>
          <div className={modes.detailHead}>
            <span className={modes.stageNum}>{t(today)}</span>
            <h3 className={modes.detailName}>{t(spec.title)}</h3>
            <p className={modes.detailBlurb}>
              {t(spec.blurb)}
              {t('.')}
            </p>
            <p className={modes.detailBlurb}>
              {t('vs ')}
              {t(botProfile(spec.bot).name)}
              {t(' · first to ')}
              {t(spec.winScore)}
              {t(
                attempts > 0
                  ? msg(' · {0} attempt{1} today', [t(attempts), t(attempts > 1 ? 's' : '')])
                  : ''
              )}
            </p>
          </div>
          <div className={modes.goals}>
            {goals.map((goal) => (
              <span
                key={goal.bit}
                className={medals & goal.bit ? `${modes.goal} ${modes.goalOn}` : modes.goal}
              >
                <StarIcon />
                {t(goal.label)}
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
            <DailyResultCopy text={t(shareText)} />
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
              {t(streak)}
              {t(' day')}
              {t(streak === 1 ? '' : 's')}
            </span>
            <span className={styles.rowBlurb}>
              {t(
                cleared
                  ? 'Streak kept for today'
                  : streak > 0
                    ? 'Clear today to keep it going'
                    : 'Clear today to start a streak'
              )}
              {t(record.bestStreak > 0 ? msg(' · best {0}', [t(record.bestStreak)]) : '')}
            </span>
          </span>
          <span
            className={modes.freezes}
            title={t('Freezes cover a missed day. One banked every 7 days.')}
          >
            {Array.from({ length: MAX_FREEZES }, (_, i) => (
              <span key={i} className={i < record.freezes ? undefined : modes.freezeEmpty}>
                <SnowIcon />
              </span>
            ))}
          </span>
        </div>

        <QuestList profile={profile} day={today} />

        <MenuDisclosure
          title={t('Daily archive')}
          hint={t('Past 30 days · practice without XP or streaks')}
        >
          <GamePicker
            label={t('Archive date')}
            placeholder={t('Choose a date')}
            value={archive}
            onChange={setArchive}
            options={Array.from({ length: 31 }, (_, i) => {
              const date = new Date(now.getTime() - i * 86400000);
              return {
                value: dayKey(date),
                name: date.toLocaleDateString(locale(), {
                  calendar: 'gregory',
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                }),
                hint: dayKey(date)
              };
            })}
          />
          <button
            type="button"
            className={styles.ghost}
            disabled={
              !archive ||
              archive > today ||
              archive < dayKey(new Date(now.getTime() - 30 * 86400000))
            }
            onClick={() => onPlay(`a2-${archive}`)}
          >
            {t('Play archive')}
          </button>
          {archive && <PaddleNotice profile={profile} policy="daily" dailyKey={`a2-${archive}`} />}
        </MenuDisclosure>

        <p className={styles.note}>
          {t(
            'Everyone plays the same court today. Clear it for a bonus and to grow your streak; every seven days banks a freeze that covers a missed day.'
          )}
        </p>
      </div>
    </Screen>
  );
}
