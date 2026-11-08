import { CURATION_SCHEMA_SQL, FACTUAL_RANGE_TASK_INTENTS_SQL } from '../../src/service/task-authorization.js';
import { BaselineAnalysisExecutionOwner, ModelRequestGovernor } from '../../src/service/analysis/execution.js';
import { capturedOrdinaryExecution } from '../support/captured-ordinary-transport.js';
import { execPre74Fixture } from '../support/pre74-schema.js';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RECONCILED_INTERRUPTED_DETAIL, RECONCILED_QUEUED_DETAIL } from '../../src/service/analysis/baseline-analysis-store.js';
import { runReportUsageReconciles } from '../../src/service/analysis/run-report.js';
import { canonicalRecord, sha256Hex } from '../../src/service/analysis/canonical.js';
import { EvaluationRecords, EVALUATION_INITIAL_DRAFT_TRIGGER_SQL, EVALUATION_RECORD_TRIGGER_SQL } from '../../src/service/evaluation-records.js';
import { EvaluationRewrites, EVALUATION_REWRITE_SCHEMA_SQL, EVALUATION_REWRITE_TRIGGER_SQL } from '../../src/service/evaluation-rewrites.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST, parseRunReportReflectionMessageHeader } from '../../src/service/analysis/run-report-contract.js';
import {
  EVALUATION_REWRITE_UNIT_RESULT_SCHEMA,
  evaluationRewriteObservationSetDigest,
  evaluationRewriteSynthesisRequestDigest,
  parseEvaluationRewriteUnitMessageHeader,
  parseEvaluationRewriteSynthesisMessageHeader,
} from '../../src/service/evaluation/evaluation-rewrite-contract.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import {
  ANALYSIS_LEDGER_REVISION_62_SQL,
  ANALYSIS_LEDGER_SCHEMA_SQL,
  CAPTURED_PROCEDURE_SCHEMA_VERSION,
} from '../../src/service/task-authorization.js';
import {
  EVALUATION_REWRITE_ASSURANCE_STATEMENT,
  EVALUATION_REWRITE_CONTRACT_VERSION,
  EVALUATION_REWRITE_KIND,
  EVALUATION_REWRITE_LIVE_UNAVAILABLE,
  type EvaluationContent,
  type EvaluationRecordProjection,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { KIND_COUPLED_ANALYSIS_RELATIONS, constructPre94PolicyEncoding, downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';
import { AUTHORED_REWRITE_OBSERVATIONS, AUTHORED_REWRITE_WORDS, EVALUATION_REWRITE_FIXTURE_IDENTITY, EVALUATION_REWRITE_V1_FIXTURE_IDENTITY, J11_REWRITE_ADJUSTMENTS, beginRewriteAsJ11 } from '../support/evaluation-rewrite.js';
import { finalizeAsJ11, runInitialEvaluationToEnd } from '../support/readers-report.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { AUTHORED_MARKET } from '../support/initial-evaluation-market.js';

// One explicit model-request capability per test application.
// Registered first: the stack-ordered final hook runs after existing consumer teardown.
let requestGovernor: ModelRequestGovernor;
beforeEach(() => { requestGovernor = new ModelRequestGovernor(); });
afterEach(async () => { requestGovernor.close(); await requestGovernor.whenIdle(); });

// L2 market and rewrite behavior over the real store, execution owner and authored local fixture on exact sample1
// (ADR 0043): no Provider, socket or credential value; assertions name states and authored words, never manuscript text.

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
  const owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
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
  const prepared = prepareRewrite(book.store, book.bookId, recordId);
  expect(prepared).toMatchObject({ kind: EVALUATION_REWRITE_KIND, contractVersion: EVALUATION_REWRITE_CONTRACT_VERSION, state: 'prepared' });
  const authorized = book.store.authorizeEvaluationRewrite(book.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  expect(authorized.recordId).toBe(recordId);
  expect(book.owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger)).toBe('admitted');
  await book.owner.whenIdle();
  return prepared.taskIntent!.taskIntentId;
}

const scoresOf = (content: EvaluationContent): Array<[string, number | null, string | null]> =>
  content.items.map((item) => [item.itemId, item.score, item.notRated]);

/** Read provenance through its exported owner, with real adoption decisions and this fixture's authored words. */
function ai7Words(bookId: string, recordId: string): unknown {
  const reader = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const rewrites = new EvaluationRewrites(reader);
    const records = new EvaluationRecords(reader, { current: () => null }, undefined, undefined, undefined, {
      adoptionsOf: (id) => rewrites.adoptionsOf(id),
      adoptionStamps: (id) => rewrites.decisionStamps(id),
      acceptedRewrite: (id) => {
        const decision = rewrites.decisionOf(id);
        return decision?.decision === 'accepted' ? { ...decision, words: AUTHORED_REWRITE_WORDS } : null;
      },
    });
    return records.ai7Words(bookId, recordId);
  } finally { reader.close(); }
}

function prepareRewrite(store: EditorialStore, bookId: string, recordId: string, policy = launchPolicy) {
  let progress = store.createEvaluationRewritePreparationWork(bookId, recordId, policy);
  while (!progress.done) progress = store.advanceEvaluationRewritePreparationWork(progress.workId!);
  return progress.projection!;
}

async function withAdjustedBook(body: (book: Book, record: EvaluationRecordProjection) => Promise<void>): Promise<void> {
  await withBook(async (book) => {
    await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
    finalizeAsJ11(book.store, book.bookId);
    await body(book, beginRewriteAsJ11(book.store, book.bookId));
  });
}

async function withProposal(body: (book: Book, record: EvaluationRecordProjection, taskIntentId: string) => Promise<void>): Promise<void> {
  await withAdjustedBook(async (book, record) => {
    const taskIntentId = await rewrite(book, record.recordId);
    await body(book, record, taskIntentId);
  });
}

async function withReopenedStore(body: (store: EditorialStore) => Promise<void>): Promise<void> {
  const store = await openStore();
  try { await body(store); store.markCleanShutdown(); }
  finally { store.close(); }
}

function withDatabase(body: (database: DatabaseSync) => void): void {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
  try { body(database); } finally { database.close(); }
}

/** Only legacy-shape and damage arrangements use stored JSON; assertions read the public APIs. */
function changeStoredRecord(table: string, trigger: string, transform: (json: string) => string,
  where = '', parameters: string[] = []): void {
  withDatabase((database) => {
    const row = database.prepare(`SELECT canonical_json FROM ${table} ${where}`).get(...parameters) as { canonical_json: string };
    const json = transform(row.canonical_json);
    database.exec(`DROP TRIGGER ${table}_no_update`);
    database.prepare(`UPDATE ${table} SET canonical_json = ?, sha256 = ? ${where}`).run(json, sha256Hex(json), ...parameters);
    database.exec(trigger);
  });
}

function damageDecisionDigest(): void {
  withDatabase((database) => {
    database.exec('DROP TRIGGER evaluation_rewrite_decisions_no_update');
    database.exec("UPDATE evaluation_rewrite_decisions SET canonical_json = canonical_json || ' '");
    database.exec(EVALUATION_REWRITE_TRIGGER_SQL.evaluation_rewrite_decisions_no_update!);
  });
}

