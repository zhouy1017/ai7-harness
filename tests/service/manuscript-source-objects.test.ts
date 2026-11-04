import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS } from '../../src/shared/protocol.js';
import { composeSourceObjectDocx } from '../support/source-objects.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { fixedArchiveTime } from '../../src/shared/archive-time.js';

let roots: ServiceTestRoots;
let store: EditorialStore;
let book: { bookId: string; manuscriptId: string; branchId: string };
let original: Uint8Array;
beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-source-objects-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const path = join(roots.inputRoot, 'objects.docx');
  original = await composeSourceObjectDocx(path);
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '表图组稿' }, false);
  const commitId = randomUUID();
  book = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
});
afterEach(async () => { store.markCleanShutdown(); store.close(); await roots.dispose(); });

it('shows table cells and an embedded image, refuses table edits, and restores source parts on DOCX export', async () => {
  const view = store.getManuscriptWindow(book.manuscriptId, book.branchId, null);
  const [first, second] = view.blocks;
  expect(first!.sourceDisplay?.table).toMatchObject({ continuation: false, truncated: false });
  expect(first!.sourceDisplay?.table?.rows).toEqual([[first!.text, second!.text]]);
  expect(second!.sourceDisplay?.table).toMatchObject({ continuation: true });
  expect(view.blocks.flatMap((block) => block.sourceDisplay?.images ?? []).map((image) => image.dataUrl?.startsWith('data:image/png;base64,'))).toEqual([true]);
  expect(() => store.flushJournalEdit({ ...book, clientEditId: randomUUID(), baseRevisionId: view.revisionId, blockId: first!.blockId,
    windowStartBlockId: first!.blockId, baseBlockDigest: first!.digest, expectedJournalSequence: view.journalSequence,
    fromGrapheme: 0, toGrapheme: 0, insertText: '〔改〕' })).toThrow(expect.objectContaining({ code: 'SOURCE_OBJECT_READ_ONLY' }));
  const reviewed = await store.reviewManuscriptExport({ bookId: book.bookId, target: { kind: 'current' }, options: DEFAULT_MANUSCRIPT_EXPORT_OPTIONS }, true);
  const destination = join(roots.inputRoot, 'roundtrip.docx');
  const prepared = await store.prepareManuscriptExport({ bookId: book.bookId, revisionId: reviewed.target.revisionId, target: { kind: 'current' },
    options: DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, reviewDigest: reviewed.reviewDigest, destination }, true);
  await store.approveManuscriptExport({ bookId: book.bookId, preparationId: prepared.preparationId }, true);
  const before = unzipSync(original);
  const after = unzipSync(await readFile(destination));
  expect(after['word/media/preview.png']).toEqual(before['word/media/preview.png']);
  const relationship = (bytes: Uint8Array): string => strFromU8(bytes).replace(/<\?xml[^?]*\?>/, '');
  expect(relationship(after['word/_rels/document.xml.rels']!)).toBe(relationship(before['word/_rels/document.xml.rels']!));
  const table = (bytes: Uint8Array): string | undefined => strFromU8(bytes).match(/<w:tbl>[\s\S]*?<\/w:tbl>/)?.[0];
  expect(table(after['word/document.xml']!)).toBe(table(before['word/document.xml']!));
});

it('streams large local image previews in bounded chunks and refuses a different source pin', async () => {
  const files = unzipSync(original);
  const media = new Uint8Array([...files['word/media/preview.png']!, ...randomBytes(280000)]);
  files['word/media/preview.png'] = media;
  const path = join(roots.inputRoot, 'large-image.docx');
  await writeFile(path, zipSync(files, { mtime: fixedArchiveTime() }));
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const target = staged.targetChoices.find((choice) => choice.kind === 'new-book')!;
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: target.id, confirmedTitle: '大图组稿' }, false);
  const commitId = randomUUID();
  const added = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  const view = store.getManuscriptWindow(added.manuscriptId, added.branchId, null);
  const image = view.blocks.flatMap((block) => block.sourceDisplay?.images ?? [])[0]!;
  expect(image.dataUrl).toBeNull();
  const pin = { manuscriptId: added.manuscriptId, branchId: added.branchId, ...image.sourceImage! };
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < media.length) {
    const chunk = store.readManuscriptImageChunk({ ...pin, offset });
    const bytes = Buffer.from(chunk.base64, 'base64');
    expect(chunk.mime).toBe('image/png');
    expect(bytes.byteLength).toBeLessThanOrEqual(128 * 1024);
    chunks.push(bytes);
    offset += bytes.byteLength;
  }
  expect(Buffer.concat(chunks)).toEqual(Buffer.from(media));
  expect(() => store.readManuscriptImageChunk({ ...pin, sourceVersionId: randomUUID(), offset: 0 }))
    .toThrow(expect.objectContaining({ code: 'SOURCE_IMAGE_CHANGED' }));
});

