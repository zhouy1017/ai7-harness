import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { createImportReview } from '../../src/renderer/import-review.js';
import { configureImportEntry, installImportDrop } from '../../src/renderer/import-entry.js';
import { DEFAULT_QUICK_ACTIONS } from '../../src/shared/preferences.js';
import { importFileLabel } from '../../src/renderer/import-review-labels.js';
import { localInstantLabel } from '../../src/renderer/plan-preview-labels.js';
import { setTechnicalLayerVisible, technicalDisclosure } from '../../src/renderer/technical-layer.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, sample1Path } from '../support/sample1-baseline.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';
import type { RendererApi, StagedImportProjection } from '../../src/shared/protocol.js';

let restore: () => void;
let roots: Awaited<ReturnType<typeof createServiceTestRoots>>;
let store: EditorialStore;
let staged: StagedImportProjection;
let bookId: string;
let root: HTMLElement;
let view: ReturnType<typeof createImportReview>;
const status = vi.fn();
const record = vi.fn(async (_request: unknown): Promise<unknown> => { throw new Error('recorded'); });
const listBooks = vi.fn();
const lineagePage = vi.fn();
const serviceWait = vi.fn();
const returnEditing = vi.fn();
const continueDraft = vi.fn();
const settle = async () => { for (let i=0;i<4;i++) await new Promise(resolve=>setTimeout(resolve,0)); };
const control = (selector: string) => root.querySelector(selector) as unknown as MiniElement;
const change = (selector: string) => control(selector).dispatchEvent({ type: 'change' });
const target = () => staged.targetChoices.find(choice=>choice.kind==='existing-book')!;
const newBook = () => staged.targetChoices.find(choice=>choice.kind==='new-book')!;
const draw = (relationship: 'source-only' | 'reimport' = 'source-only', projection = staged) =>
  view.renderTargetChoice(projection, `existing-book:${bookId}`, undefined, undefined, relationship);

