import { useCallback, useEffect, useState } from 'react';

import { accountStore } from '../../core/account/store';
import type { AccountToken } from '../screens/AccountScreen';

/**
 * Links arriving back into the game from outside it.
 *
 * Three of them, all on the hash because the game is a single page with no
 * router: `#/verify-email?token=`, `#/reset-password?token=` and
 * `#/oauth?status=` when a provider has finished with the browser.
 *
 * Each is handled the way it deserves. Confirming an address needs nothing
 * from the player, so it happens here. A password reset needs a new password,
 * so the token goes to the account screen. A social sign-in needs one more
 * request, so it is made immediately and the account screen is opened to show
 * the result.
 *
 * The hash is stripped in every case, because a live single-use code sitting
 * in the address bar ends up in browser history, in a screenshot, and in
 * whatever the player pastes into a bug report.
 */
export function useAccountLink(open: () => void): {
  token: AccountToken | null;
  clear: () => void;
} {
  const [token, setToken] = useState<AccountToken | null>(null);

  useEffect(() => {
    const read = () => {
      const hash = window.location.hash;
      const query = hash.indexOf('?');
      if (query < 0) return;

      const route = hash.slice(1, query);
      const params = new URLSearchParams(hash.slice(query + 1));

      const clean = () => {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      };

      if (route === '/oauth') {
        clean();
        const status = params.get('status');
        const code = params.get('code');

        if (status === 'ok' && code) {
          open();
          void accountStore.completeOAuth(code).catch((error: unknown) => {
            accountStore.reportOAuthFailure(
              error instanceof Error ? error.message : 'That sign-in did not complete.'
            );
          });
          return;
        }

        // Cancelled at the provider is not a failure worth shouting about;
        // anything else gets whatever reason the server was able to give.
        open();
        accountStore.reportOAuthFailure(
          status === 'cancelled' ? 'Sign-in cancelled.' : params.get('reason')
        );
        return;
      }

      const value = params.get('token');
      if (!value) return;

      if (route === '/verify-email') {
        clean();
        void accountStore.confirmVerification(value).catch(() => {
          // A stale or already-used link is not worth an error screen; the
          // account screen shows whether the address is confirmed.
        });
        return;
      }

      if (route === '/reset-password') {
        clean();
        setToken({ kind: 'reset', token: value });
        open();
      }
    };

    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [open]);

  const clear = useCallback(() => setToken(null), []);
  return { token, clear };
}
