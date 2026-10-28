import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseDocx, type ParsedDocxBlock } from '../../src/service/docx.js';
import { EditorialStore } from '../../src/service/store.js';
import { DEFAULT_MANUSCRIPT_EXPORT_OPTIONS, MAX_BLOCK_GRAPHEMES, type ImportStructureChoice } from '../../src/shared/protocol.js';
import { composeManuscriptDocx, type ComposedManuscriptRequest } from '../support/composed-fixture.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';

// Service-integration suite (L2) for candidate structure and long paragraphs on import (Issue #1205, W22-S4c; ADR 0096 §2) over
// the real store. Every manuscript is composed from the admitted Public SampleBook 儒林外史 (ADR 0043/0091): its first thirty
// blocks written without heading styles — the 第X回 lines then stand as plain paragraphs — and, for the long-paragraph cases,
// twelve of its paragraphs written as one, with or without soft line breaks. Assertions speak of kinds, levels and positions.
const SOURCE = 'wujingzi-rulin-waishi.docx';
const HEADINGLESS: ComposedManuscriptRequest = { source: SOURCE, startBlock: 1, blocks: 30, title: '结构候选组稿', withoutHeadingStyles: true };
const JOINED = { block: 3, blocks: 12 } as const;

let roots: ServiceTestRoots;
let store: EditorialStore;
beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-import-structure-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
});
afterEach(async () => {
  store.markCleanShutdown();
  store.close();
  await roots.dispose();
});

async function stage(request: ComposedManuscriptRequest = HEADINGLESS) {
  const path = join(roots.inputRoot, `${randomUUID()}.docx`);
  await composeManuscriptDocx(path, request);
  return { path, staged: await store.stageSelectedManuscript(randomUUID(), path) };
}

function review(staged: { draftId: string; draftVersion: number }, structure?: ImportStructureChoice) {
  return store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: 'new-book', confirmedTitle: '结构候选组稿' },
    false, 'retain', undefined, structure);
}

async function commit(reviewed: ReturnType<typeof review>) {
  const book = await store.commitNewBookImport({ draftId: reviewed.draftId, expectedDraftVersion: reviewed.draftVersion,
    reviewDigest: reviewed.reviewDigest!, commitId: randomUUID() });
  return { book, blocks: () => store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks };
}

async function sourceBlocks(): Promise<ParsedDocxBlock[]> {
  const blocks: ParsedDocxBlock[] = [];
  await parseDocx(join('SampleBooks', SOURCE), SOURCE, (block) => blocks.push(block));
  return blocks.slice(0, 30);
}

describe('candidate structure on import (#1205)', () => {
  it('lists the 第X回 lines of a heading-less file as unchecked candidates, and confirming two writes headings that drive 选章', async () => {
    const { staged } = await stage();
    const source = await sourceBlocks();
    const headings = source.filter((block) => block.kind === 'heading').map((block) => block.position);
    expect(staged.structure!.headings.map((candidate) => [candidate.position, candidate.rule, candidate.suggestedLevel]))
      .toEqual(headings.map((position) => [position, 'numbered', 1]));
    const reviewed = review(staged, { headings: [{ position: headings[0]!, level: 1 }, { position: headings[1]!, level: 2 }], longParagraphs: null });
    expect(reviewed.structure!.choice.headings).toHaveLength(2);
    const { book, blocks } = await commit(reviewed);
    expect(blocks().filter((block) => block.kind === 'heading').map((block) => [block.position, block.level]))
      .toEqual([[headings[0], 1], [headings[1], 2]]);
    const chapters = store.inspectReviewWorkspace(book.bookId, null).scopeOptions.chapters.chapters;
    expect(chapters.map((chapter) => [chapter.position, chapter.level])).toEqual([[headings[0], 1], [headings[1], 2]]);
  }, 120_000);

  it('keeps every candidate a paragraph when the editor confirms none, and refuses a heading the rules did not list', async () => {
    const { staged } = await stage();
    expect(() => review(staged, { headings: [{ position: 1, level: 1 }], longParagraphs: null })).toThrow(expect.objectContaining({ code: 'STRUCTURE_CHOICE_INVALID' }));
    const reviewed = review(staged);
    expect(reviewed.structure!.choice).toEqual({ headings: [], longParagraphs: null });
    const { blocks } = await commit(reviewed);
    expect(blocks().every((block) => block.kind === 'paragraph')).toBe(true);
    expect(blocks().map((block) => block.text)).toEqual((await sourceBlocks()).map((block) => block.text));
  }, 120_000);

  it('offers nothing for a file with heading styles', async () => {
    const { staged } = await stage({ source: SOURCE, startBlock: 1, blocks: 30, title: '结构候选组稿' });
    expect(staged.structure).toBeUndefined();
    expect(review(staged).structure).toBeUndefined();
  }, 120_000);
});

