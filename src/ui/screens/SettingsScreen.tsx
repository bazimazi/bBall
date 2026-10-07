import { t, msg } from '../../core/i18n/index';
import { useEffect, type CSSProperties } from 'react';

import {
  settingsStore,
  type DeviceSettings,
  type CanvasQuality,
  type EffectsLevel,
  type ShakeLevel,
  type TouchMode,
  type SkillSide
} from '../../core/settings/store';
import { Screen } from '../components/Screen';
import { useSettings } from '../hooks/useSettings';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import { useFullscreen } from '../hooks/useFullscreen';
import { setFullscreenPreference } from '../../core/platform/fullscreen';
import { isNativeShell } from '../../core/platform/shell';
import styles from '../Screens.module.css';
import { KeyBindingsEditor } from '../components/KeyBindingsEditor';
import { keyList } from '../../core/settings/controls';
import { LANGUAGES } from '../../core/i18n/languages';

interface SettingsScreenProps {
  /** Return to Pause rather than leaving or automatically resuming the match. */
  pausedGame?: boolean;
  /** Play a sample through the effects bus, so a new level can be heard. */
  onPreview: () => void;
  onMusicPreview: () => void;
  onStopPreview: () => void;
  onBack: () => void;
}

interface Choice<T> {
  readonly id: T;
  readonly label: string;
}

const SHAKES: readonly Choice<ShakeLevel>[] = [
  { id: 'full', label: 'Full' },
  { id: 'gentle', label: 'Gentle' },
  { id: 'off', label: 'Off' }
];

const SIDES: readonly Choice<SkillSide>[] = [
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' }
];

const EFFECTS: readonly Choice<EffectsLevel>[] = [
  { id: 'full', label: 'Full' },
  { id: 'calm', label: 'Calm' }
];

const CANVAS_QUALITIES: readonly Choice<CanvasQuality>[] = [
  { id: 'high', label: 'High' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'low', label: 'Low' }
];

const SERVES: readonly Choice<boolean>[] = [
  { id: true, label: 'Automatic' },
  { id: false, label: 'When ready' }
];

const TOUCH_MODES: readonly Choice<TouchMode>[] = [
  { id: 'direct', label: 'Follow finger' },
  { id: 'relative', label: 'Relative drag' }
];

const TOGGLE: readonly Choice<boolean>[] = [
  { id: true, label: 'On' },
  { id: false, label: 'Off' }
];

/** A row of mutually exclusive buttons - the one pressed is the setting. */
function Segmented<T extends string | boolean>({
  label,
  choices,
  value,
  onChange,
  disabled = false
}: {
  label: string;
  choices: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.segmented} role="group" aria-label={t(label)}>
      {choices.map((choice) => (
        <button
          key={String(choice.id)}
          type="button"
          className={choice.id === value ? `${styles.ghost} ${styles.selected}` : styles.ghost}
          aria-pressed={choice.id === value}
          disabled={disabled}
          onClick={() => onChange(choice.id)}
        >
          {t(choice.label)}
        </button>
      ))}
    </div>
  );
}

