import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDocx, type ParsedDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';
import {
  IMPORT_FIDELITY_CATEGORIES_REVISION_26_SQL,
  importFidelityCategoriesShape,
} from '../../src/service/import-retention.js';
import { EditorialStore, SOURCE_VERSION_PARSER_CHANGED_MESSAGE, StoreError } from '../../src/service/store.js';
import { CLARIFICATION_SCHEMA_VERSION, SCHEDULED_BACKUP_SCHEMA_VERSION, PROPOSAL_CONFLICT_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import type { ManuscriptBlockProjection, TextBoxDisposition } from '../../src/shared/protocol.js';
import {
  ADMITTED_BASELINE_DOCX,
  composeManuscriptDocx,
  type ComposedManuscriptRequest,
} from '../support/composed-fixture.js';
import { IMPORT_RETENTION_RELATIONS_DROP_ORDER, SAMPLE1_V1_REPORT } from '../support/import-retention.js';
import { IMPORTED_MARK_RELATIONS_DROP_ORDER } from '../support/imported-marks.js';
import { EXPORT_LEDGER_RELATIONS_DROP_ORDER } from '../support/manuscript-export.js';
import { DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER } from '../support/default-execution-rules.js';
import { SAMPLE1_BLOCKS, importSample1Book, requireExactSample1, sample1Path } from '../support/sample1-baseline.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from '../support/clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from '../support/reimport-groups.js';
import { MIGRATION_EMPTY_RELATIONS, PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER } from '../support/production-documents.js';
import { RUN_CHECKPOINT_RELATIONS_DROP_ORDER } from '../support/run-continuation.js';

// Service-integration suite (L2) for import retention (Issue #410, plan slice S61; ADR 0086) over the real
// `EditorialStore` on a temporary Agent Data Root. Every manuscript is exact `sample1` or composed from it —
// its text boxes, fields and notes included — and no assertion reads manuscript text back: blocks are
// compared by digest, position and count.

type Row = Record<string, SQLOutputValue>;

let roots: ServiceTestRoots;

beforeEach(async () => {
  roots = await createServiceTestRoots();
});

afterEach(async () => {
  await roots.dispose();
});

/** Six blocks with a two-paragraph text box anchored at the second; the box's words are sample1's own. */
const TEXT_BOX_EXCERPT: ComposedManuscriptRequest = {
  source: ADMITTED_BASELINE_DOCX,
  startBlock: 1,
  blocks: 6,
  title: '文本框组稿',
  retention: { textBox: { anchorBlock: 2, sourceStartBlock: 7, blocks: 2 } },
};

function databasePath(): string {
  return join(roots.dataRoot, 'store', 'ai7.sqlite');
}

/**
 * Plant revision 26 exactly as a build before ADR 0086 left it, over a store holding one imported sample1 Book: its
 * review is the eight-row one the frozen builder rebuilds under parser identity /1, degraded and accepted as it had to
 * be, and `import_fidelity_categories` holds revision 26's text. Returns the planted rows.
 */
function plantRevision26(): Row[] {
  return withDatabase(false, (database) => {
    database.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;');
    const review = database.prepare('SELECT fidelity_review_id, source_version_id FROM manuscript_import_records').get() as Row;
    const reviewId = String(review.fidelity_review_id);
    database.prepare("UPDATE source_versions SET parser_identity = 'ai7-docx-fflate-saxes/1' WHERE source_version_id = ?").run(String(review.source_version_id));
    database.prepare("UPDATE source_provenance SET parser_identity = 'ai7-docx-fflate-saxes/1' WHERE source_version_id = ?").run(String(review.source_version_id));
    database.prepare('DELETE FROM import_fidelity_categories WHERE fidelity_review_id = ?').run(reviewId);
    for (const relation of [...PRODUCTION_DOCUMENT_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...IMPORTED_MARK_RELATIONS_DROP_ORDER, ...IMPORT_RETENTION_RELATIONS_DROP_ORDER]) database.exec(`DROP TABLE ${relation}`);
    database.exec('DROP TABLE import_fidelity_categories');
    database.exec(IMPORT_FIDELITY_CATEGORIES_REVISION_26_SQL);
    const insert = database.prepare(
      `INSERT INTO import_fidelity_categories(fidelity_review_id, category_key, display_label, item_count, status, detail, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    SAMPLE1_V1_REPORT.forEach((category, index) =>
      insert.run(reviewId, category.key, category.label, category.count, category.status, category.detail, index + 1));
    database.prepare("UPDATE import_fidelity_reviews SET outcome = 'degraded-import-no-round-trip' WHERE fidelity_review_id = ?").run(reviewId);
    const decisionId = randomUUID();
    database.prepare('INSERT INTO import_degradation_decisions(degradation_decision_id, fidelity_review_id, decision, created_at) VALUES (?, ?, ?, ?)')
      .run(decisionId, reviewId,
        '{"items":[{"categoryKey":"inline-styles","count":266,"label":"行内样式"},{"categoryKey":"sections","count":1,"label":"分节"}],' +
        '"schema":"ai7.import-degradation-decision/1","scope":"this-import-only","state":"accepted-complete-set"}',
        new Date().toISOString());
    database.prepare('UPDATE manuscript_import_records SET degradation_decision_id = ?').run(decisionId);
    database.exec(`PRAGMA user_version = ${PROPOSAL_CONFLICT_SCHEMA_VERSION}; COMMIT; PRAGMA foreign_keys = ON;`);
    expect(importFidelityCategoriesShape(database)).toBe('revision-26');
    return database.prepare('SELECT rowid, * FROM import_fidelity_categories ORDER BY rowid').all() as Row[];
  });
}

function withDatabase<T>(readOnly: boolean, body: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(databasePath(), { readOnly });
  try {
    return body(database);
  } finally {
    database.close();
  }
}

async function composed(request: ComposedManuscriptRequest): Promise<{ path: string; parsed: ParsedDocx; blocks: ParsedDocxBlock[] }> {
  const path = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeManuscriptDocx(path, request);
  const blocks: ParsedDocxBlock[] = [];
  const parsed = await parseDocx(path, 'composed.docx', (block) => blocks.push(block));
  return { path, parsed, blocks };
}

async function importComposed(
  store: EditorialStore,
  path: string,
  disposition?: TextBoxDisposition,
): Promise<{ bookId: string; manuscriptId: string; branchId: string; revisionId: string; textBoxDisposition: TextBoxDisposition | null }> {
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const target = { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value } as const;
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false, disposition);
  expect(review.reviewDigest).not.toBeNull();
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({
    draftId: staged.draftId,
    expectedDraftVersion: review.draftVersion,
    reviewDigest: review.reviewDigest!,
    commitId,
  });
  expect(await store.acknowledgeImportCompletion(commitId)).toEqual({ state: 'acknowledged' });
  return { ...commit, textBoxDisposition: review.textBoxDisposition };
}

/** Every block of the branch's working state, in order, read through the product's own window. */
function workingBlocks(store: EditorialStore, manuscriptId: string, branchId: string): ManuscriptBlockProjection[] {
  const blocks: ManuscriptBlockProjection[] = [];
  let cursor: string | null = null;
  do {
    const window = store.getManuscriptWindow(manuscriptId, branchId, cursor);
    for (const block of window.blocks) if (!blocks.some((known) => known.blockId === block.blockId)) blocks.push(block);
    cursor = window.nextCursor;
  } while (cursor !== null);
  return blocks;
}

function blockSources(revisionId: string): Row[] {
  return withDatabase(true, (database) => database.prepare(
    `SELECT s.block_id, v.position, v.digest, s.source_part, s.source_paragraph_index, s.box_ordinal,
            s.box_paragraph_ordinal, s.source_paragraph_digest
     FROM manuscript_block_sources s
     JOIN manuscript_block_versions v ON v.revision_id = s.revision_id AND v.block_id = s.block_id
     WHERE s.revision_id = ? ORDER BY v.position`,
  ).all(revisionId) as Row[]);
}

function textBoxChoices(): Row[] {
  return withDatabase(true, (database) => database.prepare('SELECT category_key, choice FROM import_fidelity_choices').all() as Row[]);
}

describe('import retention over the real store (ADR 0086)', () => {
  it('imports exact sample1 without a degradation decision and maps every block of r1 to its source paragraph', async () => {
    await requireExactSample1(roots.codeRoot);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let revisionId: string;
    try {
      const book = await importSample1Book(store, roots.codeRoot, '保留导入');
      revisionId = book.revisionId;
      const record = store.getBookOverview(book.bookId).records.find((item) => item.kind === 'import-record');
      expect(record?.kind === 'import-record' && record.degradationDecision).toBeNull();
      expect(record?.kind === 'import-record' && record.fidelityCategories.filter((category) => category.count > 0)
        .map((category) => [category.key, category.status, category.statusLabel])).toEqual([
        ['inline-styles', 'retained', '完整保留（随文件保留）'],
        ['sections', 'retained', '完整保留（随文件保留）'],
      ]);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const sources = blockSources(revisionId);
    expect(sources).toHaveLength(SAMPLE1_BLOCKS);
    expect(sources.every((row) => row.source_part === 'body' && row.box_ordinal === null && row.source_paragraph_digest === row.digest)).toBe(true);
    // Document order: each block names a later paragraph than the one before it.
    expect(sources.every((row, index) => index === 0 || Number(row.source_paragraph_index) > Number(sources[index - 1]!.source_paragraph_index))).toBe(true);
    // sample1 has no text box, so its review records no choice.
    expect(textBoxChoices()).toEqual([]);
  }, 120_000);

  it('keeps a text box with the file by default: r1 is the body alone and the review records 保留为文本框', async () => {
    const { path, blocks } = await composed(TEXT_BOX_EXCERPT);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let imported: Awaited<ReturnType<typeof importComposed>>;
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const row = staged.fidelity.find((category) => category.key === 'text-boxes')!;
      expect([row.count, row.status]).toEqual([1, 'retained']);
      expect(row.detail.startsWith('保留为文本框：')).toBe(true);
      await store.abandonImportDraft(staged.draftId, staged.draftVersion);
      imported = await importComposed(store, path);
      expect(imported.textBoxDisposition).toBe('retain');
      expect(workingBlocks(store, imported.manuscriptId, imported.branchId).map((block) => block.digest))
        .toEqual(blocks.map((block) => block.digest));
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect(textBoxChoices()).toEqual([{ category_key: 'text-boxes', choice: 'retain' }]);
    expect(blockSources(imported.revisionId).map((row) => row.source_part)).toEqual(Array(6).fill('body'));
  }, 120_000);

  it('merges a text box on request: its paragraphs follow the paragraph that anchors it, and survive a reopen', async () => {
    const { path, blocks, parsed } = await composed(TEXT_BOX_EXCERPT);
    const [box] = parsed.textBoxes;
    expect(box?.paragraphs).toHaveLength(2);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let imported: Awaited<ReturnType<typeof importComposed>>;
    const expectedOrder = [blocks[0]!.digest, blocks[1]!.digest, ...box!.paragraphs.map((paragraph) => paragraph.digest),
      ...blocks.slice(2).map((block) => block.digest)];
    try {
      imported = await importComposed(store, path, 'merge');
      expect(imported.textBoxDisposition).toBe('merge');
      expect(workingBlocks(store, imported.manuscriptId, imported.branchId).map((block) => block.digest)).toEqual(expectedOrder);
      const record = store.getBookOverview(imported.bookId).records.find((item) => item.kind === 'import-record');
      const row = record?.kind === 'import-record' ? record.fidelityCategories.find((category) => category.key === 'text-boxes') : undefined;
      expect(row?.detail.startsWith('并入正文：')).toBe(true);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect(textBoxChoices()).toEqual([{ category_key: 'text-boxes', choice: 'merge' }]);
    const sources = blockSources(imported.revisionId);
    expect(sources.map((row) => row.digest)).toEqual(expectedOrder);
    expect(sources.map((row) => [row.source_part, row.box_ordinal, row.box_paragraph_ordinal])).toEqual([
      ['body', null, null], ['body', null, null], ['text-box', 1, 1], ['text-box', 1, 2],
      ['body', null, null], ['body', null, null], ['body', null, null], ['body', null, null],
    ]);
    expect(sources.every((row, index) => index === 0 || Number(row.source_paragraph_index) > Number(sources[index - 1]!.source_paragraph_index))).toBe(true);

    // Every record reads back exactly after a reopen validates the whole store.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(workingBlocks(reopened, imported.manuscriptId, imported.branchId).map((block) => block.digest)).toEqual(expectedOrder);
      expect(reopened.getBookOverview(imported.bookId).book.bookId).toBe(imported.bookId);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('refuses to merge a file that has no text box', async () => {
    const { path } = await composed({ source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 4, title: '无文本框组稿' });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      expect(() => store.prepareNewBookReview(staged.draftId, staged.draftVersion,
        { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '无文本框组稿' }, false, 'merge'))
        .toThrow(expect.objectContaining({ code: 'TEXT_BOX_CHOICE_INVALID' }));
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('asks for the degradation decision for a field and a note, and records it with the review', async () => {
    const { path } = await composed({
      source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 5, title: '降级组稿',
      retention: { field: { block: 1 }, footnote: { block: 3, noteSourceBlock: 9 } },
    });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const target = { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '降级组稿' } as const;
      const pending = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false);
      expect(pending.reviewDigest).toBeNull();
      expect(pending.degradationDecision).toEqual({
        state: 'required-unselected',
        items: [
          { categoryKey: 'notes', label: '脚注与尾注', count: 1 },
          { categoryKey: 'fields', label: '域（目录等）', count: 1 },
        ],
      });
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, true);
      expect(review.degradationDecision.state).toBe('accepted-complete-set');
      const commitId = randomUUID();
      const commit = await store.commitNewBookImport({
        draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId,
      });
      const record = store.getBookOverview(commit.bookId).records.find((item) => item.kind === 'import-record');
      expect(record?.kind === 'import-record' && record.degradationDecision?.acceptedItems.map((item) => item.categoryKey))
        .toEqual(['notes', 'fields']);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('keeps a merge chosen on a review that must first accept its degradation', async () => {
    const { path, blocks } = await composed({
      ...TEXT_BOX_EXCERPT, title: '文本框与域组稿',
      retention: { ...TEXT_BOX_EXCERPT.retention, field: { block: 1 } },
    });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await store.stageSelectedManuscript(randomUUID(), path);
      const target = { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '文本框与域组稿' } as const;
      const pending = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, false, 'merge');
      // The unaccepted review already states the choice, so the renderer can repeat it with the acceptance.
      expect([pending.reviewDigest, pending.degradationDecision.state, pending.textBoxDisposition]).toEqual([null, 'required-unselected', 'merge']);
      const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, target, true, pending.textBoxDisposition!);
      expect([review.degradationDecision.state, review.textBoxDisposition]).toEqual(['accepted-complete-set', 'merge']);
      const commit = await store.commitNewBookImport({
        draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId: randomUUID(),
      });
      expect(workingBlocks(store, commit.manuscriptId, commit.branchId)).toHaveLength(blocks.length + 2);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    expect(textBoxChoices()).toEqual([{ category_key: 'text-boxes', choice: 'merge' }]);
  }, 120_000);

  it('maps every block of a reimported revision to the paragraph of the file it came from', async () => {
    const first = await composed({ source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 6, title: '重新导入组稿' });
    const second = await composed({ ...TEXT_BOX_EXCERPT, blocks: 7, title: '重新导入组稿' });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let resultingRevisionId: string | null;
    try {
      const book = await importComposed(store, first.path);
      const staged = await store.stageSelectedManuscript(randomUUID(), second.path);
      const started = store.createManuscriptReimportPreparationWork(staged.draftId, staged.draftVersion, {
        kind: 'existing-book', bookId: book.bookId, relationship: 'reimport', lineage: { kind: 'unconfirmed' }, reuseSourceVersionId: null,
      });
      let prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
      while (!prepared.done) prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
      let review = prepared.review!;
      // The one appended block is a row the editor resolves (Issue #412: 改写与新增, the one verb it admits); nothing is preselected.
      const unresolved: string[] = [];
      let cursor: number | null = null;
      do {
        const page = store.getReimportMappingPage(review.draftId, review.draftVersion, cursor);
        unresolved.push(...page.items.filter((item) => item.verb === null).map((item) => item.groupId));
        expect(page.items.map((item) => item.verbs)).toEqual(page.items.map(() => ['rewrite']));
        cursor = page.nextCursor;
      } while (cursor !== null);
      expect(unresolved).toHaveLength(1);
      for (const groupId of unresolved) {
        const resolution = store.createReimportResolutionWork(review.draftId, review.draftVersion, groupId, 'rewrite');
        let progress = store.advanceReimportResolutionWork(resolution.workId);
        while (!progress.done) progress = store.advanceReimportResolutionWork(resolution.workId);
        review = progress.review!;
      }
      expect(review.commitReady).toBe(true);
      // A reimport offers no text-box choice: the new file's box stays with it.
      expect(review.fidelity.find((category) => category.key === 'text-boxes')?.detail.startsWith('保留为文本框：')).toBe(true);
      const commit = await store.createManuscriptReimportCommitWork({
        draftId: review.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId: randomUUID(),
      });
      let result = commit.result;
      while (result === null) {
        // The commit re-reads the file in the background: give its I/O a turn between steps.
        await new Promise((resolve) => setTimeout(resolve, 5));
        const progress = await store.advanceManuscriptReimportCommitWork(commit.workId!);
        result = progress.result;
      }
      expect(result.resultKind).toBe('changed');
      resultingRevisionId = result.resultingRevisionId;
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    const sources = blockSources(resultingRevisionId!);
    expect(sources.map((row) => row.digest)).toEqual(second.blocks.map((block) => block.digest));
    expect(sources.map((row) => Number(row.source_paragraph_index))).toEqual(second.blocks.map((block) => block.sourceParagraphIndex));
    expect(textBoxChoices()).toEqual([{ category_key: 'text-boxes', choice: 'retain' }]);
  }, 180_000);
});

describe('the startup validation J-01 proves (Issue #584)', () => {
  it('refuses a store whose reimport proof the tamper control altered, as the validator and not as the control', async () => {
    const first = await composed({ source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 6, title: '篡改证明组稿' });
    const second = await composed({ source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 7, title: '篡改证明组稿' });
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importComposed(store, first.path);
      const staged = await store.stageSelectedManuscript(randomUUID(), second.path);
      const started = store.createManuscriptReimportPreparationWork(staged.draftId, staged.draftVersion, {
        kind: 'existing-book', bookId: book.bookId, relationship: 'reimport', lineage: { kind: 'unconfirmed' }, reuseSourceVersionId: null,
      });
      let prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
      while (!prepared.done) prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
      let review = prepared.review!;
      let cursor: number | null = null;
      do {
        const page = store.getReimportMappingPage(review.draftId, review.draftVersion, cursor);
        for (const item of page.items.filter((entry) => entry.verb === null)) {
          const resolution = store.createReimportResolutionWork(review.draftId, review.draftVersion, item.groupId, 'rewrite');
          let progress = store.advanceReimportResolutionWork(resolution.workId);
          while (!progress.done) progress = store.advanceReimportResolutionWork(resolution.workId);
          review = progress.review!;
        }
        cursor = page.nextCursor;
      } while (cursor !== null);
      const commit = await store.createManuscriptReimportCommitWork({
        draftId: review.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest, commitId: randomUUID(),
      });
      let result = commit.result;
      while (result === null) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        result = (await store.advanceManuscriptReimportCommitWork(commit.workId!)).result;
      }
      expect(result.resultKind).toBe('changed');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // The control alters one mapping that has staged text, and the store is then refused by what validates it — never by
    // the control's own E2E_CONTROL_INVALID, nor by a statement that could not be prepared.
    const opened = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
      induceUnprovableReconciliation: false,
      persistLegacyReviewedDraft: false,
      induceReimportProofTamper: true,
      induceAbandonObjectRemovalFailure: false,
      interruptAfterAbandonObjectRemoval: false,
      baselineAnalysisRoute: null,
    }).then((store) => {
      store.close();
      return null;
    }, (error: unknown) => error);
    expect([opened instanceof Error ? opened.name : typeof opened, (opened as { code?: unknown } | null)?.code, opened instanceof Error ? opened.message : null])
      .toEqual(['BoundedStoreError', 'SCHEMA_INVALID', '稿件重新导入块摘要无效。']);
  }, 180_000);
});

describe('schema revision 27 over the real store', () => {
  it('migrates a revision-26 store holding a legacy eight-row review, with every fidelity row byte for byte', async () => {
    await requireExactSample1(roots.codeRoot);
    let bookId: string;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      bookId = (await importSample1Book(store, roots.codeRoot, '修订版 27 迁移')).bookId;
      store.markCleanShutdown();
    } finally {
      store.close();
    }

    // Plant revision 26 exactly as a build before ADR 0086 left it: the review is the eight-row one the
    // frozen builder rebuilds under parser identity /1, degraded and accepted as it had to be, and
    // `import_fidelity_categories` holds revision 26's text.
    const before = plantRevision26();
    expect(before).toHaveLength(8);

    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      // The legacy review reads back under the identity it was recorded with: eight rows, degraded, accepted.
      const record = migrated.getBookOverview(bookId).records.find((item) => item.kind === 'import-record');
      expect(record?.kind === 'import-record' && record.fidelityCategories).toEqual(SAMPLE1_V1_REPORT);
      expect(record?.kind === 'import-record' && record.degradationDecision?.acceptedItems.map((item) => item.categoryKey))
        .toEqual(['inline-styles', 'sections']);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(SCHEDULED_BACKUP_SCHEMA_VERSION);
      expect(importFidelityCategoriesShape(database)).toBe('current');
      expect(database.prepare('SELECT rowid, * FROM import_fidelity_categories ORDER BY rowid').all()).toEqual(before);
      for (const relation of [...IMPORT_RETENTION_RELATIONS_DROP_ORDER, ...IMPORTED_MARK_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...MIGRATION_EMPTY_RELATIONS, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER]) {
        expect(database.prepare(`SELECT count(*) total FROM ${relation}`).get()).toEqual({ total: 0 });
      }
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
  }, 180_000);

  it('names the parser change when a Book an earlier parser read takes its unchanged file again, at the choice (Issue #532)', async () => {
    await requireExactSample1(roots.codeRoot);
    let bookId: string;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      bookId = (await importSample1Book(store, roots.codeRoot, '旧读取方式')).bookId;
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    plantRevision26();
    const sourceVersionId = withDatabase(true, (database) =>
      String((database.prepare('SELECT source_version_id FROM source_versions').get() as Row).source_version_id));
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const refused = (operation: () => unknown): [string, string] | null => {
        try {
          operation();
        } catch (error) {
          if (error instanceof StoreError) return [error.code, error.message];
          throw error;
        }
        return null;
      };
      // The unchanged file, staged under this build's parser: the Book holds its exact Source Version, read under /1. Taken
      // again as a reimport, the choice itself says why not, before any review is prepared.
      const again = await migrated.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
      expect(refused(() => {
        const started = migrated.createManuscriptReimportPreparationWork(again.draftId, again.draftVersion, {
          kind: 'existing-book', bookId, relationship: 'reimport', lineage: { kind: 'unconfirmed' }, reuseSourceVersionId: sourceVersionId,
        });
        let progress = migrated.advanceManuscriptReimportPreparationWork(started.workId);
        while (!progress.done) progress = migrated.advanceManuscriptReimportPreparationWork(started.workId);
      })).toEqual(['SOURCE_VERSION_PARSER_CHANGED', SOURCE_VERSION_PARSER_CHANGED_MESSAGE]);
      // As source material for the Book, the same.
      const asSource = await migrated.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
      expect(refused(() => migrated.prepareSourceImportReview(asSource.draftId, asSource.draftVersion, {
        kind: 'existing-book', bookId, relationship: 'source-only', reuseSourceVersionId: sourceVersionId,
      }))).toEqual(['SOURCE_VERSION_PARSER_CHANGED', SOURCE_VERSION_PARSER_CHANGED_MESSAGE]);
      // The way on the words name: the file comes in as a new Book.
      const renewed = await importSample1Book(migrated, roots.codeRoot, '重新导入为新书');
      expect(renewed.bookId).not.toBe(bookId);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
  }, 180_000);

  it('does not bring back ready a reimport review over a Source Version an earlier parser read, and says why when it is prepared again (Issue #580)', async () => {
    await requireExactSample1(roots.codeRoot);
    let draftId: string;
    let draftVersion: number;
    let bookId: string;
    let sourceVersionId: string;
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      bookId = (await importSample1Book(store, roots.codeRoot, '旧读取方式')).bookId;
      sourceVersionId = withDatabase(true, (database) => String((database.prepare('SELECT source_version_id FROM source_versions').get() as Row).source_version_id));
      // The unchanged file taken again as a reimport that reuses its exact Source Version: a review ready under this parser.
      const again = await store.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
      const started = store.createManuscriptReimportPreparationWork(again.draftId, again.draftVersion, {
        kind: 'existing-book', bookId, relationship: 'reimport', lineage: { kind: 'unconfirmed' }, reuseSourceVersionId: sourceVersionId,
      });
      let prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
      while (!prepared.done) prepared = store.advanceManuscriptReimportPreparationWork(started.workId);
      draftId = prepared.review!.draftId;
      draftVersion = prepared.review!.draftVersion;
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // The Source Version as an earlier parser left it. sample1 has no comments or revisions, so its /2 and /3 reports are one.
    withDatabase(false, (database) => {
      database.prepare("UPDATE source_versions SET parser_identity = 'ai7-docx-fflate-saxes/2' WHERE source_version_id = ?").run(sourceVersionId);
      database.prepare("UPDATE source_provenance SET parser_identity = 'ai7-docx-fflate-saxes/2' WHERE source_version_id = ?").run(sourceVersionId);
    });
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const continued = await reopened.continueImportDraft(draftId!, draftVersion!);
      expect(continued.state === 'target-review-required' && continued.reviewInvalidated).toBe(true);
      const staged = continued.state === 'target-review-required' ? continued.staged : null;
      const refused = ((): [string, string] | null => {
        try {
          const started = reopened.createManuscriptReimportPreparationWork(staged!.draftId, staged!.draftVersion, {
            kind: 'existing-book', bookId: bookId!, relationship: 'reimport', lineage: { kind: 'unconfirmed' }, reuseSourceVersionId: sourceVersionId!,
          });
          let progress = reopened.advanceManuscriptReimportPreparationWork(started.workId);
          while (!progress.done) progress = reopened.advanceManuscriptReimportPreparationWork(started.workId);
        } catch (error) {
          if (error instanceof StoreError) return [error.code, error.message];
          throw error;
        }
        return null;
      })();
      expect(refused).toEqual(['SOURCE_VERSION_PARSER_CHANGED', SOURCE_VERSION_PARSER_CHANGED_MESSAGE]);
      expect(SOURCE_VERSION_PARSER_CHANGED_MESSAGE.endsWith('可以把它作为新建图书导入。')).toBe(true);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 180_000);

  it('finds a Book an earlier parser read by its content when the same content comes in another file (Issue #532)', async () => {
    await requireExactSample1(roots.codeRoot);
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importSample1Book(store, roots.codeRoot, '旧读取方式');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    plantRevision26();
    const [sourceVersionId, sourceDigest] = withDatabase(true, (database) => {
      const row = database.prepare('SELECT source_version_id, source_digest FROM source_versions').get() as Row;
      return [String(row.source_version_id), String(row.source_digest)];
    });
    // sample1's own parts in another container: other bytes, the same body, so the same content and structure.
    const twin = join(roots.inputRoot, 'sample1-另存.docx');
    writeFileSync(twin, zipSync(unzipSync(readFileSync(sample1Path(roots.codeRoot))), { mtime: fixedArchiveTime() }));
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const staged = await migrated.stageSelectedManuscript(randomUUID(), twin);
      expect(staged.source.sourceSha256).not.toBe(sourceDigest);
      // Read under /1 and under this build's parser, the content and structure agree: the Book is found.
      expect(staged.identityFindings.map((finding) => [finding.sourceVersionId, finding.identityClass])).toEqual([
        [sourceVersionId, { kind: 'parsed-content-structure', label: '发现相同内容' }],
      ]);
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
  }, 180_000);
});
