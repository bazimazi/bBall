import { t, msg } from '../../core/i18n/index';
import { SCHOOL_SCOUT } from '../../core/modes/recipes';
import { weeklySeed } from '../../core/daily/daily';
import { dayKey } from '../../core/progression/xp';
import { startRun } from '../../core/account/progression';
import { profileStore } from '../../core/profile/store';
import { useState, type CSSProperties } from 'react';

import { botProfile } from '../../core/bots/levels';
import { bossById } from '../../core/modes/bosses';
import type { PlayerProfile } from '../../core/profile/types';
import { boonById, type BoonDef, type BoonFamily } from '../../core/run/boons';
import {
  encounterFor,
  heartsFor,
  isRunActive,
  PRESSURE,
  pressureUnlocked,
  type RunSave
} from '../../core/run/run';
import { Screen } from '../components/Screen';
import { kitName } from '../../core/equipment/catalog';
import { PaddleNotice } from '../components/PaddleNotice';
import { MenuDisclosure } from '../components/MenuDisclosure';
import { ChoiceGroup } from '../components/ChoiceGroup';
import { GamePicker } from '../components/GamePicker';
import { ConfirmAction } from '../components/ConfirmAction';
import { HeartIcon } from '../icons/ModeIcons';
import {
  actLength,
  actIndex,
  atBoundary,
  runLength,
  runPosition,
  RUN_FORMATS,
  type RunFormat
} from '../../core/run/formats';
import { runAction } from '../../core/account/progression';
import modes from '../Modes.module.css';
import styles from '../Screens.module.css';

interface GauntletScreenProps {
  profile: PlayerProfile;
  onStart: (pressure: number, format?: RunFormat) => void;
  onPlay: () => void;
  onPick: (boonId: string) => void;
  onAbandon: () => void;
  onBack: () => void;
  onWorkshop?: (() => void) | undefined;
}

const FAMILY_HUE: Record<BoonFamily, number> = {
  power: 22,
  control: 190,
  defense: 150,
  tempo: 280,
  relic: 310,
  duo: 46
};

const FAMILY_NAME: Record<BoonFamily, string> = {
  power: 'Power',
  control: 'Control',
  defense: 'Defense',
  tempo: 'Tempo',
  relic: 'Relic · 3 sockets',
  duo: 'Duo'
};

const accent = (hue: number): CSSProperties =>
  ({ '--accent': `hsl(${hue} 90% 66%)` }) as CSSProperties;

function Hearts({ run }: { run: RunSave }) {
  const total = Math.max(heartsFor(run.pressure), run.hearts);
  return (
    <span className={modes.hearts} aria-label={t(msg('{0} hearts left', [t(run.hearts)]))}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < run.hearts ? undefined : modes.heartLost}>
          <HeartIcon />
        </span>
      ))}
    </span>
  );
}

/**
 * The Gauntlet, in whichever state it is in: a run to start, a draft to
 * pick from, or the road ahead with the next opponent named.
 */
export function GauntletScreen({
  profile,
  onStart,
  onPlay,
  onPick,
  onAbandon,
  onBack,
  onWorkshop
}: GauntletScreenProps) {
  const run = profile.progress.run;
  if (!isRunActive(run)) return <StartView profile={profile} onStart={onStart} onBack={onBack} />;
  if (run.offer && (run.equipment?.version ?? 0) <= 1)
    return <DraftView run={run} onPick={onPick} onBack={onBack} />;
  return (
    <RunView
      key={`${profile.id}:${run.seed}:${run.startedAt}:${run.stage}:${run.hearts}`}
      run={run}
      onPlay={onPlay}
      onAbandon={onAbandon}
      onBack={onBack}
      onWorkshop={onWorkshop}
    />
  );
}

// ------------------------------------------------------------------ start