/** A 0..1 level as a 0..100 slider, its value printed beside it. */
function Level({
  label,
  value,
  onChange,
  onCommit
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onCommit?: () => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <label className={styles.slider}>
      <span className={styles.sliderLabel}>{t(label)}</span>
      <input
        className={styles.range}
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        style={{ '--fill': `${percent}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
      <span className={styles.sliderValue}>
        {t(percent === 0 ? 'Off' : msg('{0}%', [t(percent)]))}
      </span>
    </label>
  );
}

/**
 * This device's settings: how it sounds, how it feels, and which side the
 * skill buttons sit on. None of it is synced - it belongs to the phone in
 * the hand, not to the player. Pacing choices leave rally speeds unchanged.
 */
export function SettingsScreen({
  pausedGame = false,
  onPreview,
  onMusicPreview,
  onStopPreview,
  onBack
}: SettingsScreenProps) {
  useEffect(() => onStopPreview, [onStopPreview]);
  const settings = useSettings();
  const fullscreen = useFullscreen();
  const touch = useCoarsePointer();
  const mobile =
    (!isNativeShell && touch) || fullscreen.target === 'android' || fullscreen.target === 'ios';
  const fullscreenSupported =
    fullscreen.target !== 'checking' && fullscreen.target !== 'unsupported';
  const set = (patch: Partial<DeviceSettings>) => settingsStore.update(patch);

  return (
    <Screen
      title={t('Settings')}
      subtitle={t(pausedGame ? 'Game paused · This device only' : 'This device only')}
      onBack={onBack}
      onEscape={pausedGame ? onBack : undefined}
      footer={
        pausedGame && (
          <button type="button" className={styles.primary} onClick={onBack}>
            {t('Return to paused game')}
          </button>
        )
      }
    >
      <p className={styles.sectionLabel}>{t('Language')}</p>
      <Segmented
        label={t('Language')}
        choices={LANGUAGES}
        value={settings.language}
        onChange={(language) => set({ language })}
      />
      {mobile && (
        <>
          <p className={styles.sectionLabel}>{t('Fullscreen')}</p>
          <Segmented
            label={t('Fullscreen')}
            choices={TOGGLE}
            value={settings.fullscreen}
            disabled={!fullscreenSupported || fullscreen.pending}
            onChange={(enabled) => void setFullscreenPreference(enabled)}
          />
          <p className={styles.note} role="status">
            {t(
              fullscreen.error ??
                (fullscreen.target === 'checking'
                  ? 'Checking fullscreen support…'
                  : !fullscreenSupported
                    ? 'Fullscreen is unavailable in this browser or app.'
                    : settings.fullscreen && !fullscreen.active && !fullscreen.pending
                      ? 'Tap On or start a match to enter fullscreen again.'
                      : fullscreen.target === 'ios'
                        ? 'Hide the status bar and let the Home indicator fade while playing.'
                        : 'Hide system bars for more room to play. Swipe from the screen edge to reveal them.')
            )}
          </p>
        </>
      )}
      <p className={styles.sectionLabel}>{t('Sound')}</p>
      <div className={styles.card}>
        <div className={styles.settingStack}>
          <Level
            label={t('Music')}
            value={settings.musicVolume}
            onChange={(musicVolume) => set({ musicVolume })}
            onCommit={onMusicPreview}
          />
          <Level
            label={t('Effects')}
            value={settings.sfxVolume}
            onChange={(sfxVolume) => set({ sfxVolume })}
            onCommit={onPreview}
          />
        </div>
      </div>
      <button type="button" className={styles.ghost} onClick={onMusicPreview}>
        {t('Preview music · 5 seconds')}
      </button>
      <p className={styles.note}>
        {t('The soundtrack follows the rally. Both previews respect the mute button.')}
      </p>

      <p className={styles.sectionLabel}>{t('Visual effects')}</p>
      <Segmented
        label={t('Visual effects')}
        choices={EFFECTS}
        value={settings.effects}
        onChange={(effects) => set({ effects })}
      />
      <p className={styles.note}>
        {t(
          'Calm removes camera movement, screen flashes and animated menu backgrounds, with fewer particles.'
        )}
      </p>

      <p className={styles.sectionLabel}>{t('Screen shake')}</p>
      <Segmented
        label={t('Screen shake')}
        choices={SHAKES}
        value={settings.shake}
        onChange={(shake) => set({ shake })}
      />
      <p className={styles.note}>{t('Camera movement stays off when Calm is active.')}</p>

      <p className={styles.sectionLabel}>{t('Court image quality')}</p>
      <Segmented
        label={t('Court image quality')}
        choices={CANVAS_QUALITIES}
        value={settings.canvasQuality}
        onChange={(canvasQuality) => set({ canvasQuality })}
      />
      <p className={styles.note}>
        {t(
          'If rallies stutter, try Balanced or Low. The court looks softer on high-resolution screens; menu text, controls and game timing stay the same.'
        )}
      </p>

      <p className={styles.sectionLabel}>{t('Controls')}</p>
      <KeyBindingsEditor />
      <Segmented
        label={t('Touch movement')}
        choices={TOUCH_MODES}
        value={settings.touchMode}
        onChange={(touchMode) => set({ touchMode })}
      />
      <p className={styles.note}>
        {t(
          'Follow finger places the paddle at your finger. Relative drag moves from its current position, so you can steer from a clear part of the court.'
        )}
      </p>
      {settings.touchMode === 'relative' && (
        <label className={styles.slider}>
          <span className={styles.sliderLabel}>{t('Drag sensitivity')}</span>
          <input
            type="range"
            className={styles.range}
            min={50}
            max={200}
            step={25}
            value={settings.touchSensitivity * 100}
            style={
              { '--fill': `${((settings.touchSensitivity - 0.5) / 1.5) * 100}%` } as CSSProperties
            }
            onChange={(event) => set({ touchSensitivity: Number(event.target.value) / 100 })}
          />
          <span className={styles.sliderValue}>
            {t(Math.round(settings.touchSensitivity * 100))}
            {t('%')}
          </span>
        </label>
      )}

      <p className={styles.sectionLabel}>{t('Serve pacing')}</p>
      <Segmented
        label={t('Serve pacing')}
        choices={SERVES}
        value={settings.autoServe}
        onChange={(autoServe) => set({ autoServe })}
      />
      <p className={styles.note}>
        {t('When ready waits for a tap, ')}
        {t(keyList(settings.keyBindings, 'serve'))}
        {t(' or the Serve button. Drag to aim without launching.')}
      </p>

      <p className={styles.sectionLabel}>{t('Countdown after pause')}</p>
      <Segmented
        label={t('Countdown after pause')}
        choices={TOGGLE}
        value={settings.resumeCountdown}
        onChange={(resumeCountdown) => set({ resumeCountdown })}
      />

      <p className={styles.sectionLabel}>{t('Vibration')}</p>
      <Segmented
        label={t('Vibration')}
        choices={TOGGLE}
        value={settings.haptics}
        onChange={(haptics) => set({ haptics })}
      />

      <p className={styles.sectionLabel}>{t('Replay the deciding point')}</p>
      <Segmented
        label={t('Replay the deciding point')}
        choices={TOGGLE}
        value={settings.replays}
        onChange={(replays) => set({ replays })}
      />

      {/* Stored on this device, not the profile: it follows the hand holding
          the phone, and a demo must not be able to change it for the real save. */}
      <p className={styles.sectionLabel}>{t('Skill buttons')}</p>
      <Segmented
        label={t('Skill button side')}
        choices={SIDES}
        value={settings.skillSide}
        onChange={(skillSide) => set({ skillSide })}
      />
    </Screen>
  );
}
