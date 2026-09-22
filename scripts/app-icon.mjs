/**
 * Draws every app icon the packaged builds need, from one definition.
 *
 * The mark is the favicon in index.html: a dark rounded square with a teal
 * ball in the middle. There is no artwork file to keep in sync, because there
 * is no artwork - the whole thing is two shapes, so it is drawn here and
 * written straight out as PNG.
 *
 * Run it with `npm run icons`. It does three things in order:
 *
 * 1. Writes the 1024px master, `src-tauri/app-icon.png`.
 * 2. Runs `tauri icon`, which fans the master out into the .ico, the .icns,
 *    the Linux and Microsoft Store PNGs, the iOS app icon set and the Android
 *    mipmaps.
 * 3. Redraws the Android mipmaps, because a fanned-out master is the wrong
 *    thing there - see below.
 *
 * Two platform rules that a scaled copy of the master would get wrong:
 *
 * - **iOS forbids transparency.** An icon with an alpha channel is rejected at
 *   submission, so the flat colour behind the mark has to be baked in. That is
 *   what `--ios-color` does, and it has to be our background rather than the
 *   white it defaults to, or every iOS icon gets a white border around a dark
 *   mark.
 * - **Android crops adaptive icons.** The foreground layer is a 108dp canvas
 *   of which only the middle 72dp is guaranteed to survive the launcher's
 *   mask; the rest is cropped, and parallaxed while it is being cropped. A
 *   full-bleed foreground therefore loses its corners and comes out looking
 *   like a zoomed-in crop of the icon. The foreground here is the ball alone,
 *   sized so that it lands at the same proportion of the visible area as it
 *   has in the mark, over a background layer that is the flat colour.
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'src-tauri', 'icons');

/** The mark, in the proportions index.html draws it at: a 32-unit grid. */
const BG = [0x06, 0x08, 0x0f];
const FG = [0x4f, 0xf0, 0xd6];
const BG_HEX = '#06080f';
const CORNER = 8 / 32; // corner radius, as a fraction of the side
const BALL = 7 / 32; // ball radius, as a fraction of the side

// --------------------------------------------------------------- drawing

/**
 * Render one icon.
 *
 * `backdrop` is the shape filled with the background colour: a rounded square,
 * a circle, or nothing at all when the layer is meant to be transparent.
 * `ball` is the ball's radius as a fraction of the canvas.
 *
 * Coverage is sampled 4x4 per pixel rather than computed analytically. At
 * these sizes that is both accurate enough to be invisible and short enough to
 * read.
 */
function render(size, { backdrop = 'square', ball = BALL } = {}) {
  const radius = size * CORNER;
  const ballRadius = size * ball;
  const half = size / 2;

  const insideBackdrop = (x, y) => {
    if (backdrop === 'none') return false;
    if (backdrop === 'circle') {
      const dx = x - half;
      const dy = y - half;
      return dx * dx + dy * dy <= half * half;
    }
    // A rounded square is the set of points within `radius` of the rectangle
    // inset by `radius` on every side.
    const cx = Math.min(Math.max(x, radius), size - radius);
    const cy = Math.min(Math.max(y, radius), size - radius);
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius;
  };

  const insideBall = (x, y) => {
    const dx = x - half;
    const dy = y - half;
    return dx * dx + dy * dy <= ballRadius * ballRadius;
  };

  // One filter byte per scanline, then RGBA.
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let at = 0;

  for (let y = 0; y < size; y++) {
    raw[at++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let back = 0;
      let front = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = x + (sx + 0.5) / 4;
          const py = y + (sy + 0.5) / 4;
          if (insideBackdrop(px, py)) back++;
          if (insideBall(px, py)) front++;
        }
      }

      const backdropAlpha = back / 16;
      const ballAlpha = front / 16;
      const alpha = Math.max(backdropAlpha, ballAlpha);
      if (alpha === 0) {
        at += 4;
        continue;
      }

      // The ball is opaque over the backdrop wherever both cover the pixel,
      // so its coverage is the weight and the backdrop takes what is left.
      const backWeight = Math.max(alpha - ballAlpha, 0);
      for (let channel = 0; channel < 3; channel++) {
        raw[at++] = Math.round((BG[channel] * backWeight + FG[channel] * ballAlpha) / alpha);
      }
      raw[at++] = Math.round(alpha * 255);
    }
  }

  return png(size, size, raw);
}

// ------------------------------------------------------------ png writing

let crcTable = null;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(width, height, raw, channels = 4) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = channels === 4 ? 6 : 2; // colour type: RGBA or RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * Rewrite an 8-bit RGBA PNG as 8-bit RGB.
 *
 * App Store submission rejects an app icon that *has* an alpha channel, not
 * merely one that uses it, so flattening the iOS set is not optional even
 * though every pixel in it is already opaque. The colour is taken as-is:
 * `--ios-color` has already composited the mark onto a solid background.
 */