async function acceptedBook(): Promise<{ bookId: string; recordId: string; from: { taskIntentId: string; analysisRevisionId: string } }> {
  let result!: Awaited<ReturnType<typeof acceptedBook>>;
  await withProposal(async (book, record, taskIntentId) => {
    const proposal = book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.proposal!;
    book.store.decideEvaluationRewrite(book.bookId, proposal.revisionId, 'accept');
    result = { bookId: book.bookId, recordId: record.recordId, from: { taskIntentId, analysisRevisionId: proposal.revisionId } };
  });
  return result;
}

/** AI7's authored words in an entry: these items' 评语, and the 总评 when `verdict`, all from one rewrite, each with its digest. */
const wordsOf = (itemIds: ReadonlyArray<string>, from: { taskIntentId: string; analysisRevisionId: string }, verdict: boolean): unknown => ({
  items: itemIds.map((itemId) => ({ itemId, ...from, sha256: sha256Hex(AUTHORED_REWRITE_WORDS.items.find((item) => item.itemId === itemId)!.comment) })),
  verdict: verdict ? { ...from, sha256: sha256Hex(AUTHORED_REWRITE_WORDS.verdict) } : null,
});

const kindCoupledRows = (database: DatabaseSync): string => JSON.stringify(KIND_COUPLED_ANALYSIS_RELATIONS
  .map((table) => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));

async function revision63Book(compatible: boolean): Promise<{ bookId: string; before: string }> {
  let bookId = '', before = '';
  await withBook(async (book) => {
    bookId = book.bookId;
    if (compatible) await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
  });
  withDatabase((database) => {
    constructPre94PolicyEncoding(database);
    execPre74Fixture(database, `DROP TABLE analysis_outcome_resolutions; DROP TABLE material_index_segments; DROP TABLE material_index_builds; DROP TABLE writing_drafts; DROP TABLE writing_tasks; DROP TABLE evaluation_rewrite_decisions; DROP TABLE evaluation_rewrite_tasks; PRAGMA user_version = ${CAPTURED_PROCEDURE_SCHEMA_VERSION};`);
    if (compatible) {
      downgradeKindCoupledRelations(database, ANALYSIS_LEDGER_REVISION_62_SQL);
      before = kindCoupledRows(database);
      expect(() => database.exec(`INSERT INTO analysis_result_sets(result_set_id, book_id, kind, created_at, canonical_json, sha256)
        VALUES ('${randomUUID()}', (SELECT book_id FROM books LIMIT 1), '${EVALUATION_REWRITE_KIND}', 'x', '{}', '${'a'.repeat(64)}')`)).toThrowError(/CHECK constraint failed/u);
    }
  });
  return { bookId, before };
}

async function discardedThenPendingBook(): Promise<{ bookId: string; recordId: string }> {
  let bookId = '', recordId = '';
  await withProposal(async (book, record) => {
    bookId = book.bookId; recordId = record.recordId;
    book.store.decideEvaluationRewrite(bookId, book.store.inspectEvaluation(bookId, recordId).rewrite.proposal!.revisionId, 'discard');
    await rewrite(book, recordId);
  });
  return { bookId, recordId };
}

function asLegacyInitialSnapshot(recordId: string): void {
  changeStoredRecord('evaluation_initial_drafts', EVALUATION_INITIAL_DRAFT_TRIGGER_SQL.evaluation_initial_drafts_no_update!, (json) => {
    const { calibration: _calibration, draft, ...stored } = JSON.parse(json) as { calibration: unknown; draft: Record<string, unknown> };
    const { market: _market, ...legacyDraft } = draft;
    return canonicalRecord({ ...stored, schema: 'ai7.evaluation-initial-draft/1', draft: legacyDraft }).json;
  }, 'WHERE record_id = ?', [recordId]);
}

function partialRewriteTransport(store: EditorialStore, bookId: string, recordId: string) {
  let contract = '';
  let synthesisContract = '';
  let observationSet = '';
  const units = new Map<number, { digest: string; requestDigest: string }>();
  const verdict = '总体较好，建议推荐出版。';
  const captured = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, requestGovernor, (request, message) => {
    const unit = parseEvaluationRewriteUnitMessageHeader(message);
    if (request.stage === 'units' && unit !== null) {
      const expected = units.get(unit.ordinal);
      if (expected === undefined || unit.total !== 8 || unit.unitDigest !== expected.digest || request.unitOrdinal !== unit.ordinal ||
        request.attemptIndex !== 1 || request.contractDigest !== contract || request.requestDigest !== expected.requestDigest) return undefined;
      if (unit.ordinal === 3) return { kind: 'adapter-failure', code: 'SYNTHETIC_UNIT_UNAVAILABLE', status: 400, message: '合成：此阅读范围的请求被永久拒绝。' };
      return { kind: 'unit-result', text: JSON.stringify({ schema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA,
        unitOrdinal: unit.ordinal, observations: AUTHORED_REWRITE_OBSERVATIONS[unit.ordinal]! }), usage: { inputTokens: 100, outputTokens: 50 } };
    }
    const synthesis = parseEvaluationRewriteSynthesisMessageHeader(message);
    if (request.stage === 'cross-unit-reduction' && synthesis !== null && synthesis.closed === 7 && synthesis.total === 8 &&
      synthesis.setDigest === observationSet && request.contractDigest === synthesisContract &&
      request.requestDigest === evaluationRewriteSynthesisRequestDigest(synthesisContract, observationSet)) {
      return { kind: 'unit-result', text: JSON.stringify({ ...AUTHORED_REWRITE_WORDS, verdict }), usage: { inputTokens: 2600, outputTokens: 560 } };
    }
    if (request.stage === 'run-report-reflection' && parseRunReportReflectionMessageHeader(message) !== null &&
      request.contractDigest === RUN_REPORT_REFLECTION_PROMPT_CONTRACT_DIGEST && request.requestDigest === sha256Hex(message)) {
      return { kind: 'unit-result', text: JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [] }), usage: { inputTokens: 10, outputTokens: 5 } };
    }
    return undefined;
  });
  const policy = captured.policy;
  const prepared = prepareRewrite(store, bookId, recordId, policy);
  const manifest = prepared.coverageManifest!;
  contract = prepared.planEnvelope!.promptContractDigest;
  const third = manifest.units[2]!;
  const closed = manifest.units.filter((unit) => unit.ordinal !== third.ordinal).map((unit) => ({
    unitOrdinal: unit.ordinal,
    result: { schema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, observations: AUTHORED_REWRITE_OBSERVATIONS[unit.ordinal]! },
  }));
  observationSet = evaluationRewriteObservationSetDigest(closed);
  const authorized = store.authorizeEvaluationRewrite(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  synthesisContract = authorized.ledger.definition.crossUnit!.promptContractDigest;
  for (const unit of manifest.units) units.set(unit.ordinal, { digest: unit.digest,
    requestDigest: authorized.ledger.definition.requestDigest(unit.ordinal, unit.digest) });
  return { captured, authorized };
}

