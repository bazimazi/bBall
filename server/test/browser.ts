/**
 * A browser, in as much detail as the client actually needs.
 *
 * The point of this file is that the end-to-end test can run the *real*
 * client modules - `profileStore`, the outbox, `accountStore`, the fetch
 * wrapper with its retries and its token refresh - against the *real* server,
 * with nothing stubbed in between except the parts of a browser that are not
 * the subject of the test.
 *
 * So: localStorage is a Map, `fetch` is `app.inject` with a cookie jar, and
 * the network can be switched off. Everything above that is production code.
 */

import type { FastifyInstance } from 'fastify';

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }

  /** Test-only: look at the raw bytes the client wrote. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.map);
  }
}

export interface FakeBrowser {
  readonly storage: MemoryStorage;
  /** Switch the network off; every request then fails as it would offline. */
  goOffline(): void;
  goOnline(): void;
  readonly online: boolean;
  /** Requests the client has made, for asserting on traffic. */
  readonly requests: { method: string; url: string }[];
  restore(): void;
}

/**
 * Install the globals the client expects, routed at `app`.
 *
 * Must be called *before* the client modules are imported: `profileStore` is
 * a module singleton that reads storage as it is constructed.
 */
export function installBrowser(app: FastifyInstance): FakeBrowser {
  const storage = new MemoryStorage();
  const requests: { method: string; url: string }[] = [];
  const cookies = new Map<string, string>();
  let online = true;

  const listeners = new Map<string, Set<() => void>>();
  const addListener = (type: string, handler: () => void) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(handler);
  };

  const windowStub = {
    localStorage: storage,
    addEventListener: addListener,
    removeEventListener: (type: string, handler: () => void) => {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent: (event: { type: string }) => {
      for (const handler of listeners.get(event.type) ?? []) handler();
      return true;
    },
    location: { pathname: '/', search: '', hash: '' },
    history: { replaceState: () => undefined }
  };

  const documentStub = {
    visibilityState: 'visible',
    addEventListener: addListener,
    removeEventListener: () => undefined
  };

  const saved = {
    window: (globalThis as Record<string, unknown>).window,
    document: (globalThis as Record<string, unknown>).document,
    fetch: globalThis.fetch,
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  };

  Object.defineProperty(globalThis, 'window', { value: windowStub, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: documentStub, configurable: true });
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      get onLine() {
        return online;
      },
      userAgent: 'bball-test'
    },
    configurable: true
  });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    requests.push({ method, url });

    if (!online) {
      // Exactly what a browser does with no network: a TypeError, not a
      // response the client could mistake for a refusal.
      throw new TypeError('fetch failed');
    }

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[key.toLowerCase()] = value;
    }
    if (cookies.size > 0) {
      headers.cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }

    const response = await app.inject({
      method: method as 'GET',
      url,
      headers,
      ...(init?.body === undefined ? {} : { payload: init.body as string })
    });

    // A real cookie jar, so the httpOnly refresh cookie path is what the test
    // exercises - the same one a browser would use.
    for (const cookie of response.cookies as { name: string; value: string }[]) {
      if (cookie.value === '') cookies.delete(cookie.name);
      else cookies.set(cookie.name, cookie.value);
    }

    return new Response(response.statusCode === 204 ? null : response.body, {
      status: response.statusCode,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  return {
    storage,
    requests,
    get online() {
      return online;
    },
    goOffline() {
      online = false;
      windowStub.dispatchEvent({ type: 'offline' });
    },
    goOnline() {
      online = true;
      windowStub.dispatchEvent({ type: 'online' });
    },
    restore() {
      if (saved.window === undefined) delete (globalThis as Record<string, unknown>).window;
      else Object.defineProperty(globalThis, 'window', { value: saved.window, configurable: true });
      if (saved.document === undefined) delete (globalThis as Record<string, unknown>).document;
      else
        Object.defineProperty(globalThis, 'document', {
          value: saved.document,
          configurable: true
        });
      if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator);
      globalThis.fetch = saved.fetch;
    }
  };
}

/** Let queued timers and microtasks run. */
export function settle(ms = 20): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
