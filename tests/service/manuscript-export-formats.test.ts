import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EXPORT_MARKDOWN_LINE, EXPORT_PDF_LINE, EXPORT_TEXT_RESTORATION_LINES } from '../../src/service/manuscript-export.js';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { graphemesOf } from '../../src/shared/mark-anchor.js';
import {
  DEFAULT_MANUSCRIPT_EXPORT_OPTIONS,
  type CreateEditorialMarkInput,
  type EditorialMarkKind,
  type ManuscriptExportFormat,
  type ManuscriptExportTargetInput,
  type ManuscriptWindowProjection,
} from '../../src/shared/protocol.js';
import { ADMITTED_BASELINE_DOCX, composeManuscriptDocx, sourceSpanText, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for ④ 导出 · PDF and the Markdown 备用格式 (Issue #500, plan slice S64b; V2-UX-EXP-001,
// EXP-005 to EXP-009, EXP-013) over the real `EditorialStore` on a temporary Agent Data Root. The manuscript is composed
// from exact `sample1`; mark bodies are authored neutral phrases; no assertion prints manuscript text. The service
// never prints: a PDF's page is staged for the main process, and here a stand-in file plays the printed PDF.

const EXCERPT: ComposedManuscriptRequest = { source: ADMITTED_BASELINE_DOCX, startBlock: 1, blocks: 30, title: '导出组稿' };
const CURRENT: ManuscriptExportTargetInput = { kind: 'current' };
const NOTE_BODY = '二校时再看。';
const ANNOTATION_BODY = '请核对这一句。';
const STAND_IN_PDF = '%PDF-1.7\n% AI7 service suite stand-in for a printed page\n%%EOF\n';

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

function mark(store: EditorialStore, book: Imported, blockIndex: number, from: number, to: number, kind: EditorialMarkKind, proposedText: string | null = null): void {
  const view = window(store, book);
  const block = view.blocks.filter((candidate) => candidate.kind === 'paragraph' && graphemesOf(candidate.text).length >= 40)[blockIndex]!;
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
    highlightColor: null,
    body: kind === 'annotation' ? ANNOTATION_BODY : kind === 'editor-note' ? NOTE_BODY : '',
    proposedText: kind === 'change-suggestion' ? proposedText : null,
    rationale: kind === 'change-suggestion' ? '与全书用法统一。' : null,
  };
  store.createEditorialMark(input);
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

function ledgerCounts(): Record<string, number> {
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    return Object.fromEntries(['export_preparations', 'export_approvals', 'export_receipts'].map((table) => [
      table, (database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number }).total,
    ]));
  } finally {
    database.close();
  }
}

async function marked(store: EditorialStore): Promise<Imported> {
  const book = await importBook(store);
  const proposal = await sourceSpanText(ADMITTED_BASELINE_DOCX, { block: 31, from: 0, to: 4 });
  mark(store, book, 0, 2, 6, 'annotation');
  mark(store, book, 0, 10, 14, 'change-suggestion', proposal);
  mark(store, book, 1, 0, 3, 'editor-note');
  return book;
}

async function reviewAs(store: EditorialStore, book: Imported, format: ManuscriptExportFormat) {
  return store.reviewManuscriptExport({ bookId: book.bookId, target: CURRENT, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS }, format }, true);
}

async function prepareAs(store: EditorialStore, book: Imported, format: ManuscriptExportFormat, destination: string) {
  const reviewed = await reviewAs(store, book, format);
  return store.prepareManuscriptExport({
    bookId: book.bookId, revisionId: reviewed.target.revisionId, target: CURRENT, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS },
    reviewDigest: reviewed.reviewDigest, destination, format,
  }, true);
}

