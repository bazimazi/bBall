import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { accountStore } from './core/account/store';
import { experienceEnabled } from './dev/experienceBridge';
import { installBackRouting } from './core/platform/back';
import { installNativeInsets } from './core/platform/insets';
import { restoreFullscreen } from './core/platform/fullscreen';
import { installDeepLinkRouting } from './core/platform/shell';
import { installWindowShortcuts } from './core/platform/window';
import { App } from './ui/App';
import './styles/global.css';

// Restores a signed-in session and drains whatever the last session queued.
// Deliberately before the first render: a returning player should see their own
// level straight away rather than a guest profile that changes a moment later.
accountStore.start();

// Both are no-ops in a browser tab. In a packaged build they are how a social
// sign-in gets back in (`bball://oauth?...`) and how F11 reaches the window.
void installDeepLinkRouting();
installWindowShortcuts();

// Arms the history guard the back button is routed through. Done before the
// first render so the very first press - which on Android would otherwise
// close the app outright - already has somewhere to land.
installBackRouting();

// On Android, the status and navigation bars the WebView leaves out of
// `env(safe-area-inset-*)`. Before the first render, so nothing lays out twice.
installNativeInsets();
void restoreFullscreen();

const container = document.getElementById('root');
if (!container) throw new Error('bBall: #root is missing from index.html.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Local opt-in profiling, deferred out of ordinary game startup.
if (experienceEnabled)
  void import('./dev/experience')
    .then(({ installExperience }) => installExperience())
    .catch((error: unknown) => {
      console.warn('bBall experience capture could not start.', error);
    });
