import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import type { ProducedEditorialMarkInput } from '../../src/service/editorial-marks.js';
import { decodeRequest, encodeServiceResponse } from '../../src/service/request-frames.js';
import { markModelLabels, type MarkModelBinding } from '../../src/service/editorial-mark-source.js';
import { matchesEditorialMarkFilter } from '../../src/renderer/editorial-mark-filter.js';
import { editorialMarkFilterModel } from '../../src/shared/editorial-mark-category.js';
import { MAX_FRAME_BYTES, MAX_WINDOW_MARKS, type EditorialMarkAnchorProjection, type FindPendingMarkInput, type ManuscriptWindowProjection,
  type ServiceResponse } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book } from '../support/sample1-baseline.js';

// #1604: exact admitted sample1 with a tester's edit — one paragraph lengthened and covered by produced marks, provider-free.
const ID = '00000000-0000-4000-8000-000000000000';
const LOCAL: MarkModelBinding = { route: 'ai7-local-deterministic', model: 'local-text-check' };
const OTHER: MarkModelBinding = { route: 'test-route', model: 'test-model' };
let roots: ServiceTestRoots;
let store: EditorialStore;
beforeEach(async () => { roots = await createServiceTestRoots('ai7-window-marks-'); });
afterEach(async () => { store?.close(); store = undefined!; await roots.dispose(); });

type Book = Awaited<ReturnType<typeof importSample1Book>>;

/** One request as the renderer sends it: a decoded request frame, the store, and an encoded response frame within the frame. */
function call<T>(op: 'getManuscriptWindowAt' | 'findPendingMark', input: object, read: (input: never) => T): T {
  const request = decodeRequest(new TextEncoder().encode(JSON.stringify({ id: ID, op, input })));
  const result = read(request.input as never);
  expect(encodeServiceResponse({ id: ID, ok: true, op, result } as ServiceResponse).length).toBeLessThanOrEqual(MAX_FRAME_BYTES + 4);
  return result;
}
const windowAt = (book: Book, blockId: string, marks?: { afterOrdinal: number; digest: string }): ManuscriptWindowProjection =>
  call('getManuscriptWindowAt', { manuscriptId: book.manuscriptId, branchId: book.branchId, target: { kind: 'window-start', blockId }, ...(marks ? { marks } : {}) },
    (input: { manuscriptId: string; branchId: string; target: { kind: 'window-start'; blockId: string }; marks?: { afterOrdinal: number; digest: string } }) =>
      store.getManuscriptWindowAt(input.manuscriptId, input.branchId, input.target, input.marks));
const find = (book: Book, input: Omit<FindPendingMarkInput, 'manuscriptId' | 'branchId'>) =>
  call('findPendingMark', { manuscriptId: book.manuscriptId, branchId: book.branchId, ...input }, (frame: FindPendingMarkInput) => store.findPendingMark(frame)).mark;

/** sample1's first paragraph lengthened to `graphemes`, then `count` open marks on it, in reading order of their ranges. */
async function denseParagraph(count: number, graphemes: number, source: (index: number) => { label: string; binding: MarkModelBinding }) {
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  const book = await importSample1Book(store, roots.codeRoot, '标记分页公开样书');
  const blockId = store.getManuscriptWindow(book.manuscriptId, book.branchId, null).blocks.find((block) => block.kind === 'paragraph')!.blockId;
  for (let written = 0; written < graphemes; written += 250) {
    const window = store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId });
    const block = window.blocks.find((entry) => entry.blockId === blockId)!;
    store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: window.revisionId,
      blockId, windowStartBlockId: window.blocks[0]!.blockId, baseBlockDigest: block.digest, expectedJournalSequence: window.journalSequence,
      fromGrapheme: 0, toGrapheme: 0, insertText: '停住…又望。'.repeat(200).slice(0, Math.min(250, graphemes - written)) });
  }
  const text = Array.from(store.getManuscriptWindowAt(book.manuscriptId, book.branchId, { kind: 'block', blockId }).blocks.find((entry) => entry.blockId === blockId)!.text);
  const ids = store.createProducedEditorialMarks(Array.from({ length: count }, (_, index) => {
    const from = index % graphemes, { label, binding } = source(index);
    return { manuscriptId: book.manuscriptId, branchId: book.branchId, blockId, fromGrapheme: from, toGrapheme: from + 1, pinnedText: text[from]!,
      kind: 'annotation' as const, body: `公开合成批注 ${index}`, proposedText: null, rationale: null, atomicGroupId: null, sourceModelBinding: binding,
      source: { kind: 'ai7' as const, origin: 'review-category' as const, label, taskId: null }, basis: [] };
  }), (markIds) => markIds.map((markId) => markId!));
  return { book, blockId, ids };
}

