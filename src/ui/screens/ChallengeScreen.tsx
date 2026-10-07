import { t, msg } from '../../core/i18n/index';
import { useState } from 'react';
import { botProfile } from '../../core/bots/levels';
import { CHALLENGES, contractChallenge } from '../../core/modes/challenges';
import type { PlayerProfile } from '../../core/profile/types';
import { Screen } from '../components/Screen';
import { PaddleNotice } from '../components/PaddleNotice';
import { MenuDisclosure } from '../components/MenuDisclosure';
import { GamePicker } from '../components/GamePicker';
import styles from '../Screens.module.css';

interface ChallengeScreenProps {
  profile: PlayerProfile;
  onPick: (id: string) => void;
  onBack: () => void;
}

export function ChallengeScreen({ profile, onPick, onBack }: ChallengeScreenProps) {
  const [page, setPage] = useState(0);
  const pageSize = 12;
  const pageCount = Math.ceil(CHALLENGES.length / pageSize);
  const seriesStart = Math.floor((profile.progress.contracts ?? 0) / 5) * 5 + 1;
  const seriesEnd = seriesStart + 4;
  const contract = contractChallenge((profile.progress.contracts ?? 0) + 1);
  const cleared = CHALLENGES.filter((item) => profile.challenges[item.id]?.cleared).length;

  return (
    <Screen
      title={t('Challenge')}
      subtitle={t(msg('{0} of {1} cleared', [t(cleared), t(CHALLENGES.length)]))}
      onBack={onBack}
    >
      <PaddleNotice profile={profile} policy="neutral" />
      <MenuDisclosure
        title={t('Five-trial contract playlist')}
        hint={t(
          msg('Set {0} · {1}/5 cleared', [
            t(Math.ceil(seriesStart / 5)),
            t((profile.progress.contracts ?? 0) - seriesStart + 1)
          ])
        )}
      >
        <p className={styles.rowBlurb}>
          {t('Seeded set ')}
          {t(Math.ceil(seriesStart / 5))}
          {t(' ·')}
          {t(' ')}
          {t((profile.progress.contracts ?? 0) - seriesStart + 1)}
          {t(' of 5 cleared. Complete each objective in order; progress survives reloads.')}
        </p>
        {Array.from({ length: 5 }, (_, i) => contractChallenge(seriesStart + i)).map((trial) => (
          <button
            type="button"
            className={styles.row}
            key={trial.id}
            disabled={Number(trial.id.slice(9)) > (profile.progress.contracts ?? 0) + 1}
            onClick={() => onPick(trial.id)}
          >
            {t(trial.name)}
            {t(' · ')}
            {t(trial.objective.label)}
            {t(Number(trial.id.slice(9)) <= (profile.progress.contracts ?? 0) ? ' ✓' : '')}
          </button>
        ))}
        <p className={styles.rowBlurb}>
          {t('Ends at contract ')}
          {t(seriesEnd)}
          {t('. Normal contract rewards; no playlist bonus.')}
        </p>
      </MenuDisclosure>
      <button type="button" className={styles.row} onClick={() => onPick(contract.id)}>
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{t(contract.name)}</span>
          <span className={styles.rowBlurb}>
            {t(contract.objective.label)}
            {t(' · Ongoing contract series')}
          </span>
        </span>
      </button>
      <nav className={styles.pager} aria-label={t('Trial pages')}>
        <button
          type="button"
          className={styles.ghost}
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          {t('Previous')}
        </button>
        <GamePicker
          label={t('Trial group')}
          compact
          value={page}
          onChange={setPage}
          options={Array.from({ length: pageCount }, (_, index) => ({
            value: index,
            name: `Trials ${index * pageSize + 1}–${Math.min((index + 1) * pageSize, CHALLENGES.length)}`
          }))}
        />
        <button
          type="button"
          className={styles.ghost}
          disabled={page === pageCount - 1}
          onClick={() => setPage(page + 1)}
        >
          {t('Next')}
        </button>
      </nav>
      <div className={styles.grid} key={page}>
        {CHALLENGES.slice(page * pageSize, (page + 1) * pageSize).map((challenge) => {
          const record = profile.challenges[challenge.id];
          const done = record?.cleared ?? false;
          return (
            <button
              key={challenge.id}
              type="button"
              className={styles.row}
              onClick={() => onPick(challenge.id)}
            >
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>
                  {t(challenge.name)}
                  {t(done ? ' ✓' : '')}
                </span>
                <span className={styles.rowBlurb}>{t(challenge.blurb)}</span>
                <span className={styles.rowBlurb}>
                  {t(challenge.objective.label)}
                  {t(' · vs ')}
                  {t(botProfile(challenge.bot).name)}
                </span>
              </span>
              <span className={done ? `${styles.rowMeta} ${styles.done}` : styles.rowMeta}>
                {t(done ? 'Cleared' : msg('{0} XP', [t(challenge.xp)]))}
              </span>
            </button>
          );
        })}
      </div>
    </Screen>
  );
}
