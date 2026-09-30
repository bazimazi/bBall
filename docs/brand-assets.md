# bBall brand assets

The mark depicts the game: opposing aqua and rose paddles and a bright ball
with a tapered trail. The colours come from `src/styles/global.css` and
`src/game/palette.ts`: navy `#06080f`, aqua `#4ff0d6`, rose `#ff5c8a`, and
pearl `#eef2ff`. There is no basketball imagery.

## Files

| Asset                    | Location                                   | Use                                            |
| ------------------------ | ------------------------------------------ | ---------------------------------------------- |
| Colour mark, transparent | `public/brand/mark.svg`, `mark-1024.png`   | Menus and compositing                          |
| Monochrome mark          | `public/brand/mark-mono.svg`               | Single-colour use; SVG `currentColor`          |
| Square icon              | `public/brand/icon.svg`                    | Browser favicon                                |
| PNG icons                | `public/brand/icon-{16,32,48,192,512}.png` | Browser and launcher sizes                     |
| ICO                      | `public/brand/favicon.ico`                 | Legacy consumers                               |
| Apple touch icon         | `public/brand/apple-touch-icon.png`        | 180px, opaque RGB                              |
| Maskable web icon        | `public/brand/icon-maskable-512.png`       | Full background with an inset mark             |
| Native master            | `src-tauri/app-icon.png`                   | 1024px input to Tauri                          |
| Desktop / Store icons    | `src-tauri/icons/`                         | ICO, ICNS and platform PNG sizes               |
| iOS icons                | `src-tauri/icons/ios/`                     | Opaque RGB AppIcon family                      |
| Android icons            | `src-tauri/icons/android/`                 | Five densities, adaptive, round and monochrome |
| Cover artwork            | `public/brand/cover.png`                   | README and promotional use                     |

The home and onboarding headers share `BrandLogo`. The HTML head references
the favicon, Apple touch icon and `public/manifest.webmanifest`. Paths work
with Vite's relative base. The manifest adds launcher metadata; it does not
add offline caching or a service worker.

## Regeneration

Run `npm run icons`. The script's `MARK` geometry is shared by the SVG and PNG
renderers. It uses the installed Tauri CLI for desktop and iOS formats, strips
the iOS alpha channel, and draws Android foregrounds inside the central safe
circle. API 33 monochrome layers support themed launchers. Generated native
projects are refreshed when they exist; rerun after mobile initialization.

The cover was generated with the built-in imagegen tool. Its exact prompt is
saved in [brand-cover-prompt.json](brand-cover-prompt.json). It is separate
from the deterministic icon generator and is not overwritten by `npm run icons`.
The cover is promotional artwork, not a gameplay screenshot, and is not loaded
by the game screens.

## Review scope

The visual and packaging review found that the original mark was only a teal
dot, the web favicon duplicated geometry outside the icon generator, and the
web build lacked touch/manifest assets. This set addresses those gaps while
retaining the existing canvas gameplay and SVG UI glyphs.
