/**
 * Glyphs for the home screen's corner buttons. Drawn in currentColor, like
 * the mode icons, so each takes its colour from the button it sits in.
 */

export function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.6 7.6 0 01-2.3 1.3l-.3 2h-4l-.3-2a7.6 7.6 0 01-2.3-1.3l-1.9.7-2-3.4 1.6-1.2a7.7 7.7 0 010-3l-1.6-1.2 2-3.4 1.9.7a7.6 7.6 0 012.3-1.3l.3-2h4l.3 2a7.6 7.6 0 012.3 1.3l1.9-.7 2 3.4-1.6 1.2a7.7 7.7 0 010 3z"
      />
    </svg>
  );
}

export function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        d="M12 3l2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1z"
      />
    </svg>
  );
}

export function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"
      />
    </svg>
  );
}
