import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EVALUATION_RECORD_TRIGGER_SQL } from '../../src/service/evaluation-records.js';
import { EvaluationProfiles } from '../../src/service/evaluation-profiles.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { EditorialStore, EVALUATION_PROFILE_UNKNOWN_ID, EVALUATION_PROFILE_UNKNOWN_TITLE } from '../../src/service/store.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// The #797 review's P3 follow-ups (Issue #798) that need the real store: the 初评 snapshot's Task identity (P3-2) and the
// use counts of records merged from another house (P3-6). Every input is the suite's own synthetic SampleBook.

let roots: ServiceTestRoots;
beforeEach(async () => { roots = await createServiceTestRoots('ai7-unit-profile-followups-'); });
afterEach(async () => roots.dispose());

describe('评估方案 editing follow-ups (#798)', () => {
  it('pins the 初评 snapshot to the Task the preparation returned, never a separate latest-Task query (P3-2)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let closed = false;
    try {
      const book = await importSample1Book(store, roots.codeRoot, '初评快照归属');
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
      recordMissingCredentialConnection(store, '合成连接');
      const launch = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
      const builtin = store.inspectEvaluationProfiles().profiles[0]!;
      const profile = store.saveEvaluationProfile({
        expectedSha256: builtin.sha256,
        items: builtin.items.map((item) => ({ itemId: item.itemId, label: item.label, description: item.description ?? '' })),
        readiness: ['完成来源复核。'],
      }).profiles[0]!;
      let work = store.createInitialEvaluationPreparationWork(book.bookId, launch);
      while (!work.done) work = store.advanceInitialEvaluationPreparationWork(work.workId!);
      const prepared = work.projection!;
      store.close();
      closed = true;
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        const rows = db.prepare('SELECT task_intent_id FROM initial_evaluation_tasks').all() as Array<{ task_intent_id: string }>;
        expect(rows.map((row) => row.task_intent_id)).toEqual([prepared.taskIntent!.taskIntentId]);
        expect(new EvaluationProfiles(db).taskProfile(prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.promptContractDigest))
          .toMatchObject({ sha256: profile.sha256, readiness: ['完成来源复核。'] });
      } finally { db.close(); }
    } finally { if (!closed) store.close(); }
  });

  it('counts records merged from another house under a labelled 未知版本 bucket (P3-6)', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const book = await importSample1Book(store, roots.codeRoot, '合并记录归属');
    store.startEvaluation(book.bookId);
    store.close();
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      db.exec('DROP TRIGGER evaluation_records_no_update');
      db.prepare('UPDATE evaluation_records SET profile_sha256 = ?').run('f'.repeat(64));
      db.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_records_no_update!);
    } finally { db.close(); }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const profiles = store.inspectEvaluationProfiles().profiles;
      expect(profiles.find((entry) => entry.sha256 === ''))
        .toMatchObject({ profileId: EVALUATION_PROFILE_UNKNOWN_ID, title: EVALUATION_PROFILE_UNKNOWN_TITLE, records: 1, books: 1 });
      expect(profiles.filter((entry) => entry.profileId !== EVALUATION_PROFILE_UNKNOWN_ID).every((entry) => entry.records === 0)).toBe(true);
    } finally { store.close(); }
  });
});
