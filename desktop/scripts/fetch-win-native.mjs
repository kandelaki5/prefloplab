/**
 * Fetch the Windows koffi binary when packaging from a non-Windows host.
 *
 * koffi ships its native code as one prebuilt package per platform
 * (@koromix/koffi-win32-x64 and friends), and npm refuses to install a package
 * whose "os" does not match the machine. On Windows the normal install already
 * provides it and this script does nothing; anywhere else it pulls the tarball
 * straight from the registry so `npm run dist:win` works from Linux or macOS.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const koffiVersion = JSON.parse(readFileSync(join(root, 'node_modules/koffi/package.json'), 'utf8')).version;
const pkg = '@koromix/koffi-win32-x64';
const target = join(root, 'node_modules', ...pkg.split('/'));

if (existsSync(join(target, 'win32_x64/koffi.node'))) {
  console.log(`[tablelab] ${pkg}@${koffiVersion} already present`);
  process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), 'koffi-win-'));
try {
  const output = execFileSync('npm', ['pack', `${pkg}@${koffiVersion}`, '--silent'], {
    cwd: work,
    encoding: 'utf8',
  });
  const tarball = output.trim().split('\n').pop();
  mkdirSync(target, { recursive: true });
  execFileSync('tar', ['xzf', join(work, tarball), '--strip-components=1', '-C', target]);
  console.log(`[tablelab] unpacked ${pkg}@${koffiVersion}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
