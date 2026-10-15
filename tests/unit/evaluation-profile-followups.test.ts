import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EVALUATION_RECORD_TRIGGER_SQL } from '../../src/service/evaluation-records.js';
import { EVALUATION_PROFILE_TRIGGER_SQL, EvaluationProfiles } from '../../src/service/evaluation-profiles.js';
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
  it('pins each 初评 snapshot to the Task its preparation returned, never to another Task of the Book (P3-2)', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let closed = false;
    try {
      const book = await importSample1Book(store, roots.codeRoot, '初评快照归属');
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
      recordMissingCredentialConnection(store, '合成连接');
      const launch = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
      const prepare = () => {
        let work = store.createInitialEvaluationPreparationWork(book.bookId, launch);
        while (!work.done) work = store.advanceInitialEvaluationPreparationWork(work.workId!);
        return work.projection!;
      };
      const builtin = store.inspectEvaluationProfiles().profiles[0]!;
      const first = prepare();
      const profile = store.saveEvaluationProfile({
        expectedSha256: builtin.sha256,
        items: builtin.items.map((item) => ({ itemId: item.itemId, label: item.label, description: item.description ?? '' })),
        readiness: ['完成来源复核。'],
      }).profiles[0]!;
      const second = prepare();
      expect(second.taskIntent!.taskIntentId).not.toBe(first.taskIntent!.taskIntentId);
      store.close();
      closed = true;
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        // One pin per Task under its own contract: the earlier Task keeps the version it was prepared under and is never
        // pinned again under the later preparation's profile.
        const rows = db.prepare('SELECT task_intent_id, prompt_contract_sha256, profile_sha256 FROM initial_evaluation_tasks ORDER BY rowid').all();
        expect(rows).toEqual([
          { task_intent_id: first.taskIntent!.taskIntentId, prompt_contract_sha256: first.planEnvelope!.promptContractDigest, profile_sha256: builtin.sha256 },
          { task_intent_id: second.taskIntent!.taskIntentId, prompt_contract_sha256: second.planEnvelope!.promptContractDigest, profile_sha256: profile.sha256 },
        ]);
        expect(new EvaluationProfiles(db).taskProfile(second.taskIntent!.taskIntentId, second.planEnvelope!.promptContractDigest))
          .toMatchObject({ sha256: profile.sha256, readiness: ['完成来源复核。'] });
      } finally { db.close(); }
    } finally { if (!closed) store.close(); }
  });

  it('keeps 设置 › 评估校准与预测 readable when the current 评估方案 version is damaged (P3-1)', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const builtin = store.inspectEvaluationProfiles().profiles[0]!;
    store.saveEvaluationProfile({
      expectedSha256: builtin.sha256,
      items: builtin.items.map((item) => ({ itemId: item.itemId, label: item.label, description: item.description ?? '' })),
      readiness: ['完成来源复核。'],
    });
    store.close();
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      db.exec('DROP TRIGGER evaluation_profile_versions_no_update');
      db.exec("UPDATE evaluation_profile_versions SET canonical_json = canonical_json || ' '");
      db.exec(EVALUATION_PROFILE_TRIGGER_SQL.evaluation_profile_versions_no_update!);
    } finally { db.close(); }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(() => store.inspectEvaluationProfiles()).toThrow('已损坏');
      expect(store.inspectEvaluationCalibration().calibration).toMatchObject({ adjustments: 0, unreadableBooks: 0, offset: null });
    } finally { store.close(); }
  });

  // At the stamped version an earlier exact-schema check already names the missing table; the window before the stamp, where
  // `initializeEvaluationProfileSchema` itself met the half-present pair, is pinned in evaluation-profiles.test.ts.
  it('refuses a store holding only initial_evaluation_tasks by naming the missing table, not a raw SQLite error (P3-3)', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    first.close();
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try { db.exec('DROP TABLE evaluation_profile_versions'); } finally { db.close(); }
    const refusal = await EditorialStore.open(roots.dataRoot, roots.codeRoot).then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).not.toContain('already exists');
    expect((refusal as Error).message).toContain('数据库表 evaluation_profile_versions');
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
