import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ANALYSIS_FEEDBACK_TRIGGER_SQL } from '../../src/service/analysis-feedback.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { ANALYSIS_FEEDBACK_SCHEMA_VERSION, EVALUATION_RECORD_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import {
  BASELINE_ANALYSIS_TASK_GOAL,
  type AnalysisFeedbackProjection,
  type LaunchPolicyProjection,
  type RecordAnalysisFeedbackInput,
} from '../../src/shared/protocol.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for ②A 分析反馈 (Issue #94, plan slice S38; V2-UX-ANALYSIS-023, ANALYSIS-024, FDBK-005 to
// FDBK-008) over the real store, exact `sample1`'s baseline analysis settled through the one execution owner and the J-04
// fixture. Each explicit judgment is a Quality Signal bound to its revision, item and digest; a changed judgment succeeds it;
// the metric counts each item's latest judgment once, and nothing nobody judged. Judgments and notes are the suite's own
// words; no manuscript text is printed.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-analysis-feedback-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
});

afterEach(async () => {
  await roots.dispose();
});

async function refusal(operation: () => unknown): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

async function openSession(): Promise<{ store: EditorialStore; owner: BaselineAnalysisExecutionOwner }> {
  const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-happy');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  return { store, owner };
}

async function closeSession(session: { store: EditorialStore; owner: BaselineAnalysisExecutionOwner }): Promise<void> {
  await session.owner.dispose();
  session.store.markCleanShutdown();
  session.store.close();
}

function item(projection: AnalysisFeedbackProjection, itemKey: string) {
  return projection.items.find((entry) => entry.itemKey === itemKey)!;
}

