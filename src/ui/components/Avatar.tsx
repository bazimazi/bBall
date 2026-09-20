import type { AvatarId } from '../../core/profile/types';
import styles from '../Screens.module.css';

interface AvatarProps {
  avatar: AvatarId;
  /** Any CSS colour; defaults to the player's accent. */
  color?: string | undefined;
  large?: boolean;
}

/** Six flat glyphs - no image assets, and they tint with the accent colour. */
function Glyph({ avatar }: { avatar: AvatarId }) {
  switch (avatar) {
    case 'ring':
      return <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="3" />;
    case 'spark':
      return (
        <path
          d="M12 2.5 14.2 9.8 21.5 12 14.2 14.2 12 21.5 9.8 14.2 2.5 12 9.8 9.8z"
          fill="currentColor"
        />
      );
    case 'wedge':
      return <path d="M12 3.5 21 20H3z" fill="currentColor" />;
    case 'grid':
      return (
        <g fill="currentColor">
          <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
        </g>
      );
    case 'bolt':
      return <path d="M13.5 2.5 5 13.5h5.5L10 21.5 19 10h-5.6z" fill="currentColor" />;
    case 'orb':
    default:
      return <circle cx="12" cy="12" r="8" fill="currentColor" />;
  }
}

export function Avatar({ avatar, color, large }: AvatarProps) {
  return (
    <span
      className={large ? `${styles.avatar} ${styles.avatarLarge}` : styles.avatar}
      style={{ color: color ?? 'var(--you)' }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24">
        <Glyph avatar={avatar} />
      </svg>
    </span>
  );
}