describe('④ 导出 · PDF and the Markdown 备用格式', () => {
  it('writes the Markdown 备用格式 from the manuscript\'s words: headings, 批注 as footnotes, 修改建议 as CriticMarkup, no 备注', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await marked(store);
      const reviewed = await reviewAs(store, book, 'markdown');
      expect(reviewed).toMatchObject({
        format: 'markdown', restoration: 'regenerated', formatLine: EXPORT_MARKDOWN_LINE,
        restorationLine: EXPORT_TEXT_RESTORATION_LINES.markdown, suggestedFileName: '导出组稿 · r1.md', degraded: true,
        technical: { writerIdentity: 'ai7-markdown-export/1' },
      });
      // Each format has its own review (EXP-007): the marks keep their words but not what the editor can do with them.
      expect(reviewed.fidelity.filter((row) => ['annotations', 'change-suggestions', 'editor-notes'].includes(row.key)).map((row) => [row.key, row.status, row.count]))
        .toEqual([['annotations', 'degraded', 1], ['change-suggestions', 'degraded', 1], ['editor-notes', 'excluded', 1]]);
      const docx = await reviewAs(store, book, 'docx');
      expect(docx.reviewDigest).not.toBe(reviewed.reviewDigest);

      // The file name ends as the format does, or nothing is prepared.
      expect(await refusal(() => prepareAs(store, book, 'markdown', join(outbox, '导出组稿.docx')))).toBe('EXPORT_DESTINATION_INVALID');
      const destination = join(outbox, '导出组稿.md');
      const preparation = await prepareAs(store, book, 'markdown', destination);
      expect(preparation).toMatchObject({ format: 'markdown', fileName: '导出组稿.md', disposition: 'create' });
      // A format the service writes itself needs no print.
      expect(await store.stageManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true)).toEqual({ format: 'markdown', print: null });

      const receipt = await store.approveManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true);
      expect(receipt).toMatchObject({ format: 'markdown', outcome: 'created', outcomeLabel: '已导出到所选位置' });
      const written = await readFile(destination);
      expect(receipt.byteLength).toBe(written.byteLength);
      expect(receipt.technical.fileSha256).toBe(digest(written));
      const text = written.toString('utf8');
      const lines = text.split('\n');
      // One line per block before the notes, a heading's level as #, a footnote per 批注 and per 修改建议.
      const blocks = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks;
      const body = text.slice(0, text.indexOf('[^1]:')).trimEnd().split('\n\n');
      expect(body.length).toBeGreaterThanOrEqual(blocks.length);
      expect(lines.filter((line) => /^\[\^\d+\]: /u.test(line)).map((line) => line.replace(/^\[\^\d+\]: (\S+) .*$/u, '$1'))).toEqual(['批注', '修改建议']);
      expect(text).toMatch(/\{~~[^~]+~>[^~]+~~\}\[\^2\]/u);
      expect(text).toContain(`：${ANNOTATION_BODY}`);
      expect(text).not.toContain(NOTE_BODY);
      expect(ledgerCounts()).toEqual({ export_preparations: 1, export_approvals: 1, export_receipts: 1 });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);

  it('writes a PDF from the page the main process printed, and approves none that was not printed', async () => {
    const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      const book = await marked(store);
      const reviewed = await reviewAs(store, book, 'pdf');
      expect(reviewed).toMatchObject({
        format: 'pdf', restoration: 'regenerated', formatLine: EXPORT_PDF_LINE, restorationLine: EXPORT_TEXT_RESTORATION_LINES.pdf,
        suggestedFileName: '导出组稿 · r1.pdf', technical: { writerIdentity: 'ai7-pdf-export/1' },
      });
      const destination = join(outbox, '导出组稿.pdf');
      const preparation = await prepareAs(store, book, 'pdf', destination);
      expect(preparation.format).toBe('pdf');

      // Not printed yet: nothing is approved, and the destination stays as it was.
      const ask = () => store.approveManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true);
      expect(await refusal(ask)).toBe('EXPORT_PDF_NOT_PRINTED');
      expect(ledgerCounts()).toEqual({ export_preparations: 1, export_approvals: 0, export_receipts: 0 });

      // The staging step lays out the exact page the preparation bound, inside AI7's own data, for the main process.
      const staged = await store.stageManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true);
      expect(staged.format).toBe('pdf');
      const print = staged.print!;
      expect(print.pagePath.startsWith(join(roots.dataRoot, 'export-staging'))).toBe(true);
      const page = await readFile(print.pagePath, 'utf8');
      expect(digest(page)).toBe(preparation.technical.payloadDigest);
      expect(page.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(page).toContain("default-src 'none'");
      expect(page).not.toMatch(/<script|https?:/iu);
      expect(page.match(/<sup class="note-ref">/gu)?.length).toBe(2);
      expect(page).not.toContain(NOTE_BODY);
      expect(existsSync(print.pdfPath)).toBe(false);

      // A printed file that is no PDF is refused too.
      await writeFile(print.pdfPath, 'not a pdf');
      expect(await refusal(ask)).toBe('EXPORT_PDF_NOT_PRINTED');
      await writeFile(print.pdfPath, STAND_IN_PDF);
      const receipt = await ask();
      expect(receipt).toMatchObject({ format: 'pdf', outcome: 'created' });
      const written = await readFile(destination, 'utf8');
      expect(written).toBe(STAND_IN_PDF);
      // The receipt binds the printed file; the page and the print are not kept.
      expect(receipt.technical.fileSha256).toBe(digest(STAND_IN_PDF));
      expect(existsSync(print.pagePath) || existsSync(print.pdfPath)).toBe(false);
      // An approved PDF needs no second print, and answers with what it came to.
      expect(await store.stageManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true)).toEqual({ format: 'pdf', print: null });
      expect((await ask()).technical.receiptId).toBe(receipt.technical.receiptId);
      expect(ledgerCounts()).toEqual({ export_preparations: 1, export_approvals: 1, export_receipts: 1 });
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 120_000);
});