/** Every page of a window's marks, read as the interface reads them: the first, then each `nextOrdinal` with its digest. */
function everyPage(book: Book, blockId: string): { marks: EditorialMarkAnchorProjection[]; reads: number } {
  let page = windowAt(book, blockId);
  const marks = [...page.marks];
  let reads = 1;
  while (page.marksPage?.nextOrdinal != null) {
    page = windowAt(book, blockId, { afterOrdinal: page.marksPage.nextOrdinal, digest: page.marksPage.digest });
    reads += 1;
    expect(page.marks.length).toBe(page.marksPage!.shown);
    marks.push(...page.marks);
  }
  return { marks, reads };
}

/** The whole Book's walk of `findPendingMark` in one direction under a filter, from `from` to where it answers `null`. */
function walk(book: Book, direction: 'next' | 'previous', filter: Pick<FindPendingMarkInput, 'categories' | 'models'>, from: FindPendingMarkInput['from']): string[] {
  const seen: string[] = [];
  for (let at = from; ;) {
    const mark = find(book, { from: at, direction, ...filter });
    if (mark === null) return seen;
    seen.push(mark.markId);
    at = { blockId: mark.blockId, grapheme: mark.fromGrapheme, markId: mark.markId };
    expect(seen.length).toBeLessThanOrEqual(5_000);
  }
}

it('reaches every one of 1,000 marks in one paragraph by window pages and by 上一条 / 下一条待处理 under a filter (#1604)', async () => {
  const { book, blockId, ids } = await denseParagraph(1_000, 1_000, (index) => index % 2 === 0
    ? { label: '错别字与规范', binding: LOCAL } : { label: '事实核查', binding: OTHER });
  const first = windowAt(book, blockId);
  expect(first.marks).toHaveLength(MAX_WINDOW_MARKS);
  expect(first.marksTruncated).toBe(true);
  expect(first.marksPage).toMatchObject({ shown: MAX_WINDOW_MARKS, total: 1_000, nextOrdinal: MAX_WINDOW_MARKS });
  const { marks, reads } = everyPage(book, blockId);
  expect(reads).toBe(3);
  expect(marks.map((mark) => mark.markId).sort()).toEqual([...ids].sort());
  expect(new Set(marks.map((mark) => mark.markId)).size).toBe(1_000);
  expect(first.marksPage!.digest).toBe(createHash('sha256').update(JSON.stringify(marks.map((mark) => mark.markId)), 'utf8').digest('hex'));
  expect(marks.map((mark) => mark.fromGrapheme)).toEqual([...marks.map((mark) => mark.fromGrapheme)].sort((a, b) => a - b));

  const start = { blockId: first.blocks[0]!.blockId, grapheme: -1, markId: null };
  const language = ids.filter((_, index) => index % 2 === 0);
  expect(walk(book, 'next', { categories: ['language'], models: [] }, start)).toEqual(language);
  expect(walk(book, 'next', { categories: [], models: ['AI7 本地检查'] }, start)).toEqual(language);
  expect(walk(book, 'next', { categories: ['factual'], models: [markModelLabels(OTHER).modelLabel!] }, start)).toEqual(ids.filter((_, index) => index % 2 === 1));
  expect(walk(book, 'next', { categories: ['factual'], models: ['AI7 本地检查'] }, start)).toEqual([]);
  const end = { blockId: first.blocks.at(-1)!.blockId, grapheme: 1_000_000, markId: null };
  expect(walk(book, 'previous', { categories: [], models: [] }, end)).toEqual([...ids].reverse());
});

