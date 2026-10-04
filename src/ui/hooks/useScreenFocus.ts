import { useLayoutEffect, useRef } from 'react';

/** Orient a new page at its heading without opening a touch keyboard. */
export function useScreenFocus() {
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (!heading.current?.closest('[inert]')) heading.current?.focus({ preventScroll: true });
  }, []);
  return heading;
}
