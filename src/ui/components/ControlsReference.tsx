import { t, msg } from '../../core/i18n/index';
import { useCoarsePointer } from '../hooks/useCoarsePointer';
import styles from '../Screens.module.css';
import { useSettings } from '../hooks/useSettings';
import { keyList, keyName, skillAction } from '../../core/settings/controls';

/** The same short control reference is available before play and on pause. */
export function ControlsReference({ versus = false }: { versus?: boolean }) {
  const coarse = useCoarsePointer();
  const { keyBindings, touchMode } = useSettings();
  const up = [...keyBindings.up, ...keyBindings.p2Up].map(keyName).join(' / ');
  const down = [...keyBindings.down, ...keyBindings.p2Down].map(keyName).join(' / ');
  return (
    <dl className={styles.controls}>
      <div>
        <dt>{t('Move')}</dt>
        <dd>
          {t(
            versus
              ? coarse
                ? msg('Drag on your half{0}', [
                    t(touchMode === 'relative' ? ' from any clear spot' : ' of the court')
                  ])
                : msg('Player 1: {0} up, {1} down · Player 2: {2} up, {3} down', [
                    keyList(keyBindings, 'up'),
                    keyList(keyBindings, 'down'),
                    keyList(keyBindings, 'p2Up'),
                    keyList(keyBindings, 'p2Down')
                  ])
              : coarse
                ? touchMode === 'relative'
                  ? 'Drag from a clear spot to move your paddle'
                  : 'Drag anywhere along your paddle’s lane'
                : msg('Move the mouse · {0} up / left · {1} down / right', [t(up), t(down)])
          )}
        </dd>
      </div>
      <div>
        <dt>{t('Serve / skip replay')}</dt>
        <dd>
          {t(
            coarse ? 'Tap the court' : msg('Click the court · {0}', [keyList(keyBindings, 'serve')])
          )}
        </dd>
      </div>
      {!versus && (
        <div>
          <dt>{t('Skills')}</dt>
          <dd>
            {t(
              coarse
                ? 'Tap an equipped skill'
                : Array.from({ length: 9 }, (_, slot) =>
                    msg('{0}: {1}', [t(slot + 1), keyList(keyBindings, skillAction(slot))])
                  ).join(' · ')
            )}
          </dd>
        </div>
      )}
      <div>
        <dt>{t('Pause / sound')}</dt>
        <dd>
          {t(
            coarse
              ? 'Use the buttons in the top corner'
              : msg('Esc / {0} to pause · {1} to mute', [
                  keyList(keyBindings, 'pause'),
                  keyList(keyBindings, 'mute')
                ])
          )}
        </dd>
      </div>
    </dl>
  );
}