it('refuses a later page when the window\'s marks changed since its digest, and keeps a window of at most 400 marks as it was', async () => {
  const { book, blockId } = await denseParagraph(MAX_WINDOW_MARKS, 1_000, () => ({ label: '错别字与规范', binding: LOCAL }));
  const whole = windowAt(book, blockId);
  expect(whole.marks).toHaveLength(MAX_WINDOW_MARKS);
  expect(whole.marksTruncated).toBe(false);
  expect(Object.hasOwn(whole, 'marksPage')).toBe(false);
  const text = Array.from(whole.blocks.find((block) => block.blockId === blockId)!.text);
  store.createProducedEditorialMarks([{ manuscriptId: book.manuscriptId, branchId: book.branchId, blockId, fromGrapheme: 999, toGrapheme: 1_000, pinnedText: text[999]!,
    kind: 'annotation', body: '公开合成批注', proposedText: null, rationale: null, atomicGroupId: null, sourceModelBinding: LOCAL,
    source: { kind: 'ai7', origin: 'review-category', label: '错别字与规范', taskId: null }, basis: [] }], () => undefined);
  const paged = windowAt(book, blockId);
  expect(paged.marksPage).toMatchObject({ shown: MAX_WINDOW_MARKS, total: MAX_WINDOW_MARKS + 1, nextOrdinal: MAX_WINDOW_MARKS });
  store.createProducedEditorialMarks([{ manuscriptId: book.manuscriptId, branchId: book.branchId, blockId, fromGrapheme: 0, toGrapheme: 1, pinnedText: text[0]!,
    kind: 'annotation', body: '公开合成批注', proposedText: null, rationale: null, atomicGroupId: null, sourceModelBinding: LOCAL,
    source: { kind: 'ai7', origin: 'review-category', label: '错别字与规范', taskId: null }, basis: [] }], () => undefined);
  let refused: unknown;
  try { windowAt(book, blockId, { afterOrdinal: MAX_WINDOW_MARKS, digest: paged.marksPage!.digest }); } catch (error) { refused = error; }
  expect(refused).toMatchObject({ code: 'WINDOW_MARKS_CHANGED' });
});

it('reaches the last of 2,000 marks in one paragraph by sequential pages, every frame within the frame bound', async () => {
  const { book, blockId, ids } = await denseParagraph(2_000, 1_000, () => ({ label: '错别字与规范', binding: LOCAL }));
  const { marks, reads } = everyPage(book, blockId);
  expect(reads).toBe(5);
  expect(marks.map((mark) => mark.markId).sort()).toEqual([...ids].sort());
  expect(marks.slice(-2).map((mark) => mark.markId)).toContain(ids.at(-1));
  // An inline revision past the first page (Issue #1604 review): applying it answers its card and the window's paging facts.
  const head = windowAt(book, blockId), later = head.blocks.find((block) => block.kind === 'paragraph' && block.blockId !== blockId && Array.from(block.text).length > 4)!;
  store.flushJournalEdit({ clientEditId: randomUUID(), manuscriptId: book.manuscriptId, branchId: book.branchId, baseRevisionId: head.revisionId, blockId: later.blockId,
    windowStartBlockId: blockId, baseBlockDigest: later.digest, expectedJournalSequence: head.journalSequence, fromGrapheme: 0, toGrapheme: 2, insertText: '公开修订',
    editorRevision: { sessionId: randomUUID(), autoApply: false } });
  const revision = everyPage(book, blockId).marks.find((mark) => mark.inlineRevision)!;
  const applied = store.updateEditorialMark({ manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: blockId, markId: revision.markId,
    action: 'apply-inline-revision', body: null, highlightColor: null, status: null, targetKind: null, proposedText: null, rationale: null });
  expect(applied.marks.some((mark) => mark.markId === revision.markId)).toBe(false);
  expect(applied.card?.status).toBe('applied');
  expect(applied.marksPage).toMatchObject({ shown: MAX_WINDOW_MARKS, total: 2_001, nextOrdinal: MAX_WINDOW_MARKS });
});