describe('②A 分析反馈 over the real store', () => {
  it('binds each judgment to its revision and item, succeeds it on change, and counts only what the editor judged', async () => {
    await requireExactSample1(roots.codeRoot);
    const session = await openSession();
    let bookId: string;
    let revisionId: string;
    try {
      const { store, owner } = session;
      const book = await importSample1Book(store, roots.codeRoot, '分析反馈之书');
      bookId = book.bookId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, '分析反馈连接');
      let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      const prepared = progress.projection!;
      const authorized = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      owner.admitAndDispatch(authorized.dispatchRunRecordId!);
      await owner.whenIdle();
      const revision = store.inspectBaselineAnalysis(bookId).resultSetRevision!;
      revisionId = revision.revisionId;

      // Every item the page shows, in its order, none judged; the metric counts nothing, since silence is not approval.
      const before = store.inspectAnalysisFeedback(bookId, revisionId);
      const { synthesis } = revision;
      expect(before.items.map((entry) => entry.itemKey)).toEqual([
        ...(synthesis.synopsis.length > 0 ? ['synopsis'] : []),
        ...synthesis.entities.map((_, index) => `entities/${index}`),
        ...synthesis.events.map((_, index) => `events/${index}`),
        ...synthesis.relationships.map((_, index) => `relationships/${index}`),
        ...synthesis.settingClaims.map((_, index) => `settings/${index}`),
      ]);
      expect(synthesis.entities.length).toBeGreaterThan(0);
      expect(synthesis.events.length).toBeGreaterThan(0);
      expect(before.items.every((entry) => entry.latest === null && entry.signals === 0 && /^[0-9a-f]{64}$/u.test(entry.digest))).toBe(true);
      expect([before.revisionOrdinal, before.metric.definition, before.metric.scope, before.metric.judged]).toEqual([revision.ordinal, 'ai7.analysis-quality-metric/1', 'book', 0]);

      const entity = item(before, 'entities/0');
      const judge = (input: Partial<RecordAnalysisFeedbackInput>) => store.recordAnalysisFeedback({
        bookId, revisionId, itemKey: 'entities/0', itemDigest: entity.digest, expectedLatestSignalId: null,
        judgment: 'inaccurate', reason: null, correction: null, ...input,
      });
      // The item is what the editor saw, its latest judgment the one they saw, and a reason one offered for the judgment.
      expect(await refusal(() => judge({ itemDigest: '0'.repeat(64) }))).toBe('ANALYSIS_FEEDBACK_ITEM_CHANGED:这一条的内容与你看到的不一致；请刷新后再给反馈。');
      expect(await refusal(() => judge({ itemKey: 'entities/999' }))).toBe('ANALYSIS_FEEDBACK_ITEM_NOT_FOUND:这一版分析结果里没有这一条。');
      expect(await refusal(() => judge({ judgment: 'accurate', reason: { choice: 'misnamed', text: null } }))).toBe('ANALYSIS_FEEDBACK_REASON_UNEXPECTED:「准确」不需要说明原因。');
      expect(await refusal(() => judge({ reason: { choice: 'chronology-wrong', text: null } }))).toBe('ANALYSIS_FEEDBACK_REASON_INVALID:反馈的原因无效。');
      expect(await refusal(() => judge({ reason: { choice: 'other', text: '  ' } }))).toBe('ANALYSIS_FEEDBACK_REASON_TEXT:选「其他」时请写下原因。');
      expect(await refusal(() => judge({ judgment: 'accurate', correction: '应为另一名称' }))).toBe('ANALYSIS_FEEDBACK_CORRECTION_UNEXPECTED:「准确」不需要修正说明。');
      // The editor's own words are 300 graphemes at most and never a control character; a revision the Book does not
      // hold binds nothing.
      expect(await refusal(() => judge({ correction: '字'.repeat(301) }))).toBe('ANALYSIS_FEEDBACK_TEXT_TOO_LONG:修正说明要在 300 字以内。');
      expect(await refusal(() => judge({ reason: { choice: 'other', text: '原因\u0007' } }))).toBe('ANALYSIS_FEEDBACK_TEXT_INVALID:原因说明含有不能显示的控制字符。');
      expect(await refusal(() => judge({ revisionId: '00000000-0000-4000-8000-000000000000' }))).toBe('ANALYSIS_REVISION_NOT_FOUND:本图书没有该结果集修订版。');

      // 不准确, with a reason offered for it and the editor's own correction.
      const first = judge({ reason: { choice: 'misnamed', text: null }, correction: '  应为另一名称  ' });
      const judged = item(first, 'entities/0');
      expect(judged).toMatchObject({ signals: 1, latest: { judgment: 'inaccurate', reason: { choice: 'misnamed', text: null }, correction: '应为另一名称', supersedes: null } });
      expect(first.metric).toMatchObject({ judged: 1, accurate: 0, inaccurate: 1, incomplete: 0 });
      expect(first.metric.byDimension.find((entry) => entry.dimension === 'entities')).toEqual({ dimension: 'entities', judged: 1, accurate: 0, inaccurate: 1, incomplete: 0 });
      expect(first.metric.lineageDigest).not.toBe(before.metric.lineageDigest);
      expect(await refusal(() => judge({}))).toBe('ANALYSIS_FEEDBACK_MOVED:这一条的反馈刚被改过；请看过现在的反馈再改。');
      const firstSignal = judged.latest!.signalId;
      expect(await refusal(() => judge({ expectedLatestSignalId: firstSignal, reason: { choice: 'misnamed', text: null }, correction: '应为另一名称' })))
        .toBe('ANALYSIS_FEEDBACK_UNCHANGED:反馈没有变化。');

      // Changed to 准确: a successor on record, the first kept; the metric counts the item once, as its latest says.
      const changed = judge({ expectedLatestSignalId: firstSignal, judgment: 'accurate' });
      expect(item(changed, 'entities/0')).toMatchObject({ signals: 2, latest: { judgment: 'accurate', reason: null, correction: null, supersedes: firstSignal } });
      expect(changed.metric).toMatchObject({ judged: 1, accurate: 1, inaccurate: 0, incomplete: 0 });
      let revised = changed;
      for (let index = 0; index < 64; index += 1) {
        revised = judge({ expectedLatestSignalId: item(revised, 'entities/0').latest!.signalId,
          judgment: index % 2 === 0 ? 'inaccurate' : 'accurate' });
      }
      expect(item(revised, 'entities/0').signals).toBe(66);
      expect(revised.metric).toMatchObject({ judged: 1, accurate: 1, inaccurate: 0, incomplete: 0 });

      // An event 不完整 for the editor's own reason, and the synopsis 准确 when there is one.
      const event = item(changed, 'events/0');
      const withEvent = store.recordAnalysisFeedback({
        bookId, revisionId, itemKey: 'events/0', itemDigest: event.digest, expectedLatestSignalId: null,
        judgment: 'incomplete', reason: { choice: 'other', text: '漏了事件的起因' }, correction: null,
      });
      expect(item(withEvent, 'events/0').latest).toMatchObject({ judgment: 'incomplete', reason: { choice: 'other', text: '漏了事件的起因' } });
      expect(withEvent.metric).toMatchObject({ judged: 2, accurate: 1, inaccurate: 0, incomplete: 1 });
      // Reading it twice answers the same, and writes nothing.
      expect(store.inspectAnalysisFeedback(bookId, revisionId)).toEqual(withEvent);
      // The incremental hash remains byte-identical to the established canonical lineage object.
      const lineageDatabase = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const rows = lineageDatabase.prepare('SELECT signal_id, sha256, revision_id, item_key FROM analysis_feedback_signals WHERE book_id = ? ORDER BY ordinal').all(bookId);
        const latest = new Map(rows.map((row) => [`${String(row.revision_id)}\n${String(row.item_key)}`, { signalId: String(row.signal_id), sha256: String(row.sha256) }]));
        const signals = [...latest.values()].sort((a, b) => a.signalId < b.signalId ? -1 : a.signalId > b.signalId ? 1 : 0);
        expect(withEvent.metric.lineageDigest).toBe(sha256Hex(canonicalJson({ schema: 'ai7.analysis-quality-metric-lineage/1',
          definition: withEvent.metric.definition, bookId, signals })));
      } finally {
        lineageDatabase.close();
      }
      // Another Book cannot read or judge this Book's revision — one analysed as well, so the refusal is the ownership
      // check's own, never an absent analysis.
      const other = (await importSample1Book(store, roots.codeRoot, '另一本分析之书')).bookId;
      await pinEditorialWorkspaceProfileRevision2(store, other);
      let otherProgress = store.createBaselineAnalysisPreparationWork(other, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
      while (!otherProgress.done) otherProgress = store.advanceBaselineAnalysisPreparationWork(otherProgress.workId!);
      const otherPrepared = otherProgress.projection!;
      owner.admitAndDispatch(store.authorizeBaselineAnalysis(other, otherPrepared.taskIntent!.taskIntentId, otherPrepared.planEnvelope!.digest).dispatchRunRecordId!);
      await owner.whenIdle();
      expect(store.inspectBaselineAnalysis(other).resultSetRevision).not.toBeNull();
      expect(await refusal(() => store.inspectAnalysisFeedback(other, revisionId))).toMatch(/^ANALYSIS_REVISION_NOT_FOUND:/u);
      expect(await refusal(() => store.recordAnalysisFeedback({
        bookId: other, revisionId, itemKey: 'entities/0', itemDigest: item(withEvent, 'entities/0').digest,
        expectedLatestSignalId: item(withEvent, 'entities/0').latest?.signalId ?? null, judgment: 'inaccurate', reason: null, correction: null,
      }))).toMatch(/^ANALYSIS_REVISION_NOT_FOUND:/u);
    } finally {
      await closeSession(session);
    }

    // A restart keeps every signal, and the ledger refuses to be rewritten.
    const reopened = await openSession();
    try {
      const kept = reopened.store.inspectAnalysisFeedback(bookId!, revisionId!);
      expect([item(kept, 'entities/0').signals, item(kept, 'events/0').latest?.judgment, kept.metric.judged]).toEqual([66, 'incomplete', 2]);
    } finally {
      await closeSession(reopened);
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(ANALYSIS_FEEDBACK_SCHEMA_VERSION);
      expect(() => database.exec('UPDATE analysis_feedback_signals SET judgment = judgment')).toThrowError(/ANALYSIS_FEEDBACK_LEDGER_IMMUTABLE/u);
      expect(() => database.exec('DELETE FROM analysis_feedback_signals')).toThrowError(/ANALYSIS_FEEDBACK_LEDGER_IMMUTABLE/u);
      // Rewritten by hand behind the triggers' back, the signal no longer reads, and the page says so rather than guess.
      database.exec('DROP TRIGGER analysis_feedback_signals_no_update');
      database.exec("UPDATE analysis_feedback_signals SET canonical_json = replace(canonical_json, '应为另一名称', '改过')");
      database.exec(ANALYSIS_FEEDBACK_TRIGGER_SQL.analysis_feedback_signals_no_update!);
    } finally {
      database.close();
    }
    const tampered = await openSession();
    try {
      expect(await refusal(() => tampered.store.inspectAnalysisFeedback(bookId!, revisionId!))).toBe('ANALYSIS_FEEDBACK_RECORD_INVALID:分析反馈记录已损坏。');
    } finally {
      await closeSession(tampered);
    }
  }, 300_000);

  it('adds revision 48 to a revision-47 store with nothing else moved', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const plant = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      plant.exec(`DROP TABLE analysis_feedback_signals; PRAGMA user_version = ${EVALUATION_RECORD_SCHEMA_VERSION};`);
    } finally {
      plant.close();
    }
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(ANALYSIS_FEEDBACK_SCHEMA_VERSION);
      expect((database.prepare('SELECT count(*) count FROM analysis_feedback_signals').get() as { count: number }).count).toBe(0);
    } finally {
      database.close();
    }
  }, 120_000);
});
