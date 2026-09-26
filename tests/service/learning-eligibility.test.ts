import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/service/analysis/canonical.js';
import { LEARNING_ELIGIBILITY_BASIS, LEARNING_ELIGIBILITY_POLICY_BASIS, LEARNING_ELIGIBILITY_TRIGGER_SQL } from '../../src/service/learning-eligibility.js';
import { fileURLToPath } from 'node:url';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { decodeRequest } from '../../src/service/request-frames.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { TYPOS_AND_USAGE } from '../support/review-categories.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { DECISION_FEEDBACK_SCHEMA_VERSION, LEARNING_ELIGIBILITY_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { MAX_LEARNING_MATERIALS_PAGE } from '../../src/shared/protocol.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import type {
  CreateEditorialMarkInput,
  DecideLearningMaterialInput,
  GlobalAttentionItemProjection,
  LearningMaterialProjection,
  ManuscriptWindowProjection,
} from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for 质量与学习 › 学习准入 (Issue #61, plan slice S26b; V2-UX-LEARN-001 to LEARN-012, ATTN-009,
// FDBK-013) over the real store. The manuscript is composed from the one admitted SampleBook and no assertion prints its
// text: suggestions, reasons and notes are the suite's own words, and excerpts are compared by line prefix and count.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 40, title: '学习组稿' };

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-learning-eligibility-');
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { bookId: string; manuscriptId: string; branchId: string }

async function importBook(store: EditorialStore): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, 'learning.docx');
  await composeManuscriptDocx(selectedPath, EXCERPT);
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

/** Another Book, composed from other blocks of the same SampleBook, so its import is a work of its own. */
async function importBookOf(store: EditorialStore, name: string, startBlock: number, title: string): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, `${name}.docx`);
  await composeManuscriptDocx(selectedPath, { ...EXCERPT, startBlock, title });
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: title }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

