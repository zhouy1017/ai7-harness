import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';

// Unit suite for the one fixed archive time (Issue #601): a ZIP entry's time is written from local fields, so the same
// content must come out as the same bytes whatever the host's time zone — a converted working representation, an exported
// DOCX, and the suites' own archives alike.

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const e2e = (await import(new URL('../../e2e/composed-docx.mjs', import.meta.url).href)) as { fixedArchiveTime(): Date };

/** One archive built in a child process under `zone`, through the shared time and fflate; answers its digest. */
function archiveDigestUnder(zone: string): string {
  const module = pathToFileURL(join(ROOT, 'src', 'shared', 'archive-time.ts')).href;
  const script = [
    "const { strToU8, zipSync } = await import('fflate');",
    "const { createHash } = await import('node:crypto');",
    `const { fixedArchiveTime } = await import(${JSON.stringify(module)});`,
    "const bytes = zipSync({ 'word/document.xml': strToU8('<w:document/>') }, { level: 6, mtime: fixedArchiveTime() });",
    "process.stdout.write(createHash('sha256').update(bytes).digest('hex'));",
  ].join('\n');
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, env: { ...process.env, TZ: zone }, encoding: 'utf8' });
}

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(?:ts|mjs)$/u.test(entry.name) ? [path] : [];
  });
}

describe('the fixed archive time', () => {
  it('reads 2026-01-01 08:00:00 in local fields, the time the UTC+8 hosts already wrote', () => {
    const time = fixedArchiveTime();
    expect([time.getFullYear(), time.getMonth(), time.getDate(), time.getHours(), time.getMinutes(), time.getSeconds()])
      .toEqual([2026, 0, 1, 8, 0, 0]);
    // The runners' composers carry the same time.
    expect(e2e.fixedArchiveTime().getTime()).toBe(time.getTime());
  });

  it('gives the same archive bytes under every time zone', () => {
    const digests = ['UTC', 'Asia/Shanghai', 'America/Los_Angeles'].map(archiveDigestUnder);
    expect(digests[0]).toMatch(/^[0-9a-f]{64}$/u);
    expect(new Set(digests).size).toBe(1);
  }, 60_000);

  it('is the only time an archive the product, the suites\' support or the runners write carries', () => {
    const offenders = [join(ROOT, 'src'), join(ROOT, 'tests', 'support'), join(ROOT, 'e2e')]
      .flatMap(sources)
      .flatMap((path) => (readFileSync(path, 'utf8').match(/\bmtime:\s*[^,}\n]+/gu) ?? [])
        .filter((use) => use.replace(/\s+/gu, ' ').trim() !== 'mtime: fixedArchiveTime()')
        .map((use) => `${relative(ROOT, path)}: ${use}`));
    expect(offenders).toEqual([]);
  });
});
