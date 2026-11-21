import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';

const sequence = vi.hoisted(() => ({ value: 0 }));
vi.mock('node:crypto', async original => ({ ...await original<typeof import('node:crypto')>(),
  randomUUID: () => `00000000-0000-4000-8000-${String(++sequence.value).padStart(12, '0')}` }));

// Captured on dd09959e7 before #1657 product changes. Only hashes of canonical records leave the disposable store;
// no manuscript payload is captured. Fixed time/UUIDs make the complete authorization, envelopes and snapshot reproducible.
it('keeps the no-options review launch records byte-identical to the S-tasks base (#1657)', async () => {
  sequence.value = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-21T00:00:00.000Z'));
  const roots = await createServiceTestRoots('ai7-review-launch-golden-');
  let store: EditorialStore | undefined;
  try {
    const policy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    const fixture = await loadModelFixture(join(roots.codeRoot, 'tests/fixtures/model'), 'sample1-review-cross-chapter-authored');
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: {
      fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage } });
    const book = await importSample1Book(store, roots.codeRoot, 'sample1');
    await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
    recordMissingCredentialConnection(store, 'sample1');
    store.launchReviewRun({ bookId: book.bookId, clientCommandId: '10000000-0000-4000-8000-000000000001',
      categoryIds: ['typos-and-usage'], scope: { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } }, policy);
    const db = new DatabaseSync(join(roots.dataRoot, 'store/ai7.sqlite'), { readOnly: true });
    try {
      const digests = ['review_run_authorizations', 'analysis_plan_records', 'task_launch_snapshots'].map(table => ({ table,
        digests: db.prepare(`SELECT canonical_json FROM ${table}${table === 'analysis_plan_records' ? " WHERE component = 'plan-envelope'" : ''} ORDER BY rowid`).all().map(row =>
          createHash('sha256').update(String(row.canonical_json)).digest('hex')) }));
      expect(digests).toEqual([
        { table: 'review_run_authorizations', digests: ['4913fd71a102c074e71eb11c4d0f7198bb92e57b0779cad35050345f44503d3a'] },
        { table: 'analysis_plan_records', digests: ['d1fd2c06457050a135e4aebc0fe3661c87fef2b2c04ca7b6ca44dce2b4c366bb',
          'dc3ee2ee0362195cdc05ab2419ad4664e6cc66fa07702fd24df3b38f3c06203a'] },
        { table: 'task_launch_snapshots', digests: ['737ff0d6a1d31046c1a369d2c0d8658c088cc12ea000a4b43ed4a6d884818f5c'] },
      ]);
    } finally { db.close(); }
  } finally { store?.close(); await roots.dispose(); vi.useRealTimers(); }
});
