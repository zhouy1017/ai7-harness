import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mergeBooks, MERGE_TABLE_POLICY } from '../../src/service/database-merge.js';
import { EvaluationProfiles } from '../../src/service/evaluation-profiles.js';
import { readersReportContractInput } from '../../src/service/readers-reports.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { EditorialStore } from '../../src/service/store.js';
import { LATEST_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import type { EvaluationContent, EvaluationProfileProjection, SaveEvaluationProfileInput } from '../../src/shared/protocol.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

let roots: ServiceTestRoots;
beforeEach(async () => { roots = await createServiceTestRoots('ai7-service-profile-'); });
afterEach(async () => roots.dispose());
function edit(profile: EvaluationProfileProjection, readiness: string[] = []): SaveEvaluationProfileInput {
  return { expectedSha256: profile.sha256, items: profile.items.map((item) => ({ itemId: item.itemId, label: item.label, description: item.description ?? '' })), readiness };
}
function finalContent(content: EvaluationContent): EvaluationContent {
  return { ...content, items: content.items.map((item) => ({ ...item, score: 10, comment: '合成评分说明。' })),
    risks: content.risks.map((risk) => ({ ...risk, level: 'low', statement: '合成风险说明。' })), conclusion: 'revise' };
}

describe('知识库 › 评估方案, prospective snapshots over the real store', () => {
  it.each(['absent', 'committed'] as const)('finishes revision 69 with profile relations %s before the terminal stamp', async (state) => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const profile = store.saveEvaluationProfile(edit(store.inspectEvaluationProfiles().profiles[0]!, ['已复核。'])).profiles[0]!;
    store.close();
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      if (state === 'absent') db.exec('DROP TABLE initial_evaluation_tasks; DROP TABLE evaluation_profile_versions');
      db.exec('PRAGMA user_version = 69');
    } finally { db.close(); }
    store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(store.inspectDataVersion().schemaRevision).toBe(LATEST_SCHEMA_VERSION);
      expect(store.inspectEvaluationProfiles().profiles[0]!.sha256).toBe(state === 'committed' ? profile.sha256 : store.inspectEvaluationProfiles().profiles.at(-1)!.sha256);
    } finally { store.close(); }
  });

  it('refuses a partial profile upgrade instead of inventing the missing Task ledger', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    store.close();
    const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try { db.exec('DROP TABLE initial_evaluation_tasks; PRAGMA user_version = 69'); } finally { db.close(); }
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toThrow('不兼容');
  });

  it('carries every house version and its record snapshots through full export and replacement', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    const targetRoots = await createServiceTestRoots('ai7-service-profile-replacement-');
    let target = await EditorialStore.open(targetRoots.dataRoot, roots.codeRoot);
    try {
      const book = await importSample1Book(store, roots.codeRoot, '全库方案版本');
      const builtinRecord = store.startEvaluation(book.bookId).record!;
      store.saveEvaluation({ bookId: book.bookId, recordId: builtinRecord.recordId, expectedEntries: builtinRecord.entries, content: finalContent(builtinRecord.content), finalize: true });
      const builtin = store.inspectEvaluationProfiles().profiles[0]!;
      const second = store.saveEvaluationProfile({ ...edit(builtin, ['来源已复核。']), items: edit(builtin).items.slice(0, 4) }).profiles[0]!;
      const houseRecord = store.startEvaluation(book.bookId).record!;
      store.saveEvaluationProfile(edit(second, ['来源和版权已复核。']));
      const history = store.inspectEvaluationProfiles();
      const snapshots = [builtinRecord, houseRecord].map((record) => store.inspectEvaluation(book.bookId, record.recordId).record);
      const destination = join(roots.inputRoot, 'profiles.ai7db');
      const prepared = await store.prepareDatabaseExport(destination, true);
      expect((await store.approveDatabaseExport(prepared.preparationId, true)).outcome).toBe('created');
      const preview = await target.inspectDatabaseImport(destination);
      expect(preview.compatibility).toBe('compatible');
      await target.prepareDatabaseReplacement(preview.previewId, new Date());
      target.markCleanShutdown(); target.close();
      target = await EditorialStore.open(targetRoots.dataRoot, roots.codeRoot);
      expect(target.inspectEvaluationProfiles()).toEqual(history);
      expect([builtinRecord, houseRecord].map((record) => target.inspectEvaluation(book.bookId, record.recordId).record)).toEqual(snapshots);
    } finally { store.close(); target.close(); await targetRoots.dispose(); }
  });

  it('keeps historical records and readers-report inputs, seeds new readiness, and compares removed/new items', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let closed = false;
    try {
      const book = await importSample1Book(store, roots.codeRoot, '方案版本测试');
      const old = store.startEvaluation(book.bookId).record!;
      store.saveEvaluation({ bookId: book.bookId, recordId: old.recordId, expectedEntries: old.entries, content: finalContent(old.content), finalize: true });
      const original = store.inspectEvaluation(book.bookId, old.recordId).record!;
      const profile = store.inspectEvaluationProfiles().profiles[0]!;
      const changed = store.saveEvaluationProfile({ ...edit(profile, ['完成来源复核。']), items: edit(profile).items.slice(0, 4).map((item, index) => index === 0 ? { ...item, label: '作品品质', description: '本社评分说明。' } : item) }).profiles[0]!;
      expect(changed.items.map((item) => item.fullMarks)).toEqual([25, 25, 25, 25]);
      expect(store.inspectEvaluation(book.bookId, old.recordId).record).toEqual(original);
      let record = store.startEvaluation(book.bookId).record!;
      expect(record.profile.sha256).toBe(changed.sha256);
      expect(record.content.readiness).toEqual(['完成来源复核。']);
      expect(record.comparison!.items.at(-1)).toMatchObject({ itemId: profile.items[4]!.itemId, label: profile.items[4]!.label, change: 'removed', previous: 10, current: null });
      record = store.saveEvaluation({ bookId: book.bookId, recordId: record.recordId, expectedEntries: record.entries, content: finalContent({ ...record.content, readiness: ['完成来源复核。', '本书还有插图。'] }), finalize: true }).record!;
      const input = readersReportContractInput('author', { recordId: record.recordId, bookId: book.bookId, ordinal: record.ordinal,
        revisionId: record.revisionId, revisionLabel: record.revisionLabel, profile: record.profile, content: record.content, total: record.total,
        entrySha256: 'a'.repeat(64), finalizedAt: record.finalized!.at, initial: null }, []);
      expect(input.record.items[0]).toMatchObject({ label: '作品品质', fullMarks: 25, description: '本社评分说明。' });
      store.saveEvaluationProfile({ ...edit(changed, ['完成版权复核。']), items: [...edit(changed).items, { itemId: null, label: '新增评分项', description: '新项。' }] });
      const next = store.startEvaluation(book.bookId).record!;
      expect(next.content.readiness).toEqual(['完成版权复核。', '本书还有插图。']);
      expect(next.comparison!.items.find((item) => item.change === 'added')).toMatchObject({ label: '新增评分项', previous: null, current: null });
      store.close();
      closed = true;
      closed = false;
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.inspectEvaluation(book.bookId, old.recordId).record).toEqual(original);
      expect(store.inspectDataVersion().schemaRevision).toBe(LATEST_SCHEMA_VERSION);
    } finally { if (!closed) store.close(); }
  });

  it('freezes prepared 初评 contracts before profile edits and keeps them after reopen and Book-only merge', async () => {
    let store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let closed = false;
    const other = join(dirname(roots.dataRoot), 'other-data');
    try {
      const book = await importSample1Book(store, roots.codeRoot, '初评方案快照');
      await pinEditorialWorkspaceProfileRevision2(store, book.bookId);
      recordMissingCredentialConnection(store, '合成连接');
      const launch = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
      const builtin = store.inspectEvaluationProfiles().profiles[0]!;
      const profile = store.saveEvaluationProfile({ ...edit(builtin), items: edit(builtin).items.map((item, index) => index === 0 ? { ...item, label: '作品品质', description: '请看作者声音。' } : item) }).profiles[0]!;
      let work = store.createInitialEvaluationPreparationWork(book.bookId, launch);
      while (!work.done) work = store.advanceInitialEvaluationPreparationWork(work.workId!);
      const prepared = work.projection!;
      const plan = store.inspectTaskPlan({ kind: 'initial-evaluation', bookId: book.bookId, ref: prepared.taskIntent!.taskIntentId });
      store.saveEvaluationProfile(edit(profile, ['完成来源复核。']));
      expect(store.inspectTaskPlan({ kind: 'initial-evaluation', bookId: book.bookId, ref: prepared.taskIntent!.taskIntentId })).toEqual(plan);
      store.close();
      closed = true;
      closed = false;
      store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      expect(store.inspectInitialEvaluation(book.bookId).planEnvelope!.promptContractDigest).toBe(prepared.planEnvelope!.promptContractDigest);
      expect(store.inspectTaskPlan({ kind: 'initial-evaluation', bookId: book.bookId, ref: prepared.taskIntent!.taskIntentId })).toEqual(plan);
      store.authorizeInitialEvaluation(book.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      expect(store.initialEvaluationLedgerForRun(store.inspectInitialEvaluation(book.bookId).run!.runRecordId).definition.promptContractDigest).toBe(prepared.planEnvelope!.promptContractDigest);
      store.close();
      closed = true;
      const target = await EditorialStore.open(other, roots.codeRoot);
      target.close();
      const db = new DatabaseSync(join(other, 'store', 'ai7.sqlite'));
      try {
        db.prepare('ATTACH DATABASE ? AS src').run(join(roots.dataRoot, 'store', 'ai7.sqlite'));
        expect(MERGE_TABLE_POLICY.evaluation_profile_versions).toBe('house');
        expect(MERGE_TABLE_POLICY.initial_evaluation_tasks).toBe('owned');
        mergeBooks(db, [book.bookId], { source: roots.dataRoot, target: other });
        expect(db.prepare('SELECT count(*) AS n FROM evaluation_profile_versions').get()!.n).toBe(0);
        expect(new EvaluationProfiles(db).taskProfile(prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.promptContractDigest)).toMatchObject({ sha256: profile.sha256, items: profile.items });
      } finally { db.close(); }
      closed = false;
      store = await EditorialStore.open(other, roots.codeRoot);
      expect(store.inspectEvaluationProfiles().profiles[0]!.issuer).toBe('AI7 内置默认');
      expect(store.inspectInitialEvaluation(book.bookId).planEnvelope!.promptContractDigest).toBe(prepared.planEnvelope!.promptContractDigest);
    } finally { if (!closed) store.close(); }
  });
});
