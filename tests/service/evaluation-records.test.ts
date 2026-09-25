import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_EVALUATION_PROFILE, EVALUATION_RECORD_TRIGGER_SQL, emptyEvaluationContent } from '../../src/service/evaluation-records.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { SCHEDULED_BACKUP_SCHEMA_VERSION, LIBRARY_MATERIAL_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import type { EvaluationContent, EvaluationWorkspaceProjection } from '../../src/shared/protocol.js';
import { importSample1Book, requireExactSample1 } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for ②C 评估 (Issue #429, plan slice S81a; editor-surfaces §5, V2-UX-EVAL-001 to EVAL-005,
// EVAL-007, EVAL-012) over the real store on a temporary Agent Data Root, exact `sample1` imported through the supported path.
// A version binds the manuscript's current revision and snapshots the profile; each save appends the editor's whole content;
// 定稿 closes the version; 重新评估 begins the next from it and compares the two item by item. The scores and words are the
// suite's own; nothing of the manuscript is read or printed.

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-evaluation-');
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

/** Content of the built-in profile's shape: scores for the five items in order (a string is `不评` with that reason). */
function scored(scores: ReadonlyArray<number | string | null>, overrides: Partial<EvaluationContent> = {}): EvaluationContent {
  const empty = emptyEvaluationContent(BUILTIN_EVALUATION_PROFILE);
  return {
    ...empty,
    items: empty.items.map((item, index) => {
      const score = scores[index] ?? null;
      return typeof score === 'string' ? { ...item, notRated: score } : { ...item, score, comment: score === null ? null : `第 ${index + 1} 项的评语。` };
    }),
    ...overrides,
  };
}

const RISKS = (legal: 'low' | 'medium' | 'high', reviewed = false): EvaluationContent['risks'] => [
  { riskId: 'facts-and-sources', level: 'low', statement: null, reviewed: false },
  { riskId: 'law-rights-ethics-policy', level: legal, statement: '书中写到真实人物，需要法务看过。', reviewed },
];

describe('②C 评估 over the real store', () => {
  it('binds a version to the revision, scores it as the editor writes it, closes it at 定稿, and compares the next with it', async () => {
    await requireExactSample1(roots.codeRoot);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // A Book without a manuscript has nothing to evaluate.
      const creation = store.prepareBookCreation('评估空书', null);
      const empty = store.commitBookCreation({ ...creation.proposed, reviewDigest: creation.reviewDigest }).overview.book.bookId;
      expect(store.inspectEvaluation(empty, null)).toMatchObject({
        manuscript: null, records: [], record: null, start: { allowed: false, reason: '这本书还没有稿件，没有可以评估的内容。' },
      });
      expect(await refusal(() => store.startEvaluation(empty))).toBe('EVALUATION_NO_MANUSCRIPT:这本书还没有稿件，没有可以评估的内容。');

      const book = await importSample1Book(store, roots.codeRoot, '评估之书');
      const before = store.inspectEvaluation(book.bookId, null);
      expect([before.bookTitle, before.manuscript, before.records, before.record, before.start]).toEqual([
        '评估之书', { revisionId: book.revisionId, revisionLabel: 'r1', uncheckpointed: false }, [], null, { allowed: true, kind: 'first' },
      ]);
      // The profile: five items of 20 each, the bands, two risks, four conclusions — and nothing named a weight.
      expect(before.profile.items.map((item) => [item.label, item.fullMarks])).toEqual([
        ['文学品质与作者声音', 20], ['主题、价值与社会文化语境', 20], ['结构、叙事逻辑与连贯', 20], ['中文语言与表达', 20], ['读者与市场潜力', 20],
      ]);
      expect(JSON.stringify(before.profile)).not.toMatch(/weight|权重|%/u);

      // 开始评估: version 1 on r1, empty, being scored by the editor.
      const first = store.startEvaluation(book.bookId).record!;
      expect(first).toMatchObject({
        ordinal: 1, state: 'editing', revisionId: book.revisionId, revisionLabel: 'r1', uncheckpointed: false, entries: 1, finalized: null,
        total: { score: 0, fullMarks: 100, notRated: 0, unscored: 5 }, conclusion: null, recommendationBlocked: false, comparison: null,
      });
      expect(first.content).toEqual(emptyEvaluationContent(BUILTIN_EVALUATION_PROFILE));
      expect(await refusal(() => store.startEvaluation(book.bookId))).toBe('EVALUATION_OPEN:第 1 版还没有定稿；定稿后才能重新评估。');

      const save = (expectedEntries: number, content: EvaluationContent, finalize = false): EvaluationWorkspaceProjection =>
        store.saveEvaluation({ bookId: book.bookId, recordId: first.recordId, expectedEntries, content, finalize });
      // The scale: whole or half points within 满分; 不评 only with its reason.
      expect(await refusal(() => save(1, scored([20.5])))).toBe('EVALUATION_SCORE_INVALID:「文学品质与作者声音」的得分要在 0 到 20 之间，可以有半分。');
      expect(await refusal(() => save(1, scored([7.25])))).toBe('EVALUATION_SCORE_INVALID:「文学品质与作者声音」的得分要在 0 到 20 之间，可以有半分。');
      expect(await refusal(() => save(1, scored([null, null, null, null, '   '])))).toBe('EVALUATION_NOT_RATED_REASON:「读者与市场潜力」不评时要写明理由。');
      // 推荐出版 waits while a 高 risk is unreviewed.
      expect(await refusal(() => save(1, scored([18, 16.5, 15, 17, '市场资料不足'], { risks: RISKS('high'), conclusion: 'recommend' }))))
        .toBe('EVALUATION_RECOMMEND_BLOCKED:有「高」风险还没有经人工复核，不能选「推荐出版」。');

      // 保存评估: 66.5 out of the 80 still rated, one item 不评; the conclusion the editor chose.
      const saved = save(1, scored([18, 16.5, 15, 17, '市场资料不足'], {
        risks: RISKS('high'), readiness: ['第三章结尾需要重写', ''], strengths: ['人物鲜明'], weaknesses: ['节奏偏慢'], verdict: '整体可用，需修改。', conclusion: 'revise',
      })).record!;
      expect(saved).toMatchObject({ state: 'editing', entries: 2, total: { score: 66.5, fullMarks: 80, notRated: 1, unscored: 0 }, conclusion: 'revise', recommendationBlocked: true });
      expect(saved.content.readiness).toEqual(['第三章结尾需要重写']);
      expect(await refusal(() => save(2, saved.content))).toBe('EVALUATION_UNCHANGED:评估没有变化。');
      expect(await refusal(() => save(1, scored([18])))).toBe('EVALUATION_MOVED:这一版评估刚在另一个窗口保存过；请看过最新的再改。');
      // A version belongs to its Book.
      expect(await refusal(() => store.saveEvaluation({ bookId: empty, recordId: first.recordId, expectedEntries: 2, content: saved.content, finalize: false })))
        .toBe('EVALUATION_NOT_FOUND:这个评估版本不属于当前图书。');

      // 定稿 asks for every item, every risk, the statements of 中 and 高, and a conclusion.
      expect(await refusal(() => save(2, scored([18, 16.5, 15, 17, null], { risks: RISKS('high'), conclusion: 'revise' }), true)))
        .toBe('EVALUATION_ITEM_UNSCORED:定稿前，「读者与市场潜力」要打分或写明不评的理由。');
      expect(await refusal(() => save(2, scored([18, 16.5, 15, 17, 12], { conclusion: 'revise' }), true)))
        .toBe('EVALUATION_RISK_UNRATED:定稿前，要给「事实与来源」定风险等级。');
      expect(await refusal(() => save(2, scored([18, 16.5, 15, 17, 12], {
        risks: [{ riskId: 'facts-and-sources', level: 'medium', statement: null, reviewed: false }, RISKS('low')[1]!], conclusion: 'revise',
      }), true))).toBe('EVALUATION_RISK_STATEMENT:「事实与来源」为中或高时，要写明风险说明。');
      expect(await refusal(() => save(2, scored([18, 16.5, 15, 17, 12], { risks: RISKS('low') }), true))).toBe('EVALUATION_CONCLUSION_REQUIRED:定稿前要选定结论。');

      // Reviewed by a person, 推荐出版 is open; 定稿 closes the version with the actor and the time.
      const finalized = save(2, { ...saved.content, risks: RISKS('high', true), conclusion: 'recommend' }, true).record!;
      expect(finalized).toMatchObject({ state: 'finalized', entries: 3, conclusion: 'recommend', recommendationBlocked: false, finalized: { actor: '本机编辑' } });
      expect(finalized.finalizedAt).toBe(finalized.finalized!.at);
      expect(await refusal(() => save(3, saved.content))).toBe('EVALUATION_FINALIZED:第 1 版已经定稿，不能再改；要改就重新评估。');
      expect(await refusal(() => save(3, { ...saved.content, risks: RISKS('high', true), conclusion: 'reject' }, true)))
        .toBe('EVALUATION_FINALIZED:第 1 版已经定稿，不能再改；要改就重新评估。');

      // The manuscript moves on in its journal; 重新评估 binds the same revision, says so, and starts from 定稿's content.
      const working = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
      const block = working.blocks.find((candidate) => candidate.kind === 'paragraph')!;
      store.flushJournalEdit({
        clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: working.revisionId, blockId: block.blockId,
        windowStartBlockId: working.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: working.journalSequence,
        fromGrapheme: 0, toGrapheme: 0, insertText: '〔评估后改动〕',
      });
      const again = store.startEvaluation(book.bookId);
      const second = again.record!;
      expect(second).toMatchObject({ ordinal: 2, state: 'editing', revisionLabel: 'r1', uncheckpointed: true, entries: 1, conclusion: 'recommend' });
      expect(second.content.items).toEqual(finalized.content.items);
      expect(second.comparison).toMatchObject({ previousOrdinal: 1, conclusion: { previous: 'recommend', current: 'recommend' } });
      const changed = store.saveEvaluation({
        bookId: book.bookId, recordId: second.recordId, expectedEntries: 1, finalize: false,
        content: { ...second.content, items: second.content.items.map((item, index) => (index === 0 ? { ...item, score: 19 } : index === 4 ? { ...item, score: 14, notRated: null } : item)) },
      }).record!;
      expect(changed.comparison!.items.map((item) => [item.itemId, item.previous, item.current])).toEqual([
        ['literary-quality', 18, 19], ['theme-and-context', 16.5, 16.5], ['structure-and-coherence', 15, 15], ['chinese-language', 17, 17],
        ['readers-and-market', 'not-rated', 14],
      ]);
      expect(changed.comparison!.total).toEqual({ previous: { score: 66.5, fullMarks: 80, notRated: 1, unscored: 0 }, current: { score: 81.5, fullMarks: 100, notRated: 0, unscored: 0 } });
      // Versions newest first; the older one still opens as it was 定稿.
      const workspace = store.inspectEvaluation(book.bookId, null);
      expect(workspace.records.map((record) => [record.ordinal, record.state])).toEqual([[2, 'editing'], [1, 'finalized']]);
      expect(workspace.start).toEqual({ allowed: false, reason: '第 2 版还没有定稿；定稿后才能重新评估。' });
      expect(store.inspectEvaluation(book.bookId, first.recordId).record).toMatchObject({ ordinal: 1, state: 'finalized', conclusion: 'recommend' });
      expect(await refusal(() => store.inspectEvaluation(book.bookId, randomUUID()))).toBe('EVALUATION_NOT_FOUND:没有这个评估版本。');
      // 知识库 › 评估方案 counts its use.
      expect(store.inspectEvaluationProfiles().profiles.map((profile) => [profile.title, profile.version, profile.issuer, profile.records, profile.books]))
        .toEqual([['审稿评估方案', '1', 'AI7 内置默认', 2, 1]]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(SCHEDULED_BACKUP_SCHEMA_VERSION);
      for (const table of ['evaluation_records', 'evaluation_record_entries']) {
        expect(() => database.exec(`UPDATE ${table} SET canonical_json = canonical_json`)).toThrowError(/EVALUATION_LEDGER_IMMUTABLE/u);
        expect(() => database.exec(`DELETE FROM ${table}`)).toThrowError(/EVALUATION_LEDGER_IMMUTABLE/u);
      }
      // Rewritten by hand behind the triggers' back, a save no longer reads, and the page says so rather than guess.
      database.exec('DROP TRIGGER evaluation_record_entries_no_update');
      database.exec(`UPDATE evaluation_record_entries SET canonical_json = replace(canonical_json, '人物鲜明', '改过') WHERE ordinal = 2`);
      database.exec(EVALUATION_RECORD_TRIGGER_SQL.evaluation_record_entries_no_update!);
    } finally {
      database.close();
    }
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const books = reopened.listBooks(null).items;
      const bookId = books.find((entry) => entry.title === '评估之书')!.bookId;
      expect(await refusal(() => reopened.inspectEvaluation(bookId, null))).toBe('EVALUATION_RECORD_INVALID:评估记录已损坏。');
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 300_000);

  it('adds revision 47 to a revision-46 store with nothing else moved', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const plant = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      plant.exec(`DROP TABLE scheduled_backup_removals; DROP TABLE scheduled_backups; DROP TABLE backup_preferences; DROP TABLE database_export_receipts; DROP TABLE database_export_approvals; DROP TABLE database_export_preparations; DROP TABLE store_versions; DROP TABLE series_knowledge_promotions; DROP TABLE series_knowledge_revisions; DROP TABLE series_knowledge_candidates; DROP TABLE series_knowledge_items; DROP TABLE series_membership_changes; DROP TABLE series; DROP TABLE evaluation_preferences; DROP TABLE publication_actuals; DROP TABLE learning_eligibility_decisions; DROP TABLE proposal_decision_feedback; DROP TABLE analysis_feedback_signals; DROP TABLE evaluation_record_entries; DROP TABLE evaluation_records; PRAGMA user_version = ${LIBRARY_MATERIAL_SCHEMA_VERSION};`);
    } finally {
      plant.close();
    }
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(migrated.inspectEvaluationProfiles().profiles.map((profile) => [profile.records, profile.books])).toEqual([[0, 0]]);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(SCHEDULED_BACKUP_SCHEMA_VERSION);
      expect((database.prepare('SELECT count(*) count FROM evaluation_records').get() as { count: number }).count).toBe(0);
    } finally {
      database.close();
    }
  }, 120_000);
});
