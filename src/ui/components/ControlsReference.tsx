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
        <dt>Move</dt>
        <dd>
          {versus
            ? coarse
              ? `Drag on your half${touchMode === 'relative' ? ' from any clear spot' : ' of the court'}`
              : `Player 1: ${keyList(keyBindings, 'up')} up, ${keyList(keyBindings, 'down')} down · Player 2: ${keyList(keyBindings, 'p2Up')} up, ${keyList(keyBindings, 'p2Down')} down`
            : coarse
              ? touchMode === 'relative'
                ? 'Drag from a clear spot to move your paddle'
                : 'Drag anywhere along your paddle’s lane'
              : `Move the mouse · ${up} up / left · ${down} down / right`}
        </dd>
      </div>
      <div>
        <dt>Serve / skip replay</dt>
        <dd>{coarse ? 'Tap the court' : `Click the court · ${keyList(keyBindings, 'serve')}`}</dd>
      </div>
      {!versus && (
        <div>
          <dt>Skills</dt>
          <dd>
            {coarse
              ? 'Tap an equipped skill'
              : Array.from(
                  { length: 9 },
                  (_, slot) => `${slot + 1}: ${keyList(keyBindings, skillAction(slot))}`
                ).join(' · ')}
          </dd>
        </div>
      )}
      <div>
        <dt>Pause / sound</dt>
        <dd>
          {coarse
            ? 'Use the buttons in the top corner'
            : `Esc / ${keyList(keyBindings, 'pause')} to pause · ${keyList(keyBindings, 'mute')} to mute`}
        </dd>
      </div>
    </dl>
  );
}
