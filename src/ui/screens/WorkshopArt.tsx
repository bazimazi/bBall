import { useId } from 'react';
import { kitName } from '../../core/equipment/catalog';
import type { PaddleKit } from '../../core/equipment/types';
import { MATERIAL_COLOURS } from './workshopVisuals';

/** Material silhouettes also identify choices when colours are indistinguishable. */
export function MaterialGlyph({ id }: { id: string }) {
  let shape;
  switch (id) {
    case 'springsteel':
      shape = <path d="M5 4h14L7 8l10 4-10 4 12 4H5" />;
      break;
    case 'cork':
      shape = (
        <>
          <rect x="4" y="4" width="16" height="16" rx="4" />
          <path d="m8 8 1 1m6-2 1 1m-4 4 1 1m-6 3 1 1m8-1 1 1" />
        </>
      );
      break;
    case 'memory-gel':
      shape = (
        <>
          <path d="M12 3C9 7 5 10 5 14a7 7 0 0 0 14 0c0-4-4-7-7-11Z" />
          <path d="M9 15c0 2 2 3 4 3" />
        </>
      );
      break;
    case 'rubber':
      shape = (
        <path d="M3 7c3-5 6 5 9 0s6 5 9 0M3 12c3-5 6 5 9 0s6 5 9 0M3 17c3-5 6 5 9 0s6 5 9 0" />
      );
      break;
    case 'ceramic':
      shape = (
        <>
          <path d="m12 3 9 9-9 9-9-9Z" />
          <path d="M6 12h12M12 6v12" />
        </>
      );
      break;
    case 'graphite':
      shape = (
        <>
          <path d="m4 8 4-4m-4 9 9-9M4 18 18 4M7 20 20 7m-8 13 8-8m-3 8 3-3" />
          <path d="M4 4h16v16H4Z" />
        </>
      );
      break;
    case 'woven':
      shape = <path d="M4 5h16M4 12h16M4 19h16M5 4v16m7-16v16m7-16v16M4 8h4v8h8V8h4" />;
      break;
    case 'split':
      shape = (
        <>
          <rect x="4" y="3" width="16" height="18" rx="3" />
          <path d="M4 9h16M4 15h16M7 6l2-1 3 2 3-2 2 1M7 18l2-1 3 2 3-2 2 1" />
        </>
      );
      break;
    case 'extended':
      shape = (
        <>
          <rect x="8" y="6" width="8" height="12" rx="2" />
          <path d="M12 2v3m-3-1 3-2 3 2M12 19v3m-3-2 3 2 3-2M4 6v12m16-12v12" />
        </>
      );
      break;
    case 'compact':
      shape = (
        <>
          <rect x="8" y="7" width="8" height="10" rx="2" />
          <path d="M12 2v3m-3-2 3 2 3-2M12 19v3m-3-1 3-2 3 2M4 8v8m16-8v8" />
        </>
      );
      break;
    case 'copper':
      shape = (
        <>
          <path d="M4 6h8v12h8M4 18h4V6h12" />
          <circle cx="3" cy="6" r="1.5" />
          <circle cx="21" cy="18" r="1.5" />
          <circle cx="21" cy="6" r="1.5" />
        </>
      );
      break;
    case 'balanced-core':
      shape = (
        <>
          <path d="m12 3 9 5v8l-9 5-9-5V8Zm-9 5 9 5 9-5M12 13v8" />
        </>
      );
      break;
    case 'balanced-frame':
      shape = (
        <>
          <rect x="6" y="3" width="12" height="18" rx="4" />
          <rect x="9" y="6" width="6" height="12" rx="2" />
        </>
      );
      break;
    case 'empty-insert':
      shape = (
        <>
          <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
          <path d="M9 12h6" />
        </>
      );
      break;
    default:
      shape = (
        <>
          <rect x="5" y="3" width="14" height="18" rx="4" />
          <path d="M9 8h6m-6 4h6m-6 4h6" />
        </>
      );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shape}
    </svg>
  );
}

export function WorkshopSymbol({
  kind
}: {
  kind: 'marks' | 'check' | 'lock' | 'play' | 'target' | 'attack' | 'edge';
}) {
  const shape =
    kind === 'marks' ? (
      <>
        <path d="m12 3 8 9-8 9-8-9Z" />
        <path d="m12 7 4 5-4 5-4-5Z" />
      </>
    ) : kind === 'check' ? (
      <path d="m5 12 4 4 10-10" />
    ) : kind === 'lock' ? (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
      </>
    ) : kind === 'play' ? (
      <path d="m8 4 12 8-12 8Z" />
    ) : kind === 'attack' ? (
      <path d="m13 3-9 11h7l-1 7 10-12h-8Z" />
    ) : kind === 'edge' ? (
      <>
        <path d="M4 3v18m4-3L20 6m-6 0h6v6" />
        <circle cx="8" cy="18" r="2" />
      </>
    ) : (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
        <path d="M12 1v4m0 14v4M1 12h4m14 0h4" />
      </>
    );
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shape}
    </svg>
  );
}