function StartView({
  profile,
  onStart,
  onBack
}: {
  profile: PlayerProfile;
  onStart: (pressure: number, format?: RunFormat) => void;
  onBack: () => void;
}) {
  const records = profile.progress.runRecords;
  const unlocked = pressureUnlocked(records);
  const [pressure, setPressure] = useState(0);
  const [format, setFormat] = useState<RunFormat>('expedition');
  const last = profile.progress.lastRun;

  return (
    <Screen
      title={t('Gauntlet')}
      subtitle={t(
        records.runs > 0
          ? msg('{0} run{1} · {2} cleared', [
              t(records.runs),
              t(records.runs > 1 ? 's' : ''),
              t(records.clears)
            ])
          : 'Choose a short run, an expedition or endless depth'
      )}
      onBack={onBack}
      footer={
        <button type="button" className={styles.primary} onClick={() => onStart(pressure, format)}>
          {t(pressure > 0 ? msg('Start at Pressure {0}', [t(pressure)]) : 'Start a run')}
        </button>
      }
    >
      <PaddleNotice profile={profile} policy="run" />
      <div className={modes.stagger} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className={modes.detail} style={accent(340)}>
          <div className={modes.detailHead}>
            <h3 className={modes.detailName}>{t('Build a run. Find your limit.')}</h3>
            <p className={modes.detailBlurb}>
              {t(
                'Win fights. Draft boons. Keep your build until the run ends. Lose a fight, lose a heart. Try the same opponent again.'
              )}
            </p>
          </div>
        </div>

        <ChoiceGroup<RunFormat>
          label={t('Run length')}
          value={format}
          onChange={setFormat}
          options={RUN_FORMATS.map((f) => ({
            value: f,
            name: f === 'sprint' ? 'Sprint' : f === 'expedition' ? 'Expedition' : 'Endless',
            hint: f === 'sprint' ? '9 fights' : f === 'expedition' ? '36 fights' : 'No final fight'
          }))}
        />

        <GamePicker
          label={t(msg('Pressure · {0} starting hearts', [t(heartsFor(pressure))]))}
          value={pressure}
          onChange={setPressure}
          options={Array.from({ length: Math.min(51, unlocked + 2) }, (_, level) => ({
            value: level,
            name: level === 0 ? '0 · Standard' : `${level} · ${PRESSURE[level - 1]!.name}`,
            tag: String(level),
            disabled: level > unlocked,
            hint:
              level > unlocked
                ? `Clear Pressure ${unlocked} to unlock`
                : `${heartsFor(level)} starting hearts`
          }))}
        />
        {unlocked < 50 && (
          <p className={styles.rowBlurb} style={{ margin: 0 }}>
            {t('Clear Pressure ')}
            {t(unlocked)}
            {t(' to unlock ')}
            {t(unlocked + 1)}
            {t('.')}
          </p>
        )}
        <MenuDisclosure
          title={t('Run rules')}
          hint={t(
            pressure > 0
              ? msg('Pressure {0} · cumulative rules', [t(pressure)])
              : 'Resumable · rewards kept after each fight'
          )}
        >
          <p className={styles.rowBlurb}>
            {t(
              'Closing the game saves your run. Starting a fight commits its court and route. Restarting or discarding an unfinished fight costs one heart.'
            )}
          </p>
          {pressure > 0 ? (
            <div className={modes.ranks}>
              {PRESSURE.filter(
                (rank) => rank.level <= pressure && (rank.level <= 5 || rank.level === pressure)
              ).map((rank) => (
                <span key={rank.level} className={modes.rankLine}>
                  <b>{t(rank.level)}</b> {t(rank.name)}
                  {t(' · ')}
                  {t(rank.blurb)}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.rowBlurb}>
              {t('Standard pace, three hearts and three boon choices.')}
            </p>
          )}
        </MenuDisclosure>
        <button
          type="button"
          className={styles.row}
          onClick={() => startRun(0, 'expedition', weeklySeed(dayKey()))}
        >
          <span className={styles.rowText}>
            <span className={styles.rowTitle}>{t('Weekly expedition')}</span>
            <span className={styles.rowBlurb}>
              {t('36 shared fights · Pressure 0 · saves between fights')}
            </span>
          </span>
        </button>

        {last && (
          <div className={styles.card}>
            <p className={styles.sectionLabel} style={{ marginTop: 0 }}>
              {t('Last run')}
            </p>
            <p className={styles.rowBlurb}>
              {t(
                last.won
                  ? msg('Cleared at Pressure {0}', [t(last.pressure)])
                  : msg('Reached {0}', [t(runPosition(last))])
              )}
              {t(
                Object.keys(last.boons).length > 0
                  ? msg(' · {0} boons', [t(Object.keys(last.boons).length)])
                  : ''
              )}
            </p>
            {last.won && last.version === 2 && last.format !== 'endless' && (
              <button type="button" className={styles.ghost} onClick={() => runAction('continue')}>
                {t('Continue this build into Endless')}
              </button>
            )}
          </div>
        )}
      </div>
    </Screen>
  );
}

// ------------------------------------------------------------------ draft

function DraftView({
  run,
  onPick,
  onBack
}: {
  run: RunSave;
  onPick: (id: string) => void;
  onBack: () => void;
}) {
  const offer = (run.offer ?? [])
    .map((id) => boonById(id))
    .filter((boon): boon is BoonDef => !!boon);
  return (
    <Screen
      title={t('Choose a boon')}
      subtitle={t(msg('Encounter {0} won · {1}', [t(run.stage), t(run.format ?? 'Sprint')]))}
      onBack={onBack}
    >
      <p className={styles.note}>
        {t(run.equipment ? kitName(run.equipment.kit) : 'Legacy neutral paddle')}
        {t(' · starting kit saved for this run')}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Hearts run={run} />
      </div>
      <div className={modes.draft}>
        {offer.map((boon) => {
          const owned = run.boons[boon.id] ?? 0;
          const classes = boon.family === 'duo' ? `${modes.boon} ${modes.duo}` : modes.boon;
          return (
            <button
              key={boon.id}
              type="button"
              className={classes}
              style={accent(FAMILY_HUE[boon.family])}
              onClick={() => onPick(boon.id)}
            >
              <span className={modes.boonTop}>
                <span className={modes.boonName}>{t(boon.name)}</span>
                <span className={modes.boonFamily}>{t(FAMILY_NAME[boon.family])}</span>
              </span>
              <span className={modes.boonBlurb}>{t(boon.blurb)}</span>
              {!boon.instant && boon.maxRank > 1 && (
                <span
                  className={modes.boonRank}
                  aria-label={t(msg('Rank {0} of {1}', [t(owned + 1), t(boon.maxRank)]))}
                >
                  {Array.from({ length: boon.maxRank }, (_, i) => (
                    <span
                      key={i}
                      className={
                        i < owned
                          ? `${modes.pip} ${modes.pipOn}`
                          : i === owned
                            ? `${modes.pip} ${modes.pipNew}`
                            : modes.pip
                      }
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <BoonList run={run} />
      {run.version === 2 && (
        <button
          type="button"
          className={styles.ghost}
          disabled={(run.credits ?? 0) < 2 || offer.every((b) => b.id === 'repair-credit')}
          onClick={() => runAction('reroll')}
        >
          {t('Reroll draft · 2 credits (')}
          {t(run.credits ?? 0)}
          {t(' held)')}
        </button>
      )}
    </Screen>
  );
}

function BoonList({ run }: { run: RunSave }) {
  const owned = Object.entries(run.boons).filter(([, rank]) => rank > 0);
  if (owned.length === 0) return null;
  return (
    <MenuDisclosure
      title={t('Your build')}
      hint={t(
        msg('{0} boons · {1}/3 relics', [
          t(owned.length),
          t(owned.filter(([id]) => boonById(id)?.family === 'relic').length)
        ])
      )}
    >
      <div className={modes.boonChips}>
        {owned.map(([id, rank]) => {
          const boon = boonById(id);
          if (!boon) return null;
          return (
            <span key={id} className={modes.boonChip} style={accent(FAMILY_HUE[boon.family])}>
              {t(boon.name)}
              {t(boon.maxRank > 1 ? msg(' {0}', [t(rank)]) : '')}
            </span>
          );
        })}
      </div>
    </MenuDisclosure>
  );
}

// -------------------------------------------------------------------- run

function ActTrack({ run, act }: { run: RunSave; act: number }) {
  return (
    <div className={modes.act} style={{ '--nodes': actLength(run) } as CSSProperties}>
      <span className={modes.actLabel}>
        {t('Act ')}
        {t(act + 1)}
      </span>
      {Array.from({ length: actLength(run) }, (_, slot) => {
        const stage = act * actLength(run) + (run.actOffset ?? 0) + slot;
        const encounter = encounterFor(run, stage);
        const won = run.results.some((item) => item.stage === stage && item.won);
        const classes = [modes.node];
        if (won) classes.push(modes.nodeDone);
        if (stage === run.stage) classes.push(modes.nodeNow);
        if (encounter.boss) classes.push(modes.nodeBoss);
        const known = stage <= run.stage;
        const name = encounter.boss
          ? known
            ? (bossById(encounter.boss)?.spec.name ?? 'Boss')
            : 'Boss'
          : known
            ? botProfile(encounter.bot).name
            : '?';
        const results = run.results.filter((item) => item.stage === stage);
        const score = results[results.length - 1];
        return (
          <span
            key={stage}
            className={classes.join(' ')}
            aria-current={stage === run.stage ? 'step' : undefined}
            aria-label={t(
              msg('Encounter {0} · {1}{2}', [
                t(stage + 1),
                t(name),
                t(won ? ' · won' : stage === run.stage ? ' · next' : '')
              ])
            )}
            title={t(msg('Encounter {0} · {1}', [t(stage + 1), t(name)]))}
          >
            <span className={modes.nodeName}>{t(stage + 1)}</span>
            <span>
              {t(
                score
                  ? msg('{0}-{1}', [t(score.you), t(score.bot)])
                  : stage === run.stage
                    ? 'Next'
                    : encounter.boss
                      ? 'Boss'
                      : '·'
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function RunView({
  run,
  onPlay,
  onAbandon,
  onBack,
  onWorkshop
}: {
  run: RunSave;
  onPlay: () => void;
  onAbandon: () => void;
  onBack: () => void;
  onWorkshop?: (() => void) | undefined;
}) {
  const [confirm, setConfirm] = useState(false);
  const next = encounterFor(run);
  const boss = next.boss ? bossById(next.boss) : undefined;
  const lastResult = run.results[run.results.length - 1];
  const rematch = lastResult && !lastResult.won && lastResult.stage === run.stage;
  const currentAct = actIndex(run);
  const futureActs = [currentAct + 1, currentAct + 2].filter(
    (act) => act * actLength(run) + (run.actOffset ?? 0) < runLength(run)
  );

  return (
    <Screen
      title={t('Gauntlet')}
      subtitle={t(msg('Pressure {0} · {1}', [t(run.pressure), t(runPosition(run))]))}
      onBack={onBack}
      footer={
        <>
          <button
            type="button"
            className={styles.primary}
            disabled={(run.equipment?.version ?? 0) > 1}
            onClick={() => {
              if (run.attempt) {
                if (!runAction('restart')) return;
                if (!profileStore.getSnapshot().progress.run) return;
              }
              onPlay();
            }}
          >
            {t(
              run.attempt
                ? msg('Restart · lose 1 heart{0}', [t(run.hearts === 1 ? ' (ends run)' : '')])
                : rematch
                  ? 'Rematch'
                  : boss
                    ? msg('Face {0}', [t(boss.spec.name)])
                    : 'Play next match'
            )}
          </button>
          <div className={styles.runActions}>
            {run.version === 2 &&
              run.format === 'endless' &&
              run.stage > 0 &&
              !run.attempt &&
              atBoundary(run) && (
                <button type="button" className={styles.ghost} onClick={() => runAction('bank')}>
                  {t('Bank this run')}
                </button>
              )}
            <button type="button" className={styles.ghost} onClick={() => setConfirm(true)}>
              {t('End run')}
            </button>
          </div>
        </>
      }
    >
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Hearts run={run} />
      </div>

      <p className={styles.note}>
        {t(
          (run.equipment?.version ?? 0) > 1
            ? 'This run uses unsupported paddle rules. End this run and start another; your banked rewards stay.'
            : msg('{0} · kit saved for this run', [
                t(run.equipment ? kitName(run.equipment.kit) : 'Legacy neutral paddle')
              ])
        )}
      </p>
      <div className={modes.acts} aria-label={t('Upcoming acts')}>
        <ActTrack run={run} act={currentAct} />
      </div>

      <div className={modes.detail} style={accent(boss?.spec.hue ?? 340)}>
        <div className={modes.detailHead}>
          <span className={modes.stageNum}>
            {t(boss ? 'Boss' : msg('Act {0}', [t(next.act + 1)]))}
          </span>
          <h3 className={modes.detailName}>
            {t(boss ? boss.spec.name : msg('vs {0}', [t(botProfile(next.bot).name)]))}
          </h3>
          <p className={modes.detailBlurb}>
            {t(
              boss
                ? boss.spec.title
                : next.courtName
                  ? msg('On {0}', [t(next.courtName)])
                  : 'On a plain court'
            )}
            {t(msg(' · first to {0}', [t(next.winScore)]))}
          </p>
        </div>
      </div>

      {next.personality && (
        <p className={styles.rowBlurb}>
          {t(next.personality[0]!.toUpperCase() + next.personality.slice(1))}
          {t(' school ·')}
          {t(' ')}
          {t(SCHOOL_SCOUT[next.personality])}
        </p>
      )}
      {run.version === 2 && !run.attempt && atBoundary(run) && (
        <div className={modes.routeChoices}>
          <p className={styles.sectionLabel}>{t('Next route')}</p>
          {(['safe', 'risk'] as const).map((route) => (
            <button
              type="button"
              key={route}
              className={run.route === route ? styles.choiceOn : styles.choice}
              aria-pressed={run.route === route}
              onClick={() => runAction(route)}
            >
              <span>{t(route === 'safe' ? 'Steady route' : 'Risk route')}</span>
              <small>{t(encounterFor({ ...run, route }).courtName ?? 'Open court')}</small>
            </button>
          ))}
        </div>
      )}
      <BoonList run={run} />
      {run.attempt && (
        <p className={styles.rowBlurb}>
          {t(
            'This encounter was started. Its court and route stay fixed. You can return to an open paused match, or restart here for one heart.'
          )}
        </p>
      )}
      {run.version === 2 && !run.attempt && atBoundary(run) && (
        <MenuDisclosure
          title={t('Act services')}
          hint={t(msg('{0} credits · repair, upgrade or recycle', [t(run.credits ?? 0)]))}
        >
          {onWorkshop && run.stage > 0 && run.equipment?.version === 1 && (
            <button
              type="button"
              className={styles.ghost}
              disabled={(run.credits ?? 0) < 2}
              onClick={onWorkshop}
            >
              {t('Paddle service · 2 credits')}
            </button>
          )}
          <button
            type="button"
            className={styles.ghost}
            disabled={(run.credits ?? 0) < 3 || run.hearts >= 5}
            onClick={() => runAction('repair')}
          >
            {t('Repair a heart · 3 credits')}
          </button>
          {Object.entries(run.boons)
            .filter(([id, rank]) => {
              const boon = boonById(id);
              return (
                boon &&
                rank > 0 &&
                (boon.family === 'relic' ||
                  (boon.family !== 'duo' && !boon.instant && rank < boon.maxRank))
              );
            })
            .map(([id]) => {
              const boon = boonById(id)!;
              return (
                <button
                  type="button"
                  key={id}
                  className={styles.ghost}
                  disabled={boon.family !== 'relic' && (run.credits ?? 0) < 2}
                  onClick={() =>
                    runAction(`${boon.family === 'relic' ? 'recycle' : 'upgrade'}:${id}`)
                  }
                >
                  {t(
                    boon.family === 'relic'
                      ? msg('Recycle {0} · gain 2 credits', [t(boon.name)])
                      : msg('Upgrade {0} · 2 credits', [t(boon.name)])
                  )}
                </button>
              );
            })}
        </MenuDisclosure>
      )}
      {futureActs.length > 0 && (
        <MenuDisclosure
          title={t('Road ahead')}
          hint={t(
            futureActs.length === 1
              ? msg('Act {0}', [t(futureActs[0]! + 1)])
              : msg('Acts {0}–{1}', [
                  t(futureActs[0]! + 1),
                  t(futureActs[futureActs.length - 1]! + 1)
                ])
          )}
        >
          <div className={modes.acts}>
            {futureActs.map((act) => (
              <ActTrack key={act} run={run} act={act} />
            ))}
          </div>
        </MenuDisclosure>
      )}
      <ConfirmAction
        show={confirm}
        title={t('End this run?')}
        description={t(
          msg(
            'This ends the run at {0}, without another clear. Its boons and remaining hearts will not carry into a new run. Your earned XP and unlocks stay. You can keep the run and return later.',
            [t(runPosition(run))]
          )
        )}
        cancelLabel="Keep run"
        confirmLabel="End this run"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          onAbandon();
        }}
      />
    </Screen>
  );
}
