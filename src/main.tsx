import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { accountStore } from './core/account/store';
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

const container = document.getElementById('root');
if (!container) throw new Error('bBall: #root is missing from index.html.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