/** A schematic assembly preview, independent of collision geometry or live charges. */
export function PaddlePreview({ kit }: { kit: PaddleKit }) {
  const id = useId().replace(/:/g, '');
  const face = MATERIAL_COLOURS[kit.surface];
  const core = MATERIAL_COLOURS[kit.core];
  const height = kit.frame === 'extended' ? 158 : kit.frame === 'compact' ? 136 : 148;
  const top = 120 - height / 2;
  return (
    <svg viewBox="0 0 320 240" role="img" aria-label={`Paddle assembly preview: ${kitName(kit)}`}>
      <defs>
        <linearGradient id={`${id}-face`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor={face} />
          <stop offset=".5" stopColor={face} stopOpacity=".4" />
          <stop offset="1" stopColor={face} stopOpacity=".8" />
        </linearGradient>
        <pattern id={`${id}-grid`} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0v24" fill="none" stroke="#a5c9ee" strokeOpacity=".09" />
        </pattern>
        <pattern id={`${id}-texture`} width="8" height="8" patternUnits="userSpaceOnUse">
          <path
            d={
              kit.surface === 'woven'
                ? 'M0 2h8M2 0v8'
                : kit.surface === 'graphite'
                  ? 'm0 8 8-8'
                  : 'M2 4h4'
            }
            stroke={face}
            strokeOpacity=".35"
          />
        </pattern>
      </defs>
      <rect width="320" height="240" fill={`url(#${id}-grid)`} />
      <ellipse cx="160" cy="217" rx="56" ry="7" fill={face} opacity=".09" />
      <circle cx="160" cy="120" r="89" fill="none" stroke={face} strokeOpacity=".14" />
      <circle
        cx="160"
        cy="120"
        r="105"
        fill="none"
        stroke={face}
        strokeOpacity=".12"
        strokeDasharray="3 8"
      />
      <path
        d="m30 173 70-22 146-86 48 21"
        fill="none"
        stroke={face}
        strokeWidth="1.5"
        strokeOpacity=".5"
        strokeDasharray="4 5"
      />
      <path
        d="M25 26h15m-15 0v15m270-15h-15m15 0v15M25 214h15m-15 0v-15m270 15h-15m15 0v-15"
        stroke={face}
        strokeOpacity=".4"
        fill="none"
      />
      <g transform="rotate(12 160 120)">
        <rect
          x="128"
          y={top - 5}
          width="53"
          height={height + 10}
          rx="12"
          fill="#080f1d"
          stroke={MATERIAL_COLOURS[kit.frame]}
          strokeWidth="2"
        />
        <rect x="135" y={top} width="9" height={height} rx="4" fill={core} opacity=".75" />
        <rect
          x="144"
          y={top}
          width="29"
          height={height}
          rx="7"
          fill={`url(#${id}-face)`}
          stroke={face}
        />
        <rect x="144" y={top} width="29" height={height} rx="7" fill={`url(#${id}-texture)`} />
        <path d={`M149 ${top + 8}v${height - 16}`} stroke="white" strokeOpacity=".3" />
        {kit.surface === 'rubber' && (
          <path
            d="M151 108q4-5 8 0t8 0m-16 9q4-5 8 0t8 0m-16 9q4-5 8 0t8 0"
            fill="none"
            stroke="#171a30"
            strokeWidth="2"
          />
        )}
        {kit.surface === 'ceramic' && (
          <path d="m159 106 8 12-8 12-8-12Z" fill="none" stroke="#0c293d" strokeWidth="2" />
        )}
        {kit.surface === 'split' && (
          <>
            <path d="M144 87h29m-29 62h29" stroke="#eef2ff" strokeWidth="2" />
            <path d="M146 90h25v55h-25Z" fill="#c4e9ff" fillOpacity=".5" />
            <path d="M151 116h15m-15 7h15" stroke="#192941" />
          </>
        )}
        {kit.core === 'memory-gel' && <path d="m139 112 3 8-3 8-3-8Z" fill="#e2d7ff" />}
        {kit.insert === 'copper' && (
          <path
            d={`M133 ${top + 14}h-9v40h9m-9 44v38h9`}
            stroke="#ffb17a"
            strokeWidth="3"
            fill="none"
          />
        )}
        <path
          d={`M130 ${top + 17}h-5m5 ${height - 34}h-5m53 0h6m-6 ${34 - height}h6`}
          stroke={core}
          strokeWidth="2"
        />
      </g>
      <circle cx="247" cy="66" r="13" fill={face} opacity=".09" />
      <circle cx="247" cy="66" r="5" fill="#f0fcff" />
      <path d="M208 40h24m-24 0v13M81 183H54v14" fill="none" stroke={face} strokeOpacity=".4" />
    </svg>
  );
}