function dropAlpha(file) {
  const buf = readFileSync(file);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (buf[24] !== 8 || buf[25] !== 6) return false; // already flat, or not ours

  const parts = [];
  for (let at = 8; at < buf.length; ) {
    const length = buf.readUInt32BE(at);
    if (buf.toString('ascii', at + 4, at + 8) === 'IDAT') {
      parts.push(buf.subarray(at + 8, at + 8 + length));
    }
    at += 12 + length;
  }

  const data = inflateSync(Buffer.concat(parts));
  const stride = width * 4;
  const flat = Buffer.alloc((width * 3 + 1) * height);
  const line = Buffer.alloc(stride);
  let previous = Buffer.alloc(stride);
  let read = 0;
  let write = 0;

  for (let y = 0; y < height; y++) {
    const filter = data[read++];
    data.copy(line, 0, read, read + stride);
    read += stride;

    // Undo the row filter. Every PNG encoder picks these per row, so all five
    // have to be handled however simple the image is.
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? line[i - 4] : 0;
      const b = previous[i];
      const c = i >= 4 ? previous[i - 4] : 0;
      let value = line[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = value & 0xff;
    }

    flat[write++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      flat[write++] = line[x * 4];
      flat[write++] = line[x * 4 + 1];
      flat[write++] = line[x * 4 + 2];
    }
    previous = Buffer.from(line);
  }

  writeFileSync(file, png(width, height, flat, 3));
  return true;
}

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
  console.log(`  ${path.slice(root.length + 1).replace(/\\/g, '/')}`);
}

// ------------------------------------------------------------------- run

console.log('master:');
const master = join(root, 'src-tauri', 'app-icon.png');
write(master, render(1024));

console.log('tauri icon:');
// Everything except Android comes out of this: icon.ico, icon.icns, the Linux
// PNGs, the Microsoft Store logos and the iOS set. `--ios-color` is the flat
// colour composited behind the mark for iOS, which has to be opaque.
//
// The CLI's own entry point rather than `npx`: a .cmd shim cannot be spawned
// without a shell on Windows, and a shell is one more thing to quote paths for.
const cli = fileURLToPath(import.meta.resolve('@tauri-apps/cli/tauri.js'));
execFileSync(process.execPath, [cli, 'icon', master, '--ios-color', BG_HEX], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit']
});
console.log('  src-tauri/icons/ (desktop, Microsoft Store, iOS)');

// Flatten the iOS set: opaque already, but the channel itself is what gets an
// app rejected.
const iosDir = join(icons, 'ios');
let flattened = 0;
for (const file of readdirSync(iosDir)) {
  if (file.endsWith('.png') && dropAlpha(join(iosDir, file))) flattened++;
}
console.log(`  src-tauri/icons/ios/ (${flattened} icons flattened to RGB)`);

// Same reasoning as the Android resources below: once `tauri ios init` has
// run, the asset catalogue in the generated Xcode project is the copy that
// gets built, so it is kept in step rather than left holding whatever was
// there at init time.
const appIconSet = join(
  root,
  'src-tauri',
  'gen',
  'apple',
  'Assets.xcassets',
  'AppIcon.appiconset'
);
if (existsSync(appIconSet)) {
  for (const file of readdirSync(iosDir)) {
    if (file.endsWith('.png')) {
      write(join(appIconSet, file), readFileSync(join(iosDir, file)));
    }
  }
}

console.log('android:');
/**
 * Densities, and what each one is in pixels.
 *
 * Legacy launchers (before Android 8) use `ic_launcher` and, on the launchers
 * that asked for it, `ic_launcher_round` - which is a circle, not a rounded
 * square, because nothing masks it. Everything since uses the adaptive pair:
 * `ic_launcher_foreground` on a 108dp canvas over a flat background colour.
 */
const DENSITIES = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432]
];

// The adaptive foreground's safe area is the middle 72dp of 108dp, so the ball
// has to be scaled by 72/108 to keep the proportion it has in the mark.
const ADAPTIVE_BALL = BALL * (72 / 108);

/*
 * Where the Android resources go.
 *
 * `icons/android` is the staging copy that `tauri android init` seeds the
 * generated project from. Once that project exists it is the one the build
 * actually reads, so both are written - otherwise regenerating the icons
 * after an init would silently change nothing.
 */
const androidRes = [
  join(icons, 'android'),
  join(root, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res')
].filter((dir, index) => index === 0 || existsSync(dir));

for (const res of androidRes) {
  for (const [density, legacy, adaptive] of DENSITIES) {
    const dir = join(res, `mipmap-${density}`);
    write(join(dir, 'ic_launcher.png'), render(legacy));
    write(join(dir, 'ic_launcher_round.png'), render(legacy, { backdrop: 'circle' }));
    write(
      join(dir, 'ic_launcher_foreground.png'),
      render(adaptive, { backdrop: 'none', ball: ADAPTIVE_BALL })
    );
  }

  write(
    join(res, 'values', 'ic_launcher_background.xml'),
    Buffer.from(
      `<?xml version="1.0" encoding="utf-8"?>
<!-- The background layer of the adaptive icon. Generated by scripts/app-icon.mjs. -->
<resources>
  <color name="ic_launcher_background">${BG_HEX}</color>
</resources>
`,
      'utf8'
    )
  );
}