beforeEach(async () => {
  restore = installMiniDom(); setTechnicalLayerVisible(false); record.mockClear(); status.mockClear(); listBooks.mockReset(); lineagePage.mockReset(); serviceWait.mockReset();
  returnEditing.mockReset(); continueDraft.mockReset();
  vi.stubGlobal('Event', class { constructor(public type: string) {} });
  vi.stubGlobal('Option', function (text: string, value: string) { const option = document.createElement('option'); option.textContent = text; option.value = value; return option; });
  vi.stubGlobal('window', { ai7: { prepareSourceImportReview: record, prepareManuscriptReimport: record,
    prepareNewBookReview: record, returnImportToEditing: returnEditing, continueImportDraft: continueDraft,
    getPreferences: async () => ({ values: { 'actions.defaults': DEFAULT_QUICK_ACTIONS } }),
    listBooks, getReimportLineageSourceVersionPage: lineagePage }, setTimeout, clearTimeout });
  roots = await createServiceTestRoots('ai7-import-page-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  bookId = (await importSample1Book(store, roots.codeRoot, '公开样书')).bookId;
  staged = await store.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
  root = document.createElement('main'); document.body.append(root);
  view = createImportReview({ appendRecoveryReturnAction: vi.fn(), technicalDetails: (_class, ...rows) => {
    const details=document.createElement('details'); details.className='technical-details'; details.append(...rows); return technicalDisclosure(details);
  }, replaceScreen: (_state, content) => root.replaceChildren(content), rendererErrorMessage: (_error, fallback) => fallback,
    abandonAndContinue: vi.fn(), awaitServiceJob: serviceWait, hasErrorCode: (error, code) => (error as { code?: string }).code === code,
    identityFindingDisclosure: () => document.createElement('div'), initializeStartup: vi.fn(), instantValue: () => document.createElement('span'),
    renderError: vi.fn(), renderImported: vi.fn(), setStatus: status, sourceCard: () => document.createElement('div') });
});
afterEach(async () => { store.close(); await roots.dispose(); setTechnicalLayerVisible(true); restore(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('keeps the distinct-work label first, selected target and changing target notes', () => {
  draw();
  const options = Array.from(root.querySelectorAll('option'));
  expect(options[0]!.textContent).toBe(newBook().label);
  expect((options.find(option=>option.dataset['bookId']===bookId) as HTMLOptionElement).selected).toBe(true);
  expect(root.textContent).toContain('已有主稿件；仍可导入来源材料');
  control('[id="import-book"]').value = newBook().id; change('[id="import-book"]');
  expect(root.querySelector('[id="book-title"]')).not.toBeNull();
  expect(root.textContent).toContain('用文件名作为书名。');
  expect((root.querySelector('option') as HTMLOptionElement).selected).toBe(true);
});

it('returns from details with title, Word, text-box and editable structure choices, then uses the returned version', async () => {
  const review = store.prepareNewBookReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: newBook().id as 'new-book', confirmedTitle: '修改后的书名' }, true);
  const returned = store.returnImportToEditing(staged.draftId, review.draftVersion);
  if (returned.state !== 'staged') throw new Error('Expected editable import');
  const word = { mode: 'accepted-baseline' as const, learnFromEdits: false, acceptedBaselineConfirmed: true };
  const structure = { headings: [{ position: 1, level: 2 }], longParagraphs: 'blocks' as const };
  returnEditing.mockResolvedValue({ ...returned, editingChoices: { ...returned.editingChoices, textBoxDisposition: 'merge', trackedChanges: word, structure },
    staged: { ...returned.staged, fidelity: staged.fidelity.map(row => row.key === 'text-boxes' ? { ...row, count: 1, status: 'retained' } : row),
      wordTrackedChanges: { compatibility: 'ready', previewReading: 'accepted', readings: { accepted: { usable: true, blockCount: 1 }, rejected: { usable: true, blockCount: 1 } }, savedChoice: null },
      structure: { headings: [{ position: 1, suggestedLevel: 1, rule: 'numbered', excerpt: '' }], headingsTruncated: false, softBreakSplits: [],
        longParagraphs: [{ sourceOrdinal: 2, firstPosition: 2, pieceCount: 2, choice: { sentences: 2, blocks: 3 }, excerpt: '' }] } } });
  view.renderReview(review);
  control('[data-return-import-to-editing]').click(); await settle();
  expect(returnEditing).toHaveBeenCalledWith({ draftId: review.draftId, expectedDraftVersion: review.draftVersion });
  expect(control('[id="book-title"]').value).toBe('修改后的书名');
  expect(control('[data-import-relationship="first-manuscript"]').checked).toBe(true);
  expect(control('[data-text-box-disposition="merge"]').checked).toBe(true);
  expect(control('[data-word-import-mode="accepted-baseline"]').checked).toBe(true);
  expect(control('[data-word-learn-from-edits]').checked).toBe(false);
  expect(control('[data-structure-candidate="1"]').disabled).toBe(false);
  expect(control('[data-structure-level="1"]').value).toBe('2');
  expect(control('[data-long-paragraph-choice="blocks"]').checked).toBe(true);
  Array.from(root.querySelectorAll('button')).find(button => button.textContent === '导入')!.click(); await settle();
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ expectedDraftVersion: returned.draftVersion, acceptDegradation: true,
    textBoxDisposition: 'merge', trackedChanges: word, structure }));
});

it('returns source-only details to the same Book and relationship', async () => {
  const review = store.prepareSourceImportReview(staged.draftId, staged.draftVersion,
    { kind: 'existing-book', bookId, relationship: 'source-only', reuseSourceVersionId: staged.identityFindings[0]!.sourceVersionId });
  const returned = store.returnImportToEditing(staged.draftId, review.draftVersion);
  returnEditing.mockResolvedValue(returned);
  view.renderSourceImportReview(review);
  control('[data-return-import-to-editing]').click(); await settle();
  expect((root.querySelector(`option[data-book-id="${bookId}"]`) as HTMLOptionElement).selected).toBe(true);
  expect(control('[data-import-relationship="source-only"]').checked).toBe(true);
  control('[data-prepare-source-import-review]').click(); await settle();
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ expectedDraftVersion: returned.draftVersion, target: expect.objectContaining({ bookId, relationship: 'source-only' }) }));
});

