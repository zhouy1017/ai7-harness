import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalRecord } from '../../src/service/analysis/canonical.js';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { EDITOR_AUTHOR_LABEL } from '../../src/service/docx-export.js';
import { EXPORT_LEDGER_SCHEMA_SQL, writeAtomically } from '../../src/service/manuscript-export.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { CLARIFICATION_SCHEMA_VERSION, REIMPORT_GROUP_SCHEMA_VERSION, IMPORTED_MARK_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import {
  DEFAULT_MANUSCRIPT_EXPORT_OPTIONS,
  type CreateEditorialMarkInput,
  type EditorialMarkKind,
  type ManuscriptExportOptions,
  type ManuscriptExportTargetInput,
  type ManuscriptWindowProjection,
} from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, sourceSpanText, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { EXPORT_LEDGER_RELATIONS_DROP_ORDER } from '../support/manuscript-export.js';
import { DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER } from '../support/default-execution-rules.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { CLARIFICATION_RELATIONS_DROP_ORDER } from '../support/clarifications.js';
import { REIMPORT_GROUP_RELATIONS_DROP_ORDER } from '../support/reimport-groups.js';
import { RUN_CHECKPOINT_RELATIONS_DROP_ORDER } from '../support/run-continuation.js';

// Service-integration suite (L2) for ④ 导出 · DOCX (Issue #413, plan slice S64) over the real `EditorialStore` on
// a temporary Agent Data Root: the Export Fidelity Review, the frozen preparation, the approval and its atomic
// write, the receipts and what refuses. The manuscript is composed from exact `sample1`; mark bodies are authored
// neutral phrases; no assertion prints manuscript text — texts are compared by digest.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 30, title: '导出组稿' };
const EDIT = '〔编辑改动〕';
const LEDGER = Object.keys(EXPORT_LEDGER_SCHEMA_SQL);
const CURRENT: ManuscriptExportTargetInput = { kind: 'current' };

let roots: ServiceTestRoots;
let outbox: string;

beforeEach(async () => {
  roots = await createServiceTestRoots();
  outbox = join(roots.inputRoot, 'exports');
  await mkdir(outbox);
});

afterEach(async () => {
  await roots.dispose();
});

interface Imported { bookId: string; manuscriptId: string; branchId: string }

function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

async function importBook(store: EditorialStore): Promise<Imported> {
  const selectedPath = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeManuscriptDocx(selectedPath, EXCERPT);
  const staged = await store.stageSelectedManuscript(randomUUID(), selectedPath);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: 'new-book', confirmedTitle: staged.titleSuggestion.value }, false);
  const commitId = randomUUID();
  const commit = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  return { bookId: commit.bookId, manuscriptId: commit.manuscriptId, branchId: commit.branchId };
}

function window(store: EditorialStore, book: Imported): ManuscriptWindowProjection {
  return store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
}

