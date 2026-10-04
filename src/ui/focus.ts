/** Focus behavior shared by the game's small, light-DOM dialogs. */
const scopes: { root: HTMLElement; block: () => void; release: () => void }[] = [];
const blocked = new Map<
  HTMLElement,
  { count: number; inert: string | null; hidden: string | null; pointer: string }
>();
const CONTROLS = 'button, a[href], input, select, textarea, summary, [tabindex]';

function visible(element: HTMLElement): boolean {
  const visibility = getComputedStyle(element).visibility;
  return (
    visibility !== 'hidden' &&
    visibility !== 'collapse' &&
    !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
    !element.matches(':disabled') &&
    element.getClientRects().length > 0
  );
}

function controls(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(CONTROLS)].filter(
    (element) => element.tabIndex >= 0 && visible(element)
  );
}

function block(element: HTMLElement): void {
  const saved = blocked.get(element);
  if (saved) {
    saved.count++;
    return;
  }
  blocked.set(element, {
    count: 1,
    inert: element.getAttribute('inert'),
    hidden: element.getAttribute('aria-hidden'),
    pointer: element.style.pointerEvents
  });
  element.setAttribute('inert', '');
  element.setAttribute('aria-hidden', 'true');
  element.style.pointerEvents = 'none';
}

function unblock(element: HTMLElement): void {
  const saved = blocked.get(element);
  if (!saved || --saved.count > 0) return;
  for (const [key, value] of [
    ['inert', saved.inert],
    ['aria-hidden', saved.hidden]
  ] as const) {
    if (value === null) element.removeAttribute(key);
    else element.setAttribute(key, value);
  }
  element.style.pointerEvents = saved.pointer;
  blocked.delete(element);
}

/** Activate on mount; dispose on close. JS containment also covers webviews without inert. */
export function activateDialog(root: HTMLElement, onDismiss: () => void): () => void {
  const doc = root.ownerDocument;
  const previous = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  const siblings = new Set<HTMLElement>();
  const activeScope = () => scopes[scopes.length - 1];
  const top = () => activeScope()?.root === root;
  const release = () => {
    for (const sibling of siblings) unblock(sibling);
    siblings.clear();
  };
  const background = () => {
    if (!top()) return;
    for (const sibling of siblings) {
      if (!sibling.isConnected) {
        unblock(sibling);
        siblings.delete(sibling);
      }
    }
    let branch: HTMLElement = root;
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement && !siblings.has(sibling)) {
          siblings.add(sibling);
          block(sibling);
        }
      }
      if (branch.parentElement === doc.body) break;
      branch = branch.parentElement;
    }
  };
  activeScope()?.release();
  const scope = { root, block: background, release };
  scopes.push(scope);
  const first = () => {
    const preferred = root.querySelector<HTMLElement>('[data-dialog-initial]');
    return preferred && visible(preferred) ? preferred : (controls(root)[0] ?? root);
  };
  // Move focus before hiding its previous ancestor from assistive technology.
  first().focus();
  background();
  const observer = new MutationObserver(background);
  observer.observe(doc.body, { childList: true, subtree: true });
  const onKey = (event: KeyboardEvent) => {
    if (!top() || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) onDismiss();
    } else if (event.key === 'Tab') {
      const available = controls(root);
      const current = available.indexOf(doc.activeElement as HTMLElement);
      if (current < 0 || (event.shiftKey ? current === 0 : current === available.length - 1)) {
        event.preventDefault();
        (event.shiftKey
          ? (available[available.length - 1] ?? root)
          : (available[0] ?? root)
        ).focus();
      }
    }
  };
  const onFocus = (event: FocusEvent) => {
    if (top() && event.target instanceof Node && !root.contains(event.target)) first().focus();
  };
  const onClick = (event: MouseEvent) => {
    if (top() && event.target instanceof Node && !root.contains(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('focusin', onFocus, true);
  doc.addEventListener('click', onClick, true);
  return () => {
    observer.disconnect();
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('focusin', onFocus, true);
    doc.removeEventListener('click', onClick, true);
    const wasTop = top();
    const at = scopes.indexOf(scope);
    if (at >= 0) scopes.splice(at, 1);
    release();
    if (!wasTop) return;
    activeScope()?.block();
    const parent = activeScope()?.root;
    const fallback = parent
      ? (controls(parent)[0] ?? parent)
      : (doc.querySelector<HTMLElement>('[data-screen-heading]') ??
        doc.querySelector<HTMLElement>('canvas[tabindex="-1"]'));
    const target =
      previous?.isConnected && previous !== doc.body && visible(previous) ? previous : fallback;
    target?.focus({ preventScroll: true });
  };
}