it.each(['first-manuscript', 'source-only'] as const)('recovers REVIEW_CHANGED from %s details with a fresh target and the service notice', async (relationship) => {
  const query = miniDocument.querySelector.bind(miniDocument);
  vi.spyOn(miniDocument, 'querySelector').mockImplementation(selector => selector.startsWith('#screen') ? null : query(selector));
  const review = relationship === 'first-manuscript'
    ? store.prepareNewBookReview(staged.draftId, staged.draftVersion, { kind: 'new-book', choiceId: newBook().id as 'new-book', confirmedTitle: '旧书名' }, true)
    : store.prepareSourceImportReview(staged.draftId, staged.draftVersion, { kind: 'existing-book', bookId, relationship, reuseSourceVersionId: staged.identityFindings[0]!.sourceVersionId });
  returnEditing.mockRejectedValue({ code: 'REVIEW_CHANGED' });
  continueDraft.mockResolvedValue({ state: 'target-review-required', staged: { ...staged, draftVersion: review.draftVersion + 1 }, notice: '导入目标已变化，请重新选择导入目标。' });
  if ('retainedBoundary' in review) view.renderSourceImportReview(review); else view.renderReview(review);
  control('[data-return-import-to-editing]').click(); await settle();
  expect(continueDraft).toHaveBeenCalledWith({ draftId: review.draftId, expectedDraftVersion: review.draftVersion });
  expect(root.textContent).toContain('导入目标已变化，请重新选择导入目标。');
  expect(control('[id="book-title"]').value).not.toBe('旧书名');
  Array.from(root.querySelectorAll('button')).find(button => button.textContent === '导入')!.click(); await settle();
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ expectedDraftVersion: review.draftVersion + 1 }));
});

it('opens a restart form with only the saved Word and structure choices', () => {
  const structure = { headings: [{ position: 1, level: 3 }], longParagraphs: null };
  view.renderTargetChoice({ ...staged, savedStructureChoice: structure,
    structure: { headings: [{ position: 1, suggestedLevel: 1, rule: 'numbered', excerpt: '' }], headingsTruncated: false, softBreakSplits: [], longParagraphs: [] },
    wordTrackedChanges: { compatibility: 'ready', previewReading: 'rejected', readings: { accepted: { usable: true, blockCount: 1 }, rejected: { usable: true, blockCount: 1 } },
      savedChoice: { mode: 'suggestions', learnFromEdits: false, acceptedBaselineConfirmed: false } } }, newBook().id);
  expect(control('[id="book-title"]').value).toBe('sample1');
  expect(control('[data-structure-candidate="1"]').checked).toBe(true);
  expect(control('[data-structure-level="1"]').value).toBe('3');
  expect(control('[data-word-learn-from-edits]').checked).toBe(false);
});

it('states same-Book reuse without a radio and sends the same source-only request', async () => {
  draw();
  expect(root.querySelector('[data-source-version-reuse-choices] input')).toBeNull();
  expect(control('[data-source-version-reuse-choices]').textContent).toBe('这本书已导入过同一个文件，将沿用那一份。');
  control('[data-prepare-source-import-review]').click(); await settle();
  expect(record).toHaveBeenCalledWith({ draftId: staged.draftId, expectedDraftVersion: staged.draftVersion,
    target: { kind:'existing-book', bookId, relationship:'source-only', reuseSourceVersionId: staged.identityFindings[0]!.sourceVersionId } });
});

it('states a noneditable relationship without a radiogroup or radio and sends source-only', async () => {
  draw('source-only', { ...staged, editableImport: { available:false, code:'FORMAT_UNSUPPORTED_FOR_EDITABLE_IMPORT', reason:'不支持编辑' } });
  expect(control('[data-import-relationship-choices]').getAttribute('role')).toBeNull();
  expect(root.querySelector('[data-import-relationship-choices] input')).toBeNull();
  expect(root.textContent).toContain('这个文件只能存为来源材料。');
  control('[data-prepare-source-import-review]').click(); await settle();
  expect(record.mock.calls[0]![0]).toMatchObject({ target:{ relationship:'source-only', reuseSourceVersionId: staged.identityFindings[0]!.sourceVersionId } });
});

