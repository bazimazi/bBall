import type { GameSnapshot } from '../game/types';
import { useCoarsePointer } from './hooks/useCoarsePointer';
import styles from './TutorialCoach.module.css';
import { useSettings } from './hooks/useSettings';
import { keyName, keyList } from '../core/settings/controls';

interface TutorialCoachProps {
  snapshot: GameSnapshot;
  onSend: () => void;
  onNext: () => void;
  onPractice: () => void;
  onRestart: () => void;
  onExit: () => void;
}

export function TutorialCoach({
  snapshot,
  onSend,
  onNext,
  onPractice,
  onRestart,
  onExit
}: TutorialCoachProps) {
  const coarse = useCoarsePointer();
  const { keyBindings } = useSettings();
  const moveKeys = [
    ...keyBindings.up,
    ...keyBindings.down,
    ...keyBindings.p2Up,
    ...keyBindings.p2Down
  ]
    .map(keyName)
    .join(' / ');
  const step = snapshot.tutorialStep;
  if (!step) return null;
  const cleared = snapshot.tutorialCleared;
  const complete = step === 'complete';
  const title = complete
    ? 'Ready for a rally'
    : cleared
      ? 'Nice return!'
      : step === 'move'
        ? '1 / 3 · Move your paddle'
        : step === 'return'
          ? '2 / 3 · Meet the ball'
          : '3 / 3 · Place an angled return';
  const hint = complete
    ? 'You can move, return and choose an angle. Try a friendly Practice match next.'
    : cleared
      ? step === 'angle'
        ? 'The outer part sent it at an angle. You choose where the return goes.'
        : 'You met the ball. Next, use the outer part to choose an angle.'
      : step === 'move'
        ? `${coarse ? 'Drag on the court' : `Move your pointer, or use ${moveKeys}`} to put your paddle inside the dashed outline.`
        : step === 'return'
          ? 'Line up the centre of your paddle with the dashed outline. Send the ball when ready.'
          : 'Line up with the dashed outline so the ball meets the outer part. Keep the paddle still to see the angle.';
  const feedback =
    snapshot.tutorialFeedback === 'miss'
      ? 'Missed? Take your time and try the same shot again.'
      : snapshot.tutorialFeedback === 'centre'
        ? 'That was a centre return. Move into the outline to use the outer part.'
        : null;
  return (
    <section className={styles.coach} aria-label="First-rally lesson">
      <div role="status" aria-live="polite" aria-atomic="true">
        <h2>{title}</h2>
        <p>{hint}</p>
        {feedback && <p>{feedback}</p>}
      </div>
      <div className={styles.actions}>
        {complete ? (
          <>
            <button type="button" onClick={onPractice}>
              Play with Rookie
            </button>
            <button type="button" onClick={onRestart}>
              Repeat lesson
            </button>
          </>
        ) : cleared ? (
          <button type="button" onClick={onNext}>
            {step === 'return' ? 'Try an angle' : 'Finish lesson'}
          </button>
        ) : step !== 'move' && snapshot.status === 'serve' ? (
          <button type="button" onClick={onSend}>
            Send ball <small>· {coarse ? 'Tap' : keyList(keyBindings, 'serve')}</small>
          </button>
        ) : null}
        <button type="button" className={styles.exit} onClick={onExit}>
          {complete ? 'Back to guide' : 'Skip lesson'}
        </button>
      </div>
    </section>
  );
}
