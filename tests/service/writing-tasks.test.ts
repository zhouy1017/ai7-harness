import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture, type ModelFixtureEntry, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import {
  ANALYSIS_LEDGER_REVISION_64_SQL,
  ANALYSIS_LEDGER_SCHEMA_SQL,
  EVALUATION_REWRITE_SCHEMA_VERSION,
  WRITING_TASK_SCHEMA_VERSION,
} from '../../src/service/task-authorization.js';
import { WRITING_NO_RULE } from '../../src/service/task-plan.js';
import { WRITING_TASK_TRIGGER_SQL, writingDraftBlocks } from '../../src/service/writing-tasks.js';
import {
  BASELINE_ANALYSIS_TASK_GOAL,
  DEFAULT_MANUSCRIPT_EXPORT_OPTIONS,
  WRITING_CONTRACT_VERSION,
  WRITING_KIND,
  WRITING_LIVE_UNAVAILABLE,
  WRITING_QUICK_START_REASON,
  type LaunchPolicyProjection,
  type WritingProjection,
} from '../../src/shared/protocol.js';
import { KIND_COUPLED_ANALYSIS_RELATIONS, downgradeKindCoupledRelations } from '../support/analysis-ledger-revisions.js';
import { ADMITTED_BASELINE_DOCX, composeRevisedDocx } from '../support/composed-fixture.js';
import { finalizeAsJ11, runInitialEvaluationToEnd } from '../support/readers-report.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import {
  AUTHORED_WRITING_DRAFT,
  AUTHORED_WRITING_PASSAGES,
  WRITING_BOOK_TITLE,
  WRITING_FIXTURE_IDENTITY,
  WRITING_REQUEST,
  answerWriting,
  answerWritingReflection,
} from '../support/writing-task.js';

// Service-integration suite (L2) for 写作任务 (Issue #432, plan slice S84a; V2-UX-DELIV-007, KB-004; editor-surfaces §9): the writing
// kind over the real store and ledger, the one execution owner and the AI7 local deterministic adapter — over the authored fixture
// `sample1-writing-authored` for J-07's 宣传文章, and over fixtures built here from the same authored passages where a case needs
// other words. The manuscript is exact `sample1` (ADR 0043); no Provider, socket or credential value is involved. Assertions name
// states, the draft's own structure and counts, and the service's words, never manuscript text.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const { schema: _schema, ...DRAFT_WORDS } = AUTHORED_WRITING_DRAFT;
const TYPE_LABELS = ['新闻稿', '宣传文章', '评论文章', '发布会材料', '营销要点'] as const;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-writing-');
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

interface Session {
  readonly store: EditorialStore;
  readonly owner: BaselineAnalysisExecutionOwner;
}

async function openStore(fixture: ResolvedModelFixture): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
}

async function withSession(fixture: ResolvedModelFixture, body: (session: Session) => Promise<void>): Promise<void> {
  await requireExactSample1(roots.codeRoot);
  const store = await openStore(fixture);
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  try {
    await body({ store, owner });
    store.markCleanShutdown();
  } finally {
    await owner.dispose();
    store.close();
  }
}

/** Exact sample1 as a Book the analysis path takes: the profile at Revision 2 and the connection's reference. */
async function sample1Book(store: EditorialStore, title: string): Promise<string> {
  const imported = await importSample1Book(store, roots.codeRoot, title);
  await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
  recordMissingCredentialConnection(store, 'L2 主编辑连接');
  return imported.bookId;
}

/** 先看计划 of one writing Task to its frozen plan. */
function prepare(store: EditorialStore, bookId: string, request: Parameters<EditorialStore['createWritingPreparationWork']>[1] = WRITING_REQUEST): WritingProjection {
  let progress = store.createWritingPreparationWork(bookId, request, launchPolicy);
  while (!progress.done) progress = store.advanceWritingPreparationWork(progress.workId!);
  return progress.projection!;
}