describe('long paragraphs on import (#1205)', () => {
  it('splits a paragraph over the bound at its soft line breaks, and discloses the source paragraph of each block', async () => {
    const { staged } = await stage({ ...HEADINGLESS, joined: { ...JOINED, softBreaks: true } });
    expect(staged.structure!.softBreakSplits).toMatchObject([{ sourceOrdinal: 3, firstPosition: 3, pieceCount: 12 }]);
    expect(staged.structure!.longParagraphs).toEqual([]);
    const { blocks } = await commit(review(staged));
    const source = await sourceBlocks();
    expect(blocks().slice(2, 14).map((block) => block.text)).toEqual(source.slice(2, 14).map((block) => block.text));
    expect(blocks()).toHaveLength(30);
  }, 120_000);

  it('waits for the one choice when a paragraph has no soft break, then keeps the bound cuts as several blocks', async () => {
    const { staged } = await stage({ ...HEADINGLESS, joined: { ...JOINED, softBreaks: false } });
    const [long] = staged.structure!.longParagraphs;
    expect(long).toMatchObject({ sourceOrdinal: 3, firstPosition: 3 });
    expect(() => review(staged)).toThrow(expect.objectContaining({ code: 'STRUCTURE_CHOICE_REQUIRED' }));
    const { blocks } = await commit(review(staged, { headings: [], longParagraphs: 'blocks' }));
    const pieces = blocks().slice(2, 2 + long!.choice!.blocks);
    expect(pieces.slice(0, -1).every((block) => [...new Intl.Segmenter('zh-CN').segment(block.text)].length === MAX_BLOCK_GRAPHEMES)).toBe(true);
    const source = await sourceBlocks();
    expect(pieces.map((block) => block.text).join('')).toBe(source.slice(2, 14).map((block) => block.text).join(''));
  }, 120_000);

  it('splits the same paragraph at sentence ends when the editor chooses so, each block ending a sentence', async () => {
    const { staged } = await stage({ ...HEADINGLESS, joined: { ...JOINED, softBreaks: false } });
    const sentences = staged.structure!.longParagraphs[0]!.choice!.sentences;
    const reviewed = review(staged, { headings: [], longParagraphs: 'sentences' });
    expect(reviewed.structure!.projection.longParagraphs[0]!.pieceCount).toBe(sentences);
    const { blocks } = await commit(reviewed);
    const pieces = blocks().slice(2, 2 + sentences);
    expect(pieces.every((block) => /[。！？!?…][”’」』）)》"'】]*$/u.test(block.text))).toBe(true);
    const source = await sourceBlocks();
    expect(pieces.map((block) => block.text).join('')).toBe(source.slice(2, 14).map((block) => block.text).join(''));
  }, 120_000);

  it('exports a split paragraph as its pieces and a confirmed heading from the file unchanged', async () => {
    const { staged } = await stage({ ...HEADINGLESS, joined: { ...JOINED, softBreaks: false } });
    const heading = staged.structure!.headings[1]!.position;
    const { book, blocks } = await commit(review(staged, { headings: [{ position: heading, level: 1 }], longParagraphs: 'blocks' }));
    const target = { kind: 'current' } as const;
    const reviewed = await store.reviewManuscriptExport({ bookId: book.bookId, target, options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS } }, true);
    const destination = join(roots.inputRoot, 'structured.docx');
    const preparation = await store.prepareManuscriptExport({ bookId: book.bookId, revisionId: reviewed.target.revisionId, target,
      options: { ...DEFAULT_MANUSCRIPT_EXPORT_OPTIONS }, reviewDigest: reviewed.reviewDigest, destination }, true);
    await store.approveManuscriptExport({ bookId: book.bookId, preparationId: preparation.preparationId }, true);
    const reread: ParsedDocxBlock[] = [];
    await parseDocx(destination, 'written.docx', (block) => reread.push(block));
    expect(reread.map((block) => block.text)).toEqual(blocks().map((block) => block.text));
    expect(reread.every((block) => block.kind === 'paragraph')).toBe(true);
  }, 120_000);
});
