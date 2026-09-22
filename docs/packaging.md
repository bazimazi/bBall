# Packaging bBall for desktop and mobile

The game ships twice from one codebase. On the web it is a Vite build served
next to the API. Everywhere else it is the same build inside a
[Tauri](https://tauri.app) shell: a native window, a system webview, and an
installer per operating system.

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

## Icons

Every icon in `src-tauri/icons/` is generated, and `npm run icons` regenerates
all of them from [`scripts/app-icon.mjs`](../scripts/app-icon.mjs). There is no
artwork file: the mark is the same two shapes as the favicon in `index.html` - a
dark rounded square with a teal ball - so the script draws it and writes the
PNGs directly. Change a colour or a proportion there and every platform follows.

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
- **Android crops the adaptive icon.** The foreground layer is a 108dp canvas of
  which only the middle 72dp survives the launcher's mask, and the mask itself
  is a circle on some launchers and a squircle on others. A full-bleed
  foreground loses its corners and reads as a zoomed-in crop, so the foreground
  here is the ball alone, scaled by 72/108 to keep the proportion it has in the
  mark, over a background layer that is the flat colour
  (`values/ic_launcher_background.xml`). `ic_launcher_round.png`, which older
  launchers use unmasked, is drawn as an actual circle.

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