/** 开始任务 through the governor, and the Run to its end. */
async function run(session: Session, bookId: string, prepared: WritingProjection): Promise<WritingProjection> {
  const authorized = session.store.authorizeWriting(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  expect(session.owner.admitOrQueue(authorized.dispatchRunRecordId!, authorized.ledger)).toBe('admitted');
  await session.owner.whenIdle();
  return session.store.inspectWriting(bookId)!;
}

describe('写作任务 over the real store on exact sample1', () => {
  it('drafts J-07\'s 宣传文章 from the plan, and 打开草稿 makes it the Book\'s 宣传文章 in its 起草 phase', async () => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, WRITING_FIXTURE_IDENTITY);
    expect(fixture.provenance).toBe('authored');
    let bookId = '';
    let afterDraft = '';
    await withSession(fixture, async (session) => {
      const { store } = session;
      bookId = await sample1Book(store, WRITING_BOOK_TITLE);
      // 新建文档 · 写作任务 before any Task: every reference part says the Book has none, the four rows, each type free.
      const page = store.inspectWritingTask(bookId);
      expect(page).toMatchObject({
        bookId,
        unavailable: null,
        references: {
          synopsis: '本书尚无基线分析，本次不参考梗概与人物',
          evaluation: '本书尚无定稿的评估，本次不参考评估结论与营销要点',
          book: '《写作旅程乙》 · 作者：未填写 · 责编：未填写 · 书系：不在任何书系中',
        },
        consequences: { read: '当前稿件的全部 97 个内容块，以及上面列出的参考材料', cost: '先看计划后显示' },
        task: null,
        quickStart: { allowed: false, reason: WRITING_QUICK_START_REASON },
      });
      expect(page.types.map((type) => [type.label, type.prepare, type.exemplars.statement, type.drafted])).toEqual(TYPE_LABELS.map((label) => [
        label, { allowed: true, mode: 'writing-first' }, `本社暂无其他图书的${label}范例，本次不参考范例`, null,
      ]));

      // 先看计划: the plan in the drawer's words.
      const prepared = prepare(store, bookId);
      expect(prepared).toMatchObject({ kind: WRITING_KIND, contractVersion: WRITING_CONTRACT_VERSION, state: 'prepared' });
      const plan = store.inspectTaskPlan({ bookId, kind: 'writing', ref: prepared.taskIntent!.taskIntentId });
      expect(plan.goal.sentence).toBe('为《写作旅程乙》起草「宣传文章」：受众「喜欢历史与悬疑小说的读者」，渠道「出版社微信公众号」');
      expect(plan.goal.chips.procedure).toBe('写作任务 · 宣传文章');
      expect(plan.scope.reference).toEqual([
        '本书尚无基线分析，本次不参考梗概与人物',
        '本书尚无定稿的评估，本次不参考评估结论与营销要点',
        '本社暂无其他图书的宣传文章范例，本次不参考范例',
        '图书信息：《写作旅程乙》 · 作者：未填写 · 责编：未填写 · 书系：不在任何书系中',
        '你写的受众「喜欢历史与悬疑小说的读者」、渠道「出版社微信公众号」',
      ]);
      expect(plan.steps.map((step) => step.label)).toEqual(['逐章读取，找出文档可以取用的看点、人物与主题', '依据参考材料写出「宣传文章」']);
      expect(plan.notDo.editorial).toContain('不照抄范例：与范例有连续 12 个字以上相同的草稿不予采用');
      expect(plan.start.readiness).toBe('ready');
      expect(plan.defaultRule).toMatchObject({ reason: WRITING_NO_RULE });
      expect(store.inspectWritingTask(bookId).task).toMatchObject({ taskIntentId: prepared.taskIntent!.taskIntentId, typeId: 'promotion-article', typeLabel: '宣传文章', state: 'prepared' });

      // 开始任务: the Run reads the eight ranges and writes the draft.
      const settled = await run(session, bookId, prepared);
      expect(settled.state).toBe('settled');
      const writing = settled.resultSetRevision!.writing;
      expect(writing.synthesis).toEqual({ state: 'closed', reason: null });
      expect(writing.draft).toEqual(DRAFT_WORDS);
      expect(writing.passages).toHaveLength(Object.values(AUTHORED_WRITING_PASSAGES).flat().length);
      expect(writing.exemplars).toEqual({ count: 0, statement: '本社暂无其他图书的宣传文章范例，本次不参考范例' });
      const drafted = store.inspectWritingTask(bookId).types.find((type) => type.typeId === 'promotion-article')!.drafted;
      expect(drafted).toMatchObject({ revisionId: settled.resultSetRevision!.revisionId });

      // 打开草稿: the Book's 宣传文章, its words the draft's, its 起草 phase started by the editor's command, version 1.
      const created = store.createWritingDraft(bookId, drafted!.revisionId);
      expect(created).toMatchObject({ typeId: 'promotion-article', typeLabel: '宣传文章' });
      const document = created.document;
      expect(document.origin.drafted).toBe(true);
      expect(document.versions.map((version) => version.label)).toEqual(['版本 1']);
      expect(document.workflow.transitions).toBe(1);
      expect(document.workflow.phases.find((phase) => phase.phaseId === 'drafting')).toMatchObject({ state: 'in-progress', latest: { action: 'start', fromState: 'not-started', toState: 'in-progress', reason: null } });
      expect(document.workflow.phases.filter((phase) => phase.state !== 'not-started').map((phase) => phase.phaseId)).toEqual(['drafting']);
      const window = store.getManuscriptWindow(document.documentId, document.branchId, null);
      expect(window.blocks.map((block) => [block.kind, block.text])).toEqual(writingDraftBlocks(DRAFT_WORDS).map((block) => [block.kind, block.text]));
      expect(created.writing.types.find((type) => type.typeId === 'promotion-article')).toMatchObject({
        drafted: null,
        prepare: { allowed: false, reason: '这本书已经有「宣传文章」；请在交付物中打开它继续修改。' },
      });
      // Once per type: the same result, or the type's document made another way, refuses another.
      expect(await refusal(() => store.createWritingDraft(bookId, drafted!.revisionId)))
        .toBe('WRITING_DOCUMENT_EXISTS:这本书已经有「宣传文章」；请在交付物中打开它继续修改。');
      expect(await refusal(() => prepare(store, bookId)))
        .toBe('WRITING_DOCUMENT_EXISTS:这本书已经有「宣传文章」；请在交付物中打开它继续修改。');
      // 交付物's card names it as drafted.
      const card = store.inspectProductionDocuments(bookId).types.find((type) => type.typeId === 'promotion-article')!;
      expect(card.document).toMatchObject({ documentId: document.documentId, origin: { drafted: true } });

      // Exported as DOCX, written fresh from its own words: nothing of the manuscript's file is restored into it.
      const target = { kind: 'document', documentId: document.documentId, revisionId: document.versions[0]!.revisionId } as const;
      const reviewed = await store.reviewManuscriptExport({ bookId, target, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS } }, true);
      expect(reviewed.target).toMatchObject({ kind: 'document', document: { typeId: 'promotion-article', typeLabel: '宣传文章', versionLabel: '版本 1' } });
      expect(reviewed.restoration).toBe('regenerated');
      expect(reviewed.fidelity.filter((row) => row.count > 0).map((row) => row.key)).toEqual([]);
      afterDraft = JSON.stringify(store.inspectWritingTask(bookId));
    });
    // A restart moves nothing.
    await withSession(fixture, async ({ store }) => {
      expect(JSON.stringify(store.inspectWritingTask(bookId))).toBe(afterDraft);
    });
  }, 300_000);

  it('refuses what it cannot draft: the editor\'s words, a type it does not hold, 本书不做, a live scope, a result it has not', async () => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, WRITING_FIXTURE_IDENTITY);
    await withSession(fixture, async ({ store }) => {
      const bookId = await sample1Book(store, WRITING_BOOK_TITLE);
      expect(await refusal(() => prepare(store, bookId, { ...WRITING_REQUEST, audience: '  ' }))).toBe('WRITING_FIELD_REQUIRED:请写下这份文档的受众。');
      expect(await refusal(() => prepare(store, bookId, { ...WRITING_REQUEST, channel: '' }))).toBe('WRITING_FIELD_REQUIRED:请写下这份文档的渠道。');
      expect(await refusal(() => prepare(store, bookId, { ...WRITING_REQUEST, audience: '读'.repeat(61) })))
        .toBe('WRITING_FIELD_INVALID:受众最多 60 个字，只能写在一行里。');
      expect(await refusal(() => prepare(store, bookId, { ...WRITING_REQUEST, channel: '公众号\n微博' })))
        .toBe('WRITING_FIELD_INVALID:渠道最多 60 个字，只能写在一行里。');
      expect(await refusal(() => prepare(store, bookId, { ...WRITING_REQUEST, typeId: 'readers-report-author' })))
        .toBe('WRITING_TYPE_INVALID:这个文档类型不在本社的类型配置中。');
      store.decideProductionDocumentType({ bookId, typeId: 'marketing-points', notForThisBook: true });
      expect(store.inspectWritingTask(bookId).types.find((type) => type.typeId === 'marketing-points')!.prepare)
        .toEqual({ allowed: false, reason: '「营销要点」已标为本书不做；先恢复，再起草。' });
      expect(await refusal(() => prepare(store, bookId, { ...WRITING_REQUEST, typeId: 'marketing-points' })))
        .toBe('WRITING_NOT_FOR_THIS_BOOK:「营销要点」已标为本书不做；先恢复，再起草。');
      expect(await refusal(() => store.createWritingDraft(bookId, randomUUID()))).toBe('WRITING_NOT_FOUND:这本书没有这一次起草的文档。');
      // Under a live scope nothing is prepared or started, and the page says why.
      const free = store.baselineAnalysisLedger.launch;
      store.baselineAnalysisLedger.bindLaunch({
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
        const live = store.inspectWritingTask(bookId);
        expect(live.unavailable).toBe(WRITING_LIVE_UNAVAILABLE);
        expect(live.types.every((type) => !type.prepare.allowed && type.prepare.reason === WRITING_LIVE_UNAVAILABLE)).toBe(true);
        expect(await refusal(() => prepare(store, bookId))).toBe(`WRITING_UNAVAILABLE:${WRITING_LIVE_UNAVAILABLE}`);
        expect(await refusal(() => store.authorizeWriting(bookId, randomUUID(), 'a'.repeat(64)))).toBe(`WRITING_UNAVAILABLE:${WRITING_LIVE_UNAVAILABLE}`);
      } finally {
        store.baselineAnalysisLedger.bindLaunch(free);
      }
      expect(store.inspectWritingTask(bookId).unavailable).toBeNull();
      // A Book with no manuscript has nothing to read.
      const creation = store.prepareBookCreation('还没有稿件的书', null);
      const empty = store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
      expect(store.inspectWritingTask(empty).unavailable).toBe('这本书还没有稿件：写作任务要读稿件，先导入稿件。');
      expect(await refusal(() => prepare(store, empty))).toBe('WRITING_NEEDS_MANUSCRIPT:这本书还没有稿件：写作任务要读稿件，先导入稿件。');
    });
  }, 300_000);

  it('references the synopsis, the 定稿 evaluation with its market words and another Book\'s 范例 — and refuses a draft that copies the 范例', async () => {
    // One in-memory fixture over the baseline and 初评 fixtures, answered here for each writing contract the case asks.
    const base = await loadModelFixture(FIXTURES_ROOT, 'sample1-evaluation-authored');
    const entries = new Map<string, ModelFixtureEntry>(base.entries);
    const fixture: ResolvedModelFixture = { ...base, identity: 'sample1-writing-l2', lineage: [{ identity: 'sample1-writing-l2', sha256: 'e'.repeat(64) }], sha256: 'f'.repeat(64), entries };
    await withSession(fixture, async (session) => {
      const { store, owner } = session;
      // Another Book, set as a 发稿版本, delivers a 宣传文章 made from its source material: it stands in 范例.
      const sourcePath = join(roots.inputRoot, '范例来源书.docx');
      await composeRevisedDocx(sourcePath, { source: ADMITTED_BASELINE_DOCX, title: '范例来源书', paragraphs: [{ runs: [{ text: { block: 1 } }] }, { runs: [{ text: { block: 2 } }] }] });
      const staged = await store.stageSelectedManuscript(randomUUID(), sourcePath);
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '范例来源书' }, false);
      const commitId = randomUUID();
      const other = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
      await store.acknowledgeImportCompletion(commitId);
      const milestone = await store.saveMilestone(other.manuscriptId, other.branchId, '一审稿', 'stage-archive', null, '');
      store.designatePublicationVersion({ bookId: other.bookId, milestoneId: milestone.milestoneId, scope: '纸质版首印', basis: '三审通过' });
      const materialPath = join(roots.inputRoot, '宣传文章初稿.docx');
      await composeRevisedDocx(materialPath, { source: ADMITTED_BASELINE_DOCX, title: '宣传文章初稿', paragraphs: [{ runs: [{ text: { block: 21 } }] }, { runs: [{ text: { block: 22 } }] }] });
      const material = await store.stageSelectedManuscript(randomUUID(), materialPath);
      const materialReview = store.prepareSourceImportReview(material.draftId, material.draftVersion,
        { kind: 'existing-book', bookId: other.bookId, relationship: 'source-only', reuseSourceVersionId: null });
      const materialCommit = randomUUID();
      const sourceVersionId = (await store.commitSourceImport({ draftId: material.draftId, expectedDraftVersion: materialReview.draftVersion, reviewDigest: materialReview.reviewDigest, commitId: materialCommit })).sourceVersionId;
      await store.acknowledgeImportCompletion(materialCommit);
      const promotion = (await store.createProductionDocument({ bookId: other.bookId, typeId: 'promotion-article', sourceVersionId })).document!;
      await store.recordProductionDocumentDelivery({
        bookId: other.bookId, documentId: promotion.documentId, version: { kind: 'saved', revisionId: promotion.versions[0]!.revisionId },
        recipient: { kind: 'publicity', custom: null }, note: '公众号首发',
      });
      const exemplarText = store.getManuscriptWindow(promotion.documentId, promotion.branchId, null).blocks.map((block) => block.text).join('\n');

      // This Book: its baseline analysis, and a 定稿 version begun from AI7's 初评 with its market section.
      const bookId = await sample1Book(store, '参照之书');
      let baseline = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
      while (!baseline.done) baseline = store.advanceBaselineAnalysisPreparationWork(baseline.workId!);
      const authorizedBaseline = store.authorizeBaselineAnalysis(bookId, baseline.projection!.taskIntent!.taskIntentId, baseline.projection!.planEnvelope!.digest);
      owner.admitAndDispatch(authorizedBaseline.dispatchRunRecordId!);
      await owner.whenIdle();
      const synthesis = store.inspectBaselineAnalysis(bookId).resultSetRevision!.synthesis;
      const people = synthesis.entities.filter((entity) => entity.kind === 'person').slice(0, 12);
      await runInitialEvaluationToEnd(store, owner, bookId, launchPolicy);
      finalizeAsJ11(store, bookId);

      const page = store.inspectWritingTask(bookId);
      expect(page.references.synopsis).toBe(`基线分析第 1 版的梗概与 ${people.length} 位人物`);
      expect(page.references.evaluation).toMatch(/^第 \d+ 版定稿评估的结论「修改后再议」、主要优点与营销要点（目标读者、差异化卖点、渠道与策略）$/u);
      expect(page.types.find((type) => type.typeId === 'promotion-article')!.exemplars)
        .toEqual({ count: 1, statement: '参照本社 1 份宣传文章范例（只参照，不照抄）：《范例来源书》版本 1' });
      expect(page.types.find((type) => type.typeId === 'news-release')!.exemplars.count).toBe(0);

      // A draft that copies the 范例 is refused whole: a gap, and nothing to open.
      const copying = prepare(store, bookId);
      const plan = store.inspectTaskPlan({ bookId, kind: 'writing', ref: copying.taskIntent!.taskIntentId });
      expect(plan.scope.reference[0]).toBe(`基线分析的梗概与 ${people.length} 位人物：${people.map((entity) => entity.name).join('、')}`);
      expect(plan.scope.reference[1]).toMatch(/^定稿评估的结论「修改后再议」与主要优点 \d+ 条，营销要点：目标读者 \d+ 条、差异化卖点 \d+ 条、渠道与策略 \d+ 条$/u);
      expect(plan.scope.reference[2]).toBe('参照本社 1 份宣传文章范例（只参照，不照抄）：《范例来源书》版本 1');
      const copied = Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(exemplarText), ({ segment }) => segment).slice(0, 16).join('');
      answerWriting(entries, copying, {
        ...AUTHORED_WRITING_DRAFT,
        sections: [...AUTHORED_WRITING_DRAFT.sections, { heading: '范例里的一段', paragraphs: [`正如范例所写：${copied}。`] }],
      });
      const refused = await run(session, bookId, copying);
      answerWritingReflection(entries, refused.taskOutcome!.report!.accountingDigest);
      expect(refused.resultSetRevision!.writing.draft).toBeNull();
      expect(refused.resultSetRevision!.writing.synthesis.state).toBe('gap');
      expect(refused.resultSetRevision!.writing.synthesis.reason).toContain('范例只参照，不复制');
      expect(store.inspectWritingTask(bookId).types.find((type) => type.typeId === 'promotion-article')!.drafted).toBeNull();

      // Drafted again, in the editor's other words, without the copy: the draft closes and opens, the 范例 named in its Task.
      const again = prepare(store, bookId, { ...WRITING_REQUEST, requirements: '篇幅一千字以内' });
      expect(again.taskIntent!.mode).toBe('writing-again');
      answerWriting(entries, again, AUTHORED_WRITING_DRAFT);
      const drafted = await run(session, bookId, again);
      expect(drafted.resultSetRevision!.writing.draft).toEqual(DRAFT_WORDS);
      const revisionId = store.inspectWritingTask(bookId).types.find((type) => type.typeId === 'promotion-article')!.drafted!.revisionId;
      expect(store.createWritingDraft(bookId, revisionId).document.origin.drafted).toBe(true);
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const recorded = database.prepare('SELECT canonical_json, evaluation_record_id, baseline_revision_id FROM writing_tasks WHERE task_intent_id = ?')
          .get(again.taskIntent!.taskIntentId) as { canonical_json: string; evaluation_record_id: string | null; baseline_revision_id: string | null };
        const task = JSON.parse(recorded.canonical_json) as { exemplarSources: Array<{ documentId: string }>; input: { exemplars: Array<{ bookTitle: string }> } };
        expect(task.exemplarSources.map((source) => source.documentId)).toEqual([promotion.documentId]);
        expect(task.input.exemplars.map((exemplar) => exemplar.bookTitle)).toEqual(['范例来源书']);
        expect(recorded.evaluation_record_id).not.toBeNull();
        expect(recorded.baseline_revision_id).toBe(store.inspectBaselineAnalysis(bookId).resultSetRevision!.revisionId);
        // The ledgers are append-only.
        expect(() => database.exec('UPDATE writing_tasks SET recorded_at = recorded_at')).toThrowError(/readonly|WRITING_TASK_LEDGER_IMMUTABLE/u);
      } finally {
        database.close();
      }
    });
  }, 600_000);

  it('keeps its ledgers append-only and reads a tampered Task as damaged', async () => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, WRITING_FIXTURE_IDENTITY);
    let bookId = '';
    await withSession(fixture, async ({ store }) => {
      bookId = await sample1Book(store, WRITING_BOOK_TITLE);
      prepare(store, bookId);
    });
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const database = new DatabaseSync(path);
    try {
      expect(() => database.exec('UPDATE writing_tasks SET recorded_at = recorded_at')).toThrowError(/WRITING_TASK_LEDGER_IMMUTABLE/u);
      expect(() => database.exec('DELETE FROM writing_tasks')).toThrowError(/WRITING_TASK_LEDGER_IMMUTABLE/u);
      const row = database.prepare('SELECT task_intent_id, canonical_json FROM writing_tasks').get() as { task_intent_id: string; canonical_json: string };
      const tampered = row.canonical_json.replace('喜欢历史与悬疑小说的读者', '所有读者');
      database.exec('DROP TRIGGER writing_tasks_no_update');
      const { createHash } = await import('node:crypto');
      database.prepare('UPDATE writing_tasks SET canonical_json = ?, sha256 = ? WHERE task_intent_id = ?')
        .run(tampered, createHash('sha256').update(tampered).digest('hex'), row.task_intent_id);
      database.exec(WRITING_TASK_TRIGGER_SQL.writing_tasks_no_update!);
    } finally {
      database.close();
    }
    await withSession(fixture, async ({ store }) => {
      // The frozen words no longer give the contract the row names: the Task is unreadable, and the page says so.
      expect(store.inspectWritingTask(bookId).unavailable).toBe('写作任务暂不可用：写作任务记录已损坏。');
    });
  }, 300_000);

  it('rebuilds a revision-64 store\'s kind-coupled relations for the writing kind, every row kept byte for byte', async () => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, WRITING_FIXTURE_IDENTITY);
    await withSession(fixture, async ({ store }) => {
      const bookId = await sample1Book(store, WRITING_BOOK_TITLE);
      // A baseline Task, so the rebuilt relations carry rows.
      let progress = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
    });
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const rows = (database: DatabaseSync): string => JSON.stringify(KIND_COUPLED_ANALYSIS_RELATIONS.map((table) => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
    const plant = new DatabaseSync(path);
    let before: string;
    try {
      // Revision 64 exactly: the three relations as revision 64 left them, and no relation of revision 65.
      plant.exec(`DROP TABLE writing_drafts; DROP TABLE writing_tasks; PRAGMA user_version = ${EVALUATION_REWRITE_SCHEMA_VERSION};`);
      downgradeKindCoupledRelations(plant, ANALYSIS_LEDGER_REVISION_64_SQL);
      before = rows(plant);
      expect(() => plant.exec(`INSERT INTO analysis_result_sets(result_set_id, book_id, kind, created_at, canonical_json, sha256)
        VALUES ('${randomUUID()}', (SELECT book_id FROM books LIMIT 1), '${WRITING_KIND}', 'x', '{}', '${'a'.repeat(64)}')`)).toThrowError(/CHECK constraint failed/u);
    } finally {
      plant.close();
    }
    const migrated = await openStore(fixture);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const after = new DatabaseSync(path, { readOnly: true });
    try {
      expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(WRITING_TASK_SCHEMA_VERSION);
      expect(rows(after)).toBe(before!);
      for (const table of KIND_COUPLED_ANALYSIS_RELATIONS) {
        expect((after.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table) as { sql: string }).sql).toBe(ANALYSIS_LEDGER_SCHEMA_SQL[table]);
      }
      expect(Object.keys(WRITING_TASK_TRIGGER_SQL).every((name) => after.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'trigger' AND name = ?").get(name) !== undefined)).toBe(true);
    } finally {
      after.close();
    }
  }, 300_000);

  it('refuses a revision-64 store whose kind-coupled relations already read as revision 65\'s', async () => {
    const fixture = await loadModelFixture(FIXTURES_ROOT, WRITING_FIXTURE_IDENTITY);
    await withSession(fixture, async () => undefined);
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const plant = new DatabaseSync(path);
    try {
      plant.exec(`DROP TABLE writing_drafts; DROP TABLE writing_tasks; PRAGMA user_version = ${EVALUATION_REWRITE_SCHEMA_VERSION};`);
    } finally {
      plant.close();
    }
    const refused = await openStore(fixture).then((store) => {
      store.close();
      return 'opened';
    }, (error: unknown) => (error instanceof Error && 'code' in error ? `${String((error as { code: unknown }).code)}:${error.message}` : String(error)));
    expect(refused).toBe('SCHEMA_INVALID:分析任务账本表（修订版 64） analysis_task_intents 结构不兼容。');
  }, 300_000);
});
