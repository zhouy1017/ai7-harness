import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { REVIEW_GUIDELINE_TRIGGER_SQL } from '../../src/service/review-guidelines.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { BOOK_PEOPLE_SCHEMA_VERSION, LEARNING_ELIGIBILITY_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { buildManuscriptPackage } from '../../src/service/text-manuscript.js';
import type { LaunchPolicyProjection, ReviewGuidelinesProjection, ReviewRunProjection, ReviewRunScopeRequest } from '../../src/shared/protocol.js';
import { TYPOS_AND_USAGE } from '../support/review-categories.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 知识库 › 审阅规范文件 (Issue #427, plan slice S79a; V2-UX-KB-001 to KB-003, REV-012): the
// real store on a temporary Agent Data Root, exact `sample1` imported through the supported path, the Review Run drive loop
// over the authored review fixture, and guideline files the suite writes itself — AI7's own words, never a manuscript.
// Schema revision 45 appends each imported version, chained; a Review Run prepared after an import applies it, while one
// before keeps naming the version it used; and the page counts which findings cite which clause of which version.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const WHOLE: ReviewRunScopeRequest = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null };
const TYPOS = TYPOS_AND_USAGE.categoryId;
const TYPOS_DOCUMENT = 'ai7-builtin/typos-and-usage';
/** The house's own clauses, written for this suite: a preamble line, then numbered clauses, one continued on a second line. */
const HOUSE_CLAUSES = [
  '本社文字规范（2026 年版）',
  '',
  '1. 指出错字、别字、多字与漏字，给出改正后的文字。',
  '2. 指出成分残缺与搭配不当，给出通顺的改法。',
  '3. 数字与标点按本社体例手册统一，',
  '   体例手册未写到的，按国家现行规范。',
  '4. 专名在全书前后写法一致。',
  '5. 本社新增：引文与原文核对后再改，不凭记忆改动。',
].join('\n');

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-review-guidelines-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
});

afterEach(async () => {
  await roots.dispose();
});

async function openStore(): Promise<{ store: EditorialStore; owner: BaselineAnalysisExecutionOwner; driver: ReviewRunDriver }> {
  const fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-review-authored');
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  return { store, owner, driver: new ReviewRunDriver(store.reviewRunDriveSteps, owner) };
}

async function close(session: { store: EditorialStore; owner: BaselineAnalysisExecutionOwner; driver: ReviewRunDriver }): Promise<void> {
  const stopped = session.driver.dispose();
  await session.owner.dispose();
  await stopped;
  session.store.markCleanShutdown();
  session.store.close();
}

function prepareReview(store: EditorialStore, bookId: string): ReviewRunProjection {
  let progress = store.createReviewRunPreparationWork(bookId, [TYPOS], WHOLE, launchPolicy);
  while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
  return progress.projection!.run!;
}

function file(name: string, content: string | Uint8Array): string {
  const path = join(roots.inputRoot, name);
  writeFileSync(path, content);
  return path;
}

function typosDocument(projection: ReviewGuidelinesProjection) {
  return projection.documents.find((document) => document.documentId === TYPOS_DOCUMENT)!;
}

async function refusal(operation: () => unknown): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

/** The guideline documents a Run's snapshot applied, by document, at the version and with the clauses it recorded. */
function snapshotDocuments(reviewRunId: string): Array<{ documentId: string; version: string; issuer: string; clauses: number }> {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const row = database.prepare('SELECT canonical_json FROM review_runs WHERE review_run_id = ?').get(reviewRunId) as { canonical_json: string };
    const snapshot = JSON.parse(row.canonical_json) as { categories: Array<{ entry: { guidelineDocuments: Array<{ documentId: string; version: string; issuer: string; clauses: unknown[] }> } }> };
    return snapshot.categories.flatMap((category) => category.entry.guidelineDocuments.map((document) => ({
      documentId: document.documentId, version: document.version, issuer: document.issuer, clauses: document.clauses.length,
    })));
  } finally {
    database.close();
  }
}

