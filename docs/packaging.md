# Packaging bBall for desktop and mobile

The game ships twice from one codebase. On the web it is a Vite build served
next to the API. Everywhere else it is the same build inside a
[Tauri](https://tauri.app) shell: a native window, a system webview, and an
installer per operating system.

English and Persian use the same bundled client translations on web, desktop
and mobile. Language is selected at first-time setup or in Settings and stored
per device. Persian menus and canvas labels use the bundled Vazirmatn variable
font, including its OFL license; no font service is required. Persian menus use
right-to-left layout, with sound controls on the left, while the court and paddle
controls retain their orientation. Include language switching, Persian name
entry and mixed email/key labels in packaged-webview QA.

**Reduced-motion policy:** web, desktop and mobile builds completely ignore
operating-system and browser reduced-motion settings. Native wrappers must not
read or forward those preferences to change animations, effects or timing.
Only explicit in-game settings control their supported effects. See the
[root README](../README.md) and [project instructions](../AGENTS.md).
Choice-panel slide/fade transitions follow this policy in packaged webviews too.
Menu disclosure expansion, collapse, content fades and chevron rotation follow
the same policy on every platform.
Workshop selection highlights follow the selected view, part, tuning, preset
and contact-motion option in both LTR and RTL layouts, in Full and Calm.
Workshop panel motion follows the layout direction while continuing to ignore
system/browser motion preferences. Use `npm run check:rtl` for browser checks of
Persian pages, dialogs, slider input and keyboard navigation; repeat these in
packaged webviews, including touch sliders and email/name composition.

The endless-content expansion requires its matching API build and migration 6.
Publish web/native assets alongside the updated server; an older server rejects
new formats and operations. Existing IDs, saves and legacy run paths remain
supported. The [expansion report](validation/endless-progression-report.md) records
shared-rule and real database tests.

Physical QA should include Journey chapter/variant navigation, 50 Pressure
choices, six-act Expedition paging, deep Endless runs, build presets, Master
Daily, wave transitions and mirrored couch courts on short landscape screens.
Verify charge/guard, switch/gate and phase cues in Full and Calm, pointer/key
skill use, pause stepping, and restart after process termination. Gauntlet
preserves committed choices rather than a mid-rally snapshot; restarting an
unfinished encounter consumes one heart. Asset/DOM checks do not verify native
installers, visible layout, performance or perceived challenge.

The Paddle Workshop also requires the matching API build and database migration 7,
which preserves each cup's starting paddle. No new native permission is needed.
Deploy both sides together. Profile schema 4
repairs old saves to neutral equipment; existing runs/cups keep legacy neutral
rules. On physical devices, check the pinned loan-bench action, material choice
panels, keyboard/pointer/touch contacts, material marks, split seams, stored-impact
diamonds and engraved finishes in Full/Calm with sound both on and muted. Confirm
that process restarts preserve crafted ownership, presets and session kits.
Material flex and timing ignore all system/browser reduced-motion preferences.
Workshop selection highlights, directional panel changes and popup entry/exit
also ignore those preferences and run in both Full and Calm on every platform.
The [Workshop report](validation/paddle-workshop-report.md) records automated
coverage; browser screenshots do not establish native feel or performance.

The explicit Court image quality setting uses the same High/Balanced/Low
backing-density caps in web and native builds (2.5/1.5/1). It is stored on the
device and independent of Full/Calm effects. Native wrappers should preserve
the CSS viewport and pointer coordinates. Check court sharpness and frame times
at all three qualities on physical devices; a successful asset build does not
verify webview performance.

The [experience validation guide](player-experience-validation.md) supplies a
physical-device matrix and opt-in local timing/attempt capture. Browser test
sessions use `?experience=1`; packaged debug builds can explicitly set
`VITE_EXPERIENCE_CAPTURE=1` for their build command and inspect
`window.bballExperience` in the debug webview. Leave it unset for normal releases
and keep committed environment/packaging defaults unchanged. The recorder is
deferred, exports locally and adds no native permissions or server telemetry.
Use inspector-copy JSON if downloading is unavailable; verify that path on the
target device. Successful Safari-targeted assets do not verify an installer,
physical input, displayed-frame timing or enjoyment. Capture compares explicit
in-game effects/quality; it never reads system reduced-motion preferences.

Audio recovery handles both suspended and interrupted contexts, including the
WebKit audio constructor. First use explicitly requests resume; later game
gestures retry recovery without changing mute or volume. Hidden pages request
suspension even during an interruption, and an unfinished match stays paused
when the page returns. On Safari/WKWebView and other physical targets, test the
first gesture, tab/app switching, screen lock and an interruption by another
audio app, then choose Resume. Repeat while muted and with each volume at zero;
check that sound recovers only as permitted by the browser and the selected
settings, and that play remains paused until Resume. The lifecycle regressions
simulate states and API failures; they do not render samples or verify hardware
output, autoplay permission or phone interruption delivery.

Skill buttons use primary pointer contact and keyboard activation; auxiliary
mouse buttons and pen barrel presses must not spend a skill. On physical targets,
check single activation with mouse/touch/pen, focus and cooldown announcements,
Echo during the recast lockout, and feedback after Pause/Resume. Button feedback
uses match events and cleans up independently of cooldown updates. DOM checks do
not verify native event sequences, visible CSS timing or touch reachability.
The system reduced-motion policy above also applies to these rings.

Daily's Copy result action reports clipboard refusal and offers selectable text
for manual copying. Check real copy/retry, selection and status announcements on
each webview, including missing or denied clipboard access. The fallback belongs
to the scrolling content so Play remains pinned on short landscape screens.
Test a Daily page left open across local midnight or in a background app: returning
refreshes the preview and quests. A stale Play press refreshes first, then a fresh
press starts the displayed day. If rollover removes a focused copy control, Play
receives focus. These flows retain the server's daily window and saved records;
DOM substitutes do not verify clipboard permissions, timer delivery or layout.

Home's Daily tile shares the preview's local-calendar refresh and updates its
title, cleared stars and displayed streak at midnight and on visible return,
preserving focus. Calendar polling stops while hidden; a 30-second foreground
check also handles clock changes. Check Home and Daily across midnight, several
background days, and clock/timezone changes on each physical target, including
a daylight-saving boundary where applicable. Verify they agree on the displayed
day and that refreshing alone does not change saved medals or consume freezes.
Controlled DOM clocks do not verify OS clock changes or native visibility events.

Results focuses the outcome heading and includes device-save failure/retry in its
scrolling rewards body. Check heading/star-total announcements and retry focus on
physical webviews, including a short landscape screen with a failed save. Star
reveals must finish once through ordinary updates and stop pending chimes after
navigation. The controlled DOM checks do not verify actual sound or visible timing.
System reduced-motion preferences remain completely ignored for these reveals.

On Profile, test typed names with physical keyboards, virtual keyboards and IMEs.
Composition confirmation Enter must keep editing; ordinary Enter/blur commits
the cleaned name. While the page stays open, test an account refresh with an
untouched field and with a draft: the former follows the saved name, while the
latter stays until committed. Restoration/sign-out/Demo/reset must discard drafts
for the previous owner. Check stable input focus and avatar selection after sync.
The DOM checks substitute events/store payloads and do not verify actual IME
ordering, virtual keyboard behavior or a real network/account transition.

With a disposable first-run guest profile, open an account link and complete
sign-in after the game mounts. The Account page should retain its focused control;
Back should reach Home and never reopen the old identity/colour form. Returning
account data while onboarding is visible should replace it with Home. Test real
web OAuth returns and native deep links, cached relaunch, and signing out afterward.
Start/Skip cannot apply an old draft to the restored profile. Fresh Start/Skip
remain optional and should reach Home with heading focus. DOM checks substitute
profile arrivals rather than performing actual authentication or deep-link delivery.

Test a signed-in relaunch offline with a disposable account, both with its cached
profile present and with only that cache removed. Session/cookie and outbox must
remain on connection or temporary server failure. Cached play stays on the account;
without a cache, guest edits stay separate until the cloud profile loads. Reconnect
and visible return should retry, while Account's Try restoring account/Sync now
allow an explicit attempt even with a stale browser offline hint. Check pending
status, failed retry focus and handoff to Sync now after successful focused retry.
Repeat with delayed refresh/profile replies followed by sign-out or another
sign-in, and verify that old data cannot return. A genuinely ended session should
offer sign-in recovery. The in-memory API tests recreate reload boundaries and
network errors; they do not verify real cookie persistence, OS connectivity,
process relaunch, native webview events or keyboard/screen-reader announcements.

With disposable guest/account saves, enter Demo while real offline work is queued,
then reconnect or return to the app. The demo level, build and edits should remain
visible while only the real work syncs; Exit demo should reveal the latest account
save. Switch demo levels after an update and check that the new preview uses the
latest real identity. Open Account during a guest demo: any import offer must
describe the parked real guest, and creating an account or finishing a social
sign-in must never claim demo XP/matches. Check a failed account-cache write,
retry while Demo is active, then Exit/relaunch; only the latest real save belongs
in the cache. Include native visibility/deep-link delivery and keyboard/touch
focus. The automated API/DOM fixtures do not verify those physical behaviors.

Pause, exit and talent dialogs use a shared focus scope, with JavaScript Tab
and focus containment in addition to `inert`, so containment does not rely on
native `inert` support. Menu/Back routing and Gauntlet score display use indexed
access instead of `Array.at`, which is newer than the Safari 13 target. The DOM
interaction check removes that method to exercise those paths, but does not
emulate Safari or replace physical webview/assistive-technology checks.

Cup abandonment, Gauntlet abandonment and guest reset use the same focus scope
in alert dialogs with a visible title, consequence description and Keep action
focused first. Escape and browser/Android Back cancel before screen navigation.
Using a disposable guest save, check cancellation, deliberate acceptance, focus
return and description announcements on physical webviews. Check short landscape
screens too, where the card may need to scroll. Account restoration, signed-in
profiles and Demo must not offer guest reset. Overlay height uses a `vh` fallback
before `dvh` so older webviews retain a scrollable card height limit.

Device-save failures show a notice in menus and Pause/Exit, with an explicit
retry for the latest profile, settings and offline queue records. Using a
disposable test profile, force storage access/write failures, navigate between
menus, retry after recovery and relaunch to verify persistence. Preferences
should apply in the current session even before they can be saved. Check notice
scrolling, retry activation and success announcements in physical webviews;
device-save success and account-sync success are separate states.
Also deny reads at launch while retaining an older record. After restoring
access, retry must preserve that record and explain reopening to load it.
Repeat without an older record: the temporary profile should save normally.

Settings can open above a paused match. The engine stays mounted and frozen;
gameplay keys and canvas input are disabled while a menu covers the court.
Back returns to Pause, including during a pending or failed Settings load.
Check the same route with Android Back and Escape in physical webviews, then
resume using changed bindings, touch sensitivity and countdown preferences.

A changed CSS viewport pauses an active rally, serve or resume countdown before
the queued court layout. The same match remains in Pause with a resize
explanation and requires explicit Resume. Ball/trail and recorded replay
positions adapt between fixed paddle contact planes; existing misses remain
missed. On physical devices, rotate during an incoming shot, resize the desktop
window, repeat during a countdown and drag in both orientations. Check that
scores, lesson progress and cooldowns survive, a fresh drag works after Resume,
and the closing replay stays aligned with the court. Include browser chrome and
virtual-keyboard changes: unchanged viewport notifications retain input, while
actual CSS viewport size changes pause. Check whether these interruptions feel
appropriate. Asset and DOM checks cannot establish that behavior on a webview.

Menu pages load from separate JavaScript and CSS chunks. Package the entire
`dist/` output, as Tauri's `frontendDist` already does. A build that copies only
the entry script will break menu navigation. Run `npm run check:bundle` after
building to verify the emitted chunk files and their dependency graph.

Tauri rather than Electron, for one reason that matters to this project and one
that matters to players. The project's: the game is already a self-contained
canvas application with no Node dependencies at runtime, so bundling a second
JavaScript runtime would add sixty-odd megabytes and buy nothing. The players':
the installers come out in single-digit megabytes, because the webview is the
one already on their machine.

```
src-tauri/
  Cargo.toml            the shell's Rust dependencies
  tauri.conf.json       window, bundle, CSP, URL scheme
  capabilities/         what the web layer may ask the shell for
  icons/                generated from app-icon.png
  src/lib.rs            the whole shell: one window, three plugins, one command
  src/main.rs           desktop entry point
src/core/platform/
  back.ts               the back button, in a tab and on Android
  shell.ts              native detection, opening links, deep links, exit
  window.ts             full screen
```

## What you need installed

Every platform needs [Rust](https://rustup.rs) (1.77.2 or newer) and Node 22.

| Platform | Also needs                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows  | Visual Studio Build Tools with **Desktop development with C++** - the MSVC x64 libraries and the Windows SDK - plus WebView2, which Windows 11 has |
| macOS    | Xcode command line tools: `xcode-select --install`                                                                                                 |
| Linux    | `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev libxdo-dev patchelf build-essential file`                                                 |

`npx tauri info` prints what it can find and is the fastest way to see what is
missing. One trap on Windows: it reports MSVC as present when only the OneCore
libraries are installed. If a build then fails with
`LNK1104: cannot open file 'msvcrt.lib'` or a missing `excpt.h`, the C++ desktop
workload is the thing to add.

## Building

```bash
npm run desktop          # dev: hot-reloading game in a native window
npm run desktop:build    # installers for this OS, in src-tauri/target/release/bundle
```

`npm run desktop` starts Vite in `desktop` mode and opens the window against it,
so editing a component reloads the game in the window exactly as it would in a
tab.

A release build produces, per platform:

| Platform | Artifacts                                                             |
| -------- | --------------------------------------------------------------------- |
| Windows  | `.msi` (machine-wide) and `.exe` (NSIS, per-user)                     |
| macOS    | `.app` and `.dmg`; `--target universal-apple-darwin` covers both CPUs |
| Linux    | `.deb`, `.rpm` and `.AppImage`                                        |

Cross-compiling is not a thing here: each installer is built on its own
operating system. That is what `.github/workflows/release.yml` is for - push a
`v*` tag and it builds all three and attaches them to a draft release.

## Where the packaged game looks for the API

This is the one thing that genuinely differs from the web build.

A Tauri window serves the game from `tauri://localhost`, or
`http://tauri.localhost` on Windows. That is not the API's origin and cannot be
made into it, so the relative `/v1` path the web build uses would resolve into
the app bundle. A packaged build therefore needs an absolute API origin, which
comes from `VITE_API_URL` at build time - see [`.env.desktop`](../.env.desktop),
or export it to override:

```bash
VITE_API_URL=https://api.example.com npm run desktop:build
```

Two consequences, both already handled:

- **CORS.** These requests are cross-origin. The server allows
  `tauri://localhost` and `http://tauri.localhost` unconditionally - see
  `NATIVE_ORIGINS` in `server/src/http/plugins/security.ts` - so no deployment
  has to remember to add them.
- **The refresh token.** With an absolute API origin the httpOnly refresh cookie
  cannot be used, so the client stores the refresh token itself. That fallback
  already existed for split web deployments; `usesCookieSession` in
  `src/core/account/session.ts` is the switch.

A build left pointing at `http://127.0.0.1:8787` is not broken, it is simply a
single-player build: every sync fails, the outbox queues, and the game plays on
localStorage exactly as it does offline.

## Social sign-in, and the `bball://` scheme

A webview cannot host an OAuth provider. Google and the rest refuse to render in
embedded webviews, and even if they did not, navigating there would replace the
game with a page it could never come back from.

So a packaged build does the round trip outside itself:

1. The game asks the server to start a flow, saying it is a `native` client.
2. The authorize URL opens in the **system browser**, through the `opener`
   plugin.
3. The player signs in there.
4. The provider calls back to the API, which redirects to `NATIVE_RETURN_URL` -
   `bball://oauth?status=ok&code=...` by default.
5. The operating system hands that link to the running game, the `deep-link`
   plugin delivers it, and `src/core/platform/shell.ts` turns it into the same
   `#/oauth?...` hash route the web build already handles.

Which return address the server uses is recorded on the flow row when the flow
starts, and never read from the callback. The client picks between two
configured addresses and cannot supply a third, which is the difference between
a scheme handoff and an open redirect.

Scheme registration differs by platform, and none of it needs code:

- **macOS and iOS** - from the bundle's `Info.plist`, generated out of
  `plugins.deep-link.desktop.schemes` in `tauri.conf.json`.
- **Windows and Linux** - by the installer. A development build registers the
  scheme at runtime instead, and only in debug, so a dev run cannot take the
  scheme away from an installed copy.
- **Android** - Android does not route custom schemes from the browser the way
  desktop does. Publishing there means either an App Link (an HTTPS host you
  control, serving `/.well-known/assetlinks.json`, listed under
  `plugins.deep-link.mobile` in `tauri.conf.json`) or an intent filter added by
  hand to `src-tauri/gen/android/app/src/main/AndroidManifest.xml`.

Password sign-in needs none of this and works in every shell.

## Mobile

```bash
npm run android:init     # once: generates src-tauri/gen/android
npm run android          # on a device or emulator
npm run android:build    # -- --apk or -- --aab

npm run ios:init         # once: generates src-tauri/gen/apple (macOS only)
npm run ios
npm run ios:build
```

Android needs a JDK 17, the Android SDK and the NDK, with `NDK_HOME` set. iOS
needs Xcode and, for anything that leaves your own device, an Apple developer
account. `.github/workflows/android.yml` builds an unsigned APK on demand and
lists the full set of tools in order.

`gen/android` and `gen/apple` are generated, and regenerating them is safe:
`init` leaves existing files alone. Commit them once you edit anything inside
them - an intent filter, a permission, a launch screen - because from that point
they hold decisions that cannot be regenerated.

Layout already works on a phone: it is the same responsive canvas the browser
build uses, and `index.html` already sets `viewport-fit=cover` for the notch.
What mobile has not had is a pass on touch ergonomics for the ability bar, which
is worth doing before submitting to a store.

**Settings → Fullscreen** is a device preference, defaulting to Off. Android's
`MainActivity` hides both system bars with `WindowInsetsControllerCompat`, allows
temporary edge-swipe access, and restores the choice on launch/focus return.
The existing insets bridge continues to reserve display-cutout space when the
bars are hidden. Keep `ScreenBridge`'s annotated methods in ProGuard rules.
The iOS `set_mobile_fullscreen` command updates Tauri's view-controller status-bar
and Home-indicator preferences. iOS controls when the Home indicator fades.
Browser fullscreen requests run directly from On or play/replay/tutorial gestures;
a page reload waits for the next gesture rather than requesting on load.

Before release, check fullscreen On/Off, cold launch, rotation, app switching,
edge swipes, cutouts, keyboard input and pause/settings return on physical phones.
The [UI review](validation/endless-ui-review.md) records browser and compilation
evidence and the native verification limits.

## Icons

Every icon in `src-tauri/icons/` is generated, and `npm run icons` regenerates
all of them from [`scripts/app-icon.mjs`](../scripts/app-icon.mjs). The same
geometry also generates the SVG menu mark and the web icons in `public/brand/`:
opposing aqua and rose paddles, an aqua trail and a pearl-white ball on navy.
Change `MARK` in the script and every platform follows. The complete asset
inventory and artwork provenance are in [brand-assets.md](brand-assets.md).

What comes out, and who reads it:

| Files                               | Used by                                                  |
| ----------------------------------- | -------------------------------------------------------- |
| `icon.ico` (16-256px)               | the Windows executable, its taskbar and Explorer entries |
| `icon.icns`                         | the macOS app bundle, Dock and Finder                    |
| `32x32.png` ... `icon.png`          | Linux packages, and the window icon at runtime           |
| `Square*Logo.png`, `StoreLogo.png`  | the Microsoft Store packaging                            |
| `ios/AppIcon-*.png`                 | the iOS app icon set                                     |
| `android/mipmap-*/ic_launcher*.png` | the Android launcher                                     |

`bundle.icon` in `tauri.conf.json` lists which of these go into a build. The
32px PNG earns its place twice: Tauri also uses it as the window icon on Linux,
where there is no executable resource to read one from.

Two platforms need more than a scaled copy of the mark, which is why the script
exists rather than a bare `tauri icon`:

- **iOS rejects an alpha channel.** Not transparency in the image - the channel
  itself, at submission. So the set is generated with `--ios-color #06080f`,
  which composites the mark onto the background colour instead of the white
  that flag defaults to, and then flattened from RGBA to RGB.
- **Android crops the adaptive icon.** The foreground uses a 108dp canvas;
  the entire mark is scaled to fit inside its central 66dp safe circle, over
  a flat background (`values/ic_launcher_background.xml`). Legacy round icons
  are drawn as actual circles. API 33 resources add a white alpha silhouette
  for themed icons, while API 26 resources retain the full-colour layers.

Run `npm run icons` again after `android:init` or `ios:init`: once those
projects exist, they hold the copies that get built, and the script writes into
them as well as into `src-tauri/icons/`.

## Signing

Unsigned builds work; they warn. macOS shows "unidentified developer" until the
player right-clicks and chooses Open, and Windows shows SmartScreen until the
binary has a reputation.

To sign in CI, add these to the repository's Actions secrets. The release
workflow already passes them through, and ignores them when they are unset.

| Secret                                                                      | For                      |
| --------------------------------------------------------------------------- | ------------------------ |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` | signing the macOS bundle |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`                               | notarising it            |

Windows signing takes a certificate from a CA; add it as
`bundle.windows.certificateThumbprint` in `tauri.conf.json` once you have one.

## Updates

There is no updater configured. Adding one is a decision rather than a default,
because it means generating a signing key pair, keeping the private half in CI,
and hosting a manifest. When you want it: set `plugins.updater.pubkey` in
`tauri.conf.json`, add the `updater` bundle target, set
`TAURI_SIGNING_PRIVATE_KEY` in the release workflow, and flip
`includeUpdaterJson` to `true`.

## What the shell is allowed to do

`src-tauri/capabilities/default.json` is the whole list: full screen, the window
title, the platform name, deep links, and opening `https://` URLs. There is no
filesystem access, no shell access and no native HTTP client, because the game
needs none of it - it keeps its saves in `localStorage` and talks to its own API
with `fetch`. Anything added there should be added the same way: one permission,
for one thing the game actually does.

The one thing the shell does that is not a plugin is `exit_app`, a command in
`src/lib.rs`. Commands the app defines itself are not part of the capability
list; this one exists because a packaged build can honour "close the app" and a
browser tab cannot.

## The back button

Android's system back and a browser's back button arrive the same way, so they
are handled the same way. `src/core/platform/back.ts` keeps one spare history
entry alive at all times, which is what Tauri's Android activity checks
(`WebView.canGoBack()`) before it decides to finish the activity. Every press is
therefore delivered to the innermost thing on screen - a modal, then the screen
it sits in, then the screen stack in `useGameFlow` - and the app is closed only
from the prompt that appears when Home has nowhere left to go.
