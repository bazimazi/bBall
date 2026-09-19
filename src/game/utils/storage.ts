/** localStorage access that degrades to a no-op in private mode. */

export function readStored(key: string, fallback: string): string {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: string | number): void {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* private mode - best effort only */
  }
}
