import { createHash, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RECONCILED_INTERRUPTED_DETAIL, RECONCILED_QUEUED_DETAIL } from '../../src/service/analysis/baseline-analysis-store.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { runReportUsageReconciles } from '../../src/service/analysis/run-report.js';
import { canonicalRecord, sha256Hex } from '../../src/service/analysis/canonical.js';
import { EVALUATION_INITIAL_DRAFT_TRIGGER_SQL, EVALUATION_RECORD_TRIGGER_SQL } from '../../src/service/evaluation-records.js';
import { EVALUATION_REWRITE_SCHEMA_SQL, EVALUATION_REWRITE_TRIGGER_SQL } from '../../src/service/evaluation-rewrites.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { fixtureEntryKey, loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import {
  EVALUATION_REWRITE_UNIT_RESULT_SCHEMA,
  evaluationRewriteObservationSetDigest,
  evaluationRewriteRequestDigest,
  evaluationRewriteSynthesisRequestDigest,
} from '../../src/service/evaluation/evaluation-rewrite-contract.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import {
  ANALYSIS_LEDGER_REVISION_62_SQL,
  ANALYSIS_LEDGER_SCHEMA_SQL,
  CAPTURED_PROCEDURE_SCHEMA_VERSION,
  BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION,
} from '../../src/service/task-authorization.js';
import {
  EVALUATION_REWRITE_ASSURANCE_STATEMENT,
  EVALUATION_REWRITE_CONTRACT_VERSION,
  EVALUATION_REWRITE_KIND,
  EVALUATION_REWRITE_LIVE_UNAVAILABLE,
  type EvaluationContent,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { KIND_COUPLED_ANALYSIS_RELATIONS, downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';
import { AUTHORED_REWRITE_OBSERVATIONS, AUTHORED_REWRITE_WORDS, EVALUATION_REWRITE_FIXTURE_IDENTITY, J11_REWRITE_ADJUSTMENTS, beginRewriteAsJ11 } from '../support/evaluation-rewrite.js';
import { finalizeAsJ11, runInitialEvaluationToEnd } from '../support/readers-report.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { AUTHORED_MARKET } from '../support/initial-evaluation-market.js';

// Service-integration suite (L2) for the market section and 按我的评分重写评语 (Issue #429, plan slice S81b2; V2-UX-EVAL-008,
// EVAL-009) over the real store and ledger, the one execution owner and the AI7 local deterministic adapter over the authored
// fixture `sample1-evaluation-rewrite-authored`: AI7's market words snapshotted with a version begun from its 初评, the 书系 house
// data beside them, and a rewrite of a version's 评语 that the editor 采用 or 放弃 — never a number moved. The manuscript is exact
// `sample1` (ADR 0043); no Provider, socket or credential value is involved. Assertions name states, the authored words and
// counts, never manuscript text.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-evaluation-rewrite-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  fixture = await loadModelFixture(FIXTURES_ROOT, EVALUATION_REWRITE_FIXTURE_IDENTITY);
  expect(fixture.provenance).toBe('authored');
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

interface Book {
  readonly store: EditorialStore;
  readonly owner: BaselineAnalysisExecutionOwner;
  readonly bookId: string;
}

async function openStore(): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
}

async function withBook(body: (book: Book) => Promise<void>): Promise<void> {
  await requireExactSample1(roots.codeRoot);
  const store = await openStore();
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  try {
    const imported = await importSample1Book(store, roots.codeRoot, '评语重写之书');
    await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑连接');
    await body({ store, owner, bookId: imported.bookId });
    store.markCleanShutdown();
  } finally {
    await owner.dispose();
    store.close();
  }
}

/** 按我的评分重写评语 of one version to its frozen plan, 开始任务 through the governor, and the Run to its end. */
async function rewrite(book: Book, recordId: string): Promise<string> {
  let progress = book.store.createEvaluationRewritePreparationWork(book.bookId, recordId, launchPolicy);
  while (!progress.done) progress = book.store.advanceEvaluationRewritePreparationWork(progress.workId!);
  const prepared = progress.projection!;
  expect(prepared).toMatchObject({ kind: EVALUATION_REWRITE_KIND, contractVersion: EVALUATION_REWRITE_CONTRACT_VERSION, state: 'prepared' });
  const authorized = book.store.authorizeEvaluationRewrite(book.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  expect(authorized.recordId).toBe(recordId);
  expect(book.owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger)).toBe('admitted');
  await book.owner.whenIdle();
  return prepared.taskIntent!.taskIntentId;
}

const scoresOf = (content: EvaluationContent): Array<[string, number | null, string | null]> =>
  content.items.map((item) => [item.itemId, item.score, item.notRated]);

/** Each entry's record of AI7's words in it, oldest first, as the store holds it; `null` for an entry that names none. */
function rewrittenFrom(recordId: string): unknown[] {
  const reader = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    return (reader.prepare('SELECT canonical_json FROM evaluation_record_entries WHERE record_id = ? ORDER BY ordinal').all(recordId) as Array<{ canonical_json: string }>)
      .map((row) => (JSON.parse(row.canonical_json) as { rewrittenFrom?: unknown }).rewrittenFrom ?? null);
  } finally {
    reader.close();
  }
}

/** AI7's authored words in an entry: these items' 评语, and the 总评 when `verdict`, all from one rewrite, each with its digest. */
const wordsOf = (itemIds: ReadonlyArray<string>, from: { taskIntentId: string; analysisRevisionId: string }, verdict: boolean): unknown => ({
  items: itemIds.map((itemId) => ({ itemId, ...from, sha256: sha256Hex(AUTHORED_REWRITE_WORDS.items.find((item) => item.itemId === itemId)!.comment) })),
  verdict: verdict ? { ...from, sha256: sha256Hex(AUTHORED_REWRITE_WORDS.verdict) } : null,
});