function suggestion(book: Imported, window: ManuscriptWindowProjection, from: number, to: number, proposedText: string): CreateEditorialMarkInput {
  const block = window.blocks.find((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 60)!;
  return {
    manuscriptId: book.manuscriptId,
    branchId: book.branchId,
    windowStartBlockId: window.blocks[0]!.blockId,
    clientMarkId: randomUUID(),
    baseRevisionId: window.revisionId,
    expectedJournalSequence: window.journalSequence,
    blockId: block.blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: from,
    toGrapheme: to,
    selectedText: graphemesOf(block.text).slice(from, to).join(''),
    kind: 'change-suggestion',
    highlightColor: null,
    body: '',
    proposedText,
    rationale: '与全书用法统一。',
  };
}

function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

/** The Learning Material 待我处理 lists, as its group, state, Book, object, next step and target. */
function attention(store: EditorialStore): Array<[string, GlobalAttentionItemProjection['state'], string | null, unknown, string, unknown]> {
  return store.inspectGlobalAttention(() => null, false).groups.flatMap((group) => group.items
    .filter((item) => item.object.kind === 'learning-materials')
    .map((item) => [group.key, item.state, item.book.title, item.object, item.nextStep, item.target] as [string, GlobalAttentionItemProjection['state'], string | null, unknown, string, unknown]));
}

describe('学习准入 over the real store', () => {
  it('finds the material quietly, waits for the editor’s decision on each exact version, and decides again what changed', async () => {
    let book: Imported;
    let rejectedMark: string;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      book = await importBook(store);
      const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const binding = { manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId };
      const make = (from: number, to: number, text: string) => store.createEditorialMark(suggestion(book, window, from, to, text)).markId;
      const decide = (markId: string, disposition: 'rejected' | 'accepted-with-edit', editedText: string | null, reason: string | null) =>
        store.recordChangeSuggestionDecision({ ...binding, markId, clientDecisionId: randomUUID(), disposition, editedText, reason }).card!.suggestion!.decision!;
      store.updateBookPeople({ bookId: book.bookId, expectedVersion: 0, authors: ['周一'], editors: ['郑三'], related: [] });

      // Nothing yet: a Book with no feedback has no Learning Material, and 待我处理 lists nothing for it.
      expect(store.inspectLearningMaterials(null)).toEqual({ basis: LEARNING_ELIGIBILITY_BASIS, books: [], nextCursor: null });
      expect(attention(store)).toEqual([]);

      // A rejection with a reason and an acceptance in the editor's own wording are material; a rejection with no reason,
      // and one the editor said 不说明 about, are not.
      rejectedMark = make(2, 6, '示例替换一');
      const rejected = decide(rejectedMark, 'rejected', null, null);
      store.recordProposalDecisionReason({ ...binding, markId: rejectedMark, decisionId: rejected.decisionId, reason: '证据不足', reasonSource: 'suggested' });
      const editedMark = make(10, 14, '示例替换二');
      decide(editedMark, 'accepted-with-edit', '编辑自己的说法', null);
      decide(make(20, 24, '示例替换三'), 'rejected', null, null);
      const silent = make(30, 34, '示例替换四');
      const dismissedDecision = decide(silent, 'rejected', null, null);
      store.recordProposalDecisionFeedback({ ...binding, markId: silent, decisionId: dismissedDecision.decisionId, expectedFeedback: 0, action: 'dismiss', reason: null, reasonSource: null });

      const found = store.inspectLearningMaterials(null);
      expect(found.books.map((entry) => [entry.bookId, entry.authors, entry.editors, entry.materials.length])).toEqual([[book.bookId, ['周一'], ['郑三'], 2]]);
      const [reasoned, edited] = found.books[0]!.materials as [LearningMaterialProjection, LearningMaterialProjection];
      expect([reasoned.kind, reasoned.originLabel, reasoned.state, reasoned.decision, reasoned.decisions]).toEqual(['proposal-decision', '修改建议 · 拒绝', 'pending', null, 0]);
      expect(reasoned.excerpt.map((line) => line.split('：')[0])).toEqual(['原文', '建议', '你的原因']);
      expect(reasoned.excerpt.at(-1)).toBe('你的原因：证据不足');
      expect(reasoned.rationale).toBe('你说明了为什么这样处理：它可以帮 AI7 以后的建议更接近你的判断。');
      expect([edited.originLabel, edited.excerpt.map((line) => line.split('：')[0]), edited.rationale]).toEqual([
        '修改建议 · 修改后接受', ['原文', '建议', '你改为'], '你改写了建议的文字：这处改动可以帮 AI7 以后的建议更接近你的写法。',
      ]);
      expect(reasoned.digest).toMatch(/^[0-9a-f]{64}$/u);
      // One item for the Book in 等待你的决定, however many materials wait.
      expect(attention(store)).toEqual([['decisions', 'learning-materials-pending', '学习组稿', { kind: 'learning-materials', pending: 2, deferred: 0 },
        'decide-learning-materials', { kind: 'learning-materials', bookId: book.bookId }]]);

      const choose = (material: LearningMaterialProjection, input: Partial<DecideLearningMaterialInput>) => store.decideLearningMaterial({
        bookId: book.bookId, materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: material.decisions, choice: 'book', note: null, ...input,
      });
      // The exact version the editor read, the decisions they saw, a material that is one, and a note of the house's length.
      expect(refusal(() => choose(reasoned, { materialDigest: '0'.repeat(64) }))).toBe('LEARNING_MATERIAL_CHANGED:这条材料在你打开后改过；请看过现在的内容再定。');
      expect(refusal(() => choose(reasoned, { expectedDecisions: 1 }))).toBe('LEARNING_ELIGIBILITY_MOVED:这条材料的学习准入刚被改过；请看过现在的决定再定。');
      expect(refusal(() => choose(reasoned, { materialKey: `proposal-decision:${randomUUID()}` }))).toBe('LEARNING_MATERIAL_NOT_FOUND:这条材料已经不在学习准入之列。');
      expect(refusal(() => choose(reasoned, { note: '字'.repeat(501) }))).toBe('LEARNING_ELIGIBILITY_NOTE_TOO_LONG:补充说明要在 500 字以内。');

      // 仅纳入当前图书, with the editor's note: decided, and one fewer waits.
      const decided = choose(reasoned, { note: '  只在这本书里参考  ' });
      expect([decided.state, decided.decision?.choice, decided.decision?.note, decided.decisions]).toEqual(['decided', 'book', '只在这本书里参考', 1]);
      expect(refusal(() => choose(decided, { note: '只在这本书里参考' }))).toBe('LEARNING_ELIGIBILITY_UNCHANGED:学习准入没有变化。');
      // 稍后决定 keeps one unresolved material, neither eligible nor excluded, and the Book's item says so.
      const deferred = choose(edited, { choice: 'deferred' });
      expect([deferred.state, deferred.decision?.choice]).toEqual(['deferred', 'deferred']);
      expect(attention(store)).toEqual([['decisions', 'learning-materials-deferred', '学习组稿', { kind: 'learning-materials', pending: 0, deferred: 1 },
        'decide-learning-materials', { kind: 'learning-materials', bookId: book.bookId }]]);

      // The reason changed after the decision: the material is decided again; the decision it had stays on record.
      store.recordProposalDecisionFeedback({ ...binding, markId: rejectedMark, decisionId: rejected.decisionId, expectedFeedback: 0, action: 'revise', reason: '方向不合适', reasonSource: 'suggested' });
      const changed = store.inspectLearningMaterials(book.bookId).books[0]!.materials.find((entry) => entry.materialKey === reasoned.materialKey)!;
      expect([changed.state, changed.decision?.choice, changed.decisions, changed.digest === reasoned.digest, changed.excerpt.at(-1)]).toEqual(['changed', 'book', 1, false, '你的原因：方向不合适']);
      // A later reason never moves a material on the page (Issue #61 review): the order is the order the decisions were made in.
      expect(store.inspectLearningMaterials(book.bookId).books[0]!.materials.map((entry) => entry.materialKey)).toEqual([reasoned.materialKey, edited.materialKey]);
      expect(attention(store)[0]?.[1]).toBe('learning-materials-pending');
      expect(refusal(() => choose(decided, {}))).toBe('LEARNING_MATERIAL_CHANGED:这条材料在你打开后改过；请看过现在的内容再定。');
      const house = choose(changed, { choice: 'house' });
      expect([house.state, house.decision?.choice, house.decisions]).toEqual(['decided', 'house', 2]);
      const excluded = choose(deferred, { choice: 'excluded', note: '不代表我的一贯做法' });
      expect([excluded.state, excluded.decision?.choice]).toEqual(['decided', 'excluded']);
      expect(attention(store)).toEqual([]);
      let latestEligibility = house;
      for (let index = 0; index < 64; index += 1) {
        latestEligibility = choose(latestEligibility, { choice: index % 2 === 0 ? 'book' : 'house' });
      }
      expect(latestEligibility.decisions).toBe(66);
      expect(refusal(() => choose(house, { choice: 'book' }))).toBe('LEARNING_ELIGIBILITY_MOVED:这条材料的学习准入刚被改过；请看过现在的决定再定。');
      // Deciding changes nothing it came from: the decision and its reason read as they were.
      expect(store.getEditorialMarkCard(book.manuscriptId, book.branchId, rejectedMark).suggestion!.decision).toMatchObject({ disposition: 'rejected', reason: '方向不合适', reasonState: 'given' });
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // A restart keeps every decision; the ledger refuses to be rewritten, and a record rewritten by hand no longer reads.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(reopened.inspectLearningMaterials(book!.bookId).books[0]!.materials.map((entry) => [entry.state, entry.decision?.choice, entry.decisions])).toEqual([
        ['decided', 'house', 66], ['decided', 'excluded', 2],
      ]);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(LEARNING_ELIGIBILITY_SCHEMA_VERSION);
      const records = (database.prepare('SELECT canonical_json FROM learning_eligibility_decisions ORDER BY recorded_at').all() as Array<{ canonical_json: string }>)
        .map((row) => JSON.parse(row.canonical_json) as { attribution: unknown; basis: unknown; choice: string });
      expect(records).toHaveLength(68);
      expect(records.slice(0, 4).map((record) => record.choice)).toEqual(['book', 'deferred', 'house', 'excluded']);
      // Each names the policy it was made under by identity, mode and version, with its words (Issue #61 review).
      for (const record of records) {
        expect(record.basis).toEqual(LEARNING_ELIGIBILITY_POLICY_BASIS);
        expect(record.attribution).toEqual({ authors: ['周一'], editors: ['郑三'], peopleVersion: 1 });
      }
      expect(() => database.exec("UPDATE learning_eligibility_decisions SET choice = 'book'")).toThrowError(/LEARNING_ELIGIBILITY_LEDGER_IMMUTABLE/u);
      expect(() => database.exec('DELETE FROM learning_eligibility_decisions')).toThrowError(/LEARNING_ELIGIBILITY_LEDGER_IMMUTABLE/u);
    } finally {
      database.close();
    }
    // Rewritten by hand, a record no longer reads: first one that names a basis no policy version wrote, its digest made whole
    // to match (Issue #61 review), then, that one put back, one whose words changed under its digest.
    const rewrite = async (change: (database: DatabaseSync) => void): Promise<string> => {
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        database.exec('DROP TRIGGER learning_eligibility_decisions_no_update');
        change(database);
        database.exec(LEARNING_ELIGIBILITY_TRIGGER_SQL.learning_eligibility_decisions_no_update!);
      } finally {
        database.close();
      }
      const tampered = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
      try {
        const refused = refusal(() => tampered.inspectLearningMaterials(book!.bookId));
        tampered.markCleanShutdown();
        return refused;
      } finally {
        tampered.close();
      }
    };
    let planted: { decision_id: string; canonical_json: string; sha256: string } | undefined;
    expect(await rewrite((database) => {
      planted = database.prepare('SELECT decision_id, canonical_json, sha256 FROM learning_eligibility_decisions ORDER BY recorded_at LIMIT 1').get() as typeof planted;
      const unknownBasis = planted!.canonical_json.replace('"version":1}', '"version":2}');
      expect(unknownBasis).not.toBe(planted!.canonical_json);
      database.prepare('UPDATE learning_eligibility_decisions SET canonical_json = ?, sha256 = ? WHERE decision_id = ?').run(unknownBasis, sha256Hex(unknownBasis), planted!.decision_id);
    })).toBe('LEARNING_ELIGIBILITY_RECORD_INVALID:学习准入记录已损坏。');
    expect(await rewrite((database) => {
      database.prepare('UPDATE learning_eligibility_decisions SET canonical_json = ?, sha256 = ? WHERE decision_id = ?').run(planted!.canonical_json, planted!.sha256, planted!.decision_id);
      database.exec("UPDATE learning_eligibility_decisions SET canonical_json = replace(canonical_json, '不代表我的一贯做法', '改过')");
    })).toBe('LEARNING_ELIGIBILITY_RECORD_INVALID:学习准入记录已损坏。');
  }, 180_000);

  it('adds revision 50 to a revision-49 store with nothing else moved', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const plant = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      plant.exec(`DROP TABLE learning_eligibility_decisions; PRAGMA user_version = ${DECISION_FEEDBACK_SCHEMA_VERSION};`);
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
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(LEARNING_ELIGIBILITY_SCHEMA_VERSION);
      expect((database.prepare('SELECT count(*) count FROM learning_eligibility_decisions').get() as { count: number }).count).toBe(0);
    } finally {
      database.close();
    }
  }, 120_000);

  it("reads the house's material a page at a time, a Book that runs on continued, and a material by itself", async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // Two Books with more material between them than one page holds — titled 一 and 二, which code-point order keeps in that
      // order — each material a suggestion rejected with the editor's reason.
      const counts = [MAX_LEARNING_MATERIALS_PAGE - 10, 15];
      const books: Imported[] = [];
      for (const [index, count] of counts.entries()) {
        const book = await importBookOf(store, `分页组稿${index}`, 1 + index * 40, `分页之书${index === 0 ? '一' : '二'}`);
        books.push(book);
        const window = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
        const binding = { manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: window.blocks[0]!.blockId };
        for (let at = 0; at < count; at += 1) {
          const markId = store.createEditorialMark(suggestion(book, window, at, at + 1, `改${at}`)).markId;
          store.recordChangeSuggestionDecision({ ...binding, markId, clientDecisionId: randomUUID(), disposition: 'rejected', editedText: null, reason: `第 ${at} 处不必改` });
        }
      }
      const total = counts[0]! + counts[1]!;
      const first = store.inspectLearningMaterials(null);
      expect(first.books.map((book) => [book.bookId, book.materialCount, book.materials.length])).toEqual([
        [books[0]!.bookId, counts[0], counts[0]], [books[1]!.bookId, counts[1], MAX_LEARNING_MATERIALS_PAGE - counts[0]!],
      ]);
      expect(first.nextCursor).not.toBeNull();
      const second = store.inspectLearningMaterials(null, first.nextCursor);
      // The Book that ran on heads the next page again, with the rest of its material, and nothing after it.
      expect(second.books.map((book) => [book.bookId, book.materialCount, book.materials.length])).toEqual([[books[1]!.bookId, counts[1], total - MAX_LEARNING_MATERIALS_PAGE]]);
      expect(second.nextCursor).toBeNull();
      const keys = [...first.books, ...second.books].flatMap((book) => book.materials.map((material) => material.materialKey));
      expect(new Set(keys).size).toBe(total);
      // One Book's page, and a material by itself, as its card reads it.
      const own = store.inspectLearningMaterials(books[1]!.bookId);
      expect([own.books.length, own.books[0]!.materials.length, own.nextCursor]).toEqual([1, counts[1], null]);
      const one = own.books[0]!.materials[3]!;
      expect(store.inspectLearningMaterial(books[1]!.bookId, one.materialKey)).toEqual(one);
      expect(refusal(() => store.inspectLearningMaterial(books[0]!.bookId, one.materialKey))).toBe('LEARNING_MATERIAL_NOT_FOUND:这条材料已经不在学习准入之列。');
      expect(refusal(() => store.inspectLearningMaterials(null, { bookTitle: '分页之书一', bookId: books[0]!.bookId, orderedAt: 'yesterday', materialKey: one.materialKey })))
        .toBe('LEARNING_CURSOR_INVALID:学习准入列表位置无效。');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('decides a 审阅 finding the editor ignored with a reason, by its own rvf_ identity, through the frame as through the store', async () => {
    await requireExactSample1(roots.codeRoot);
    const launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
    const fixture = await loadModelFixture(resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url))), 'sample1-review-authored');
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
      induceUnprovableReconciliation: false,
      persistLegacyReviewedDraft: false,
      induceReimportProofTamper: false,
      induceAbandonObjectRemovalFailure: false,
      interruptAfterAbandonObjectRemoval: false,
      baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
    });
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
    const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
    try {
      const { bookId } = await importSample1Book(store, roots.codeRoot, 'L2 审阅学习');
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      let progress = store.createReviewRunPreparationWork(bookId, [TYPOS_AND_USAGE.categoryId], { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null }, launchPolicy);
      while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
      const run = progress.projection!.run!;
      store.authorizeReviewRun(bookId, run.reviewRunId, run.categories
        .filter((category) => category.planEnvelopeDigest !== null).map((category) => ({ categoryId: category.categoryId, planEnvelopeDigest: category.planEnvelopeDigest! })));
      await driver.drive(run.reviewRunId);
      const finding = store.inspectReviewWorkspace(bookId, run.reviewRunId).run!.findings[0]!;
      expect(finding.findingId).toMatch(/^rvf_/u);
      store.recordReviewFindingDisposition(bookId, run.reviewRunId, finding.findingId, '本书体例允许这种写法');
      const material = store.inspectLearningMaterials(bookId).books[0]!.materials.find((entry) => entry.kind === 'review-disposition')!;
      expect(material.materialKey).toBe(`review-disposition:${run.reviewRunId}/${finding.findingId}`);
      // The frame the page sends is accepted as it is, underscore and all (Issue #61 review), and the store records it.
      const input = { bookId, materialKey: material.materialKey, materialDigest: material.digest, expectedDecisions: 0, choice: 'excluded' as const, note: null };
      const request = { id: randomUUID(), op: 'decideLearningMaterial', input };
      expect(decodeRequest(new TextEncoder().encode(JSON.stringify(request)))).toEqual(request);
      const decided = store.decideLearningMaterial(input);
      expect([decided.materialKey, decided.state, decided.decision?.choice, decided.decisions]).toEqual([material.materialKey, 'decided', 'excluded', 1]);
      expect(store.inspectLearningMaterial(bookId, material.materialKey)).toEqual(decided);
      store.markCleanShutdown();
    } finally {
      const stopped = driver.dispose();
      await owner.dispose();
      await stopped;
      store.close();
    }
  }, 300_000);
});