it('keeps a source image visible when its body paragraph is merged and undone', async () => {
  const files = unzipSync(original);
  let xml = strFromU8(files['word/document.xml']!);
  const drawing = xml.match(/<w:p><w:r><w:drawing>[\s\S]*?<\/w:p>/)![0];
  xml = xml.replace(drawing, '');
  const paragraph = [...xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)][3]![0];
  files['word/document.xml'] = strToU8(xml.replace(paragraph, paragraph.replace('</w:p>', drawing.slice(5, -6) + '</w:p>')));
  const path = join(roots.inputRoot, 'merge-image.docx');
  await writeFile(path, zipSync(files, { mtime: fixedArchiveTime() }));
  const staged = await store.stageSelectedManuscript(randomUUID(), path);
  const target = staged.targetChoices.find((choice) => choice.kind === 'new-book')!;
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: target.id, confirmedTitle: '图片合段' }, false);
  const commitId = randomUUID();
  const added = await store.commitNewBookImport({ draftId: staged.draftId, expectedDraftVersion: review.draftVersion, reviewDigest: review.reviewDigest!, commitId });
  await store.acknowledgeImportCompletion(commitId);
  const before = store.getManuscriptWindow(added.manuscriptId, added.branchId, null);
  const [into, absorbed] = before.blocks.slice(2, 4);
  expect(absorbed!.sourceDisplay?.images).toHaveLength(1);
  const at = [...new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(into!.text)].length;
  const merged = store.flushJournalEdit({ manuscriptId: added.manuscriptId, branchId: added.branchId, clientEditId: randomUUID(),
    baseRevisionId: before.revisionId, blockId: into!.blockId, windowStartBlockId: before.blocks[0]!.blockId, baseBlockDigest: into!.digest,
    expectedJournalSequence: before.journalSequence, fromGrapheme: at, toGrapheme: at, insertText: '',
    structure: { kind: 'merge', mergedBlockId: absorbed!.blockId, mergedBlockDigest: absorbed!.digest } }).window;
  expect(merged.blocks.find((block) => block.blockId === into!.blockId)!.sourceDisplay?.images).toHaveLength(1);
  const exported = await store.reviewManuscriptExport({ bookId: added.bookId, target: { kind: 'current' }, options: DEFAULT_MANUSCRIPT_EXPORT_OPTIONS }, true);
  const destination = join(roots.inputRoot, 'merged.docx');
  const prepared = await store.prepareManuscriptExport({ bookId: added.bookId, revisionId: exported.target.revisionId, target: { kind: 'current' },
    options: DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, reviewDigest: exported.reviewDigest, destination }, true);
  await store.approveManuscriptExport({ bookId: added.bookId, preparationId: prepared.preparationId }, true);
  const reread: ParsedDocxBlock[] = [];
  await parseDocx(destination, 'merged.docx', (block) => reread.push(block));
  expect(reread.map((block) => block.digest)).toEqual(merged.blocks.map((block) => block.digest));
  store.undoManuscript(added.manuscriptId, added.branchId, merged.workingDigest);
  const restored = store.getManuscriptWindow(added.manuscriptId, added.branchId, null);
  expect(restored.blocks.find((block) => block.blockId === absorbed!.blockId)!.sourceDisplay?.images).toHaveLength(1);
});
