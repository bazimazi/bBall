interface SoundIconProps {
  muted: boolean;
}

export function SoundIcon({ muted }: SoundIconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path className="body" d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z" />
      {muted ? (
        <>
          <path d="m16 9.5 5 5" />
          <path d="m21 9.5-5 5" />
        </>
      ) : (
        <>
          <path d="M15.6 9a4.3 4.3 0 0 1 0 6" />
          <path d="M18.2 6.6a7.8 7.8 0 0 1 0 10.8" />
        </>
      )}
    </svg>
  );
}
