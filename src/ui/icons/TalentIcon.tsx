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
    case 'edge-pressure':
      return (
        <>
          <path d="M4 3v18M20 3v18M8 5l4 7-4 7" />
          <circle cx="16" cy="12" r="2.5" fill="currentColor" />
        </>
      );
    case 'time-slip':
      return (
        <>
          <path d="M5 3h14M5 21h14M7 3c0 5 10 13 10 18M17 3c0 5-10 13-10 18" />
        </>
      );
    case 'rally-armor':
      return (
        <>
          <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6Z" />
          <path d="M7 13h3l2-5 2 8 2-3h2" />
        </>
      );
    case 'fast-start':
      return (
        <>
          <path d="M3 5v14M7 5l8 7-8 7Z" fill="currentColor" />
          <path d="m16 5 6 7-6 7" />
        </>
      );
    case 'chain-casting':
      return (
        <>
          <circle cx="6" cy="7" r="3" />
          <circle cx="18" cy="17" r="3" />
          <path d="M9 7h7l-2-2M15 17H8l2 2M18 7v5M6 17v-5" />
        </>
      );
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
    case 'bank-shot':
      return (
        <>
          <path d="M2 3h20" />
          <path d="M4 21 12 4.5 20 21" />
          <circle cx="12" cy="4.5" r="2" fill="currentColor" stroke="none" />
        </>
      );
    case 'reckless':
      return (
        <>
          <circle cx="10.5" cy="14" r="7" fill="currentColor" stroke="none" />
          <path d="M15 9l3-3" />
          <path d="M20 1.5v2M22.5 4h-2M21.8 2.2l-1.3 1.3" />
        </>
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
    case 'long-reach':
      return (
        <>
          <rect x="10" y="6.5" width="4" height="11" rx="2" fill="currentColor" stroke="none" />
          <path d="M12 1.5v3M9.5 4 12 1.5 14.5 4M12 22.5v-3M9.5 20l2.5 2.5 2.5-2.5" />
        </>
      );
    case 'foresight':
      return (
        <>
          <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z" />
          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        </>
      );
    case 'swerve':
      return (
        <>
          <path d="M3 20c4-1 6-6 8-10s5-6 9-6" />
          <path d="M15.5 2.5 20 4l-1.5 4.5" />
        </>
      );
    case 'blink-strike':
      return (
        <>
          <rect x="3.5" y="3.5" width="4.5" height="17" rx="2.25" strokeDasharray="2.2 2.4" />
          <path
            d="M18 2.5 12 12h4.5L13.5 21.5 21 10.5h-4.5L18 2.5Z"
            fill="currentColor"
            stroke="none"
          />
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
    case 'bastion':
      return (
        <>
          <path d="M3 3v7M3 3h7M3 21v-7M3 21h7" />
          <circle cx="15" cy="12" r="3.2" fill="currentColor" stroke="none" />
        </>
      );
    case 'fortify':
      return (
        <>
          <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6Z" />
          <path d="M12 8.5v7M8.5 12h7" />
        </>
      );
    case 'counterstrike':
      return (
        <>
          <path d="M8 2.5 3 5v6.5c0 4.3 2.2 7.5 5 9" />
          <path d="M9.5 12h12M17.5 8l4 4-4 4" />
        </>
      );
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
    // ------------------------------------------------------------- momentum
    case 'hot-hand':
      return (
        <path
          d="M12 1.5c1 4 6.5 6.5 6.5 12.5a6.5 6.5 0 0 1-13 0c0-3.2 2-5.4 3.2-6.4 0 2.2 1 3.4 2.3 3.4 0-4-1.4-6.2 1-9.5Z"
          fill="currentColor"
          stroke="none"
        />
      );
    case 'unbroken':
      return (
        <>
          <path d="M9.5 14.5 7.3 16.7a3.6 3.6 0 0 1-5-5l3-3a3.6 3.6 0 0 1 5 0" />
          <path d="M14.5 9.5l2.2-2.2a3.6 3.6 0 0 1 5 5l-3 3a3.6 3.6 0 0 1-5 0" />
          <path d="M9 15l6-6" />
        </>
      );
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
    case 'tempo':
      return (
        <>
          <path d="M8 21.5h8L13.4 3h-2.8Z" />
          <path d="M12 16l5.5-9.5" />
        </>
      );
    case 'afterglow':
      return (
        <>
          <rect x="10" y="4" width="4" height="16" rx="2" fill="currentColor" stroke="none" />
          <path d="M6 8v8M18 8v8M2.5 10v4M21.5 10v4" />
        </>
      );
    case 'cooldown-mastery':
      return (
        <>
          <circle cx="12" cy="13" r="8.5" />
          <path d="M12 8.5V13l3 2" />
          <path d="M9 2h6" />
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
        <>
          <rect x="2.5" y="6" width="19" height="12" rx="3.5" />
          <path d="M12 9v6M9 12h6" />
        </>
      );

    // ------------------------------------------------------------ capstones
    // Busier than the rest on purpose: at 44px the bottom row should look
    // heavier than everything above it before a single word is read.
    case 'overload':
      return (
        <>
          <path
            d="M13 1.5 5.5 12H10l-1 10.5L18.5 11H14l-1-9.5Z"
            fill="currentColor"
            stroke="none"
          />
          <path d="M2.5 4 4 6M21.5 4 20 6M2 19l2-1.5M22 19l-2-1.5" />
        </>
      );
    case 'slipstream':
      return (
        <>
          <path d="M1 7h9M1 12h6M1 17h9" />
          <path d="M13 3.5 22.5 12 13 20.5V15H9.5V9H13Z" fill="currentColor" stroke="none" />
        </>
      );
    case 'aegis':
      return (
        <>
          <path
            d="M12 1.5 3 6v6.5c0 5.4 3.7 9.3 9 10.5 5.3-1.2 9-5.1 9-10.5V6Z"
            fill="currentColor"
            stroke="none"
          />
          <path
            d="M12 6.5 8 8.5v3.8c0 2.6 1.7 4.6 4 5.4 2.3-.8 4-2.8 4-5.4V8.5Z"
            fill="#0b0f18"
            stroke="none"
          />
        </>
      );
    case 'zenith':
      return (
        <>
          <path d="M12 2 22 20H2Z" fill="currentColor" stroke="none" />
          <path d="M12 8.5 14.6 14h-5.2Z" fill="#0b0f18" stroke="none" />
          <path d="M5 4.5 6 6.5M19 4.5 18 6.5" />
        </>
      );
    case 'redirect':
      return <path d="M3 18 12 6l9 12M12 6v9m-4-4 4 4 4-4" />;
    case 'anchor':
      return (
        <>
          <path d="M4 16 20 8M12 5v14M5 14c1 7 13 7 14 0" />
          <circle cx="12" cy="4" r="2" />
        </>
      );
    case 'breach':
      return <path d="M3 4h8v6H3zm10 10h8v6h-8zM4 20 20 4m-4 0h4v4" />;
    case 'relay':
      return (
        <>
          <path d="M3 12h18M12 3v18" />
          <circle cx="12" cy="12" r="5" />
        </>
      );
    case 'reserve':
      return (
        <>
          <path d="M6 3h12M6 21h12M7 3c0 6 10 12 10 18M17 3C17 9 7 15 7 21" />
        </>
      );
    case 'rebound':
      return <path d="M5 18 18 5M11 5h7v7M5 9V5h4M5 5l5 5" />;
    case 'echo':
      return (
        <>
          <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="9.5" />
        </>
      );
    default:
      return (
        <>
          <path d="M4 18 12 4l8 14Z" />
          <circle cx="12" cy="13" r="3" />
        </>
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
