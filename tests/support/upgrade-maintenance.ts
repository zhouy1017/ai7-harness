import { execFile } from 'node:child_process';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { build } from 'esbuild';
import type { ServiceTestRoots } from './temp-data-root.js';

const run = promisify(execFile);

/** Launch the app's maintenance service in plain Node. Crash only after the requested rename is durable. */
export async function buildMaintenance(roots: ServiceTestRoots) {
  const dist = join(roots.inputRoot, 'maintenance');
  await mkdir(dist);
  await symlink(join(roots.codeRoot, 'node_modules'), join(dist, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const entry = join(dist, 'maintenance.mjs');
  const { version: softwareVersion, ai7: { dataVersion } } = JSON.parse(await readFile(join(roots.codeRoot, 'package.json'), 'utf8'));
  const { stdout } = await run('git', ['rev-parse', 'HEAD'], { cwd: roots.codeRoot });
  const identity = { schema: 1, softwareVersion, dataVersion, buildNumber: 1, sourceCommit: stdout.trim(), dirty: false };
  await writeFile(join(dist, 'build-identity.json'), JSON.stringify(identity));
  await build({
    stdin: { resolveDir: roots.codeRoot, contents: `
      import { createRequire, syncBuiltinESMExports } from 'node:module';
      import { basename, join } from 'node:path';
      import { runStorageMaintenance } from './src/service/storage-maintenance.ts';
      const [action, root, boundary] = process.argv.slice(2);
      if (boundary) {
        const fs = createRequire(import.meta.url)('node:fs/promises');
        const rename = fs.rename;
        const journal = join(root, 'shell', 'storage-upgrade.json');
        fs.rename = async (from, to) => {
          const fromName = basename(from);
          const toName = basename(to);
          // Force a refused publication to exercise the corresponding real recovery stage.
          if (to === join(root, 'store') &&
              ((boundary === 'return-old' && fromName === 'converted') ||
               (boundary === 'return-new' && fromName.startsWith('store-before-')))) {
            throw Object.assign(new Error('Rehearsal publication failure'), { code: 'EIO' });
          }
          await rename(from, to);
          const point = to === journal ? JSON.parse(await fs.readFile(journal, 'utf8')).stage :
            to === join(root, 'store') ? (
              fromName === 'converted' ? 'publish-renamed' :
              fromName.startsWith('store-after-') ? 'return-new-renamed' : 'publish-old-renamed'
            ) : toName.startsWith('store-before-') ? 'save-old-renamed' :
              toName.startsWith('store-after-') ? 'save-new-renamed' : null;
          if (point === boundary) {
            process.stdin.resume();
            process.stdout.write(point);
            await new Promise(() => {});
          }
        };
        syncBuiltinESMExports();
      }
      await runStorageMaintenance([action, root], process.cwd());
    ` },
    define: { __AI7_BUILD_IDENTITY__: JSON.stringify(identity) },
    outfile: entry, bundle: true, format: 'esm', platform: 'node', packages: 'external', logLevel: 'silent',
  });
  return async (action: 'preflight' | 'upgrade' | 'resume' | 'rollback', root: string, boundary?: string) => {
    const running = run(process.execPath, [entry, action, root, ...(boundary ? [boundary] : [])], {
      cwd: dist, windowsHide: true, timeout: 45_000,
    });
    let killedAtBoundary = false;
    let seen = '';
    if (boundary !== undefined) running.child.stdout!.on('data', chunk => {
      seen += String(chunk);
      if (seen === boundary) killedAtBoundary = running.child.kill('SIGKILL');
    });
    try {
      const { stdout } = await running;
      return JSON.parse(stdout) as { ok: boolean; restored?: boolean; message: string };
    } catch (error) {
      if (killedAtBoundary) return { stopped: boundary };
      throw error;
    }
  };
}
