import { t, msg } from '../../core/i18n/index';
/**
 * Small glyphs for the newer modes. Drawn in currentColor, so each one takes
 * its colour from wherever it sits.
 */

export function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"
      />
    </svg>
  );
}

export function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.5 2c.6 3.2-1 5.1-2.6 6.9C8.4 10.6 7 12.3 7 15a5 5 0 0010 0c0-2-.8-3.4-1.8-4.6.1 1.5-.5 2.6-1.5 3.1.6-3.9-.6-7.9-1.2-11.5z"
      />
    </svg>
  );
}

export function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 20.5l-1.3-1.2C6 15.1 3 12.4 3 8.9 3 6.1 5.2 4 7.9 4c1.6 0 3.1.8 4.1 2 1-1.2 2.5-2 4.1-2C18.8 4 21 6.1 21 8.9c0 3.5-3 6.2-7.7 10.4z"
      />
    </svg>
  );
}

export function SnowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"
      />
    </svg>
  );
}

export function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        d="M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5zM9 4v13M15 6.5v13"
      />
    </svg>
  );
}

export function SwordsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2M9.5 17.5L21 6V3h-3L6.5 14.5M11 19l-6-6M8 16l-4 4M5 21l-2-2"
      />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3"
      />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 12.5l4.5 4.5L19 7.5"
      />
    </svg>
  );
}

export function CrownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 11H5zM5 19.5h14V21H5z" />
    </svg>
  );
}

/** Three stars, lit by a mask. */
export function StarRow({
  mask,
  className,
  on
}: {
  mask: number;
  className: string | undefined;
  on: string | undefined;
}) {
  return (
    <span
      className={className}
      aria-label={t(msg('{0} of 3 stars', [t((mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1))]))}
    >
      {[1, 2, 4].map((bit) => (
        <span key={bit} className={mask & bit ? on : undefined}>
          <StarIcon />
        </span>
      ))}
    </span>
  );
}