it('steps exactly as the rail lists and as the 批注栏\'s own filter judges each mark of the window (#1604 parity)', async () => {
  const sources = [{ label: '错别字与规范', binding: LOCAL }, { label: '事实核查', binding: OTHER }, { label: '人物逻辑', binding: { route: 'test-route', model: 'other-model', reasoningEffort: 'high' } },
    { label: '文学表达', binding: OTHER }, { label: '自定义类别', binding: LOCAL }];
  const { book, blockId } = await denseParagraph(40, 1_000, (index) => sources[index % sources.length]!);
  const at = windowAt(book, blockId), block = at.blocks.find((entry) => entry.blockId === blockId)!, text = Array.from(block.text);
  const produced = (from: number, extra: Partial<ProducedEditorialMarkInput> & Pick<ProducedEditorialMarkInput, 'source'>): ProducedEditorialMarkInput => ({ manuscriptId: book.manuscriptId, branchId: book.branchId, blockId, fromGrapheme: from, toGrapheme: from + 1,
    pinnedText: text[from]!, kind: 'annotation' as const, body: '公开合成批注', proposedText: null, rationale: null, atomicGroupId: null, basis: [], ...extra });
  // Two marks on one place, an AI mark whose Task records no model, an imported author's open and resolved 批注 — then the editor's 批注 and highlight.
  store.createProducedEditorialMarks([
    produced(3, { kind: 'change-suggestion', body: '', proposedText: '另', source: { kind: 'ai7', origin: 'review-category', label: '错别字与规范', taskId: null }, sourceModelBinding: OTHER }),
    produced(5, { source: { kind: 'ai7', origin: 'task', label: '自定义类别', taskId: randomUUID() } }),
    produced(7, { source: { kind: 'imported-author', label: '公开作者' } }),
    produced(9, { source: { kind: 'imported-author', label: '公开作者' }, status: 'resolved' }),
  ], () => undefined);
  for (const [from, kind] of [[11, 'annotation'], [13, 'personal-highlight']] as const) {
    const now = windowAt(book, blockId), now_block = now.blocks.find((entry) => entry.blockId === blockId)!;
    store.createEditorialMark({ manuscriptId: book.manuscriptId, branchId: book.branchId, windowStartBlockId: now.blocks[0]!.blockId, clientMarkId: randomUUID(),
      baseRevisionId: now.revisionId, expectedJournalSequence: now.journalSequence, blockId, baseBlockDigest: now_block.digest, fromGrapheme: from, toGrapheme: from + 1,
      selectedText: text[from]!, kind, highlightColor: kind === 'personal-highlight' ? 1 : null, body: kind === 'annotation' ? '编辑的公开批注' : '', proposedText: null, rationale: null });
  }
  const page = windowAt(book, blockId);
  expect(page.marks).toHaveLength(46);
  const cards = new Map(page.marks.map((mark) => [mark.markId, store.getEditorialMarkCard(book.manuscriptId, book.branchId, mark.markId)]));
  const start = { blockId: page.blocks[0]!.blockId, grapheme: -1, markId: null }, end = { blockId: page.blocks.at(-1)!.blockId, grapheme: 1_000_000, markId: null };
  const kinds = new Map(page.marks.map((mark) => [mark.markId, mark.kind]));
  // Unfiltered, both ways: the rail's places, in the rail's order (ties at one place included); no resolved mark, no highlight.
  const rail = store.getManuscriptRail(book.manuscriptId, book.branchId).marks.map((place) => `${place.kind}@${place.blockId}`);
  const forward = walk(book, 'next', { categories: [], models: [] }, start);
  expect(forward.map((markId) => `${kinds.get(markId)}@${blockId}`)).toEqual(rail);
  expect(walk(book, 'previous', { categories: [], models: [] }, end)).toEqual([...forward].reverse());
  expect(forward).toHaveLength(44);
  // Every (category, model) the window holds, each way: exactly the marks the pane's filter passes; a mark not AI7's never passes a model.
  const pairs = new Set(page.marks.map((mark) => JSON.stringify([mark.categoryKey, editorialMarkFilterModel(cards.get(mark.markId)!.source)])));
  expect(pairs.size).toBe(sources.length + 4);
  for (const pair of pairs) {
    const [category, model] = JSON.parse(pair) as [EditorialMarkAnchorProjection['categoryKey'], string | null];
    const filter = { selectedCategories: new Set([category]), selectedModels: new Set(model === null ? [] : [model]), status: 'open' as const, keyword: '' };
    const expected = forward.filter((markId) => matchesEditorialMarkFilter(page.marks.find((mark) => mark.markId === markId)!, cards.get(markId), filter));
    const step = { categories: [category], models: model === null ? [] : [model] };
    expect(walk(book, 'next', step, start), pair).toEqual(expected);
    expect(walk(book, 'previous', step, end), pair).toEqual([...expected].reverse());
  }
  const everyModel = [...new Set([...cards.values()].map((card) => editorialMarkFilterModel(card.source)).filter((model) => model !== null))] as string[];
  expect(everyModel).toContain('AI7');
  expect(walk(book, 'next', { categories: [], models: everyModel }, start).every((markId) => cards.get(markId)!.source.kind === 'ai7')).toBe(true);
});

