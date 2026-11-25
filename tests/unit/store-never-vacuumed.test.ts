import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// Issue #1654: each search row stands under its working block's rowid, and VACUUM may renumber implicit rowids. The store is
// copied page by page (online backup) and never vacuumed; this keeps a VACUUM statement out of the product's sources.
function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sources(path) : /\.(ts|mjs)$/.test(name) ? [path] : [];
  });
}

it('runs no VACUUM on the store, which would renumber the rowids the search rows are paired by', () => {
  const vacuuming = sources('src').filter((path) => /['"`]\s*VACUUM\b/i.test(readFileSync(path, 'utf8')));
  expect(vacuuming).toEqual([]);
});
