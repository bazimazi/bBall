import type { TalentId } from '../../core/talents/types';

/**
 * One glyph per talent, drawn rather than shipped.
 *
 * The game has no image assets and this keeps it that way: every mark below
 * is a handful of primitives in a 24x24 box, sized and coloured by the tile
 * that hosts it. They exist to be told apart at 44px on a phone, so each one
 * leans on a different silhouette rather than on detail.
 */

interface TalentIconProps {
  id: TalentId;
}

/** Fills use `currentColor`; strokes use it too, via the wrapping <g>. */
function Glyph({ id }: TalentIconProps) {
  switch (id) {
    // ---------------------------------------------------------------- power
    case 'power-strike':
      return <path d="M13.5 2 5 13h5l-1.5 9L19 10h-5.5l1.5-8Z" fill="currentColor" stroke="none" />;
    case 'overdrive':
      return (
        <>
          <path d="M5 13l7-7 7 7" />
          <path d="M5 20l7-7 7 7" />
        </>
      );
    case 'heavy-impact':
      return (
        <>
          <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
        </>
      );
    case 'critical-strike':
      return (
        <path
          d="M12 1.5 14.4 9h7.6l-6.2 4.5 2.4 7.5-6.2-4.6L7.8 21l2.4-7.5L4 9h7.6Z"
          fill="currentColor"
          stroke="none"
        />
      );
    case 'momentum':
      return (
        <>
          <path d="M3 6l6 6-6 6" />
          <path d="M10 6l6 6-6 6" />
          <path d="M17 6l4 6-4 6" />
        </>
      );

    // -------------------------------------------------------------- control
    case 'quick-hands':
      return (
        <>
          <rect x="15" y="4" width="5" height="16" rx="2.5" fill="currentColor" stroke="none" />
          <path d="M3 8h8M2 12h9M3 16h8" />
        </>
      );
    case 'swift-recovery':
      return (
        <>
          <path d="M20 12a8 8 0 1 1-3-6.2" />
          <path d="M20 4v5h-5" />
        </>
      );
    case 'precision':
      return (
        <>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
          <path d="M12 1v5M12 18v5M1 12h5M18 12h5" />
        </>
      );
    case 'dash':
      return (
        <>
          <path d="M2 12h10" />
          <path d="M9 6l6 6-6 6" />
          <path d="M16 6l6 6-6 6" />
        </>
      );
    case 'perfect-guard':
      return (
        <>
          <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6Z" />
          <path d="M8.5 12.2 11 15l5-5.5" />
        </>
      );

    // -------------------------------------------------------------- defense
    case 'shield':
      return (
        <path
          d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6Z"
          fill="currentColor"
          stroke="none"
        />
      );
    case 'second-chance':
      return (
        <>
          <path d="M4 12a8 8 0 1 0 2.5-5.8" />
          <path d="M4 3v5h5" />
          <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
        </>
      );
    case 'stabilizer':
      return (
        <>
          <path d="M2 12h20" />
          <path d="M5 7v10M19 7v10" />
          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        </>
      );
    case 'resilience':
      return (
        <>
          <path d="M4 18a8 8 0 0 1 16 0" />
          <path d="M8 18a4 4 0 0 1 8 0" />
          <path d="M12 3v4" />
        </>
      );

    // ------------------------------------------------------------- momentum
    case 'combo-drive':
      return (
        <>
          <rect x="3" y="14" width="4" height="7" rx="1" fill="currentColor" stroke="none" />
          <rect x="10" y="9" width="4" height="12" rx="1" fill="currentColor" stroke="none" />
          <rect x="17" y="3" width="4" height="18" rx="1" fill="currentColor" stroke="none" />
        </>
      );
    case 'adrenaline':
      return <path d="M1 13h5l2.5-7 3.5 13 3-8 2 2h6" />;
    case 'clutch':
      return (
        <>
          <path d="M6 11V6.5a2 2 0 1 1 4 0V11" />
          <path d="M10 11V5a2 2 0 1 1 4 0v6" />
          <path d="M14 11V7a2 2 0 1 1 4 0v7a8 8 0 0 1-8 8 8 8 0 0 1-6-4l-2-4a2 2 0 0 1 3-2.4l1.5 1.4" />
        </>
      );
    case 'flow-state':
      return (
        <>
          <path d="M2 9c3-3 5 3 8 0s5 3 8 0" />
          <path d="M2 16c3-3 5 3 8 0s5 3 8 0" />
        </>
      );

    // -------------------------------------------------------------- mastery
    case 'cooldown-mastery':
      return (
        <>
          <circle cx="12" cy="13" r="8.5" />
          <path d="M12 8.5V13l3 2" />
          <path d="M9 2h6" />
        </>
      );
    case 'experience-boost':
      return (
        <>
          <path d="M12 21V5" />
          <path d="M6 11l6-6 6 6" />
          <path d="m19 15 .8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8Z" fill="currentColor" />
        </>
      );
    case 'talent-synergy':
      return (
        <>
          <circle cx="8.5" cy="12" r="6" />
          <circle cx="15.5" cy="12" r="6" />
        </>
      );
    case 'versatility':
      return (
        <path
          d="M12 1.5 14 10l8.5 2-8.5 2-2 8.5-2-8.5L1.5 12 10 10Z"
          fill="currentColor"
          stroke="none"
        />
      );
  }
}

/** The glyph alone. The tile around it supplies size, frame and colour. */
export function TalentIcon({ id }: TalentIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Glyph id={id} />
    </svg>
  );
}