it('states unconfirmed lineage and a new source, preserving their request values', async () => {
  const projection = { ...staged, identityFindings: [], targetChoices: staged.targetChoices.map(choice=>choice.kind==='existing-book'
    ? { ...choice, reimportLineageSourceVersionIds: [] } : choice) };
  draw('reimport', projection);
  expect(root.querySelector('[data-reimport-lineage-choices] input')).toBeNull();
  expect(root.textContent).toContain('没有找到这本书的原文件，将对比这次导入与当前稿件。');
  expect(control('[data-reimport-source-version-choices]').textContent).toContain('这个文件将作为新的原文件保存。');
  expect(root.querySelector('[data-reimport-source-version-choices] input')).toBeNull();
  control('[data-prepare-manuscript-reimport]').click(); await settle();
  expect(record.mock.calls[0]![0]).toEqual({ draftId:staged.draftId, expectedDraftVersion:staged.draftVersion,
    target:{kind:'existing-book',bookId,relationship:'reimport',lineage:{kind:'unconfirmed'},reuseSourceVersionId:null} });
});

it('states source reuse on update and preserves verified lineage and reuse in the request', async () => {
  draw('reimport');
  expect(control('[data-reimport-source-version-choices]').textContent).toContain('这个文件之前导入过，将沿用那一份。');
  expect(root.querySelector('[data-reimport-source-version-choices] input')).toBeNull();
  control('[data-prepare-manuscript-reimport]').click(); await settle();
  const choice=target(); if(choice.kind!=='existing-book') throw new Error('missing book');
  expect(record.mock.calls[0]![0]).toEqual({draftId:staged.draftId,expectedDraftVersion:staged.draftVersion,target:{kind:'existing-book',bookId,
    relationship:'reimport',lineage:{kind:'verified-source-version',sourceVersionId:choice.reimportLineageSourceVersionIds[0]!.sourceVersionId},
    reuseSourceVersionId:staged.identityFindings[0]!.sourceVersionId}});
});

it('names unnamed files with local time and keeps the selected item when paging away', async () => {
  const first={sourceVersionId:randomUUID(),displayName:null,importedAt:'2026-11-20T06:07:00.000Z'};
  const second={sourceVersionId:randomUUID(),displayName:'sample1.docx',importedAt:'2026-11-21T06:07:00.000Z'};
  draw('reimport', {...staged,targetChoices:staged.targetChoices.map(choice=>choice.kind==='existing-book'
    ? {...choice,reimportLineageSourceVersionIds:[first,second],reimportLineageNextCursor:'next'}:choice)});
  expect(root.textContent).toContain(`未记录文件名 · 导入于 ${localInstantLabel(first.importedAt)}`);
  expect(root.textContent).toContain(importFileLabel(second));
  expect(root.textContent).not.toMatch(/确认此文件|确认第|2026-11-20T/);
  lineagePage.mockResolvedValue({items:[second],after:'next',previousCursor:null,nextCursor:null});
  control('[data-load-more-reimport-lineage]').click(); await settle();
  expect(root.textContent).toContain(importFileLabel(first));
  expect(control(`[data-source-version-id="${first.sourceVersionId}"]`).checked).toBe(true);
  control('[data-prepare-manuscript-reimport]').click(); await settle();
  expect(record.mock.calls[0]![0]).toMatchObject({target:{lineage:{kind:'verified-source-version',sourceVersionId:first.sourceVersionId}}});
});

it('retains developer identities for the selected Book and both single-source outcomes', () => {
  draw(); expect(root.querySelector('.import-book-choice .technical-details')).not.toBeNull();
  setTechnicalLayerVisible(true); draw();
  expect(root.querySelector('.import-book-choice .technical-details')!.textContent).toContain(bookId);
  expect(root.textContent).toContain(staged.identityFindings[0]!.sourceVersionId);
  draw('reimport', {...staged,identityFindings:[]});
  expect(root.textContent).toContain('来源 SHA-256');
  expect(root.textContent).toContain(staged.source.sourceSha256);
  expect(root.textContent).toContain('执行三方比较');
});

it('keeps update selected when loading more Books', async () => {
  draw('reimport', {...staged,nextBookCursor:{title:'公开样书',bookId}});
  listBooks.mockResolvedValue({items:[],nextCursor:null});
  Array.from(root.querySelectorAll('button')).find(button=>button.textContent==='加载更多图书')!.click(); await settle();
  expect(control('[data-import-relationship="reimport"]').checked).toBe(true);
  expect(root.querySelector('[data-prepare-manuscript-reimport]')).not.toBeNull();
});