it('tells two marks that freeze no model name apart by the models their Tasks recorded (#1604)', async () => {
  const { book, blockId, ids } = await denseParagraph(1, 100, () => ({ label: '错别字与规范', binding: LOCAL }));
  const text = Array.from(windowAt(book, blockId).blocks.find((block) => block.blockId === blockId)!.text);
  const tasks = [randomUUID(), randomUUID()], models = ['recorded-model-a', 'recorded-model-b'];
  // Each Task's provider resolution names the model it ran on; neither mark froze one.
  const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { enableForeignKeyConstraints: false });
  tasks.forEach((task, index) => database.prepare('INSERT INTO analysis_plan_records(task_intent_id, plan_version, component, canonical_json, sha256, created_at) VALUES (?, 1, ?, ?, ?, ?)')
    .run(task, 'provider-resolution-plan', JSON.stringify({ executionRoute: { kind: 'test-route', model: models[index] } }), 'a'.repeat(64), '2000-01-01T00:00:00.000Z'));
  database.close();
  const recorded = store.createProducedEditorialMarks(tasks.map((taskId, index) => ({ manuscriptId: book.manuscriptId, branchId: book.branchId, blockId,
    fromGrapheme: 10 + index * 10, toGrapheme: 11 + index * 10, pinnedText: text[10 + index * 10]!, kind: 'annotation' as const, body: '公开合成批注', proposedText: null,
    rationale: null, atomicGroupId: null, source: { kind: 'ai7' as const, origin: 'task' as const, label: '自定义类别', taskId }, basis: [] })), (markIds) => markIds.map((markId) => markId!));
  const start = { blockId: windowAt(book, blockId).blocks[0]!.blockId, grapheme: -1, markId: null };
  expect(walk(book, 'next', { categories: [], models: [models[0]!] }, start)).toEqual([recorded[0]]);
  expect(walk(book, 'next', { categories: [], models: [models[1]!] }, start)).toEqual([recorded[1]]);
  expect(walk(book, 'next', { categories: [], models: models }, start)).toEqual(recorded);
  expect(walk(book, 'previous', { categories: [], models: [models[0]!] }, { blockId, grapheme: 1_000_000, markId: null })).toEqual([recorded[0]]);
  expect(walk(book, 'next', { categories: [], models: ['AI7 本地检查'] }, start)).toEqual(ids);
});

it('refuses a malformed marks page or pending step at the request frame', () => {
  const frame = (op: string, input: object) => () => decodeRequest(new TextEncoder().encode(JSON.stringify({ id: ID, op, input })));
  const at = { manuscriptId: ID, branchId: ID, target: { kind: 'start' } };
  expect(frame('getManuscriptWindowAt', { ...at, marks: { afterOrdinal: 400, digest: 'a'.repeat(64) } })).not.toThrow();
  expect(frame('getManuscriptWindowAt', { ...at, marks: { afterOrdinal: -1, digest: 'a'.repeat(64) } })).toThrow();
  expect(frame('getManuscriptWindowAt', { ...at, marks: { afterOrdinal: 400, digest: 'not-a-digest' } })).toThrow();
  const step = { manuscriptId: ID, branchId: ID, from: { blockId: `blk_${'0'.repeat(24)}`, grapheme: -1, markId: null }, direction: 'next', categories: ['language'], models: ['AI7'] };
  expect(frame('findPendingMark', step)).not.toThrow();
  expect(frame('findPendingMark', { ...step, categories: ['no-such-category'] })).toThrow();
  expect(frame('findPendingMark', { ...step, direction: 'down' })).toThrow();
});
