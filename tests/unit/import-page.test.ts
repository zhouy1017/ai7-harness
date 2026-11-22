import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { createImportReview } from '../../src/renderer/import-review.js';
import { importFileLabel } from '../../src/renderer/import-review-labels.js';
import { localInstantLabel } from '../../src/renderer/plan-preview-labels.js';
import { setTechnicalLayerVisible, technicalDisclosure } from '../../src/renderer/technical-layer.js';
import { createServiceTestRoots } from '../support/temp-data-root.js';
import { importSample1Book, sample1Path } from '../support/sample1-baseline.js';
import { installMiniDom, type MiniElement } from '../support/mini-dom.js';
import type { StagedImportProjection } from '../../src/shared/protocol.js';

let restore: () => void;
let roots: Awaited<ReturnType<typeof createServiceTestRoots>>;
let store: EditorialStore;
let staged: StagedImportProjection;
let bookId: string;
let root: HTMLElement;
let view: ReturnType<typeof createImportReview>;
const status = vi.fn();
const record = vi.fn(async (_request: unknown) => { throw new Error('recorded'); });
const listBooks = vi.fn();
const lineagePage = vi.fn();
const settle = async () => { for (let i=0;i<4;i++) await new Promise(resolve=>setTimeout(resolve,0)); };
const control = (selector: string) => root.querySelector(selector) as unknown as MiniElement;
const change = (selector: string) => control(selector).dispatchEvent({ type: 'change' });
const target = () => staged.targetChoices.find(choice=>choice.kind==='existing-book')!;
const newBook = () => staged.targetChoices.find(choice=>choice.kind==='new-book')!;
const draw = (relationship: 'source-only' | 'reimport' = 'source-only', projection = staged) =>
  view.renderTargetChoice(projection, `existing-book:${bookId}`, undefined, undefined, relationship);

beforeEach(async () => {
  restore = installMiniDom(); setTechnicalLayerVisible(false); record.mockClear(); status.mockClear(); listBooks.mockReset(); lineagePage.mockReset();
  vi.stubGlobal('Event', class { constructor(public type: string) {} });
  vi.stubGlobal('window', { ai7: { prepareSourceImportReview: record, prepareManuscriptReimport: record,
    listBooks, getReimportLineageSourceVersionPage: lineagePage }, setTimeout, clearTimeout });
  roots = await createServiceTestRoots('ai7-import-page-');
  store = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
  bookId = (await importSample1Book(store, roots.codeRoot, '公开样书')).bookId;
  staged = await store.stageSelectedManuscript(randomUUID(), sample1Path(roots.codeRoot));
  root = document.createElement('main'); document.body.append(root);
  view = createImportReview({ appendRecoveryReturnAction: vi.fn(), technicalDetails: (_class, ...rows) => {
    const details=document.createElement('details'); details.className='technical-details'; details.append(...rows); return technicalDisclosure(details);
  }, replaceScreen: (_state, content) => root.replaceChildren(content), rendererErrorMessage: (_error, fallback) => fallback,
    abandonAndContinue: vi.fn(), awaitServiceJob: vi.fn(), hasErrorCode: () => false,
    identityFindingDisclosure: () => document.createElement('div'), initializeStartup: vi.fn(), instantValue: () => document.createElement('span'),
    renderError: vi.fn(), renderImported: vi.fn(), setStatus: status, sourceCard: () => document.createElement('div') });
});
afterEach(async () => { store.close(); await roots.dispose(); setTechnicalLayerVisible(true); restore(); vi.unstubAllGlobals(); });

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

it('uses first-manuscript defaults when leaving a populated Book for a new or empty Book', () => {
  const emptyId=randomUUID(); const existing=target(); if(existing.kind!=='existing-book') throw new Error('missing book');
  const projection={...staged,targetChoices:[...staged.targetChoices,{...existing,id:`existing-book:${emptyId}`,bookId:emptyId,manuscriptState:'empty' as const}]};
  for(const id of [newBook().id,`existing-book:${emptyId}`]) {
    view.renderTargetChoice(projection,`existing-book:${bookId}`);
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