it('keeps the title, text-box choice and open fold across paging and a valid Book change', async () => {
  const projection={...staged,nextBookCursor:{title:'公开样书',bookId},fidelity:staged.fidelity.map(row=>row.key==='text-boxes'?{...row,count:1,status:'retained' as const}:row)};
  view.renderTargetChoice(projection,newBook().id);
  control('[id="book-title"]').value='公开样书标题';
  control('[data-text-box-disposition="merge"]').checked=true; change('[data-text-box-disposition="merge"]');
  (control('.fidelity-details') as unknown as HTMLDetailsElement).open=true;
  listBooks.mockResolvedValue({items:[],nextCursor:null});
  Array.from(root.querySelectorAll('button')).find(button=>button.textContent==='加载更多图书')!.click(); await settle();
  expect(control('[id="book-title"]').value).toBe('公开样书标题');
  expect(control('[data-text-box-disposition="merge"]').checked).toBe(true);
  expect((control('.fidelity-details') as unknown as HTMLDetailsElement).open).toBe(true);
  control('[id="import-book"]').value=`existing-book:${bookId}`; change('[id="import-book"]');
  control('[id="import-book"]').value=newBook().id; change('[id="import-book"]');
  expect(control('[id="book-title"]').value).toBe('公开样书标题');
  control('[data-import-relationship="first-manuscript"]').checked=true; change('[data-import-relationship="first-manuscript"]');
  expect(control('[data-text-box-disposition="merge"]').checked).toBe(true);
});

it('renders the comparison fidelity as a sentence outside closed shared details', () => {
  const work=store.createManuscriptReimportPreparationWork(staged.draftId,staged.draftVersion,
    {kind:'existing-book',bookId,relationship:'reimport',lineage:{kind:'unconfirmed'},reuseSourceVersionId:staged.identityFindings[0]!.sourceVersionId});
  let prepared=store.advanceManuscriptReimportPreparationWork(work.workId);
  while(!prepared.done) prepared=store.advanceManuscriptReimportPreparationWork(work.workId);
  view.renderManuscriptReimportReview(prepared.review!);
  expect(root.querySelector('.fidelity-summary')).not.toBeNull();
  expect(root.querySelector('.fidelity-details .fidelity-summary')).toBeNull();
  expect((control('.fidelity-details') as unknown as HTMLDetailsElement).open).toBe(false);
  expect(root.querySelectorAll('.fidelity-details .fidelity-row').length).toBe(9);
  expect(root.querySelector('.fidelity-details .roundtrip-card')).not.toBeNull();
});

it('keeps Word mode and structure choices across loading more and valid target changes', async () => {
  const projection: StagedImportProjection={...staged,nextBookCursor:{title:'公开样书',bookId},
    wordTrackedChanges:{compatibility:'ready',previewReading:'rejected',readings:{accepted:{usable:true,blockCount:1},rejected:{usable:true,blockCount:1}},savedChoice:null},
    structure:{headings:[],headingsTruncated:false,softBreakSplits:[],longParagraphs:[{sourceOrdinal:1,firstPosition:1,pieceCount:2,choice:{sentences:2,blocks:2},excerpt:''}]}};
  view.renderTargetChoice(projection,newBook().id);
  control('[data-word-import-mode="accepted-baseline"]').checked=true; change('[data-word-import-mode="accepted-baseline"]');
  control('[data-long-paragraph-choice="blocks"]').checked=true; change('[data-long-paragraph-choice="blocks"]');
  listBooks.mockResolvedValue({items:[],nextCursor:null});
  Array.from(root.querySelectorAll('button')).find(button=>button.textContent==='加载更多图书')!.click(); await settle();
  expect(control('[data-word-import-mode="accepted-baseline"]').checked).toBe(true);
  expect(control('[data-long-paragraph-choice="blocks"]').checked).toBe(true);
  // Another empty Book can keep the same first-manuscript choices.
  const emptyId=randomUUID(); const existing=target(); if(existing.kind!=='existing-book') throw new Error('missing book');
  const expanded={...projection,targetChoices:[...projection.targetChoices,{...existing,id:`existing-book:${emptyId}`,bookId:emptyId,manuscriptState:'empty' as const}]};
  view.renderTargetChoice(expanded,`existing-book:${emptyId}`,undefined,undefined,'first-manuscript');
  expect(control('[data-word-import-mode="accepted-baseline"]').checked).toBe(true);
  expect(control('[data-long-paragraph-choice="blocks"]').checked).toBe(true);
});

