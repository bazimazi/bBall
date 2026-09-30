/**
 * bBall's shared mark: opposing paddles and a rising ball. No image library or
 * runtime dependency is needed. `npm run icons` emits the web/SVG assets and
 * native icon families, including safe adaptive layers and opaque iOS PNGs.
 * The hand-authored geometry below is the single source for SVG and raster.
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'src-tauri', 'icons');
const brand = join(root, 'public', 'brand');
const BG = [6, 8, 15];
const BG_HEX = '#06080f';

// Coordinates on a 100-unit canvas. Broad silhouettes survive at favicon size.
// Shapes are painted in order; the ball sits over the tapered motion trail.
const MARK = [
  { kind: 'rect', x: 19, y: 36, w: 11, h: 42, r: 5.5, color: [79, 240, 214] },
  { kind: 'rect', x: 70, y: 22, w: 11, h: 42, r: 5.5, color: [255, 92, 138] },
  {
    kind: 'triangle',
    points: [
      [34, 70],
      [50, 39],
      [64, 48]
    ],
    color: [79, 240, 214]
  },
  { kind: 'circle', x: 57, y: 43, r: 9, color: [238, 242, 255] }
];

function rounded(x, y, left, top, width, height, radius) {
  const dx = x - Math.min(Math.max(x, left + radius), left + width - radius);
  const dy = y - Math.min(Math.max(y, top + radius), top + height - radius);
  return dx * dx + dy * dy <= radius * radius;
}

function contains(shape, x, y) {
  if (shape.kind === 'rect') return rounded(x, y, shape.x, shape.y, shape.w, shape.h, shape.r);
  if (shape.kind === 'circle') return (x - shape.x) ** 2 + (y - shape.y) ** 2 <= shape.r ** 2;
  const cross = ([ax, ay], [bx, by]) => (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const [a, b, c] = shape.points;
  const signs = [cross(a, b), cross(b, c), cross(c, a)];
  return !(signs.some((v) => v < 0) && signs.some((v) => v > 0));
}

function svg({ backdrop = false, monochrome = false } = {}) {
  const shapes = MARK.map((shape) => {
    const fill = monochrome ? 'currentColor' : `rgb(${shape.color.join(',')})`;
    if (shape.kind === 'rect') {
      return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" rx="${shape.r}" fill="${fill}"/>`;
    }
    if (shape.kind === 'circle') {
      return `<circle cx="${shape.x}" cy="${shape.y}" r="${shape.r}" fill="${fill}"/>`;
    }
    return `<polygon points="${shape.points.map((p) => p.join(',')).join(' ')}" fill="${fill}"/>`;
  }).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
  ${backdrop ? `<rect width="100" height="100" rx="22" fill="${BG_HEX}"/>` : ''}
  ${shapes}
</svg>\n`;
}

/** Supersample coverage, preserving straight alpha around the silhouette. */
function render(size, { backdrop = 'square', scale = 1, monochrome = false } = {}) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let at = 0;
  for (let y = 0; y < size; y++) {
    raw[at++] = 0;
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0];
      let covered = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = ((x + (sx + 0.5) / 4) / size) * 100;
          const py = ((y + (sy + 0.5) / 4) / size) * 100;
          const mx = (px - 50) / scale + 50;
          const my = (py - 50) / scale + 50;
          let color = null;
          const back =
            backdrop === 'full' ||
            (backdrop === 'circle' && (px - 50) ** 2 + (py - 50) ** 2 <= 2500) ||
            (backdrop === 'square' && rounded(px, py, 0, 0, 100, 100, 22));
          if (back) color = BG;
          for (const shape of MARK) {
            if (contains(shape, mx, my)) color = monochrome ? [255, 255, 255] : shape.color;
          }
          if (color) {
            covered++;
            for (let c = 0; c < 3; c++) sum[c] += color[c];
          }
        }
      }
      for (let c = 0; c < 3; c++) raw[at++] = covered ? Math.round(sum[c] / covered) : 0;
      raw[at++] = Math.round((covered / 16) * 255);
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
  for (let at = 8; at < buf.length;) {
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
// Keep the configured 64px window icon current even on CLI versions that omit it.
write(join(icons, '64x64.png'), render(64));

console.log('web:');
write(join(brand, 'icon.svg'), svg({ backdrop: true }));
write(join(brand, 'mark.svg'), svg());
write(join(brand, 'mark-mono.svg'), svg({ monochrome: true }));
write(join(brand, 'mark-1024.png'), render(1024, { backdrop: 'none' }));
for (const size of [16, 32, 48, 192, 512]) {
  write(join(brand, `icon-${size}.png`), render(size));
}
write(join(brand, 'favicon.ico'), readFileSync(join(icons, 'icon.ico')));
const touch = join(brand, 'apple-touch-icon.png');
write(touch, render(180, { backdrop: 'full' }));
dropAlpha(touch);
write(join(brand, 'icon-maskable-512.png'), render(512, { backdrop: 'full', scale: 0.85 }));

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
const appIconSet = join(root, 'src-tauri', 'gen', 'apple', 'Assets.xcassets', 'AppIcon.appiconset');
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

// Keep the entire mark within the central 66dp safe circle on a 108dp layer.
const ADAPTIVE_SCALE = 2 / 3;

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
      render(adaptive, { backdrop: 'none', scale: ADAPTIVE_SCALE })
    );
    write(
      join(dir, 'ic_launcher_monochrome.png'),
      render(adaptive, { backdrop: 'none', scale: ADAPTIVE_SCALE, monochrome: true })
    );
  }

  for (const version of [26, 33]) {
    const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@color/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
${version >= 33 ? '  <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n' : ''}</adaptive-icon>\n`;
    for (const name of ['ic_launcher', 'ic_launcher_round']) {
      write(join(res, `mipmap-anydpi-v${version}`, `${name}.xml`), adaptiveXml);
    }
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
