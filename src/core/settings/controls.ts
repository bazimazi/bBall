export const KEY_ACTIONS = [
  'up',
  'down',
  'p2Up',
  'p2Down',
  'serve',
  'pause',
  'mute',
  'skill1',
  'skill2',
  'skill3',
  'skill4',
  'skill5',
  'skill6',
  'skill7',
  'skill8',
  'skill9'
] as const;

export type KeyAction = (typeof KEY_ACTIONS)[number];
export type KeyBindings = Readonly<Record<KeyAction, readonly string[]>>;

export const DEFAULT_BINDINGS: KeyBindings = Object.freeze({
  up: Object.freeze(['w']),
  down: Object.freeze(['s']),
  p2Up: Object.freeze(['arrowup']),
  p2Down: Object.freeze(['arrowdown']),
  serve: Object.freeze([' ', 'enter']),
  pause: Object.freeze(['p']),
  mute: Object.freeze(['m']),
  skill1: Object.freeze(['1', 'q']),
  skill2: Object.freeze(['2', 'e']),
  skill3: Object.freeze(['3', 'r']),
  skill4: Object.freeze(['4', 'f']),
  skill5: Object.freeze(['5', 'v']),
  skill6: Object.freeze(['6']),
  skill7: Object.freeze(['7']),
  skill8: Object.freeze(['8']),
  skill9: Object.freeze(['9'])
});

export function keyName(key: string): string {
  const names: Record<string, string> = {
    ' ': 'Space',
    enter: 'Enter',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→'
  };
  return names[key] ?? key.toUpperCase();
}

export function actionLabel(action: KeyAction): string {
  const names: Partial<Record<KeyAction, string>> = {
    up: 'Move up / left',
    down: 'Move down / right',
    p2Up: 'Player 2 up / left',
    p2Down: 'Player 2 down / right',
    serve: 'Serve / skip replay',
    pause: 'Pause / resume',
    mute: 'Mute / unmute'
  };
  return names[action] ?? `Skill slot ${action.slice(5)}`;
}

export function keyList(bindings: KeyBindings, action: KeyAction): string {
  return bindings[action].map(keyName).join(' / ');
}

export function skillAction(slot: number): KeyAction {
  return `skill${slot + 1}` as KeyAction;
}

/** Escape and Tab remain available for pausing/cancelling and focus navigation. */
export function bindableKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    ((Array.from(key).length === 1 && !/\p{C}/u.test(key)) ||
      ['enter', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key))
  );
}

export function keyAction(bindings: KeyBindings, key: string): KeyAction | undefined {
  const normalized = key.toLowerCase();
  return KEY_ACTIONS.find((action) => bindings[action].includes(normalized));
}

/** Malformed maps fall back as a whole, so no action loses its only key. */
export function validateBindings(value: unknown): KeyBindings {
  if (!value || typeof value !== 'object') return DEFAULT_BINDINGS;
  const source = value as Record<string, unknown>;
  const seen = new Set<string>();
  const entries: [KeyAction, string[]][] = [];
  for (const action of KEY_ACTIONS) {
    const keys = source[action];
    if (!Array.isArray(keys) || keys.length < 1 || keys.length > 2) return DEFAULT_BINDINGS;
    const normalized: string[] = [];
    for (const raw of keys) {
      if (typeof raw !== 'string') return DEFAULT_BINDINGS;
      const key = raw.toLowerCase();
      if (!bindableKey(key) || seen.has(key)) return DEFAULT_BINDINGS;
      seen.add(key);
      normalized.push(key);
    }
    entries.push([action, normalized]);
  }
  return Object.fromEntries(entries) as unknown as KeyBindings;
}

export function assignKey(
  bindings: KeyBindings,
  action: KeyAction,
  slot: number,
  raw: string
): { bindings: KeyBindings; error: null } | { bindings: null; error: string } {
  const key = raw.toLowerCase();
  if (!bindableKey(key) || slot < 0 || slot > 1)
    return { bindings: null, error: 'Choose a letter, number, arrow, Space or Enter.' };
  const owner = keyAction(bindings, key);
  if (owner && (owner !== action || bindings[action].indexOf(key) !== slot))
    return {
      bindings: null,
      error: `${keyName(key)} is already assigned to ${actionLabel(owner)}.`
    };
  const keys = [...bindings[action]];
  keys[slot] = key;
  return { bindings: { ...bindings, [action]: keys }, error: null };
}
