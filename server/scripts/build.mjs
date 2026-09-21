/**
 * Production build.
 *
 * esbuild bundles the server, the shared protocol and the shared domain model
 * from `src/core` into one file. Bundling is what makes the cross-directory
 * source layout work without a build-time package boundary: the same
 * TypeScript that the client compiles with Vite compiles here with the same
 * resolution rules, so there is exactly one copy of the XP curve in the
 * repository rather than two that have to be kept in step.
 *
 * `better-sqlite3` stays external because it is a native addon and cannot be
 * bundled; it is resolved from node_modules at runtime like any dependency.
 */

import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

await rm(resolve(root, 'dist'), { recursive: true, force: true });

const result = await build({
  entryPoints: [resolve(root, 'src/main.ts')],
  outfile: resolve(root, 'dist/main.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  minify: false,
  // Readable stack traces matter more than a smaller file for a server.
  legalComments: 'none',
  external: ['better-sqlite3'],
  // ESM output needs these CommonJS globals shimmed for any dependency that
  // still reaches for them.
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      'const require = __createRequire(import.meta.url);'
    ].join('\n')
  },
  logLevel: 'info',
  metafile: true
});

const bytes = Object.values(result.metafile.outputs).reduce((sum, out) => sum + out.bytes, 0);
process.stdout.write(`bundled ${(bytes / 1024).toFixed(0)} KB to dist/main.js\n`);