it.each([false, true])('uses first-manuscript defaults when leaving a populated Book for a new or empty Book (remembered: %s)', async (remembered) => {
  // MiniDom has no child combinator; this screen lookup has no competing nested Book root.
  const query = miniDocument.querySelector.bind(miniDocument);
  vi.spyOn(miniDocument, 'querySelector').mockImplementation(selector => query(selector.replace('#screen > ', '#screen ')));
  if (remembered) vi.stubGlobal('window', { setTimeout, clearTimeout, ai7: {
    getPreferences: async () => ({ values: { 'actions.defaults': { ...DEFAULT_QUICK_ACTIONS, importBookId: bookId, importRelationship: 'source-only' } } }),
  } });
  const emptyId=randomUUID(); const existing=target(); if(existing.kind!=='existing-book') throw new Error('missing book');
  const projection={...staged,targetChoices:[...staged.targetChoices,{...existing,id:`existing-book:${emptyId}`,bookId:emptyId,manuscriptState:'empty' as const}]};
  for(const id of [newBook().id,`existing-book:${emptyId}`]) {
    view.renderTargetChoice(projection, remembered ? null : `existing-book:${bookId}`);
    await settle();
    expect(control('[data-import-relationship="source-only"]').checked).toBe(true);
    control('[id="import-book"]').value=id; change('[id="import-book"]');
    expect(control('[data-import-relationship="first-manuscript"]').checked).toBe(true);
    expect(control('[data-import-relationship="source-only"]').checked).toBe(false);
  }
});

it('keeps an editor-selected source relationship when it is valid for another Book', () => {
  view.renderTargetChoice(staged,`existing-book:${bookId}`);
  control('[data-import-relationship="source-only"]').checked=true; change('[data-import-relationship="source-only"]');
  control('[id="import-book"]').value=newBook().id; change('[id="import-book"]');
  expect(control('[data-import-relationship="source-only"]').checked).toBe(true);
  expect(control('[data-import-relationship="first-manuscript"]').checked).toBe(false);
});

it('forces source-only for a noneditable file even if the caller requests manuscript update', async () => {
  draw('reimport',{...staged,editableImport:{available:false,code:'FORMAT_UNSUPPORTED_FOR_EDITABLE_IMPORT',reason:'不支持编辑'}});
  expect(root.querySelector('[data-prepare-manuscript-reimport]')).toBeNull();
  control('[data-prepare-source-import-review]').click(); await settle();
  expect(record.mock.calls[0]![0]).toMatchObject({target:{relationship:'source-only'}});
});

it('keeps compact actions and the current update status words', async () => {
  draw('reimport'); await settle();
  expect(root.querySelector('.import-page-actions .compact-actions')).not.toBeNull();
  expect(status.mock.calls.at(-1)![0]).toContain('更新稿件的选择已确认');
  expect(status.mock.calls.at(-1)![0]).not.toContain('逐块比较');
});

it('keeps the same lineage and source value when preparation is cancelled and retried', async () => {
  let finish: (result: unknown) => void = () => { throw new Error('preparation not started'); };
  serviceWait.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  record.mockResolvedValueOnce({ jobId: randomUUID(), progress: { label: '正在准备比较', completed: 1, total: 10 } });
  vi.stubGlobal('window', { setTimeout, clearTimeout, ai7: { prepareManuscriptReimport: record,
    cancelServiceJob: vi.fn(async () => { const cancelled = { state: 'cancelled', progress: { label: '准备已取消' } }; finish(cancelled); return cancelled; }) } });
  draw('reimport');
  const choice=target(); if(choice.kind!=='existing-book') throw new Error('missing book');
  const lineageId=choice.reimportLineageSourceVersionIds[0]!.sourceVersionId;
  const sourceId=staged.identityFindings[0]!.sourceVersionId;
  control('[data-prepare-manuscript-reimport]').click(); await settle();
  expect(control('[data-cancel-reimport-preparation]').hidden).toBe(false);
  control('[data-cancel-reimport-preparation]').click(); await settle();
  expect(control('[data-prepare-manuscript-reimport]').disabled).toBe(false);
  expect(control(`[data-source-version-id="${lineageId}"]`).checked).toBe(true);
  expect(control('[data-reimport-source-version-choices]').dataset['reuseSourceVersionId']).toBe(sourceId);
  expect(root.querySelector('[data-reimport-source-version-choices] input')).toBeNull();
  control('[data-prepare-manuscript-reimport]').click(); await settle();
  expect(record).toHaveBeenCalledTimes(2);
  expect(record.mock.calls[1]![0]).toEqual(record.mock.calls[0]![0]);
});