describe('the market section and 按我的评分重写评语 over the real store on exact sample1', () => {
  it('snapshots AI7\'s market words with a version begun from its 初评, and lists the 书系 house data beside them', async () => {
    await withBook(async (book) => {
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      const latest = book.store.inspectEvaluation(book.bookId, null).initial.latest!;
      expect(latest.market).toEqual(AUTHORED_MARKET);
      // A version the editor begins alone holds no AI7 market words; one begun from the 初评 holds them, snapshotted.
      const alone = book.store.startEvaluation(book.bookId).record!;
      expect(alone.initial).toBeNull();
      const finalizedAlone: EvaluationContent = {
        ...alone.content,
        items: alone.content.items.map((item) => ({ ...item, score: 10 })),
        risks: alone.content.risks.map((risk) => ({ ...risk, level: 'low', statement: '无。' })),
        conclusion: 'revise',
      };
      book.store.saveEvaluation({ bookId: book.bookId, recordId: alone.recordId, expectedEntries: 1, content: finalizedAlone, finalize: true });
      const seeded = book.store.startEvaluation(book.bookId, true);
      expect(seeded.record!.initial!.market).toEqual(AUTHORED_MARKET);
      // Nothing is preselected by it: the conclusion is still the editor's to choose.
      expect(seeded.record!.content.conclusion).toBeNull();
      // The Book is in no 书系: no comparable, and 定价与首印 waits for thirty published Books.
      expect(seeded.market).toEqual({
        series: [], comparables: [], comparableCount: 0, seriesUnreadable: false,
        pricing: {
          booksWithActuals: 0, otherBooksWithActuals: 0, threshold: 30, enabled: false, available: false, unreadable: false,
          house: null, series: null, seriesBooksWithActuals: null, seriesMinimum: 5,
        },
      });
      // Its 书系's other Books are comparables tagged 书系, the Book itself never one of them.
      const created = book.store.createSeries({ title: '评估书系', note: '' });
      const other = book.store.commitBookCreation((() => {
        const creation = book.store.prepareBookCreation('同书系的另一本', null);
        return { ...creation.proposed, reviewDigest: creation.reviewDigest };
      })()).overview.book.bookId;
      for (const bookId of [book.bookId, other]) {
        const preview = book.store.previewSeriesMembershipChange({ seriesId: created.seriesId, bookId, kind: 'add' });
        book.store.changeSeriesMembership({ seriesId: created.seriesId, bookId, kind: 'add', previewDigest: preview.previewDigest });
      }
      const market = book.store.inspectEvaluation(book.bookId, null).market;
      expect(market.series).toEqual([{ seriesId: created.seriesId, title: '评估书系' }]);
      expect(market.comparables).toEqual([{ bookId: other, title: '同书系的另一本', seriesTitle: '评估书系', published: false, source: 'series' }]);
      expect(market.comparableCount).toBe(1);
    });
  }, 300_000);

  it('rewrites a version\'s 评语 to the editor\'s scores as a proposal, records nothing until 采用, and moves no number', async () => {
    await withBook(async (book) => {
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      finalizeAsJ11(book.store, book.bookId);
      // A version begun from AI7's 初评 and not yet departing from its scores has nothing to rewrite to.
      const draft = book.store.startEvaluation(book.bookId, true).record!;
      expect(book.store.inspectEvaluation(book.bookId, draft.recordId).rewrite.prepare)
        .toEqual({ allowed: false, reason: '先把至少一项改成你的分数并保存：重写会让评语与你保存的分数一致。' });
      expect(await refusal(() => book.store.createEvaluationRewritePreparationWork(book.bookId, draft.recordId, launchPolicy)))
        .toBe('EVALUATION_REWRITE_UNAVAILABLE:先把至少一项改成你的分数并保存：重写会让评语与你保存的分数一致。');
      // Saved with J-11's two departures, it can be asked.
      const adjusted = book.store.saveEvaluation({
        bookId: book.bookId, recordId: draft.recordId, expectedEntries: 1, finalize: false,
        content: {
          ...draft.content,
          items: draft.content.items.map((item) => {
            const departure = J11_REWRITE_ADJUSTMENTS.find((entry) => entry.itemId === item.itemId);
            return departure === undefined ? item : { ...item, score: departure.score, adjustment: { reasons: [departure.reason], note: null } };
          }),
        },
      }).record!;
      expect(adjusted.entries).toBe(2);
      const ready = book.store.inspectEvaluation(book.bookId, adjusted.recordId).rewrite;
      expect(ready).toEqual({ prepare: { allowed: true, mode: 'evaluation-rewrite-first' }, task: null, proposal: null, decided: null });

      // The plan in the Task Drawer, in the editor's words.
      let progress = book.store.createEvaluationRewritePreparationWork(book.bookId, adjusted.recordId, launchPolicy);
      while (!progress.done) progress = book.store.advanceEvaluationRewritePreparationWork(progress.workId!);
      const taskIntentId = progress.projection!.taskIntent!.taskIntentId;
      const plan = book.store.inspectTaskPlan({ bookId: book.bookId, kind: 'evaluation-rewrite', ref: taskIntentId });
      expect(plan).toMatchObject({ kind: 'evaluation-rewrite', ref: taskIntentId, state: { key: 'ready' }, start: { readiness: 'ready', needsModelConnection: false } });
      expect(plan.goal.sentence).toBe('按你在第 3 版评估（第 2 次保存）中的评分重写各项评语与总评，分数不变；重写后由你决定采用还是放弃');
      expect(plan.steps.map((step) => step.label)).toEqual(['逐章读取，记下能说明你所给分数的依据', '按你的评分重写评语']);
      expect(plan.notDo.editorial).toEqual(expect.arrayContaining(['不改分数：只重写评语与总评，每一项的分数照你保存的', '不自动写入评估：重写的评语要你采用后才记入这一版']));
      expect(plan.scope.reference[0]).toBe('第 3 版评估（第 2 次保存）：你的评分（文学品质与作者声音 16.5 / 20、主题、价值与社会文化语境 15 / 20、结构、叙事逻辑与连贯 13 / 20、中文语言与表达 14 / 20、读者与市场潜力 10 / 20）、调分原因、现在的评语与总评，以及 AI7 初评的分数与评语');
      expect(book.store.inspectEvaluation(book.bookId, adjusted.recordId).rewrite.task)
        .toMatchObject({ taskIntentId, recordId: adjusted.recordId, recordOrdinal: 3, entryOrdinal: 2, state: 'prepared' });
      const authorized = book.store.authorizeEvaluationRewrite(book.bookId, taskIntentId, plan.start.planEnvelopeDigest!);
      book.owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger);
      await book.owner.whenIdle();
      const settled = book.store.inspectEvaluationRewrite(book.bookId)!;
      expect(settled.state).toBe('settled');
      const revision = settled.resultSetRevision!;
      expect(revision.coverage).toMatchObject({ state: 'complete', unitsTotal: 8, unitsClosed: 8 });
      expect(revision.assurance).toMatchObject({ state: 'qualified', statement: EVALUATION_REWRITE_ASSURANCE_STATEMENT });
      expect(revision.rewrite.words).toEqual({ items: AUTHORED_REWRITE_WORDS.items, verdict: AUTHORED_REWRITE_WORDS.verdict, withheld: [] });
      expect(revision.rewrite.observations.length).toBe(12);
      expect(runReportUsageReconciles(settled.taskOutcome!.report!, revision.usage)).toBe(true);

      // A proposal beside the version's own words: the version is unchanged until the editor decides.
      const waiting = book.store.inspectEvaluation(book.bookId, adjusted.recordId);
      expect(waiting.record).toMatchObject({ entries: 2, content: adjusted.content });
      const proposal = waiting.rewrite.proposal!;
      expect(proposal).toMatchObject({ revisionId: revision.revisionId, entryOrdinal: 2, current: true, reading: { unitsTotal: 8, unitsRead: 8 }, withheld: [] });
      // Each rewritten 评语 beside the version's own, with the notes it rests on: the range and the blocks they cite (EVAL-006).
      expect(proposal.items).toEqual(AUTHORED_REWRITE_WORDS.items.map((item) => ({
        itemId: item.itemId, before: adjusted.content.items.find((entry) => entry.itemId === item.itemId)!.comment, after: item.comment,
        evidence: revision.rewrite.observations.filter((observation) => observation.itemId === item.itemId)
          .map((observation) => ({ unitOrdinal: observation.unitOrdinal, note: observation.note, blockIds: observation.blockIds })),
        evidenceCount: revision.rewrite.observations.filter((observation) => observation.itemId === item.itemId).length,
      })));
      expect(proposal.items.map((item) => item.evidence.length)).toEqual([3, 2, 4, 3, 0]);
      expect(proposal.verdict).toEqual({ before: null, after: AUTHORED_REWRITE_WORDS.verdict });

      // 放弃: recorded once, nothing of the version moves, and nothing waits any more.
      const discarded = book.store.decideEvaluationRewrite(book.bookId, revision.revisionId, 'discard');
      expect(discarded.record).toMatchObject({ recordId: adjusted.recordId, entries: 2, content: adjusted.content });
      expect(discarded.rewrite).toMatchObject({ proposal: null, decided: { decision: 'discarded', entryOrdinal: null }, prepare: { allowed: true, mode: 'evaluation-rewrite-again' } });
      expect(await refusal(() => book.store.decideEvaluationRewrite(book.bookId, revision.revisionId, 'accept'))).toBe('EVALUATION_REWRITE_DECIDED:这一次重写已经处理过了。');

      // Asked again of the same saved entry, then 采用: a new entry with AI7's words, every score and reason as the editor left them.
      const againTask = await rewrite(book, adjusted.recordId);
      const again = book.store.inspectEvaluation(book.bookId, adjusted.recordId).rewrite.proposal!;
      expect(again.revisionId).not.toBe(revision.revisionId);
      const accepted = book.store.decideEvaluationRewrite(book.bookId, again.revisionId, 'accept');
      const record = accepted.record!;
      expect(record).toMatchObject({ recordId: adjusted.recordId, entries: 3, state: 'editing' });
      expect(scoresOf(record.content)).toEqual(scoresOf(adjusted.content));
      expect(record.content.items.map((item) => item.adjustment)).toEqual(adjusted.content.items.map((item) => item.adjustment));
      expect(record.content.items.map((item) => item.comment)).toEqual(AUTHORED_REWRITE_WORDS.items.map((item) => item.comment));
      expect(record.content.verdict).toBe(AUTHORED_REWRITE_WORDS.verdict);
      expect([record.content.risks, record.content.readiness, record.content.strengths, record.content.weaknesses, record.content.conclusion])
        .toEqual([adjusted.content.risks, adjusted.content.readiness, adjusted.content.strengths, adjusted.content.weaknesses, adjusted.content.conclusion]);
      expect(accepted.rewrite).toMatchObject({ proposal: null, decided: { decision: 'accepted', entryOrdinal: 3 } });
      // The entry names, item by item, the words that are AI7's and the rewrite they came from: never to be learned as the
      // editor's (EVAL-011; Issue #689).
      const from = { taskIntentId: againTask, analysisRevisionId: again.revisionId };
      expect(rewrittenFrom(adjusted.recordId)).toEqual([null, null, wordsOf(AUTHORED_REWRITE_WORDS.items.map((item) => item.itemId), from, true)]);
    });
  }, 300_000);

  it('marks AI7\'s words item by item on every later save until the editor changes them, 定稿 and the next version included (Issue #689)', async () => {
    let bookId = '';
    let recordId = '';
    let from = { taskIntentId: '', analysisRevisionId: '' };
    await withBook(async (book) => {
      bookId = book.bookId;
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      finalizeAsJ11(book.store, book.bookId);
      const record = beginRewriteAsJ11(book.store, book.bookId);
      recordId = record.recordId;
      const taskIntentId = await rewrite(book, record.recordId);
      const proposal = book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.proposal!;
      book.store.decideEvaluationRewrite(book.bookId, proposal.revisionId, 'accept');
      from = { taskIntentId, analysisRevisionId: proposal.revisionId };
    });
    const itemIds = AUTHORED_REWRITE_WORDS.items.map((item) => item.itemId);
    expect(rewrittenFrom(recordId)).toEqual([null, null, wordsOf(itemIds, from, true)]);
    // The 采用 entry as an entry written before Issue #689 recorded it: only the rewrite it took.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      const row = database.prepare('SELECT entry_id, canonical_json FROM evaluation_record_entries WHERE record_id = ? AND ordinal = 3').get(recordId) as { entry_id: string; canonical_json: string };
      const legacy = canonicalRecord({ ...(JSON.parse(row.canonical_json) as Record<string, unknown>), rewrittenFrom: from });
      database.exec('DROP TRIGGER evaluation_record_entries_no_update');
      database.prepare('UPDATE evaluation_record_entries SET canonical_json = ?, sha256 = ? WHERE entry_id = ?').run(legacy.json, legacy.digest, row.entry_id);
      database.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!);
    } finally {
      database.close();
    }
    const store = await openStore();
    try {
      const accepted = store.inspectEvaluation(bookId, recordId).record!;
      expect(accepted.entries).toBe(3);
      // The editor rewrites the first 评语 in their own words: the other four and the 总评 stay AI7's.
      const edited = store.saveEvaluation({
        bookId, recordId, expectedEntries: 3, finalize: false,
        content: { ...accepted.content, items: accepted.content.items.map((item, index) => (index === 0 ? { ...item, comment: '编辑自己写的评语。' } : item)) },
      }).record!;
      // A save that changes neither keeps both; 定稿 with the editor's own 总评 leaves the four 评语.
      const kept = store.saveEvaluation({ bookId, recordId, expectedEntries: 4, finalize: false, content: { ...edited.content, conclusion: 'revise' } }).record!;
      store.saveEvaluation({ bookId, recordId, expectedEntries: 5, finalize: true, content: { ...kept.content, verdict: '编辑自己写的总评。' } });
      expect(rewrittenFrom(recordId)).toEqual([
        null, null, from, wordsOf(itemIds.slice(1), from, true), wordsOf(itemIds.slice(1), from, true), wordsOf(itemIds.slice(1), from, false),
      ]);
      // 重新评估 carries the 定稿's words into the next version, and AI7's with them; the editor's change makes one theirs.
      const next = store.startEvaluation(bookId).record!;
      expect(rewrittenFrom(next.recordId)).toEqual([wordsOf(itemIds.slice(1), from, false)]);
      store.saveEvaluation({
        bookId, recordId: next.recordId, expectedEntries: 1, finalize: false,
        content: { ...next.content, items: next.content.items.map((item) => ({ ...item, comment: `${item.comment ?? ''}（编辑补充）` })) },
      });
      expect(rewrittenFrom(next.recordId)).toEqual([wordsOf(itemIds.slice(1), from, false), null]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // An entry that marks an item the version does not hold is not one AI7 wrote.
    const tampered = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      const row = tampered.prepare('SELECT entry_id, canonical_json FROM evaluation_record_entries WHERE record_id = ? AND ordinal = 6').get(recordId) as { entry_id: string; canonical_json: string };
      const forged = canonicalRecord({
        ...(JSON.parse(row.canonical_json) as Record<string, unknown>),
        rewrittenFrom: { items: [{ itemId: 'no-such-item', ...from, sha256: sha256Hex('AI7') }], verdict: null },
      });
      tampered.exec('DROP TRIGGER evaluation_record_entries_no_update');
      tampered.prepare('UPDATE evaluation_record_entries SET canonical_json = ?, sha256 = ? WHERE entry_id = ?').run(forged.json, forged.digest, row.entry_id);
      tampered.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!);
    } finally {
      tampered.close();
    }
    const refused = await openStore();
    try {
      // Asked for, the damaged version gives way to the latest, which still reads (Issue #708): the words it carried name a rewrite
      // this Book accepted on the version before, over that rewrite's own words.
      expect(refused.inspectEvaluation(bookId, recordId)).toMatchObject({ unreadableRecords: [3], record: { ordinal: 4, ai7WordsNotice: null } });
      expect(await refusal(() => refused.saveEvaluation({ bookId, recordId, expectedEntries: 6, finalize: false, content: {} })))
        .toBe('EVALUATION_RECORD_INVALID:评估记录已损坏。');
      refused.markCleanShutdown();
    } finally {
      refused.close();
    }
  }, 300_000);

  it('reads 评估 past a damaged 采用 record, its marks kept and their source named unchecked, and 设置 past a damaged version (Issue #702 review)', async () => {
    let bookId = '';
    let recordId = '';
    let firstId = '';
    let firstOrdinal = 0;
    let adjustedBefore = -1;
    await withBook(async (book) => {
      bookId = book.bookId;
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      const finalized = finalizeAsJ11(book.store, book.bookId);
      firstId = finalized.recordId;
      firstOrdinal = finalized.ordinal;
      const record = beginRewriteAsJ11(book.store, book.bookId);
      recordId = record.recordId;
      await rewrite(book, record.recordId);
      const proposal = book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.proposal!;
      const accepted = book.store.decideEvaluationRewrite(book.bookId, proposal.revisionId, 'accept');
      expect(accepted.record!.ai7WordsNotice).toBeNull();
      adjustedBefore = book.store.inspectEvaluationCalibration().calibration.adjustments;
    });
    // The 采用 decision, damaged: 评估 opens, the version's AI7 words stay marked and are named unchecked, and the rewrite says
    // it is unavailable, as before.
    const decision = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      decision.exec('DROP TRIGGER evaluation_rewrite_decisions_no_update');
      decision.exec("UPDATE evaluation_rewrite_decisions SET canonical_json = canonical_json || ' ' WHERE decision = 'accepted'");
      decision.exec(EVALUATION_REWRITE_TRIGGER_SQL.evaluation_rewrite_decisions_no_update!);
    } finally {
      decision.close();
    }
    const damaged = await openStore();
    try {
      const page = damaged.inspectEvaluation(bookId, recordId);
      expect(page.record).toMatchObject({ recordId, entries: 3 });
      expect(page.record!.ai7WordsNotice).toMatch(/^评语重写的采用记录已损坏，AI7 评语的标注无法全部核对；以下仍按 AI7 所写处理：「.+」的评语.*。$/u);
      expect(page.rewrite.prepare).toEqual({ allowed: false, reason: '按我的评分重写评语暂不可用：评语重写记录已损坏。' });
      damaged.markCleanShutdown();
    } finally {
      damaged.close();
    }
    // The 定稿 version's last entry, damaged: that version is refused as before, but the version after it still reads, and
    // 设置 › 评估校准与预测 still reads for the house, the damaged version — its one adjusted Book — counting for nothing.
    const entry = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      entry.exec('DROP TRIGGER evaluation_record_entries_no_update');
      entry.prepare("UPDATE evaluation_record_entries SET sha256 = ? WHERE record_id = ? AND kind = 'finalized'").run('0'.repeat(64), firstId);
      entry.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!);
    } finally {
      entry.close();
    }
    const settings = await openStore();
    try {
      expect(adjustedBefore).toBe(1);
      expect(settings.inspectEvaluationCalibration().calibration).toMatchObject({ adjustments: 0, unreadableBooks: 1 });
      expect(settings.inspectEvaluation(bookId, firstId)).toMatchObject({ unreadableRecords: [firstOrdinal], record: { recordId } });
      const later = settings.inspectEvaluation(bookId, recordId);
      expect(later.unreadableRecords).toEqual([firstOrdinal]);
      expect(later.record).toMatchObject({ recordId, entries: 3 });
      settings.markCleanShutdown();
    } finally {
      settings.close();
    }
  }, 300_000);

  it('takes no rewrite into a version that moved since, and none of a version that is 定稿, begun alone, or unknown', async () => {
    await withBook(async (book) => {
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      finalizeAsJ11(book.store, book.bookId);
      const record = beginRewriteAsJ11(book.store, book.bookId);
      await rewrite(book, record.recordId);
      const proposal = book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.proposal!;
      // The editor saves again: the rewrite was written to scores that may have changed, and cannot be taken.
      const moved = book.store.saveEvaluation({
        bookId: book.bookId, recordId: record.recordId, expectedEntries: 2, finalize: false,
        content: { ...record.content, readiness: [...record.content.readiness, '补一句。'] },
      }).record!;
      const stale = book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.proposal!;
      expect(stale).toMatchObject({ revisionId: proposal.revisionId, current: false, entryOrdinal: 2 });
      expect(await refusal(() => book.store.decideEvaluationRewrite(book.bookId, proposal.revisionId, 'accept')))
        .toBe('EVALUATION_REWRITE_STALE:这一版评估在重写之后又保存过：重写的评语依据的是之前的分数，不能采用；可以放弃它，再按现在的评分重写。');
      expect(book.store.inspectEvaluation(book.bookId, record.recordId).record).toMatchObject({ entries: 3, content: moved.content });
      expect(book.store.decideEvaluationRewrite(book.bookId, proposal.revisionId, 'discard').rewrite.decided).toMatchObject({ decision: 'discarded' });
      // Unknown results and other Books' are refused; so are malformed requests.
      expect(await refusal(() => book.store.decideEvaluationRewrite(book.bookId, randomUUID(), 'accept'))).toBe('EVALUATION_REWRITE_NOT_FOUND:这本书没有这一次重写的评语。');
      expect(await refusal(() => book.store.decideEvaluationRewrite(book.bookId, proposal.revisionId, 'keep' as 'accept'))).toBe('EVALUATION_REWRITE_INVALID:评语重写参数无效。');
      expect(await refusal(() => book.store.createEvaluationRewritePreparationWork(book.bookId, randomUUID(), launchPolicy))).toBe('EVALUATION_NOT_FOUND:没有这个评估版本。');
      // A plan prepared, then the version saved again while the drawer stayed open: 开始任务 is refused before any Run is spent.
      const prepare = (): { taskIntentId: string; digest: string } => {
        let progress = book.store.createEvaluationRewritePreparationWork(book.bookId, record.recordId, launchPolicy);
        while (!progress.done) progress = book.store.advanceEvaluationRewritePreparationWork(progress.workId!);
        return { taskIntentId: progress.projection!.taskIntent!.taskIntentId, digest: progress.projection!.planEnvelope!.digest };
      };
      const planned = prepare();
      const movedAgain = book.store.saveEvaluation({
        bookId: book.bookId, recordId: record.recordId, expectedEntries: 3, finalize: false,
        content: { ...moved.content, readiness: [...moved.content.readiness, '再补一句。'] },
      }).record!;
      expect(await refusal(() => book.store.authorizeEvaluationRewrite(book.bookId, planned.taskIntentId, planned.digest)))
        .toBe('EVALUATION_REWRITE_STALE:这一版在准备重写之后又保存过：这份计划依据的是之前的分数；请按现在的评分重新准备重写。');
      expect(book.store.inspectEvaluationRewrite(book.bookId)?.run ?? null).toBeNull();
      // Planned again at the new entry, then 定稿: 开始任务 is refused as any rewrite of a 定稿 version is.
      const replanned = prepare();
      const finalized = book.store.saveEvaluation({ bookId: book.bookId, recordId: record.recordId, expectedEntries: 4, finalize: true, content: { ...movedAgain.content, conclusion: 'revise' } }).record!;
      expect(await refusal(() => book.store.authorizeEvaluationRewrite(book.bookId, replanned.taskIntentId, replanned.digest)))
        .toBe(`EVALUATION_REWRITE_UNAVAILABLE:第 ${finalized.ordinal} 版已经定稿：评语不再重写；要改就重新评估。`);
      expect(book.store.inspectEvaluationRewrite(book.bookId)?.run ?? null).toBeNull();
      // A 定稿 version takes no rewrite.
      expect(book.store.inspectEvaluation(book.bookId, finalized.recordId).rewrite.prepare)
        .toEqual({ allowed: false, reason: `第 ${finalized.ordinal} 版已经定稿：评语不再重写；要改就重新评估。` });
      // A version begun alone has no AI7 评语 to rewrite.
      const alone = book.store.startEvaluation(book.bookId).record!;
      expect(book.store.inspectEvaluation(book.bookId, alone.recordId).rewrite.prepare)
        .toEqual({ allowed: false, reason: '这一版不是从 AI7 初评开始的：没有 AI7 的评语可以按你的评分重写。' });
      expect(await refusal(() => book.store.createEvaluationRewritePreparationWork(book.bookId, alone.recordId, launchPolicy)))
        .toBe('EVALUATION_REWRITE_UNAVAILABLE:这一版不是从 AI7 初评开始的：没有 AI7 的评语可以按你的评分重写。');
    });
  }, 300_000);

  it('settles a rewrite a stopped AI7 left waiting or under way, so 评估 offers it again and polls nothing', async () => {
    let bookId = '';
    let recordId = '';
    await withBook(async (book) => {
      bookId = book.bookId;
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      finalizeAsJ11(book.store, book.bookId);
      recordId = beginRewriteAsJ11(book.store, book.bookId).recordId;
    });
    const polled = ['waiting', 'admitted', 'executing', 'cancelling', 'pausing', 'queued'];
    for (const planted of ['authorized', 'executing'] as const) {
      const first = await openStore();
      let runRecordId: string;
      try {
        let progress = first.createEvaluationRewritePreparationWork(bookId, recordId, launchPolicy);
        while (!progress.done) progress = first.advanceEvaluationRewritePreparationWork(progress.workId!);
        const prepared = progress.projection!;
        const authorized = first.authorizeEvaluationRewrite(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
        runRecordId = authorized.dispatchRunRecordId!;
        if (planted === 'executing') {
          authorized.ledger.recordRunState(runRecordId, 'admitted', { detail: 'planted' });
          authorized.ledger.recordRunState(runRecordId, 'executing', { detail: 'planted' });
        }
        expect(authorized.ledger.currentRunState(runRecordId)).toBe(planted);
      } finally {
        first.close();
      }
      const second = await openStore();
      try {
        const stuck = second.inspectEvaluation(bookId, recordId).rewrite;
        expect(stuck.prepare.allowed).toBe(false);
        expect(polled).toContain(stuck.task!.state);
        expect(second.reconcileStoppedEvaluationRewriteRuns()).toEqual({ settled: 1 });
        const settled = second.inspectEvaluationRewrite(bookId)!;
        if (planted === 'authorized') {
          expect(settled.state).toBe('authorized-blocked');
          expect(settled.run).toMatchObject({ runRecordId, state: 'blocked-before-dispatch', blockedReasons: [RECONCILED_QUEUED_DETAIL] });
        } else {
          expect(settled.state).toBe('interrupted');
          expect(settled.taskOutcome).toMatchObject({ classification: 'interrupted', resultSetRevisionId: null, safeNextAction: RECONCILED_INTERRUPTED_DETAIL });
        }
        const offered = second.inspectEvaluation(bookId, recordId).rewrite;
        expect(offered.prepare).toEqual({ allowed: true, mode: 'evaluation-rewrite-first' });
        expect(polled).not.toContain(offered.task!.state);
        expect(offered.proposal).toBeNull();
        expect(second.reconcileStoppedEvaluationRewriteRuns()).toEqual({ settled: 0 });
        second.markCleanShutdown();
      } finally {
        second.close();
      }
    }
  }, 300_000);

  it('says how much of the Book a rewrite read, and offers no 总评 that names a conclusion while its 评语 stand', async () => {
    // A fixture of this test's own over the authored one: the third range never answers, and the synthesis over the other
    // seven writes a 总评 that chooses a conclusion.
    const entries = new Map(fixture.entries);
    fixture = { ...fixture, entries };
    await withBook(async (book) => {
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      finalizeAsJ11(book.store, book.bookId);
      const record = beginRewriteAsJ11(book.store, book.bookId);
      let progress = book.store.createEvaluationRewritePreparationWork(book.bookId, record.recordId, launchPolicy);
      while (!progress.done) progress = book.store.advanceEvaluationRewritePreparationWork(progress.workId!);
      const prepared = progress.projection!;
      const manifest = prepared.coverageManifest!;
      const contract = prepared.planEnvelope!.promptContractDigest;
      const third = manifest.units[2]!;
      expect(entries.delete(fixtureEntryKey(third.ordinal, evaluationRewriteRequestDigest(contract, third.ordinal, third.digest)))).toBe(true);
      const closed = manifest.units.filter((unit) => unit.ordinal !== third.ordinal).map((unit) => ({
        unitOrdinal: unit.ordinal,
        result: { schema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, observations: AUTHORED_REWRITE_OBSERVATIONS[unit.ordinal]! },
      }));
      const verdict = '总体较好，建议推荐出版。';
      const requestDigest = evaluationRewriteSynthesisRequestDigest(contract, evaluationRewriteObservationSetDigest(closed));
      entries.set(fixtureEntryKey(0, requestDigest), {
        unitOrdinal: 0, requestDigest, attempt: null, contentDigest: null,
        response: { kind: 'unit-result', text: JSON.stringify({ ...AUTHORED_REWRITE_WORDS, verdict }), usage: { inputTokens: 2600, outputTokens: 560 } },
      });
      const authorized = book.store.authorizeEvaluationRewrite(book.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      book.owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger);
      await book.owner.whenIdle();
      const page = book.store.inspectEvaluation(book.bookId, record.recordId);
      const proposal = page.rewrite.proposal!;
      // Seven of eight ranges read, and said so; the 评语 stand, the 总评 is set aside with why.
      expect(proposal.reading).toEqual({ unitsTotal: 8, unitsRead: 7 });
      expect(proposal.items.map((item) => item.after)).toEqual(AUTHORED_REWRITE_WORDS.items.map((item) => item.comment));
      expect([proposal.verdict, proposal.withheld]).toEqual([null, ['重写的总评写出了结论，没有采用：结论由你选。']]);
      // 采用 takes the 评语 alone: the version's own 总评 stays.
      const accepted = book.store.decideEvaluationRewrite(book.bookId, proposal.revisionId, 'accept').record!;
      expect([accepted.entries, accepted.content.verdict]).toEqual([record.entries + 1, record.content.verdict]);
      expect(accepted.content.items.filter((item) => item.score !== null).map((item) => item.comment)).toEqual(AUTHORED_REWRITE_WORDS.items.map((item) => item.comment));
    });
  }, 300_000);

  it('offers no rewrite under a live scope, and prepares or starts none there', async () => {
    await withBook(async (book) => {
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      finalizeAsJ11(book.store, book.bookId);
      const record = beginRewriteAsJ11(book.store, book.bookId);
      const free = book.store.baselineAnalysisLedger.launch;
      book.store.baselineAnalysisLedger.bindLaunch({
        operationalScope: 'developer-live',
        live: {
          route: 'opencode-go',
          model: 'deepseek-v4-flash',
          endpoint: 'https://example.invalid/v1',
          credentialSlot: 'opencode-go',
          credentialReference: randomUUID(),
          runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 100_000 },
        },
      });
      try {
        expect(book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.prepare).toEqual({ allowed: false, reason: EVALUATION_REWRITE_LIVE_UNAVAILABLE });
        expect(await refusal(() => book.store.createEvaluationRewritePreparationWork(book.bookId, record.recordId, launchPolicy)))
          .toBe(`EVALUATION_REWRITE_UNAVAILABLE:${EVALUATION_REWRITE_LIVE_UNAVAILABLE}`);
        expect(await refusal(() => book.store.authorizeEvaluationRewrite(book.bookId, randomUUID(), 'a'.repeat(64))))
          .toBe(`EVALUATION_REWRITE_UNAVAILABLE:${EVALUATION_REWRITE_LIVE_UNAVAILABLE}`);
      } finally {
        book.store.baselineAnalysisLedger.bindLaunch(free);
      }
      expect(book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.prepare).toEqual({ allowed: true, mode: 'evaluation-rewrite-first' });
    });
  }, 300_000);

  it('keeps its two ledgers immutable, reads 评估 past a damaged older decision or Task record, and reads a 初评 snapshot of either shape', async () => {
    let bookId = '';
    let recordId = '';
    await withBook(async (book) => {
      bookId = book.bookId;
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      finalizeAsJ11(book.store, book.bookId);
      const record = beginRewriteAsJ11(book.store, book.bookId);
      recordId = record.recordId;
      await rewrite(book, record.recordId);
      const proposal = book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.proposal!;
      book.store.decideEvaluationRewrite(book.bookId, proposal.revisionId, 'discard');
      // A second rewrite waits undecided beside the first one's decision.
      await rewrite(book, record.recordId);
      expect(book.store.inspectEvaluation(book.bookId, record.recordId).rewrite).toMatchObject({ decided: { decision: 'discarded' }, proposal: { current: true } });
    });
    // The older rewrite's decision, damaged: 评估 still opens, the version with it, and the rewrite says it is unavailable.
    const older = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      older.exec('DROP TRIGGER evaluation_rewrite_decisions_no_update');
      older.exec("UPDATE evaluation_rewrite_decisions SET canonical_json = canonical_json || ' '");
      older.exec(EVALUATION_REWRITE_TRIGGER_SQL.evaluation_rewrite_decisions_no_update!);
    } finally {
      older.close();
    }
    const damaged = await openStore();
    try {
      const page = damaged.inspectEvaluation(bookId, recordId);
      expect(page.record!.recordId).toBe(recordId);
      expect(page.rewrite).toMatchObject({ prepare: { allowed: false, reason: '按我的评分重写评语暂不可用：评语重写记录已损坏。' }, proposal: null, decided: null });
      damaged.markCleanShutdown();
    } finally {
      damaged.close();
    }
    // The same decision as text that is not JSON under a digest forged to match (Issue #689): read as damaged all the same,
    // never an error past the guard.
    const forged = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      forged.exec('DROP TRIGGER evaluation_rewrite_decisions_no_update');
      forged.prepare('UPDATE evaluation_rewrite_decisions SET canonical_json = ?, sha256 = ?').run('{"schema":', createHash('sha256').update('{"schema":').digest('hex'));
      forged.exec(EVALUATION_REWRITE_TRIGGER_SQL.evaluation_rewrite_decisions_no_update!);
    } finally {
      forged.close();
    }
    const unparsable = await openStore();
    try {
      const page = unparsable.inspectEvaluation(bookId, recordId);
      expect(page.record!.recordId).toBe(recordId);
      expect(page.rewrite).toMatchObject({ prepare: { allowed: false, reason: '按我的评分重写评语暂不可用：评语重写记录已损坏。' }, proposal: null, decided: null });
      unparsable.markCleanShutdown();
    } finally {
      unparsable.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION);
      for (const table of Object.keys(EVALUATION_REWRITE_SCHEMA_SQL)) {
        expect(() => database.exec(`UPDATE ${table} SET recorded_at = recorded_at`)).toThrowError(/EVALUATION_REWRITE_LEDGER_IMMUTABLE/u);
        expect(() => database.exec(`DELETE FROM ${table}`)).toThrowError(/EVALUATION_REWRITE_LEDGER_IMMUTABLE/u);
      }
      // A snapshot written before the market section existed (`/1`) names none and reads as having none; one written since
      // EVAL-011a (`/3`) names the calibration applied too, `null` here with one Book (the unit suite reads a `/2` as well).
      const snapshot = database.prepare('SELECT canonical_json FROM evaluation_initial_drafts WHERE record_id = ?').get(recordId) as { canonical_json: string };
      const stored = JSON.parse(snapshot.canonical_json) as { schema: string; calibration: unknown; draft: Record<string, unknown> };
      expect([stored.schema, stored.calibration]).toEqual(['ai7.evaluation-initial-draft/3', null]);
      const { market: _market, ...draftV1 } = stored.draft;
      const { calibration: _calibration, ...storedV1 } = stored;
      const v1 = JSON.stringify({ ...storedV1, schema: 'ai7.evaluation-initial-draft/1', draft: draftV1 });
      const rewriteSnapshot = (json: string): void => {
        const canonical = JSON.stringify(JSON.parse(json), (_key, value: unknown) =>
          value !== null && typeof value === 'object' && !Array.isArray(value)
            ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))
            : value);
        database.exec('DROP TRIGGER evaluation_initial_drafts_no_update');
        database.prepare('UPDATE evaluation_initial_drafts SET canonical_json = ?, sha256 = ? WHERE record_id = ?')
          .run(canonical, createHash('sha256').update(canonical).digest('hex'), recordId);
        database.exec(EVALUATION_INITIAL_DRAFT_TRIGGER_SQL.evaluation_initial_drafts_no_update!);
      };
      rewriteSnapshot(v1);
      // The rewrite Task's frozen words changed, their digest with them: the contract it names is no longer this one.
      const row = database.prepare('SELECT task_intent_id, canonical_json FROM evaluation_rewrite_tasks ORDER BY recorded_at DESC LIMIT 1').get() as { task_intent_id: string; canonical_json: string };
      const json = row.canonical_json.replace('"score":13', '"score":12');
      expect(json).not.toBe(row.canonical_json);
      database.exec('DROP TRIGGER evaluation_rewrite_tasks_no_update');
      database.prepare('UPDATE evaluation_rewrite_tasks SET canonical_json = ?, sha256 = ? WHERE task_intent_id = ?')
        .run(json, createHash('sha256').update(json).digest('hex'), row.task_intent_id);
      database.exec(EVALUATION_REWRITE_TRIGGER_SQL.evaluation_rewrite_tasks_no_update!);
    } finally {
      database.close();
    }
    const reopened = await openStore();
    try {
      expect(reopened.inspectEvaluation(bookId, recordId).record!.initial!.market).toBeNull();
      expect(await refusal(() => reopened.inspectEvaluationRewrite(bookId))).toBe('EVALUATION_REWRITE_RECORD_INVALID:评语重写记录已损坏。');
      // 评估 still opens, and says the rewrite is unavailable with why.
      expect(reopened.inspectEvaluation(bookId, recordId).rewrite.prepare).toEqual({ allowed: false, reason: '按我的评分重写评语暂不可用：评语重写记录已损坏。' });
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    // A `/1` snapshot that names a market section, or a `/2` one that names none, is not one AI7 wrote.
    const tampered = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      const snapshot = tampered.prepare('SELECT canonical_json FROM evaluation_initial_drafts WHERE record_id = ?').get(recordId) as { canonical_json: string };
      const stored = JSON.parse(snapshot.canonical_json) as Record<string, unknown>;
      const json = JSON.stringify({ ...stored, schema: 'ai7.evaluation-initial-draft/2' });
      const sorted = JSON.stringify(JSON.parse(json), (_key, value: unknown) =>
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))
          : value);
      tampered.exec('DROP TRIGGER evaluation_initial_drafts_no_update');
      tampered.prepare('UPDATE evaluation_initial_drafts SET canonical_json = ?, sha256 = ? WHERE record_id = ?')
        .run(sorted, createHash('sha256').update(sorted).digest('hex'), recordId);
      tampered.exec(EVALUATION_INITIAL_DRAFT_TRIGGER_SQL.evaluation_initial_drafts_no_update!);
    } finally {
      tampered.close();
    }
    const refused = await openStore();
    try {
      expect(await refusal(() => refused.inspectEvaluation(bookId, recordId))).toBe('EVALUATION_RECORD_INVALID:评估记录已损坏。');
      refused.markCleanShutdown();
    } finally {
      refused.close();
    }
  }, 300_000);

  it('rebuilds a revision-63 store\'s kind-coupled relations for the evaluation rewrite kind, every row kept byte for byte', async () => {
    await withBook(async (book) => {
      // A 初评 Task, so the rebuilt relations carry rows of the evaluation kind.
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
    });
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const rows = (database: DatabaseSync): string => JSON.stringify(KIND_COUPLED_ANALYSIS_RELATIONS.map((table) => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
    const plant = new DatabaseSync(path);
    let before: string;
    try {
      // Revision 63 exactly: the three relations as revision 62 left them, and no relation of revision 65.
      plant.exec(`DROP TABLE writing_drafts; DROP TABLE writing_tasks; DROP TABLE evaluation_rewrite_decisions; DROP TABLE evaluation_rewrite_tasks; PRAGMA user_version = ${CAPTURED_PROCEDURE_SCHEMA_VERSION};`);
      downgradeKindCoupledRelations(plant, ANALYSIS_LEDGER_REVISION_62_SQL);
      before = rows(plant);
      expect(() => plant.exec(`INSERT INTO analysis_result_sets(result_set_id, book_id, kind, created_at, canonical_json, sha256)
        VALUES ('${randomUUID()}', (SELECT book_id FROM books LIMIT 1), '${EVALUATION_REWRITE_KIND}', 'x', '{}', '${'a'.repeat(64)}')`)).toThrowError(/CHECK constraint failed/u);
    } finally {
      plant.close();
    }
    const migrated = await openStore();
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const after = new DatabaseSync(path, { readOnly: true });
    try {
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(BACKGROUND_ANALYSIS_ENROLLMENT_SCHEMA_VERSION);
      expect(rows(after)).toBe(before!);
      for (const table of KIND_COUPLED_ANALYSIS_RELATIONS) {
        expect((after.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) as { sql: string }).sql).toBe(ANALYSIS_LEDGER_SCHEMA_SQL[table]);
      }
      expect(Object.keys(EVALUATION_REWRITE_TRIGGER_SQL).every((name) => after.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'trigger' AND name = ?").get(name) !== undefined)).toBe(true);
    } finally {
      after.close();
    }
  }, 300_000);

  it('refuses a revision-63 store whose kind-coupled relations already read as revision 64\'s', async () => {
    await withBook(async () => undefined);
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const plant = new DatabaseSync(path);
    try {
      plant.exec(`DROP TABLE writing_drafts; DROP TABLE writing_tasks; DROP TABLE evaluation_rewrite_decisions; DROP TABLE evaluation_rewrite_tasks; PRAGMA user_version = ${CAPTURED_PROCEDURE_SCHEMA_VERSION};`);
    } finally {
      plant.close();
    }
    const refused = await openStore().then((store) => {
      store.close();
      return 'opened';
    }, (error: unknown) => (error instanceof Error && 'code' in error ? `${String((error as { code: unknown }).code)}:${error.message}` : String(error)));
    expect(refused).toBe('SCHEMA_INVALID:分析任务账本表（修订版 62） analysis_task_intents 结构不兼容。');
  }, 300_000);
});