describe('知识库 › 审阅规范文件 over the real store', () => {
  it('lists the built-in documents, counts the clauses a review cited, and applies an imported version from the next review on', async () => {
    await requireExactSample1(roots.codeRoot);
    const session = await openStore();
    try {
      const { store, driver } = session;
      // A fresh store: every document the categories apply, at AI7's built-in first version, used by nothing yet.
      const fresh = store.inspectReviewGuidelines();
      expect(fresh.documents.map((document) => [document.title, document.currentOrdinal, document.issuer])).toEqual([
        ['文字规范条款', 1, 'AI7 内置默认'],
        ['体例条款', 1, 'AI7 内置默认'],
        ['线索条款', 1, 'AI7 内置默认'],
        ['事实核查契约', 1, 'AI7 内置默认'],
        ['引用与学术规范条款', 1, 'AI7 内置默认'],
        ['出版风险提示条款', 1, 'AI7 内置默认'],
        ['表达改进条款', 1, 'AI7 内置默认'],
      ]);
      expect(typosDocument(fresh).appliedBy).toEqual([{ categoryId: TYPOS, label: '错别字与规范用语' }]);
      expect(typosDocument(fresh).clauses.map((clause) => [clause.clauseId, clause.citations])).toEqual([
        ['typos-and-usage/1', 0], ['typos-and-usage/2', 0], ['typos-and-usage/3', 0], ['typos-and-usage/4', 0],
      ]);
      expect(typosDocument(fresh).versions).toEqual([expect.objectContaining({ ordinal: 1, versionId: null, source: null, usedBy: [] })]);
      // 工序与规则's expert 工序 (S79d): the nine categories' 工序, none used yet, and the native artifact not installed.
      const freshProcedures = store.inspectKnowledgeProcedures();
      expect(freshProcedures.procedures.map((procedure) => [procedure.title, procedure.state, procedure.reviewRuns])).toEqual([
        ['错别字与规范用语审阅工序', 'enabled', 0], ['体例与格式审阅工序', 'enabled', 0], ['线索转批注', 'enabled', 0], ['断言列举与引文定位', 'enabled', 0],
        ['引用风险点标注', 'enabled', 0], ['出版风险点标注', 'enabled', 0], ['文学性与表达改进工序', 'enabled', 0],
        ['书系一致性检查', 'unavailable', 0], ['跨交付物一致性检查', 'unavailable', 0],
      ]);
      expect(freshProcedures.procedures.filter((procedure) => procedure.state === 'unavailable').every((procedure) => (procedure.unavailableReason ?? '').length > 0)).toBe(true);
      expect(freshProcedures.artifacts).toEqual([{ artifactId: '@ai7/editorial-workspace-profile', title: '编辑工作区方案', version: null, state: 'not-installed', enabledBooks: 0 }]);

      // One review of 错别字与规范用语 under version 1: its findings cite the clauses, and the version names the Run.
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 审阅规范');
      await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const first = prepareReview(store, imported.bookId);
      store.authorizeReviewRun(imported.bookId, first.reviewRunId, first.categories
        .filter((category) => category.planEnvelopeDigest !== null).map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
      await driver.drive(first.reviewRunId);
      const reviewed = typosDocument(store.inspectReviewGuidelines());
      const cited = reviewed.clauses.filter((clause) => clause.citations > 0);
      expect(cited.length).toBeGreaterThan(0);
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const counted = database.prepare(`SELECT clause_ref, COUNT(DISTINCT finding_id) n FROM review_findings WHERE review_run_id = ? AND category_id = ? AND clause_ref IS NOT NULL GROUP BY clause_ref`)
          .all(first.reviewRunId, TYPOS) as Array<{ clause_ref: string; n: number }>;
        expect(Object.fromEntries(reviewed.clauses.filter((clause) => clause.citations > 0).map((clause) => [clause.clauseId, clause.citations])))
          .toEqual(Object.fromEntries(counted.map((row) => [row.clause_ref, Number(row.n)])));
      } finally {
        database.close();
      }
      expect(reviewed.versions[0]!.usedBy).toEqual([expect.objectContaining({ bookId: imported.bookId, bookTitle: 'L2 审阅规范', reviewRunId: first.reviewRunId, reviewOrdinal: 1 })]);
      expect(reviewed.olderVersionBooks).toEqual([]);
      const afterReview = store.inspectKnowledgeProcedures();
      expect(afterReview.procedures.find((procedure) => procedure.categoryId === TYPOS)!.reviewRuns).toBe(1);
      expect(afterReview.procedures.filter((procedure) => procedure.categoryId !== TYPOS).every((procedure) => procedure.reviewRuns === 0)).toBe(true);
      expect(afterReview.artifacts[0]).toMatchObject({ state: 'installed', version: '1.0.0', enabledBooks: 1 });

      // 导入新版本 from plain text: the preview reads the house's five clauses and records nothing.
      const before = store.inspectReviewGuidelines();
      const preview = await store.previewReviewGuidelineVersion(TYPOS_DOCUMENT, file('本社文字规范.txt', HOUSE_CLAUSES));
      expect(preview).toMatchObject({ documentId: TYPOS_DOCUMENT, title: '文字规范条款', ordinal: 2, currentOrdinal: 1, changes: { changed: 4, added: 1, removed: 0 } });
      expect(preview.source).toMatchObject({ displayName: '本社文字规范.txt', format: 'text' });
      expect(preview.clauses.map((clause) => [clause.clauseId, clause.number])).toEqual([1, 2, 3, 4, 5].map((n) => [`typos-and-usage/${n}`, n]));
      expect(preview.clauses[2]!.text).toBe('数字与标点按本社体例手册统一， 体例手册未写到的，按国家现行规范。');
      expect(store.inspectReviewGuidelines()).toEqual(before);

      // 确认导入: version 2, issued by the house; version 1 stays with the review that used it, and the Book is still on it.
      const after = typosDocument(store.importReviewGuidelineVersion(preview.previewId));
      expect([after.currentOrdinal, after.issuer]).toEqual([2, '本社']);
      expect(after.clauses.map((clause) => clause.citations)).toEqual([0, 0, 0, 0, 0]);
      expect(after.versions.map((version) => [version.ordinal, version.issuer, version.clauseCount, version.usedBy.length])).toEqual([[2, '本社', 5, 0], [1, 'AI7 内置默认', 4, 1]]);
      expect(after.versions[0]!.source).toMatchObject({ displayName: '本社文字规范.txt', format: 'text', bytes: Buffer.byteLength(HOUSE_CLAUSES) });
      expect(after.olderVersionBooks).toEqual([{ bookId: imported.bookId, bookTitle: 'L2 审阅规范', ordinal: 1 }]);
      // The same preview again is spent; the same file again is no new version.
      expect(await refusal(() => store.importReviewGuidelineVersion(preview.previewId))).toMatch(/^REVIEW_GUIDELINE_PREVIEW_EXPIRED:/u);
      expect(await refusal(() => store.previewReviewGuidelineVersion(TYPOS_DOCUMENT, file('again.txt', HOUSE_CLAUSES))))
        .toBe('REVIEW_GUIDELINE_UNCHANGED:与当前的第 2 版条款完全相同，不需要导入新版本。');

      // A review prepared now applies version 2; the first review's snapshot still names version 1.
      const second = prepareReview(store, imported.bookId);
      expect(snapshotDocuments(second.reviewRunId).find((document) => document.documentId === TYPOS_DOCUMENT)).toEqual({ documentId: TYPOS_DOCUMENT, version: '2', issuer: '本社', clauses: 5 });
      expect(snapshotDocuments(first.reviewRunId).find((document) => document.documentId === TYPOS_DOCUMENT)).toEqual({ documentId: TYPOS_DOCUMENT, version: '1', issuer: 'AI7 内置默认', clauses: 4 });
      const workspace = store.inspectReviewWorkspace(imported.bookId, null);
      expect(workspace.categories.find((category) => category.categoryId === TYPOS)!.basisStatement).toContain('本社 · 文字规范条款（第 2 版）');
      // Its Book's latest review applies version 2 now, so no Book is on an older one — though nothing has been run under it.
      const now = typosDocument(store.inspectReviewGuidelines());
      expect(now.olderVersionBooks).toEqual([]);
      expect(now.versions.map((version) => version.usedBy.map((run) => run.reviewOrdinal))).toEqual([[2], [1]]);
      expect(store.inspectKnowledgeProcedures().procedures.find((procedure) => procedure.categoryId === TYPOS)!.reviewRuns).toBe(2);
    } finally {
      await close(session);
    }
  }, 300_000);

  it('reads a Word file, refuses what is not numbered clauses in plain words, and a version imported meanwhile', async () => {
    const session = await openStore();
    try {
      const { store } = session;
      const docx = buildManuscriptPackage([
        { lines: ['本社体例'] },
        { lines: ['第一条 标题层级与编号方式全书一致。'] },
        { lines: ['第二条 数字、年代与计量的写法全书统一。'] },
        { lines: ['第三条 引文与书名的呈现方式一致，'] },
        { lines: ['注释格式另见附录。'] },
      ]);
      const word = await store.previewReviewGuidelineVersion('ai7-builtin/style-and-format', file('本社体例.docx', docx));
      expect(word).toMatchObject({ ordinal: 2, source: { format: 'docx', displayName: '本社体例.docx' } });
      expect(word.clauses.map((clause) => [clause.clauseId, clause.text])).toEqual([
        ['style-and-format/1', '标题层级与编号方式全书一致。'],
        ['style-and-format/2', '数字、年代与计量的写法全书统一。'],
        ['style-and-format/3', '引文与书名的呈现方式一致， 注释格式另见附录。'],
      ]);
      // Two previews of one document: the first confirmed moves the document, so the second is refused.
      const other = await store.previewReviewGuidelineVersion('ai7-builtin/style-and-format', file('另一份.txt', '1. 标题全书一致。\n2. 数字全书统一。'));
      store.importReviewGuidelineVersion(word.previewId);
      expect(await refusal(() => store.importReviewGuidelineVersion(other.previewId))).toMatch(/^REVIEW_GUIDELINE_MOVED:/u);

      const refused = async (name: string, content: string | Uint8Array) => refusal(() => store.previewReviewGuidelineVersion(TYPOS_DOCUMENT, file(name, content)));
      expect(await refused('none.txt', '这里没有编号。\n也没有条款。')).toBe('REVIEW_GUIDELINE_NO_CLAUSES:没有找到编号条款：每一条要以“1.”或“第1条”这样的编号开头。');
      expect(await refused('gap.txt', '1. 第一条。\n2. 第二条。\n4. 第四条。')).toBe('REVIEW_GUIDELINE_NUMBERING:条款编号要连续：第 2 条之后是第 4 条。');
      expect(await refused('start.txt', '2. 从二开始。')).toBe('REVIEW_GUIDELINE_NUMBERING:条款编号要从 1 开始：第一条写的是第 2 条。');
      expect(await refused('long.txt', `1. ${'长'.repeat(301)}`)).toBe('REVIEW_GUIDELINE_CLAUSE_TOO_LONG:第 1 条超过 300 字；请拆成几条。');
      expect(await refused('many.txt', Array.from({ length: 41 }, (_, index) => `${index + 1}. 条款。`).join('\n'))).toMatch(/^REVIEW_GUIDELINE_TOO_MANY:/u);
      expect(await refused('empty-clause.txt', '1.\n2. 有内容。')).toBe('REVIEW_GUIDELINE_EMPTY_CLAUSE:第 1 条只有编号，没有内容。');
      expect(await refused('scan.pdf', Buffer.from('%PDF-1.7\n'))).toBe('REVIEW_GUIDELINE_FORMAT:审阅规范文件请用 Word（.docx）或纯文本（.txt、.md）。');
      expect(await refused('gbk.txt', Buffer.from([0x31, 0x2e, 0x20, 0xb2, 0xe2, 0xca, 0xd4]))).toMatch(/^REVIEW_GUIDELINE_/u);
      expect(await refusal(() => store.previewReviewGuidelineVersion('ai7-builtin/unknown', file('x.txt', '1. 条。')))).toBe('REVIEW_GUIDELINE_UNKNOWN:没有这份审阅规范文件。');
    } finally {
      await close(session);
    }
  }, 300_000);

  it('adds revision 45 to a revision-44 store with nothing else moved, and refuses a version rewritten by hand', async () => {
    const first = await openStore();
    try {
      const preview = await first.store.previewReviewGuidelineVersion(TYPOS_DOCUMENT, file('house.txt', HOUSE_CLAUSES));
      first.store.importReviewGuidelineVersion(preview.previewId);
    } finally {
      await close(first);
    }
    // A revision-44 store never held the relation: planted by dropping it, it gains it again empty.
    const plant = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      plant.exec(`DROP TABLE learning_eligibility_decisions; DROP TABLE proposal_decision_feedback; DROP TABLE analysis_feedback_signals; DROP TABLE evaluation_record_entries; DROP TABLE evaluation_records; DROP TABLE library_material_decisions; DROP TABLE library_materials; DROP TABLE review_guideline_versions; PRAGMA user_version = ${BOOK_PEOPLE_SCHEMA_VERSION};`);
    } finally {
      plant.close();
    }
    const migrated = await openStore();
    try {
      expect(typosDocument(migrated.store.inspectReviewGuidelines()).currentOrdinal).toBe(1);
      const preview = await migrated.store.previewReviewGuidelineVersion(TYPOS_DOCUMENT, file('house-again.txt', HOUSE_CLAUSES));
      migrated.store.importReviewGuidelineVersion(preview.previewId);
    } finally {
      await close(migrated);
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(LEARNING_ELIGIBILITY_SCHEMA_VERSION);
      expect(() => database.exec("UPDATE review_guideline_versions SET recorded_at = recorded_at")).toThrowError(/REVIEW_GUIDELINE_LEDGER_IMMUTABLE/u);
      expect(() => database.exec('DELETE FROM review_guideline_versions')).toThrowError(/REVIEW_GUIDELINE_LEDGER_IMMUTABLE/u);
      // Rewritten by hand behind the triggers' back: the chain no longer reads, and the page says so rather than guess.
      database.exec('DROP TRIGGER review_guideline_versions_no_update');
      database.exec(`UPDATE review_guideline_versions SET canonical_json = replace(canonical_json, '本社新增', '改过')`);
      database.exec(REVIEW_GUIDELINE_TRIGGER_SQL.review_guideline_versions_no_update!);
    } finally {
      database.close();
    }
    const tampered = await openStore();
    try {
      expect(await refusal(() => tampered.store.inspectReviewGuidelines())).toMatch(/^REVIEW_GUIDELINE_RECORD_INVALID:/u);
    } finally {
      await tampered.owner.dispose();
      tampered.store.close();
    }
  }, 300_000);
});