/** Every block of the working manuscript, in order. */
function allBlocks(store: EditorialStore, book: Imported): ManuscriptWindowProjection['blocks'][number][] {
  const blocks: ManuscriptWindowProjection['blocks'][number][] = [];
  let cursor: string | null = null;
  do {
    const page = store.getManuscriptWindow(book.manuscriptId, book.branchId, cursor);
    for (const block of page.blocks) if (!blocks.some((known) => known.blockId === block.blockId)) blocks.push(block);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return blocks;
}

/** The long paragraphs of the window, so a mark has room on both sides. */
function longBlocks(view: ManuscriptWindowProjection): ManuscriptWindowProjection['blocks'][number][] {
  return view.blocks.filter((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 40);
}

function mark(store: EditorialStore, book: Imported, blockIndex: number, from: number, to: number, kind: EditorialMarkKind, proposedText: string | null = null): string {
  const view = window(store, book);
  const block = longBlocks(view)[blockIndex]!;
  const input: CreateEditorialMarkInput = {
    manuscriptId: book.manuscriptId,
    branchId: book.branchId,
    windowStartBlockId: view.blocks[0]!.blockId,
    clientMarkId: randomUUID(),
    baseRevisionId: view.revisionId,
    expectedJournalSequence: view.journalSequence,
    blockId: block.blockId,
    baseBlockDigest: block.digest,
    fromGrapheme: from,
    toGrapheme: to,
    selectedText: graphemesOf(block.text).slice(from, to).join(''),
    kind,
    highlightColor: kind === 'personal-highlight' ? 1 : null,
    body: kind === 'annotation' ? '请核对这一句。' : kind === 'editor-note' ? '二校时再看。' : '',
    proposedText: kind === 'change-suggestion' ? proposedText : null,
    rationale: kind === 'change-suggestion' ? '与全书用法统一。' : null,
  };
  return store.createEditorialMark(input).markId;
}

/** The editor's own typing at the start of the first paragraph. */
function edit(store: EditorialStore, book: Imported): void {
  const view = window(store, book);
  const block = view.blocks.find((candidate) => candidate.kind === 'paragraph')!;
  store.flushJournalEdit({
    clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: view.revisionId,
    blockId: block.blockId, windowStartBlockId: view.blocks[0]!.blockId, baseBlockDigest: block.digest,
    expectedJournalSequence: view.journalSequence, fromGrapheme: 0, toGrapheme: 0, insertText: EDIT,
  });
}

async function refusal(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  return 'no-error';
}

function databasePath(): string {
  return join(roots.dataRoot, 'store', 'ai7.sqlite');
}

function withDatabase<T>(readOnly: boolean, operation: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(databasePath(), { readOnly });
  try {
    return operation(database);
  } finally {
    database.close();
  }
}

function ledgerCounts(): Record<string, number> {
  return withDatabase(true, (database) => Object.fromEntries(LEDGER.map((table) => [
    table,
    (database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number }).total,
  ])));
}

async function review(store: EditorialStore, book: Imported, options: ManuscriptExportOptions = DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, target = CURRENT) {
  return store.reviewManuscriptExport({ bookId: book.bookId, target, options: { ...options } }, true);
}

async function prepare(store: EditorialStore, book: Imported, destination: string, options: ManuscriptExportOptions = DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, target = CURRENT) {
  const reviewed = await review(store, book, options, target);
  return store.prepareManuscriptExport({
    bookId: book.bookId, revisionId: reviewed.target.revisionId, target, options: { ...options }, reviewDigest: reviewed.reviewDigest, destination,
  }, true);
}

async function parseWritten(path: string): Promise<{ blocks: ParsedDocxBlock[]; parsed: Awaited<ReturnType<typeof parseDocx>> }> {
  const blocks: ParsedDocxBlock[] = [];
  const parsed = await parseDocx(path, 'written.docx', (block) => blocks.push(block));
  return { blocks, parsed };
}

/**
 * Every relation the store holds, with its exact `CREATE` text and a digest over its whole content. Relations
 * hold manuscript text, so the content is compared as a row count and a hex digest.
 */
function relationTruth(database: DatabaseSync): Map<string, { sql: string; content: string }> {
  const relations = database.prepare("SELECT name, sql FROM sqlite_schema WHERE type = 'table' ORDER BY name").all() as { name: string; sql: string | null }[];
  return new Map(relations.map((relation) => {
    const rows = database.prepare(`SELECT * FROM "${relation.name}"`).all() as Record<string, SQLOutputValue>[];
    const hash = createHash('sha256');
    for (const row of rows) {
      for (const column of Object.keys(row).sort()) {
        const value = row[column]!;
        hash.update(JSON.stringify([column, value instanceof Uint8Array ? [...value] : typeof value === 'bigint' ? value.toString() : value]));
      }
    }
    return [relation.name, { sql: String(relation.sql), content: `${rows.length}:${hash.digest('hex')}` }];
  }));
}

describe('④ 导出: the Export Fidelity Review, the preparation, the approval and its receipt', () => {
  it('exports the current revision with its 批注 and 修改建议, leaves 备注 out, and records one receipt', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const proposal = await sourceSpanText(ADMITTED_BASELINE_DOCX, { block: 31, from: 0, to: 4 });
      mark(store, book, 0, 2, 6, 'annotation');
      mark(store, book, 0, 10, 14, 'change-suggestion', proposal);
      mark(store, book, 1, 0, 3, 'editor-note');
      mark(store, book, 2, 0, 3, 'personal-highlight');

      const reviewed = await review(store, book);
      expect(reviewed).toMatchObject({ target: { kind: 'current', milestoneId: null, revisionLabel: 'r1' }, savedForExport: false, format: 'docx', restoration: 'from-original', degraded: false });
      expect(reviewed.formats.map((format) => [format.format, format.available])).toEqual([['docx', true], ['pdf', true], ['markdown', true]]);
      expect(reviewed.fidelity.filter((row) => ['annotations', 'change-suggestions', 'editor-notes'].includes(row.key)).map((row) => [row.key, row.status, row.count]))
        .toEqual([['annotations', 'preserved', 1], ['change-suggestions', 'preserved', 1], ['editor-notes', 'excluded', 1]]);
      expect(reviewed.suggestedFileName).toBe('导出组稿 · r1.docx');
      // Reading the review records nothing.
      expect(ledgerCounts()).toEqual({ export_preparations: 0, export_approvals: 0, export_receipts: 0 });

      const destination = join(outbox, '导出组稿.docx');
      const preparation = await store.prepareManuscriptExport({
        bookId: book.bookId, revisionId: reviewed.target.revisionId, target: CURRENT, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
        reviewDigest: reviewed.reviewDigest, destination,
      }, true);
      expect(preparation).toMatchObject({ fileName: '导出组稿.docx', destination, disposition: 'create', dispositionLabel: '新建文件', degraded: false });
      // A preparation not approved writes nothing (EXP-020).
      expect(ledgerCounts()).toEqual({ export_preparations: 1, export_approvals: 0, export_receipts: 0 });
      expect(existsSync(destination)).toBe(false);

      const receipt = await store.approveManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true);
      expect(receipt).toMatchObject({ outcome: 'created', outcomeLabel: '已导出到所选位置', revealAvailable: true, destination, fileName: '导出组稿.docx' });
      expect(receipt.byteLength).toBe(preparation.payloadBytes);
      expect(ledgerCounts()).toEqual({ export_preparations: 1, export_approvals: 1, export_receipts: 1 });
      const written = await readFile(destination);
      expect(digest(written)).toBe(preparation.technical.payloadDigest);
      expect(receipt.technical.fileSha256).toBe(preparation.technical.payloadDigest);
      // Nothing staged is left beside the file.
      expect(await readdir(outbox)).toEqual(['导出组稿.docx']);

      // The written file reads back as the manuscript with the two marks, the 备注 and the highlight left out.
      const { blocks, parsed } = await parseWritten(destination);
      expect(blocks.map((block) => block.digest)).toEqual(allBlocks(store, book).map((block) => block.digest));
      expect(parsed.importedMarks.map((entry) => [entry.kind, entry.origin, entry.authorLabel, entry.fromGrapheme, entry.toGrapheme])).toEqual([
        ['annotation', 'comment', EDITOR_AUTHOR_LABEL, 2, 6],
        ['change-suggestion', 'replacement', EDITOR_AUTHOR_LABEL, 10, 14],
      ]);
      expect(digest(parsed.importedMarks[1]!.proposedText!)).toBe(digest(proposal));

      // Approving again answers with the receipt already held; nothing is written twice.
      const again = await store.approveManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true);
      expect(again).toEqual(receipt);
      expect(ledgerCounts()).toEqual({ export_preparations: 1, export_approvals: 1, export_receipts: 1 });
      expect(store.inspectDeliverables(book.bookId).exports).toEqual([receipt]);
      expect(store.inspectManuscriptExportReceipt({ bookId: book.bookId, preparationId: preparation.preparationId })).toEqual(receipt);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // The records verify on the next open, exactly as they were written.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(reopened.inspectDeliverables((await withDatabase(true, (database) => database.prepare('SELECT book_id FROM books').get() as { book_id: string })).book_id).exports).toHaveLength(1);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 300_000);

  it('saves unsaved edits as a revision before reviewing the current one, and exports a milestone as it was saved', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    let book: Imported;
    try {
      book = await importBook(store);
      const imported = allBlocks(store, book).map((block) => block.digest);
      const milestone = await store.saveMilestone(book.manuscriptId, book.branchId, '一审稿', 'stage-archive', null, '');
      edit(store, book);
      const reviewed = await review(store, book);
      expect(reviewed).toMatchObject({ target: { kind: 'current', revisionLabel: 'r2' }, savedForExport: true });
      // The edited block is written from the text; nothing it held is lost, so nothing degrades.
      expect(reviewed.degraded).toBe(false);
      expect(reviewed.restorationLine).toBe(`未改过、也没有带出标记的 ${imported.length - 1} 段从原文件恢复；其余 1 段按稿件文字重新写出。`);
      const second = await review(store, book);
      expect(second).toMatchObject({ target: { revisionLabel: 'r2' }, savedForExport: false });
      expect(second.reviewDigest).toBe(reviewed.reviewDigest);

      const target: ManuscriptExportTargetInput = { kind: 'milestone', milestoneId: milestone.milestoneId };
      const destination = join(outbox, '一审稿.docx');
      const preparation = await prepare(store, book, destination, DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, target);
      expect(preparation.target).toMatchObject({ kind: 'milestone', milestoneId: milestone.milestoneId, milestoneLabel: '一审稿', revisionLabel: 'r1' });
      const receipt = await store.approveManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true);
      expect(receipt.outcome).toBe('created');
      const { blocks } = await parseWritten(destination);
      expect(blocks.map((block) => block.digest)).toEqual(imported);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    // The revision saved for the export is an ordinary revision: the store validates whole on the next open.
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(window(reopened, book!).revisionId).not.toBe('');
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 300_000);

  it('replaces a file the dialog confirmed replacing, and says so', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const destination = join(outbox, '已有文件.docx');
      await writeFile(destination, 'placeholder');
      const preparation = await prepare(store, book, destination);
      expect(preparation).toMatchObject({ disposition: 'replace', dispositionLabel: '替换所选位置的同名文件' });
      const receipt = await store.approveManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true);
      expect(receipt).toMatchObject({ outcome: 'replaced', outcomeLabel: '已导出到所选位置', revealAvailable: true });
      expect(digest(await readFile(destination))).toBe(preparation.technical.payloadDigest);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('refuses a destination inside AI7\'s data, one that is no DOCX, and one whose folder is gone', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const reviewed = await review(store, book);
      const attempt = (destination: string) => refusal(() => store.prepareManuscriptExport({
        bookId: book.bookId, revisionId: reviewed.target.revisionId, target: CURRENT, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
        reviewDigest: reviewed.reviewDigest, destination,
      }, true));
      expect(await attempt(join(roots.dataRoot, 'store', '导出.docx'))).toBe('EXPORT_DESTINATION_INVALID');
      expect(await attempt(join(outbox, '导出.txt'))).toBe('EXPORT_DESTINATION_INVALID');
      expect(await attempt(join(outbox, 'missing', '导出.docx'))).toBe('EXPORT_DESTINATION_INVALID');
      expect(await attempt('导出.docx')).toBe('EXPORT_DESTINATION_INVALID');
      await mkdir(join(outbox, '文件夹.docx'));
      expect(await attempt(join(outbox, '文件夹.docx'))).toBe('EXPORT_DESTINATION_INVALID');
      // A review read under other options is not the one this preparation would bind.
      expect(await refusal(() => store.prepareManuscriptExport({
        bookId: book.bookId, revisionId: reviewed.target.revisionId, target: CURRENT,
        options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, includeEditorNotes: true }, reviewDigest: reviewed.reviewDigest, destination: join(outbox, '导出.docx'),
      }, true))).toBe('EXPORT_REVIEW_CHANGED');
      // Without the verified External Export Policy nothing about an export proceeds.
      expect(await refusal(() => store.reviewManuscriptExport({ bookId: book.bookId, target: CURRENT, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS } }, false)))
        .toBe('EXPORT_POLICY_UNAVAILABLE');
      expect(ledgerCounts()).toEqual({ export_preparations: 0, export_approvals: 0, export_receipts: 0 });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('refuses an approval once the payload or the destination drifted, and records none', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const drifted = await prepare(store, book, join(outbox, '标记变化.docx'));
      // A new 批注 after the preparation changes the file the approval would write.
      mark(store, book, 0, 2, 6, 'annotation');
      expect(await refusal(() => store.approveManuscriptExport({ bookId: book.bookId, preparationId: drifted.preparationId }, true)))
        .toBe('EXPORT_PAYLOAD_CHANGED');
      const destination = join(outbox, '位置变化.docx');
      const moved = await prepare(store, book, destination);
      await writeFile(destination, 'someone else');
      expect(await refusal(() => store.approveManuscriptExport({ bookId: book.bookId, preparationId: moved.preparationId }, true)))
        .toBe('EXPORT_TARGET_CHANGED');
      expect(await refusal(() => store.approveManuscriptExport({ bookId: randomUUID(), preparationId: moved.preparationId }, true)))
        .toBe('EXPORT_PREPARATION_NOT_FOUND');
      expect(ledgerCounts()).toEqual({ export_preparations: 2, export_approvals: 0, export_receipts: 0 });
      expect((await readFile(destination, 'utf8'))).toBe('someone else');
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('records a write that changed nothing as 未能导出, and an interrupted one as 结果待确认 that never retries', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const gone = join(outbox, 'gone');
      await mkdir(gone);
      const failed = await prepare(store, book, join(gone, '导出.docx'));
      await rm(gone, { recursive: true });
      const failure = await store.approveManuscriptExport({ bookId: book.bookId, preparationId: failed.preparationId }, true);
      expect(failure).toMatchObject({ outcome: 'failed', outcomeLabel: '未能导出', revealAvailable: false, byteLength: null });
      expect(failure.technical.failureCode).toBe('EXPORT_STAGE_FAILED');

      // An approval with no receipt is a write interrupted after it was approved: AI7 cannot tell what happened.
      const interrupted = await prepare(store, book, join(outbox, '中断.docx'));
      withDatabase(false, (database) => {
        const approvalId = randomUUID();
        const approvedAt = new Date().toISOString();
        const record = canonicalRecord({
          schema: 'ai7.export.approval/1', approvalId, preparationId: interrupted.preparationId,
          effectIntentId: interrupted.technical.effectIntentId, payloadSha256: interrupted.technical.payloadDigest,
          actor: '本机编辑', interaction: 'export-as-stated', approvedAt,
        });
        database.prepare(
          `INSERT INTO export_approvals(approval_id, preparation_id, effect_intent_id, payload_sha256, actor, interaction, approved_at, canonical_json, sha256)
           VALUES (?, ?, ?, ?, '本机编辑', 'export-as-stated', ?, ?, ?)`,
        ).run(approvalId, interrupted.preparationId, interrupted.technical.effectIntentId, interrupted.technical.payloadDigest, approvedAt, record.json, record.digest);
      });
      const pending = await store.approveManuscriptExport({ bookId: book.bookId, preparationId: interrupted.preparationId }, true);
      expect(pending).toMatchObject({ outcome: 'ambiguous', outcomeLabel: '结果待确认', revealAvailable: false, recordedAt: null });
      expect(pending.technical.failureCode).toBe('EXPORT_INTERRUPTED');
      expect(existsSync(join(outbox, '中断.docx'))).toBe(false);
      expect(ledgerCounts()).toEqual({ export_preparations: 2, export_approvals: 2, export_receipts: 1 });
      expect(store.inspectDeliverables(book.bookId).exports.map((entry) => entry.outcome)).toEqual(['ambiguous', 'failed']);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('keeps every export record as written: no update and no delete', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await importBook(store);
      const preparation = await prepare(store, book, join(outbox, '账本.docx'));
      await store.approveManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
    withDatabase(false, (database) => {
      for (const table of LEDGER) {
        expect(() => database.prepare(`UPDATE ${table} SET canonical_json = canonical_json`).run()).toThrow(/EXPORT_LEDGER_IMMUTABLE/);
        expect(() => database.prepare(`DELETE FROM ${table}`).run()).toThrow(/EXPORT_LEDGER_IMMUTABLE/);
      }
    });
  }, 300_000);

  it('migrates a revision-28 store forward, adding the three empty relations and nothing else', async () => {
    const first = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      await importBook(first);
      first.markCleanShutdown();
    } finally {
      first.close();
    }
    const truthBefore = withDatabase(false, (database) => {
      database.exec(`BEGIN IMMEDIATE;
        ${[...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER].map((relation) => `DROP TABLE ${relation};`).join('\n        ')}
        PRAGMA user_version = ${IMPORTED_MARK_SCHEMA_VERSION};
        COMMIT;`);
      expect(database.prepare("SELECT count(*) total FROM sqlite_schema WHERE name LIKE 'export_%'").get()).toEqual({ total: 0 });
      return relationTruth(database);
    });
    const migrated = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
    withDatabase(true, (database) => {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(REIMPORT_GROUP_SCHEMA_VERSION);
      const truthAfter = relationTruth(database);
      expect([...truthAfter.keys()]).toEqual([...truthBefore.keys(), ...EXPORT_LEDGER_RELATIONS_DROP_ORDER, ...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER].sort());
      for (const relation of [...REIMPORT_GROUP_RELATIONS_DROP_ORDER, ...CLARIFICATION_RELATIONS_DROP_ORDER, ...RUN_CHECKPOINT_RELATIONS_DROP_ORDER, ...DEFAULT_EXECUTION_RULE_RELATIONS_DROP_ORDER, ...EXPORT_LEDGER_RELATIONS_DROP_ORDER]) expect(truthAfter.get(relation)?.content).toMatch(/^0:/);
      expect([...truthBefore].filter(([name, before]) => truthAfter.get(name)!.sql !== before.sql).map(([name]) => name)).toEqual([]);
      expect([...truthBefore].filter(([name, before]) => truthAfter.get(name)!.content !== before.content).map(([name]) => name)).toEqual(['service_lifetimes']);
      expect(database.prepare("SELECT count(*) total FROM sqlite_schema WHERE type = 'trigger' AND tbl_name LIKE 'export_%'").get()).toEqual({ total: 6 });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    });
  }, 300_000);
});

