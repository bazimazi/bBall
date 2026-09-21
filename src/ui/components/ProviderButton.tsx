import type { OAuthProviderDto } from '../../../shared/protocol';
import styles from '../Account.module.css';

interface ProviderButtonProps {
  provider: OAuthProviderDto;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * The provider marks.
 *
 * Drawn inline rather than loaded, for the same reason everything else in
 * this game is: no asset pipeline, nothing to 404, and they stay crisp at any
 * size. Anything the server offers that is not recognised here falls back to
 * its initial, so adding a provider server-side does not need a client
 * release to look right.
 *
 * Note for anyone shipping this: Google and Apple both publish sign-in button
 * guidelines covering mark, wording, spacing and contrast. These follow the
 * shape of them - full-width button, "Continue with X", the official mark -
 * but a production release should check the current guidelines rather than
 * trust this comment.
 */
function ProviderMark({ id, name }: { id: string; name: string }) {
  if (id === 'google') {
    return (
      <svg viewBox="0 0 48 48" aria-hidden="true" className={styles.mark}>
        <path
          fill="#4285f4"
          d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
        />
        <path
          fill="#34a853"
          d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
        />
        <path
          fill="#fbbc05"
          d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
        />
        <path
          fill="#ea4335"
          d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
        />
      </svg>
    );
  }

  if (id === 'apple') {
    return (
      <svg viewBox="0 0 384 512" aria-hidden="true" className={styles.mark}>
        <path
          fill="currentColor"
          d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
        />
      </svg>
    );
  }

  return (
    <span className={styles.markLetter} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** One full-width "Continue with X" button. */
export function ProviderButton({ provider, disabled, onClick }: ProviderButtonProps) {
  return (
    <button
      type="button"
      className={styles.provider}
      disabled={disabled ?? false}
      onClick={onClick}
    >
      <ProviderMark id={provider.id} name={provider.name} />
      <span>Continue with {provider.name}</span>
    </button>
  );
}