async function withPartialRewrite(body: (book: Book, record: EvaluationRecordProjection,
  captured: ReturnType<typeof capturedOrdinaryExecution>) => Promise<void>): Promise<void> {
  let bookId = '', record!: EvaluationRecordProjection;
  await withAdjustedBook(async (book, adjusted) => { bookId = book.bookId; record = adjusted; });
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: null,
    induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
  try {
    const { captured, authorized } = partialRewriteTransport(store, bookId, record.recordId);
    try {
      captured.owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger);
      await captured.owner.whenIdle();
      await body({ store, owner: captured.owner, bookId }, record, captured);
      store.markCleanShutdown();
    } finally {
      await captured.owner.dispose();
      captured.assertMatched();
    }
  } finally { store.close(); }
}

describe('the market section and 按我的评分重写评语 over the real store on exact sample1', () => {
  it('snapshots AI7’s market words in a version begun from its 初评 without choosing a conclusion', async () => {
    await withBook(async (book) => {
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      const latest = book.store.inspectEvaluation(book.bookId, null).initial.latest!;
      expect(latest.market).toEqual(AUTHORED_MARKET);
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
      expect(seeded.record!.calibration).toBeNull();
      expect(seeded.record!.content.conclusion).toBeNull();
    });
  }, 300_000);

  it('lists only the other Books in its 书系 as market comparables and waits for pricing actuals', async () => {
    await withBook(async (book) => {
      expect(book.store.inspectEvaluation(book.bookId, null).market).toEqual({
        series: [], comparables: [], comparableCount: 0, seriesUnreadable: false,
        pricing: {
          booksWithActuals: 0, otherBooksWithActuals: 0, threshold: 30, enabled: false, available: false, unreadable: false,
          house: null, series: null, seriesBooksWithActuals: null, seriesMinimum: 5,
        },
      });
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

  it('requires a saved change to AI7’s report before preparing a rewrite', async () => {
    await withBook(async (book) => {
      await runInitialEvaluationToEnd(book.store, book.owner, book.bookId, launchPolicy);
      finalizeAsJ11(book.store, book.bookId);
      const draft = book.store.startEvaluation(book.bookId, true).record!;
      expect(book.store.inspectEvaluation(book.bookId, draft.recordId).rewrite.prepare)
        .toEqual({ allowed: false, reason: '先修改并保存评分、评语、优缺点或总评：重新生成会按你保存的修改重出报告。' });
      expect(await refusal(() => book.store.createEvaluationRewritePreparationWork(book.bookId, draft.recordId, launchPolicy)))
        .toBe('EVALUATION_REWRITE_UNAVAILABLE:先修改并保存评分、评语、优缺点或总评：重新生成会按你保存的修改重出报告。');
      const adjusted = book.store.saveEvaluation({
        bookId: book.bookId, recordId: draft.recordId, expectedEntries: 1, finalize: false,
        content: { ...draft.content, items: draft.content.items.map((item) => {
          const departure = J11_REWRITE_ADJUSTMENTS.find((entry) => entry.itemId === item.itemId);
          return departure === undefined ? item : { ...item, score: departure.score, adjustment: { reasons: [departure.reason], note: null } };
        }) },
      }).record!;
      expect(adjusted.entries).toBe(2);
      expect(book.store.inspectEvaluation(book.bookId, adjusted.recordId).rewrite)
        .toEqual({ prepare: { allowed: true, mode: 'evaluation-rewrite-first' }, task: null, proposal: null, decided: null });
    });
  }, 300_000);

  it('describes the saved scoring entry and the rewrite limits in the Task Drawer', async () => {
    await withAdjustedBook(async (book, record) => {
      const prepared = prepareRewrite(book.store, book.bookId, record.recordId);
      const taskIntentId = prepared.taskIntent!.taskIntentId;
      const plan = book.store.inspectTaskPlan({ bookId: book.bookId, kind: 'evaluation-rewrite', ref: taskIntentId });
      expect(plan).toMatchObject({ kind: 'evaluation-rewrite', ref: taskIntentId, state: { key: 'ready' }, start: { readiness: 'ready', needsModelConnection: false } });
      expect(plan.goal.sentence).toBe('按你在第 3 版评估（第 2 次保存）中的修改重新生成评估报告（各项评语、总评、优点与问题），分数与结论不变；生成后由你决定采用还是放弃');
      expect(plan.steps.map((step) => step.label)).toEqual(['逐章读取，记下能说明你所给分数与修改的依据', '按你的修改重新生成评估报告']);
      expect(plan.notDo.editorial).toEqual(expect.arrayContaining(['不改分数：每一项的分数照你保存的', '不自动写入评估：新版报告要你采用后才记入这一版', '不改你选定的结论，不改风险项']));
      expect(plan.scope.reference[0]).toBe('第 3 版评估（第 2 次保存）：你的评分（文学品质与作者声音 16.5 / 20、主题、价值与社会文化语境 15 / 20、结构、叙事逻辑与连贯 13 / 20、中文语言与表达 14 / 20、读者与市场潜力 10 / 20）、调分原因、现在的评语、优点、问题、总评、风险与结论，以及 AI7 原报告');
      expect(book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.task)
        .toMatchObject({ taskIntentId, recordId: record.recordId, recordOrdinal: 3, entryOrdinal: 2, state: 'prepared' });
    });
  }, 300_000);

  it('fails when reading closes but the rewrite synthesis has no usable result', async () => {
    fixture = { ...fixture, entries: new Map([...fixture.entries].map(([key, entry]) => [key,
      entry.response.kind === 'unit-result' && entry.response.text.includes('ai7.evaluation-rewrite.synthesis-result/')
        ? { ...entry, response: { ...entry.response, text: '{}' } } : entry])) };
    await withAdjustedBook(async (book, record) => {
      await rewrite(book, record.recordId);
      const settled = book.store.inspectEvaluationRewrite(book.bookId)!;
      expect(settled.taskOutcome?.classification).toBe('failed');
      expect(settled.taskOutcome?.report?.failures).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'SYNTHESIS_UNAVAILABLE' })]));
      expect(settled.resultSetRevision).toBeNull();
      expect(book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.proposal).toBeNull();
    });
  }, 300_000);

  it('replays contract /2 from its own exact authored fixture, the /1 fixture keeping its bytes (Issue #1407)', async () => {
    // The fixture registration: exact file bytes and lineage, the frozen `/2` prompt contract, and every entry the file adds answered.
    expect(fixture.lineage).toEqual([
      { identity: 'sample1-evaluation-report-authored', sha256: 'ff13f5e34129324daf3b281c9309011288472bd89f690a6002c601a202bacf8e' },
      { identity: 'sample1-readers-report-authored', sha256: '5cd0192953a62c5a359de38ec7ad2df4ce1d3b671413eb243fed0027dc2e8128' },
      { identity: 'sample1-evaluation-authored', sha256: '8675ee3dfc904759589b8d08aed621233306739dac4c354836052e73ee184d1c' },
      { identity: 'sample1-baseline-happy', sha256: '9c3bb63c931966ddbc4c94c5aafb29f7d04d55083f9b4f372391c6714bffba0a' },
    ]);
    const v1 = await loadModelFixture(FIXTURES_ROOT, EVALUATION_REWRITE_V1_FIXTURE_IDENTITY);
    expect(v1.lineage[0]).toEqual({ identity: 'sample1-evaluation-rewrite-authored', sha256: '9e21d82a8a5c5759101940e6708a055ad4991a0a0d4eb317ca230c3d6fa08194' });
    // Keyed apart from the `/1` fixture: eight units and the `/2` synthesis (the Run Report reflection asks the same as under `/1`).
    const own = [...fixture.entries].filter(([key]) => !v1.entries.has(key));
    expect(own.map(([, entry]) => entry.unitOrdinal).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(own.filter(([, entry]) => entry.response.kind === 'unit-result' && entry.response.text.startsWith('{"schema":"ai7.evaluation-rewrite.synthesis-result/2"'))).toHaveLength(1);
    await withProposal(async (book) => {
      const settled = book.store.inspectEvaluationRewrite(book.bookId)!;
      expect(settled.planEnvelope!.promptContractDigest).toBe('b9a85f8724528a22b03c0bf6a84b8d443cec34be73780973eaee2848efc8817c');
      expect(settled.resultSetRevision!.coverage).toMatchObject({ state: 'complete', unitsTotal: 8, unitsClosed: 8 });
    });
  }, 300_000);

  it('settles a complete rewrite with qualified assurance and reconciled usage', async () => {
    await withProposal(async (book) => {
      const settled = book.store.inspectEvaluationRewrite(book.bookId)!;
      expect(settled.state).toBe('settled');
      const revision = settled.resultSetRevision!;
      expect(revision.coverage).toMatchObject({ state: 'complete', unitsTotal: 8, unitsClosed: 8 });
      expect(revision.assurance).toMatchObject({ state: 'qualified', statement: EVALUATION_REWRITE_ASSURANCE_STATEMENT });
      // Contract `/2` (Issue #1407): the whole report — 评语, 总评 with the next step, strengths and problems.
      expect(revision.rewrite.words).toEqual({ items: AUTHORED_REWRITE_WORDS.items, verdict: AUTHORED_REWRITE_WORDS.verdict, withheld: [],
        strengths: AUTHORED_REWRITE_WORDS.strengths, weaknesses: AUTHORED_REWRITE_WORDS.weaknesses });
      expect(revision.rewrite.observations).toHaveLength(12);
      expect(runReportUsageReconciles(settled.taskOutcome!.report!, revision.usage)).toBe(true);
    });
  }, 300_000);

  it('offers the rewrite and its evidence beside the unchanged saved version', async () => {
    await withProposal(async (book, record) => {
      const revision = book.store.inspectEvaluationRewrite(book.bookId)!.resultSetRevision!;
      const waiting = book.store.inspectEvaluation(book.bookId, record.recordId);
      expect(waiting.record).toMatchObject({ entries: 2, content: record.content });
      const proposal = waiting.rewrite.proposal!;
      expect(proposal).toMatchObject({ revisionId: revision.revisionId, entryOrdinal: 2, current: true, reading: { unitsTotal: 8, unitsRead: 8 }, withheld: [] });
      expect(proposal.items).toEqual(AUTHORED_REWRITE_WORDS.items.map((item) => ({
        itemId: item.itemId, before: record.content.items.find((entry) => entry.itemId === item.itemId)!.comment, after: item.comment,
        evidence: revision.rewrite.observations.filter((observation) => observation.itemId === item.itemId)
          .map((observation) => ({ unitOrdinal: observation.unitOrdinal, note: observation.note, blockIds: observation.blockIds })),
        evidenceCount: revision.rewrite.observations.filter((observation) => observation.itemId === item.itemId).length,
      })));
      expect(proposal.items.map((item) => item.evidence.length)).toEqual([3, 2, 4, 3, 0]);
      expect(proposal.verdict).toEqual({ before: null, after: AUTHORED_REWRITE_WORDS.verdict });
      expect(proposal.strengths).toEqual({ before: record.content.strengths, after: AUTHORED_REWRITE_WORDS.strengths });
      expect(proposal.weaknesses).toEqual({ before: record.content.weaknesses, after: AUTHORED_REWRITE_WORDS.weaknesses });
    });
  }, 300_000);

  it('discards a rewrite once without changing the saved version, then offers another rewrite', async () => {
    await withProposal(async (book, record) => {
      const revisionId = book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.proposal!.revisionId;
      const discarded = book.store.decideEvaluationRewrite(book.bookId, revisionId, 'discard');
      expect(discarded.record).toMatchObject({ recordId: record.recordId, entries: 2, content: record.content });
      expect(discarded.rewrite).toMatchObject({ proposal: null, decided: { decision: 'discarded', entryOrdinal: null }, prepare: { allowed: true, mode: 'evaluation-rewrite-again' } });
      expect(await refusal(() => book.store.decideEvaluationRewrite(book.bookId, revisionId, 'accept'))).toBe('EVALUATION_REWRITE_DECIDED:这一次重写已经处理过了。');
      await rewrite(book, record.recordId);
      const again = book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.proposal!;
      expect(again.revisionId).not.toBe(revisionId);
      const accepted = book.store.decideEvaluationRewrite(book.bookId, again.revisionId, 'accept');
      expect(accepted).toMatchObject({ record: { entries: 3 }, rewrite: { proposal: null, decided: { decision: 'accepted', entryOrdinal: 3 } } });
    });
  }, 300_000);

  it('accepts only AI7’s words as a new entry, preserving scores, reasons and editorial choices', async () => {
    await withProposal(async (book, adjusted, taskIntentId) => {
      const proposal = book.store.inspectEvaluation(book.bookId, adjusted.recordId).rewrite.proposal!;
      const accepted = book.store.decideEvaluationRewrite(book.bookId, proposal.revisionId, 'accept');
      const record = accepted.record!;
      expect(record).toMatchObject({ recordId: adjusted.recordId, entries: 3, state: 'editing' });
      expect(scoresOf(record.content)).toEqual(scoresOf(adjusted.content));
      expect(record.content.items.map((item) => item.adjustment)).toEqual(adjusted.content.items.map((item) => item.adjustment));
      expect(record.content.items.map((item) => item.comment)).toEqual(AUTHORED_REWRITE_WORDS.items.map((item) => item.comment));
      expect(record.content.verdict).toBe(AUTHORED_REWRITE_WORDS.verdict);
      // The regenerated report's strengths and problems are taken; risks, what is still missing, the conclusion and the 初评
      // snapshot behind the market section and evidence stay exactly as they were (Issue #1407).
      expect([record.content.strengths, record.content.weaknesses]).toEqual([AUTHORED_REWRITE_WORDS.strengths, AUTHORED_REWRITE_WORDS.weaknesses]);
      expect([record.content.risks, record.content.readiness, record.content.conclusion, record.initial])
        .toEqual([adjusted.content.risks, adjusted.content.readiness, adjusted.content.conclusion, adjusted.initial]);
      expect(accepted.rewrite).toMatchObject({ proposal: null, decided: { decision: 'accepted', entryOrdinal: 3 } });
      expect(ai7Words(book.bookId, record.recordId)).toEqual(wordsOf(AUTHORED_REWRITE_WORDS.items.map((item) => item.itemId), { taskIntentId, analysisRevisionId: proposal.revisionId }, true));
    });
  }, 300_000);

  it('keeps AI7’s marks on unchanged words through saves, 定稿 and the next version (Issue #689)', async () => {
    const { bookId, recordId, from } = await acceptedBook();
    const itemIds = AUTHORED_REWRITE_WORDS.items.map((item) => item.itemId);
    expect(ai7Words(bookId, recordId)).toEqual(wordsOf(itemIds, from, true));
    await withReopenedStore(async (store) => {
      const accepted = store.inspectEvaluation(bookId, recordId).record!;
      const edited = store.saveEvaluation({
        bookId, recordId, expectedEntries: 3, finalize: false,
        content: { ...accepted.content, items: accepted.content.items.map((item, index) => (index === 0 ? { ...item, comment: '编辑自己写的评语。' } : item)) },
      }).record!;
      expect(ai7Words(bookId, recordId)).toEqual(wordsOf(itemIds.slice(1), from, true));
      const kept = store.saveEvaluation({ bookId, recordId, expectedEntries: 4, finalize: false, content: { ...edited.content, conclusion: 'revise' } }).record!;
      expect(ai7Words(bookId, recordId)).toEqual(wordsOf(itemIds.slice(1), from, true));
      store.saveEvaluation({ bookId, recordId, expectedEntries: 5, finalize: true, content: { ...kept.content, verdict: '编辑自己写的总评。' } });
      expect(ai7Words(bookId, recordId)).toEqual(wordsOf(itemIds.slice(1), from, false));
      const next = store.startEvaluation(bookId).record!;
      expect(ai7Words(bookId, next.recordId)).toEqual(wordsOf(itemIds.slice(1), from, false));
      store.saveEvaluation({
        bookId, recordId: next.recordId, expectedEntries: 1, finalize: false,
        content: { ...next.content, items: next.content.items.map((item) => ({ ...item, comment: `${item.comment ?? ''}（编辑补充）` })) },
      });
      expect(ai7Words(bookId, next.recordId)).toBeNull();
    });
  }, 300_000);

  it('reads a legacy adoption mark and carries only its unchanged words into the next save (Issue #689)', async () => {
    const { bookId, recordId, from } = await acceptedBook();
    changeStoredRecord('evaluation_record_entries', EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!,
      (json) => canonicalRecord({ ...JSON.parse(json), rewrittenFrom: from }).json,
      'WHERE record_id = ? AND ordinal = 3', [recordId]);
    await withReopenedStore(async (store) => {
      const accepted = store.inspectEvaluation(bookId, recordId).record!;
      expect(accepted.entries).toBe(3);
      store.saveEvaluation({ bookId, recordId, expectedEntries: 3, finalize: false,
        content: { ...accepted.content, items: accepted.content.items.map((item, index) => index === 0 ? { ...item, comment: '编辑自己写的评语。' } : item) } });
      expect(ai7Words(bookId, recordId)).toEqual(wordsOf(AUTHORED_REWRITE_WORDS.items.slice(1).map((item) => item.itemId), from, true));
    });
  }, 300_000);

  it('refuses a provenance mark naming an absent item while opening the later readable version (Issue #708)', async () => {
    const { bookId, recordId, from } = await acceptedBook();
    let nextId = '';
    await withReopenedStore(async (store) => {
      const record = store.inspectEvaluation(bookId, recordId).record!;
      store.saveEvaluation({ bookId, recordId, expectedEntries: 3, finalize: true,
        content: { ...record.content, conclusion: 'revise', verdict: '编辑自己写的总评。' } });
      const next = store.startEvaluation(bookId).record!;
      nextId = next.recordId;
      store.saveEvaluation({ bookId, recordId: nextId, expectedEntries: 1, finalize: false,
        content: { ...next.content, items: next.content.items.map((item) => ({ ...item, comment: `${item.comment ?? ''}（编辑补充）` })) } });
    });
    changeStoredRecord('evaluation_record_entries', EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!,
      (json) => canonicalRecord({ ...JSON.parse(json), rewrittenFrom: { items: [{ itemId: 'no-such-item', ...from, sha256: sha256Hex('AI7') }], verdict: null } }).json,
      'WHERE record_id = ? AND ordinal = 4', [recordId]);
    await withReopenedStore(async (store) => {
      expect(store.inspectEvaluation(bookId, recordId)).toMatchObject({ unreadableRecords: [3], record: { recordId: nextId, ordinal: 4, ai7WordsNotice: null } });
      expect(await refusal(() => store.saveEvaluation({ bookId, recordId, expectedEntries: 4, finalize: false, content: {} })))
        .toBe('EVALUATION_RECORD_INVALID:评估记录已损坏。');
    });
  }, 300_000);

  it('opens 评估 with unchecked AI7 word marks when its adoption decision is damaged (Issue #702)', async () => {
    const { bookId, recordId } = await acceptedBook();
    await withReopenedStore(async (store) => { expect(store.inspectEvaluation(bookId, recordId).record!.ai7WordsNotice).toBeNull(); });
    damageDecisionDigest();
    await withReopenedStore(async (store) => {
      const page = store.inspectEvaluation(bookId, recordId);
      expect(page.record).toMatchObject({ recordId, entries: 3 });
      expect(page.record!.ai7WordsNotice).toMatch(/^评语重写的采用记录已损坏，AI7 评语的标注无法全部核对；以下仍按 AI7 所写处理：「.+」的评语.*。$/u);
      expect(page.rewrite.prepare).toEqual({ allowed: false, reason: '按我的评分重写评语暂不可用：评语重写记录已损坏。' });
    });
  }, 300_000);

  it('excludes a damaged finalized version from house calibration while its later version stays readable (Issue #702)', async () => {
    let bookId = '', recordId = '', firstId = '', firstOrdinal = 0;
    await withAdjustedBook(async (book, record) => {
      bookId = book.bookId; recordId = record.recordId;
      const first = book.store.inspectEvaluation(bookId, null).records.find((entry) => entry.state === 'finalized')!;
      firstId = first.recordId; firstOrdinal = first.ordinal;
      await rewrite(book, recordId);
      book.store.decideEvaluationRewrite(bookId, book.store.inspectEvaluation(bookId, recordId).rewrite.proposal!.revisionId, 'accept');
      expect(book.store.inspectEvaluationCalibration().calibration.adjustments).toBe(1);
    });
    damageDecisionDigest();
    withDatabase((database) => {
      database.exec('DROP TRIGGER evaluation_record_entries_no_update');
      database.prepare("UPDATE evaluation_record_entries SET sha256 = ? WHERE record_id = ? AND kind = 'finalized'").run('0'.repeat(64), firstId);
      database.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!);
    });
    await withReopenedStore(async (store) => {
      expect(store.inspectEvaluationCalibration().calibration).toMatchObject({ adjustments: 0, unreadableBooks: 1 });
      expect(store.inspectEvaluation(bookId, firstId)).toMatchObject({ unreadableRecords: [firstOrdinal], record: { recordId } });
      const later = store.inspectEvaluation(bookId, recordId);
      expect(later.unreadableRecords).toEqual([firstOrdinal]);
      expect(later.record).toMatchObject({ recordId, entries: 3 });
    });
  }, 300_000);

  it('refuses acceptance of a stale proposal but allows its discard', async () => {
    await withProposal(async (book, record) => {
      const proposal = book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.proposal!;
      const moved = book.store.saveEvaluation({ bookId: book.bookId, recordId: record.recordId, expectedEntries: 2, finalize: false,
        content: { ...record.content, readiness: [...record.content.readiness, '补一句。'] } }).record!;
      expect(book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.proposal)
        .toMatchObject({ revisionId: proposal.revisionId, current: false, entryOrdinal: 2 });
      expect(await refusal(() => book.store.decideEvaluationRewrite(book.bookId, proposal.revisionId, 'accept')))
        .toBe('EVALUATION_REWRITE_STALE:这一版评估在重写之后又保存过：重写的评语依据的是之前的分数，不能采用；可以放弃它，再按现在的评分重写。');
      expect(book.store.inspectEvaluation(book.bookId, record.recordId).record).toMatchObject({ entries: 3, content: moved.content });
      expect(book.store.decideEvaluationRewrite(book.bookId, proposal.revisionId, 'discard').rewrite.decided).toMatchObject({ decision: 'discarded' });
    });
  }, 300_000);

  it('refuses unknown rewrites, unknown versions and malformed decisions', async () => {
    await withProposal(async (book, record) => {
      const proposal = book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.proposal!;
      expect(await refusal(() => book.store.decideEvaluationRewrite(book.bookId, randomUUID(), 'accept'))).toBe('EVALUATION_REWRITE_NOT_FOUND:这本书没有这一次重写的评语。');
      expect(await refusal(() => book.store.decideEvaluationRewrite(book.bookId, proposal.revisionId, 'keep' as 'accept'))).toBe('EVALUATION_REWRITE_INVALID:评语重写参数无效。');
      expect(await refusal(() => book.store.createEvaluationRewritePreparationWork(book.bookId, randomUUID(), launchPolicy))).toBe('EVALUATION_NOT_FOUND:没有这个评估版本。');
    });
  }, 300_000);

  it('refuses to start a plan prepared before the version was saved again, spending no Run', async () => {
    await withAdjustedBook(async (book, record) => {
      const planned = prepareRewrite(book.store, book.bookId, record.recordId);
      book.store.saveEvaluation({ bookId: book.bookId, recordId: record.recordId, expectedEntries: 2, finalize: false,
        content: { ...record.content, readiness: [...record.content.readiness, '再补一句。'] } });
      expect(await refusal(() => book.store.authorizeEvaluationRewrite(book.bookId, planned.taskIntent!.taskIntentId, planned.planEnvelope!.digest)))
        .toBe('EVALUATION_REWRITE_STALE:这一版在准备重写之后又保存过：这份计划依据的是之前的分数；请按现在的评分重新准备重写。');
      expect(book.store.inspectEvaluationRewrite(book.bookId)?.run ?? null).toBeNull();
    });
  }, 300_000);

  it('offers and starts no rewrite after the version is finalized', async () => {
    await withAdjustedBook(async (book, record) => {
      const planned = prepareRewrite(book.store, book.bookId, record.recordId);
      const finalized = book.store.saveEvaluation({ bookId: book.bookId, recordId: record.recordId, expectedEntries: 2, finalize: true,
        content: { ...record.content, conclusion: 'revise' } }).record!;
      expect(await refusal(() => book.store.authorizeEvaluationRewrite(book.bookId, planned.taskIntent!.taskIntentId, planned.planEnvelope!.digest)))
        .toBe(`EVALUATION_REWRITE_UNAVAILABLE:第 ${finalized.ordinal} 版已经定稿：评语不再重写；要改就重新评估。`);
      expect(book.store.inspectEvaluationRewrite(book.bookId)?.run ?? null).toBeNull();
      expect(book.store.inspectEvaluation(book.bookId, finalized.recordId).rewrite.prepare)
        .toEqual({ allowed: false, reason: `第 ${finalized.ordinal} 版已经定稿：评语不再重写；要改就重新评估。` });
    });
  }, 300_000);

  it('offers and prepares no rewrite for a version begun without AI7’s initial evaluation', async () => {
    await withBook(async (book) => {
      const alone = book.store.startEvaluation(book.bookId).record!;
      expect(book.store.inspectEvaluation(book.bookId, alone.recordId).rewrite.prepare)
        .toEqual({ allowed: false, reason: '这一版不是从 AI7 初评开始的：没有 AI7 的评语可以按你的评分重写。' });
      expect(await refusal(() => book.store.createEvaluationRewritePreparationWork(book.bookId, alone.recordId, launchPolicy)))
        .toBe('EVALUATION_REWRITE_UNAVAILABLE:这一版不是从 AI7 初评开始的：没有 AI7 的评语可以按你的评分重写。');
    });
  }, 300_000);

  it.each(['authorized', 'executing'] as const)('settles a stopped %s rewrite and offers it again without polling', async (planted) => {
    let bookId = '';
    let recordId = '';
    await withAdjustedBook(async (book, record) => { bookId = book.bookId; recordId = record.recordId; });
    const polled = ['waiting', 'admitted', 'executing', 'cancelling', 'pausing', 'queued'];
    const first = await openStore();
    let runRecordId: string;
    try {
      const prepared = prepareRewrite(first, bookId, recordId);
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
        expect(settled.state).toBe('resumable');
        expect(settled.taskOutcome).toBeNull();
        const owner = new BaselineAnalysisExecutionOwner({ requestGovernor, ledger: second.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
        try {
          const ledger = second.executionLedgerForRun(runRecordId);
          ledger.requestCancel(bookId, settled.taskIntent!.taskIntentId);
          owner.cancelRun(runRecordId, ledger);
          await owner.whenIdle();
        } finally { await owner.dispose(); }
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
  }, 300_000);

  it('reports partial reading and withholds a rewritten 总评 that names a conclusion', async () => {
    await withPartialRewrite(async (book, record, captured) => {
      expect(captured.requests.filter((request) => request.stage === 'units').map((request) => request.unitOrdinal).sort((a, b) => a! - b!))
        .toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(captured.requests.filter((request) => request.stage === 'cross-unit-reduction')).toHaveLength(1);
      const proposal = book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.proposal!;
      expect(proposal.reading).toEqual({ unitsTotal: 8, unitsRead: 7 });
      expect(proposal.items.map((item) => item.after)).toEqual(AUTHORED_REWRITE_WORDS.items.map((item) => item.comment));
      expect([proposal.verdict, proposal.withheld]).toEqual([null, ['含分数或结论的句子没有采用：分数与结论由你定。']]);
    });
  }, 300_000);

  it('accepts a partial rewrite’s comments while keeping the editor’s verdict and scores', async () => {
    await withPartialRewrite(async (book, record) => {
      const proposal = book.store.inspectEvaluation(book.bookId, record.recordId).rewrite.proposal!;
      const accepted = book.store.decideEvaluationRewrite(book.bookId, proposal.revisionId, 'accept').record!;
      expect([accepted.entries, accepted.content.verdict]).toEqual([record.entries + 1, record.content.verdict]);
      expect(accepted.content.items.filter((item) => item.score !== null).map((item) => item.comment)).toEqual(AUTHORED_REWRITE_WORDS.items.map((item) => item.comment));
      expect(scoresOf(accepted.content)).toEqual(scoresOf(record.content));
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
          model: 'deepseek-v4.1-flash',
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

  it('keeps both rewrite ledgers immutable without changing the public proposal or decision', async () => {
    const { bookId, recordId } = await discardedThenPendingBook();
    withDatabase((database) => {
      for (const table of Object.keys(EVALUATION_REWRITE_SCHEMA_SQL)) {
        expect(() => database.exec(`UPDATE ${table} SET recorded_at = recorded_at`)).toThrowError(/EVALUATION_REWRITE_LEDGER_IMMUTABLE/u);
        expect(() => database.exec(`DELETE FROM ${table}`)).toThrowError(/EVALUATION_REWRITE_LEDGER_IMMUTABLE/u);
      }
    });
    await withReopenedStore(async (store) => {
      expect(store.inspectEvaluation(bookId, recordId).rewrite).toMatchObject({ decided: { decision: 'discarded' }, proposal: { current: true } });
    });
  }, 300_000);

  it.each(['digest-mismatch', 'invalid-json'] as const)('opens 评估 past an older %s rewrite decision and disables rewriting', async (damage) => {
    const { bookId, recordId } = await discardedThenPendingBook();
    if (damage === 'digest-mismatch') {
      damageDecisionDigest();
    } else {
      changeStoredRecord('evaluation_rewrite_decisions', EVALUATION_REWRITE_TRIGGER_SQL.evaluation_rewrite_decisions_no_update!, () => '{"schema":');
    }
    await withReopenedStore(async (store) => {
      const page = store.inspectEvaluation(bookId, recordId);
      expect(page.record!.recordId).toBe(recordId);
      expect(page.rewrite).toMatchObject({ prepare: { allowed: false, reason: '按我的评分重写评语暂不可用：评语重写记录已损坏。' }, proposal: null, decided: null });
    });
  }, 300_000);

  it('reads a legacy /1 initial snapshot without a market section', async () => {
    const { bookId, recordId } = await acceptedBook();
    asLegacyInitialSnapshot(recordId);
    await withReopenedStore(async (store) => {
      const record = store.inspectEvaluation(bookId, recordId).record!;
      expect(record.initial!.market).toBeNull();
      expect(record.calibration).toBeNull();
    });
  }, 300_000);

  it('opens 评估 but refuses a rewrite Task whose frozen scoring contract has changed', async () => {
    const { bookId, recordId } = await discardedThenPendingBook();
    changeStoredRecord('evaluation_rewrite_tasks', EVALUATION_REWRITE_TRIGGER_SQL.evaluation_rewrite_tasks_no_update!, (json) => {
      const changed = json.replace('"score":13', '"score":12');
      expect(changed).not.toBe(json);
      return changed;
    }, 'WHERE task_intent_id = (SELECT task_intent_id FROM evaluation_rewrite_tasks ORDER BY recorded_at DESC LIMIT 1)');
    await withReopenedStore(async (store) => {
      expect(await refusal(() => store.inspectEvaluationRewrite(bookId))).toBe('EVALUATION_REWRITE_RECORD_INVALID:评语重写记录已损坏。');
      expect(store.inspectEvaluation(bookId, recordId).rewrite.prepare).toEqual({ allowed: false, reason: '按我的评分重写评语暂不可用：评语重写记录已损坏。' });
    });
  }, 300_000);

  it('refuses a /2 initial snapshot that omits its required market section', async () => {
    const { bookId, recordId } = await acceptedBook();
    asLegacyInitialSnapshot(recordId);
    changeStoredRecord('evaluation_initial_drafts', EVALUATION_INITIAL_DRAFT_TRIGGER_SQL.evaluation_initial_drafts_no_update!,
      (json) => canonicalRecord({ ...JSON.parse(json), schema: 'ai7.evaluation-initial-draft/2' }).json,
      'WHERE record_id = ?', [recordId]);
    await withReopenedStore(async (store) => {
      expect(await refusal(() => store.inspectEvaluation(bookId, recordId))).toBe('EVALUATION_RECORD_INVALID:评估记录已损坏。');
    });
  }, 300_000);

  it('migrates revision 63 so a rewrite can be prepared through the public API', async () => {
    const { bookId } = await revision63Book(true);
    await withReopenedStore(async (store) => {
      finalizeAsJ11(store, bookId);
      const record = beginRewriteAsJ11(store, bookId);
      expect(prepareRewrite(store, bookId, record.recordId)).toMatchObject({ kind: EVALUATION_REWRITE_KIND, state: 'prepared' });
    });
    withDatabase((database) => {
      for (const table of KIND_COUPLED_ANALYSIS_RELATIONS) {
        expect((database.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) as { sql: string }).sql)
          .toBe(table === 'analysis_task_intents' ? FACTUAL_RANGE_TASK_INTENTS_SQL : CURATION_SCHEMA_SQL[table] ?? ANALYSIS_LEDGER_SCHEMA_SQL[table]);
      }
      expect(Object.keys(EVALUATION_REWRITE_TRIGGER_SQL).every((name) => database.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'trigger' AND name = ?").get(name) !== undefined)).toBe(true);
    });
  }, 300_000);

  it('keeps every populated evaluation-kind row byte for byte through revision-63 migration', async () => {
    const { before } = await revision63Book(true);
    await withReopenedStore(async () => {});
    withDatabase((database) => { expect(kindCoupledRows(database)).toBe(before); });
  }, 300_000);

  it('refuses a revision-63 store whose kind-coupled relations already read as revision 64’s', async () => {
    await revision63Book(false);
    const refused = await openStore().then((store) => { store.close(); return 'opened'; },
      (error: unknown) => (error instanceof Error && 'code' in error ? `${String((error as { code: unknown }).code)}:${error.message}` : String(error)));
    expect(refused).toBe('SCHEMA_INVALID:分析任务账本表（修订版 62） analysis_task_intents 结构不兼容。');
  }, 300_000);
});

/**
 * One 按我的修改重新生成 Run over the real store and execution owner whose model answers every unit with the authored
 * observations and the synthesis with `answer` — here deliberately rewriting what the editor locked (Issue #1412).
 */
async function answeredRewrite(store: EditorialStore, bookId: string, recordId: string, answer: unknown): Promise<void> {
  let contract = '';
  let synthesisContract = '';
  let observationSet = '';
  const units = new Map<number, { digest: string; requestDigest: string }>();
  const captured = capturedOrdinaryExecution(store, roots.codeRoot, roots.dataRoot, requestGovernor, (request, message) => {
    const unit = parseEvaluationRewriteUnitMessageHeader(message);
    if (request.stage === 'units' && unit !== null) {
      const expected = units.get(unit.ordinal);
      if (expected === undefined || unit.unitDigest !== expected.digest || request.contractDigest !== contract || request.requestDigest !== expected.requestDigest) return undefined;
      return { kind: 'unit-result', text: JSON.stringify({ schema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA,
        unitOrdinal: unit.ordinal, observations: AUTHORED_REWRITE_OBSERVATIONS[unit.ordinal]! }), usage: { inputTokens: 100, outputTokens: 50 } };
    }
    const synthesis = parseEvaluationRewriteSynthesisMessageHeader(message);
    if (request.stage === 'cross-unit-reduction' && synthesis !== null && synthesis.setDigest === observationSet && request.contractDigest === synthesisContract) {
      return { kind: 'unit-result', text: JSON.stringify(answer), usage: { inputTokens: 2600, outputTokens: 560 } };
    }
    if (request.stage === 'run-report-reflection' && parseRunReportReflectionMessageHeader(message) !== null) {
      return { kind: 'unit-result', text: JSON.stringify({ schema: 'ai7.analysis.run-report-reflection-result/1', items: [] }), usage: { inputTokens: 10, outputTokens: 5 } };
    }
    return undefined;
  });
  try {
    const prepared = prepareRewrite(store, bookId, recordId, captured.policy);
    const manifest = prepared.coverageManifest!;
    contract = prepared.planEnvelope!.promptContractDigest;
    observationSet = evaluationRewriteObservationSetDigest(manifest.units.map((unit) => ({
      unitOrdinal: unit.ordinal,
      result: { schema: EVALUATION_REWRITE_UNIT_RESULT_SCHEMA, unitOrdinal: unit.ordinal, observations: AUTHORED_REWRITE_OBSERVATIONS[unit.ordinal]! },
    })));
    const authorized = store.authorizeEvaluationRewrite(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
    synthesisContract = authorized.ledger.definition.crossUnit!.promptContractDigest;
    for (const unit of manifest.units) units.set(unit.ordinal, { digest: unit.digest, requestDigest: authorized.ledger.definition.requestDigest(unit.ordinal, unit.digest) });
    captured.owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger);
    await captured.owner.whenIdle();
  } finally {
    await captured.owner.dispose();
    captured.assertMatched();
  }
}

describe('🔒 锁定 evaluation dimensions through successive regenerations (Issue #1412)', () => {
  it('keeps every locked 评语, 总评 and list exactly as the editor left them, in the proposal and in the adopted entry, over two rounds', async () => {
    let bookId = '';
    let record!: EvaluationRecordProjection;
    await withAdjustedBook(async (book, adjusted) => { bookId = book.bookId; record = adjusted; });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, { baselineAnalysisRoute: null,
      induceUnprovableReconciliation: false, persistLegacyReviewedDraft: false, induceReimportProofTamper: false,
      induceAbandonObjectRemovalFailure: false, interruptAfterAbandonObjectRemoval: false });
    try {
      // The editor writes their own 总评 and 文学品质 评语 and locks both; the scores stay the constraints they were.
      const ownComment = '编辑自己的文学品质评语，锁定后不再改动。';
      const ownVerdict = '编辑自己的总评：先补结构照应，再谈出版。';
      const locked: EvaluationContent = {
        ...record.content,
        items: record.content.items.map((item) => item.itemId === 'literary-quality' ? { ...item, comment: ownComment } : item),
        verdict: ownVerdict,
        aiLocked: ['verdict', 'literary-quality'],
      };
      const saved = store.saveEvaluation({ bookId, recordId: record.recordId, expectedEntries: record.entries, content: locked, finalize: false }).record!;
      // Stored in the profile's order, items first: the canonical form a later read and digest agree on.
      expect(saved.content.aiLocked).toEqual(['literary-quality', 'verdict']);
      // An entry without locks keeps its exact shape: no `aiLocked` key at all.
      expect(Object.hasOwn(record.content, 'aiLocked')).toBe(false);
      // Round 1: the model rewrites everything it can, the locked 评语 and 总评 included.
      await answeredRewrite(store, bookId, record.recordId, AUTHORED_REWRITE_WORDS);
      const proposal = store.inspectEvaluation(bookId, record.recordId).rewrite.proposal!;
      expect(proposal.items.map((item) => item.itemId)).not.toContain('literary-quality');
      expect(proposal.verdict).toBeNull();
      const round1 = store.decideEvaluationRewrite(bookId, proposal.revisionId, 'accept').record!;
      expect(round1.content.items.find((item) => item.itemId === 'literary-quality')!.comment).toBe(ownComment);
      expect(round1.content.verdict).toBe(ownVerdict);
      expect(round1.content.aiLocked).toEqual(['literary-quality', 'verdict']);
      expect(round1.content.items.find((item) => item.itemId === 'theme-and-context')!.comment)
        .toBe(AUTHORED_REWRITE_WORDS.items.find((item) => item.itemId === 'theme-and-context')!.comment);
      expect(scoresOf(round1.content)).toEqual(scoresOf(record.content));
      // Round 2: the editor is content with 主题 and 主要优点 too, locks them, and regenerates again with a different answer.
      const theme = round1.content.items.find((item) => item.itemId === 'theme-and-context')!.comment;
      const strengths = round1.content.strengths;
      const relocked = store.saveEvaluation({ bookId, recordId: record.recordId, expectedEntries: round1.entries,
        content: { ...round1.content, aiLocked: ['literary-quality', 'verdict', 'theme-and-context', 'strengths'] }, finalize: false }).record!;
      const second = { ...AUTHORED_REWRITE_WORDS, items: AUTHORED_REWRITE_WORDS.items.map((item) => ({ ...item, comment: `第二轮：${item.comment}` })),
        verdict: '第二轮的总评，不应被采用。', strengths: ['第二轮的优点，不应被采用。'] };
      await answeredRewrite(store, bookId, record.recordId, second);
      const proposal2 = store.inspectEvaluation(bookId, record.recordId).rewrite.proposal!;
      const round2 = store.decideEvaluationRewrite(bookId, proposal2.revisionId, 'accept').record!;
      expect(round2.content.items.find((item) => item.itemId === 'literary-quality')!.comment).toBe(ownComment);
      expect(round2.content.items.find((item) => item.itemId === 'theme-and-context')!.comment).toBe(theme);
      expect(round2.content.verdict).toBe(ownVerdict);
      expect(round2.content.strengths).toEqual(strengths);
      expect(round2.content.items.find((item) => item.itemId === 'chinese-language')!.comment).toMatch(/^第二轮：/u);
      expect(round2.content.weaknesses).toEqual(second.weaknesses);
      expect(scoresOf(round2.content)).toEqual(scoresOf(relocked.content));
      // Everything locked leaves nothing to regenerate: the Task is refused before a plan is made.
      const all = store.saveEvaluation({ bookId, recordId: record.recordId, expectedEntries: round2.entries, content: { ...round2.content,
        aiLocked: [...round2.content.items.map((item) => item.itemId), 'verdict', 'strengths', 'weaknesses'] }, finalize: false }).record!;
      expect(all.content.aiLocked).toHaveLength(round2.content.items.length + 3);
      expect(await refusal(() => store.createEvaluationRewritePreparationWork(bookId, record.recordId, launchPolicy))).toContain('都已锁定');
      store.markCleanShutdown();
    } finally { store.close(); }
  }, 300_000);
});