// The publication itself (V2-UX-EXP-012), over real files in a temporary folder. The name is taken by the
// filesystem, not by a check before it: these cases pin what an export may never do to a file it did not write.
describe('taking the chosen name', () => {
  const PAYLOAD = new TextEncoder().encode('AI7 export payload');
  const OTHER = new TextEncoder().encode('another application wrote this');

  /** Every name this write staged under is removed; a partial left behind would be read as the export. */
  async function partials(): Promise<string[]> {
    return (await readdir(outbox)).filter((entry) => entry.endsWith('.ai7-partial'));
  }

  it('creates the chosen name and leaves no partial behind', async () => {
    const destination = join(outbox, '新建.docx');
    const written = await writeAtomically(destination, PAYLOAD, digest(PAYLOAD), 'create', randomUUID());
    expect(written).toEqual({ outcome: 'created', bytes: PAYLOAD.byteLength, sha256: digest(PAYLOAD) });
    expect(new Uint8Array(await readFile(destination))).toEqual(PAYLOAD);
    expect(await partials()).toEqual([]);
  });

  it('publishes the chosen name once when two exports race for it', async () => {
    const destination = join(outbox, '同名.docx');
    const [first, second] = await Promise.all([
      writeAtomically(destination, PAYLOAD, digest(PAYLOAD), 'create', randomUUID()),
      writeAtomically(destination, OTHER, digest(OTHER), 'create', randomUUID()),
    ]);
    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(['created', 'failed']);
    const refused = first.outcome === 'failed' ? first : second;
    expect(refused).toEqual({ outcome: 'failed', code: 'EXPORT_TARGET_CHANGED' });
    // The winner's file is whole: the one that lost the name neither overwrote it nor removed it.
    const landed = new Uint8Array(await readFile(destination));
    const created = first.outcome === 'created' ? PAYLOAD : OTHER;
    expect(landed).toEqual(created);
    expect(await partials()).toEqual([]);
  });

  it('leaves a file that took the chosen name untouched', async () => {
    const destination = join(outbox, '已被占用.docx');
    await writeFile(destination, OTHER);
    const written = await writeAtomically(destination, PAYLOAD, digest(PAYLOAD), 'create', randomUUID());
    expect(written).toEqual({ outcome: 'failed', code: 'EXPORT_TARGET_CHANGED' });
    expect(new Uint8Array(await readFile(destination))).toEqual(OTHER);
    expect(await partials()).toEqual([]);
  });

  it('never removes a file standing where an earlier build staged its write', async () => {
    const effectIntentId = randomUUID();
    const destination = join(outbox, '旧暂存.docx');
    const legacyStage = join(outbox, `.${'旧暂存.docx'}.${effectIntentId.slice(0, 8)}.ai7-partial`);
    await writeFile(legacyStage, OTHER);
    const written = await writeAtomically(destination, PAYLOAD, digest(PAYLOAD), 'create', effectIntentId);
    expect(written.outcome).toBe('created');
    expect(new Uint8Array(await readFile(legacyStage))).toEqual(OTHER);
    expect(new Uint8Array(await readFile(destination))).toEqual(PAYLOAD);
  });

  it('replaces exactly the file the editor chose to replace', async () => {
    const destination = join(outbox, '覆盖.docx');
    await writeFile(destination, OTHER);
    const written = await writeAtomically(destination, PAYLOAD, digest(PAYLOAD), 'replace', randomUUID());
    expect(written).toEqual({ outcome: 'replaced', bytes: PAYLOAD.byteLength, sha256: digest(PAYLOAD) });
    expect(new Uint8Array(await readFile(destination))).toEqual(PAYLOAD);
    expect(await partials()).toEqual([]);
  });

  it('refuses a replace whose file is gone, and writes nothing in its place', async () => {
    const destination = join(outbox, '已被删除.docx');
    const written = await writeAtomically(destination, PAYLOAD, digest(PAYLOAD), 'replace', randomUUID());
    expect(written).toEqual({ outcome: 'failed', code: 'EXPORT_TARGET_CHANGED' });
    expect(existsSync(destination)).toBe(false);
    expect(await partials()).toEqual([]);
  });

  it('writes nothing when the folder the dialog resolved is gone', async () => {
    const destination = join(outbox, '不存在的文件夹', '稿件.docx');
    const written = await writeAtomically(destination, PAYLOAD, digest(PAYLOAD), 'create', randomUUID());
    expect(written).toEqual({ outcome: 'failed', code: 'EXPORT_STAGE_FAILED' });
    expect(existsSync(destination)).toBe(false);
  });
});
