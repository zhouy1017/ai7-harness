import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createServiceTestRoots } from '../support/temp-data-root.js';

// J04 builds its helper outside the checkout. Its dependencies must keep their own package identity,
// even when TEMP happens to contain an unrelated package.json on the development host.
it('retains sources through the actual runner bundle in a package-free parent', async () => {
  const roots = await createServiceTestRoots('ai7-retained-runner-');
  try {
    const runRoot = join(roots.inputRoot, 'run'); await mkdir(runRoot);
    expect(existsSync(join(roots.inputRoot, 'package.json'))).toBe(false);
    const script = `
      import assert from 'node:assert/strict';
      const [loader, codeRoot, dataRoot, inputRoot, runRoot] = process.argv.slice(1);
      try {
        const { loadRetainedReviewFixture } = await import(loader);
        const { seedRetainedReviewFallback } = await loadRetainedReviewFixture(codeRoot, runRoot);
        const fixture = await seedRetainedReviewFallback({codeRoot, dataRoot, inputRoot});
        assert.equal(fixture.retainedBeforeFailure, 3);
        assert.equal(fixture.verificationResults, 0);
        assert.equal(fixture.sources.length, 3);
        console.log('RETAINED_FIXTURE/pass');
      } catch { process.exitCode = 1; console.log('RETAINED_FIXTURE/fail'); }
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script,
      new URL('../../e2e/retained-finding-sources.mjs', import.meta.url).href,
      roots.codeRoot, roots.dataRoot, roots.inputRoot, runRoot],
      { cwd: roots.codeRoot, encoding: 'utf8', timeout: 60_000, maxBuffer: 64 * 1024 });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('RETAINED_FIXTURE/pass');
    expect(existsSync(join(roots.inputRoot, 'package.json'))).toBe(false);
  } finally { await roots.dispose(); }
}, 70_000);