it.each(['new', 'empty'] as const)('keeps the dropped-file source choice through a change to the %s Book and commits only source material', async (destination) => {
  // Source-only import makes a real empty Book without creating a manuscript.
  const seed = store.prepareSourceImportReview(staged.draftId, staged.draftVersion,
    { kind: 'new-book', choiceId: newBook().id, confirmedTitle: '公开来源样书', relationship: 'source-only' });
  const empty = await store.commitSourceImport({ draftId: seed.draftId, expectedDraftVersion: seed.draftVersion,
    reviewDigest: seed.reviewDigest, commitId: randomUUID() });
  staged = await store.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
  const prepare = vi.fn(async (request: Parameters<RendererApi['prepareSourceImportReview']>[0]) =>
    ({ ...store.prepareSourceImportReview(request.draftId, request.expectedDraftVersion, request.target), commitAttemptId: randomUUID() }));
  const commit = vi.fn(async (request: Parameters<RendererApi['commitSourceImport']>[0]) => {
    if (request.commitAttemptId === null) throw new Error('missing reviewed commit attempt');
    return store.commitSourceImport({ ...request, commitId: request.commitAttemptId });
  });
  vi.stubGlobal('window', { setTimeout, clearTimeout, ai7: { prepareSourceImportReview: prepare, commitSourceImport: commit,
    getPreferences: async () => ({ values: { 'actions.defaults': DEFAULT_QUICK_ACTIONS } }), savePreference: vi.fn() } });
  const stageDropped = vi.fn(async () => ({ status: 'staged' as const, staged }));
  configureImportEntry({ api: { stageDroppedManuscript: stageDropped, selectAndStageManuscript: vi.fn(),
    getReimportLineageSourceVersionPage: vi.fn(), abandonImportDraft: vi.fn() },
    bookFor: () => undefined, occupied: () => false, route: () => ({ isCurrent: () => true }), inBook: () => true,
    renderTargetChoice: view.renderTargetChoice, setStatus: status, rendererErrorMessage: (_error, fallback) => fallback,
    settleScreen: async () => true });
  root.dataset['screen'] = 'book-overview';
  const overview = document.createElement('section'); overview.dataset['bookId'] = bookId; overview.dataset['manuscriptState'] = 'populated';
  root.append(overview); installImportDrop(root);
  (root as unknown as MiniElement).dispatchEvent({ type: 'drop', dataTransfer: { files: [{ name: 'sample1.docx' }], types: ['Files'] } } as never);
  (document.querySelector('[data-import-answer="source"]') as unknown as MiniElement).click();
  await settle();
  expect(stageDropped).toHaveBeenCalledTimes(1);
  const destinationId = destination === 'new' ? newBook().id : `existing-book:${empty.bookId}`;
  control('[id="import-book"]').value = destinationId; change('[id="import-book"]');
  expect(control('[data-import-relationship="source-only"]').checked).toBe(true);
  expect(control('[data-import-relationship="first-manuscript"]').checked).toBe(false);
  Array.from(root.querySelectorAll<HTMLButtonElement>('.primary')).find(button => button.textContent?.startsWith('导入'))!.click();
  await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
  const result = await commit.mock.results[0]!.value;
  expect(prepare.mock.calls[0]![0].target).toMatchObject(destination === 'new'
    ? { kind: 'new-book', choiceId: destinationId, relationship: 'source-only' }
    : { kind: 'existing-book', bookId: empty.bookId, relationship: 'source-only' });
  expect(store.listBooks(null).items.find(book => book.bookId === result.bookId)?.manuscriptState).toBe('empty');
});
