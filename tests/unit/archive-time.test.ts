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

  it('is the time every archive writer in the product, the suites, the runners and the tools gives its entries (#611, #618)', () => {
    // Read structurally, not only by the text `mtime:` (#611): a writer that names no time gets fflate's clock reading, and one
    // that names it another way hides from a text scan. Every one-shot archive passes the fixed time in its options argument,
    // so no entry falls back to the clock; every streamed entry is given it before it is added; an entry made any way the
    // guard cannot follow is not allowed. And every time the text does name is the fixed one (#618): a clock time given to one
    // entry beside fixed options, or an entry's time set again after the fixed one, is as wrong as none. A namespace, as in
    // `fflate.zipSync(`, hides nothing.
    const self = fileURLToPath(import.meta.url);
    const offenders: string[] = [];
    for (const path of [join(ROOT, 'src'), join(ROOT, 'tests'), join(ROOT, 'e2e'), join(ROOT, 'tools')].flatMap(sources)) {
      if (path === self) continue;
      const source = readFileSync(path, 'utf8').replace(/\r\n/gu, '\n');
      const at = (index: number): string => `${relative(ROOT, path)}:${source.slice(0, index).split('\n').length}`;
      // A call's top-level arguments, from its opening parenthesis.
      const argumentsFrom = (open: number): string[] => {
        const parts: string[] = [];
        let depth = 0;
        let start = open + 1;
        for (let index = open; index < source.length; index += 1) {
          const char = source[index];
          if (char === '(' || char === '{' || char === '[') depth += 1;
          else if (char === ')' || char === '}' || char === ']') {
            depth -= 1;
            if (depth === 0) {
              parts.push(source.slice(start, index));
              break;
            }
          } else if (char === ',' && depth === 1) {
            parts.push(source.slice(start, index));
            start = index + 1;
          }
        }
        return parts.filter((part) => part.trim() !== '');
      };
      for (const match of source.matchAll(/\bzipSync\(/gu)) {
        const parts = argumentsFrom(match.index + match[0].length - 1);
        if (parts.length < 2 || !/\bmtime:\s*fixedArchiveTime\(\)/u.test(parts.at(-1)!)) {
          offenders.push(`${at(match.index)} zipSync without the fixed time in its options`);
        }
      }
      for (const match of source.matchAll(/\bmtime\s*:(?!\s*fixedArchiveTime\(\))/gu)) offenders.push(`${at(match.index)} an mtime other than the fixed time`);
      for (const match of source.matchAll(/\.mtime\s*=(?!=)(?!\s*fixedArchiveTime\(\);)/gu)) offenders.push(`${at(match.index)} an entry's time set to another`);
      for (const match of source.matchAll(/new\s+(?:\w+\.)?(?:ZipPassThrough|ZipDeflate|AsyncZipDeflate)\(/gu)) {
        const named = /\b(?:const|let)\s+(\w+)\s*=\s*$/u.exec(source.slice(Math.max(0, match.index - 80), match.index));
        if (named === null) {
          offenders.push(`${at(match.index)} an entry the guard cannot follow`);
          continue;
        }
        const rest = source.slice(match.index);
        const given = rest.search(new RegExp(`\\b${named[1]}\\.mtime\\s*=\\s*fixedArchiveTime\\(\\);`, 'u'));
        const added = rest.search(new RegExp(`\\.add\\(\\s*${named[1]}\\s*\\)`, 'u'));
        if (given < 0 || (added >= 0 && added < given)) offenders.push(`${at(match.index)} ${named[1]} added without the fixed time`);
      }
      if (/(?<![.\w])(?:\w+\.)?zip\(/u.test(source)) offenders.push(`${relative(ROOT, path)} fflate's zip() is not checked here`);
    }
    expect(offenders).toEqual([]);
  });
});
