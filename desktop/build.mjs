/**
 * Build: three bundles (main, preload, renderer) plus the test bundle.
 *
 * esbuild only — no bundler config to maintain, and a cold build is well under
 * a second, which matters when you are iterating on window-placement code.
 */
import { build, context } from 'esbuild';
import { cp, mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

// Electron is provided by the runtime; koffi is a native module that must stay
// external so its .node binary is loaded from disk rather than inlined.
const nodeExternals = ['electron', 'koffi'];

const targets = [
  {
    entryPoints: [join(here, 'src/main/main.ts')],
    outfile: join(here, 'dist/main/main.js'),
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: nodeExternals,
  },
  {
    entryPoints: [join(here, 'src/preload/preload.ts')],
    outfile: join(here, 'dist/preload/preload.js'),
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: nodeExternals,
  },
  {
    entryPoints: [join(here, 'src/renderer/app.ts')],
    outfile: join(here, 'dist/renderer/renderer.js'),
    platform: 'browser',
    target: 'chrome120',
    format: 'iife',
  },
];

async function testTargets() {
  const dir = join(here, 'test');
  const files = await readdir(dir).catch(() => []);
  const entries = files.filter((f) => f.endsWith('.test.ts')).map((f) => join(dir, f));
  if (entries.length === 0) return [];
  return [
    {
      entryPoints: entries,
      outdir: join(here, 'dist/test'),
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      external: nodeExternals,
    },
  ];
}

async function copyStatic() {
  await mkdir(join(here, 'dist/renderer'), { recursive: true });
  await cp(join(here, 'src/renderer/index.html'), join(here, 'dist/renderer/index.html'));
  await cp(join(here, 'src/renderer/styles.css'), join(here, 'dist/renderer/styles.css'));
}

const all = [...targets, ...(await testTargets())].map((options) => ({
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  ...options,
}));

if (watch) {
  const contexts = await Promise.all(all.map((options) => context(options)));
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  await copyStatic();
  console.log('[tablelab] watching for changes…');
} else {
  await Promise.all(all.map((options) => build(options)));
  await copyStatic();
}
