import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { retainedFixtureFailureCheck, withRetainedCopyObserver } = await import(pathToFileURL(resolve('e2e/retained-finding-sources.mjs')).href) as {
  retainedFixtureFailureCheck(phase: unknown, error: unknown): string;
  withRetainedCopyObserver(renderer: { evaluate(expression: string): Promise<void> }, action: () => Promise<void>): Promise<void>;
};
const { journeyCheckLabel } = await import(pathToFileURL(resolve('e2e/controller.mjs')).href) as { journeyCheckLabel(error: unknown): string | null };

it('names the exact retained fixture predicate using fixed code identifiers', () => {
  for (const check of ['review-finding-present', 'retained-before-write', 'retained-after-write', 'verification-results-absent']) {
    expect(retainedFixtureFailureCheck('check-order', Object.assign(new Error('Untrusted detail'), { fixtureCheck: check }))).toBe(`retained-fixture-${check}`);
  }
  expect(retainedFixtureFailureCheck('read-review', new TypeError('Untrusted detail'))).toBe('retained-fixture-read-review-type-error');
});

it('never forwards unknown exception fields, messages or phase text', () => {
  const error = Object.assign(new Error('Untrusted detail'), { fixtureCheck: 'Untrusted detail', code: 'UNTRUSTED_DETAIL' });
  expect(retainedFixtureFailureCheck('Untrusted detail', error)).toBe('retained-fixture-unknown-error');
  expect(retainedFixtureFailureCheck('import-module', error)).toBe('retained-fixture-import-module-error');
  expect(retainedFixtureFailureCheck('directory', { code: 'ENOENT' })).toBe('retained-fixture-directory-missing-file');
});

it('keeps the first predicate when the copy-observer cleanup also fails', async () => {
  const original = new Error('Original predicate'), cleanup = new Error('Cleanup');
  let calls = 0;
  const renderer = { evaluate: async () => { if (++calls === 2) throw cleanup; } };
  await expect(withRetainedCopyObserver(renderer, async () => { throw original; })).rejects.toBe(original);
  expect(calls).toBe(2);
});

it('names a cleanup-only failure and retains its cause', async () => {
  const cleanup = new Error('Cleanup'); let calls = 0;
  const renderer = { evaluate: async () => { if (++calls === 2) throw cleanup; } };
  const error = await withRetainedCopyObserver(renderer, async () => {}).catch(error => error);
  expect(journeyCheckLabel(error)).toBe('retained-copy-observer-cleanup');
  expect(error.cause).toBe(cleanup);
});
