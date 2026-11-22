import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureImportEntry, installImportDrop, registerDerivativeImportForm, startNewVersionImport } from '../../src/renderer/import-entry.js';
import { IMPORT_ENTRY_WORDS } from '../../src/renderer/import-entry-labels.js';
import { SAVE_MENU_WORDS } from '../../src/renderer/save-menu-labels.js';
import { createDerivative, droppedFileFormState } from '../../src/renderer/components/derivative-create.js';
import type { StagedImportProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

const notices = vi.hoisted(() => [] as string[]);
vi.mock('../../src/renderer/notifications.js', () => ({
  reportResult: (setStatus: (message: string) => void, message: string) => { setStatus(''); notices.push(message); },
}));

let restore: () => void;
let observers: Array<() => void> = [];
beforeEach(() => {
  restore = installMiniDom(); notices.length = 0; observers = [];
  vi.stubGlobal('MutationObserver', class {
    constructor(changed: () => void) { observers.push(changed); }
    observe(): void {}
    disconnect(): void {}
  });
  vi.stubGlobal('Event', class { constructor(readonly type: string) {} });
});
afterEach(() => { vi.unstubAllGlobals(); restore(); });

function staged(bookIds: string[], editable = true): StagedImportProjection {
  return { draftId: 'draft', draftVersion: 1, editableImport: { available: editable }, nextBookCursor: null,
    targetChoices: bookIds.map((bookId) => ({ kind: 'existing-book', id: `existing-book:${bookId}`, bookId, label: bookId, internalNumber: null,
      manuscriptState: 'populated', reimportLineageSourceVersionIds: [], reimportLineagePageAfter: null,
      reimportLineagePreviousCursor: null, reimportLineageNextCursor: null, selected: false })) } as unknown as StagedImportProjection;
}

function setup(stagedFor: StagedImportProjection = staged(['book'])) {
  const api = {
    selectAndStageManuscript: vi.fn(async () => ({ status: 'staged', staged: stagedFor })),
    stageDroppedManuscript: vi.fn(async () => ({ status: 'staged', staged: stagedFor })),
    getReimportLineageSourceVersionPage: vi.fn(async () => ({ bookId: 'book', after: null, previousCursor: null, nextCursor: 'next',
      items: [{ sourceVersionId: 'source-1', displayName: '旧稿', importedAt: '2026-11-01T00:00:00Z' }] })),
    getBookOverview: vi.fn(async () => ({ book: { title: '合成图书', internalNumber: null } })),
  };
  const renderTargetChoice = vi.fn(), setStatus = vi.fn(), settleScreen = vi.fn(async () => true);
  configureImportEntry({ api: api as never, renderTargetChoice, setStatus, rendererErrorMessage: (_error, fallback) => fallback, settleScreen });
  return { api, renderTargetChoice, setStatus, settleScreen };
}

describe('the 导入新版本… entry', () => {
  it('opens the import page with this Book and 更新稿件 after one picker', async () => {
    const { api, renderTargetChoice, settleScreen } = setup();
    const recovery = { attentionId: 'a' } as never;
    await startNewVersionImport('book', recovery);
    expect(settleScreen).toHaveBeenCalledTimes(1);
    expect(api.selectAndStageManuscript).toHaveBeenCalledTimes(1);
    expect(renderTargetChoice).toHaveBeenCalledWith(expect.anything(), 'existing-book:book', undefined, recovery, 'reimport');
  });

  it('offers a file that cannot become a manuscript as source material', async () => {
    const { renderTargetChoice } = setup(staged(['book'], false));
    await startNewVersionImport('book');
    expect(renderTargetChoice).toHaveBeenCalledWith(expect.anything(), 'existing-book:book', undefined, undefined, 'source-only');
  });

  it('adds the Book as a populated choice with its lineage page when the staged Books do not list it', async () => {
    const { api, renderTargetChoice } = setup(staged(['other']));
    await startNewVersionImport('book');
    expect(api.getReimportLineageSourceVersionPage).toHaveBeenCalledWith({ bookId: 'book', after: null });
    const [offered, id] = renderTargetChoice.mock.calls[0] as [StagedImportProjection, string];
    expect(id).toBe('existing-book:book');
    expect(offered.targetChoices.at(-1)).toMatchObject({ kind: 'existing-book', bookId: 'book', manuscriptState: 'populated',
      reimportLineageSourceVersionIds: [{ sourceVersionId: 'source-1', displayName: '旧稿', importedAt: '2026-11-01T00:00:00Z' }],
      reimportLineagePageAfter: null, reimportLineageNextCursor: 'next' });
  });

  it('says 已取消文件选择 and calls nothing when the picker is closed', async () => {
    const { api, renderTargetChoice } = setup();
    api.selectAndStageManuscript.mockResolvedValueOnce({ status: 'cancelled' } as never);
    await startNewVersionImport('book');
    expect(notices).toEqual(['已取消文件选择']);
    expect(renderTargetChoice).not.toHaveBeenCalled();
  });

  it('opens one picker for a repeated press, and another once it has answered', async () => {
    const { api } = setup();
    const answer = Promise.withResolvers<{ status: 'cancelled' }>();
    api.selectAndStageManuscript.mockReturnValueOnce(answer.promise as never);
    const first = startNewVersionImport('book');
    await startNewVersionImport('book');
    expect(api.selectAndStageManuscript).toHaveBeenCalledTimes(1);
    answer.resolve({ status: 'cancelled' });
    await first;
    await startNewVersionImport('book');
    expect(api.selectAndStageManuscript).toHaveBeenCalledTimes(2);
  });
});

type Page = 'landing' | 'empty-book' | 'overview' | 'editor' | 'derivatives' | 'derivative-editor';

/** The screen host as the pages paint it: the screen's state name and the root a page's own data attributes sit on. */
function screenOf(page: Page): MiniElement {
  const screen = miniDocument.createElement('div');
  screen.dataset['screen'] = page === 'landing' ? 'landing' : page === 'editor' || page === 'derivative-editor' ? 'editor'
    : page === 'derivatives' ? 'book-derivatives' : 'book-overview';
  const root = miniDocument.createElement('div');
  if (page !== 'landing') root.dataset['bookId'] = 'book';
  if (page === 'overview' || page === 'empty-book') {
    root.className = 'book-overview'; root.dataset['manuscriptState'] = page === 'overview' ? 'populated' : 'empty';
  }
  if (page === 'derivative-editor') root.dataset['manuscriptKind'] = 'derivative';
  screen.append(root); miniDocument.body.append(screen);
  installImportDrop(screen as unknown as HTMLElement);
  return screen;
}

function drop(screen: MiniElement, name: string): void {
  screen.dispatchEvent({ type: 'drop', dataTransfer: { files: [{ name }], types: ['Files'] } } as never);
}

const question = (): MiniElement | null => miniDocument.querySelector('[data-import-question]');
const answers = (): string[] => (question()?.querySelectorAll('[data-import-answer]') ?? []).map((node) => node.dataset['importAnswer']!);
const press = (key: string): void => question()!.querySelector(`[data-import-answer="${key}"]`)!.click();

describe('the question a dropped file asks', () => {
  it.each([
    ['overview', ['update', 'source', 'cancel']],
    ['editor', ['update', 'source', 'cancel']],
    ['derivatives', ['update', 'derivative', 'cancel']],
    ['derivative-editor', ['update', 'derivative', 'cancel']],
  ] as const)('offers the right answers on %s and stages nothing before one', (page, offered) => {
    const { api, settleScreen } = setup();
    drop(screenOf(page), '新稿.docx');
    expect(answers()).toEqual(offered);
    expect(question()!.textContent).toContain('「新稿.docx」要怎样导入？');
    expect(answers().map((key) => question()!.querySelector(`[data-import-answer="${key}"]`)!.textContent))
      .toEqual(offered.map((key) => ({ update: '更新稿件', source: '存为来源材料', derivative: '存为衍生稿件', cancel: '取消' })[key]));
    expect(api.stageDroppedManuscript).not.toHaveBeenCalled();
    expect(settleScreen).not.toHaveBeenCalled();
  });

  it('stages once for 更新稿件 and for 存为来源材料, each with this Book', async () => {
    const { api, renderTargetChoice } = setup();
    for (const [key, relationship] of [['update', 'reimport'], ['source', 'source-only']] as const) {
      drop(screenOf('overview'), '新稿.docx');
      const answer = question()!.querySelector(`[data-import-answer="${key}"]`)!;
      answer.click();
      answer.click();
      await vi.waitFor(() => expect(renderTargetChoice).toHaveBeenLastCalledWith(expect.anything(), 'existing-book:book', undefined, undefined, relationship));
    }
    expect(api.stageDroppedManuscript).toHaveBeenCalledTimes(2);
    expect(question()).toBeNull();
  });

  it('stages nothing for 取消, Escape or leaving the page', () => {
    const { api } = setup();
    drop(screenOf('overview'), '新稿.docx'); press('cancel'); expect(question()).toBeNull();
    drop(screenOf('editor'), '新稿.docx');
    question()!.dispatchEvent({ type: 'keydown', key: 'Escape', isComposing: false } as never);
    expect(question()).toBeNull();
    const screen = screenOf('overview'); drop(screen, '新稿.docx'); expect(question()).not.toBeNull();
    screen.replaceChildren(miniDocument.createElement('div')); observers.forEach((changed) => changed());
    expect(question()).toBeNull();
    expect(api.stageDroppedManuscript).not.toHaveBeenCalled();
  });

  it('ignores a second drop while the question is open and while a staging is under way', async () => {
    const { api } = setup();
    const screen = screenOf('overview');
    drop(screen, '甲.docx'); drop(screen, '乙.docx');
    expect(question()!.textContent).toContain('「甲.docx」');
    const staging = Promise.withResolvers<{ status: 'cancelled' }>();
    api.stageDroppedManuscript.mockReturnValueOnce(staging.promise as never);
    press('update');
    drop(screen, '丙.docx');
    expect(question()).toBeNull();
    await vi.waitFor(() => expect(api.stageDroppedManuscript).toHaveBeenCalledTimes(1));
    staging.resolve({ status: 'cancelled' });
    await vi.waitFor(() => { drop(screen, '丁.docx'); expect(question()).not.toBeNull(); });
  });

  it('hands 存为衍生稿件 to the registered 衍生稿件 form with the file, and says so when none can take it', () => {
    const { setStatus } = setup();
    const screen = screenOf('derivatives');
    const open = vi.fn(() => true);
    const unregister = registerDerivativeImportForm(open);
    drop(screen, '新稿.docx'); press('derivative');
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ name: '新稿.docx' }));
    expect(setStatus).not.toHaveBeenCalled();
    unregister();
    drop(screen, '新稿.docx'); press('derivative');
    expect(setStatus).toHaveBeenCalledWith(IMPORT_ENTRY_WORDS.derivativeFormUnavailable, 'error');
  });

  it.each(['landing', 'empty-book', 'overview', 'editor', 'derivatives', 'derivative-editor'] as const)(
    'answers a file that is not DOCX with the sentence on %s', (page) => {
      const { api, setStatus } = setup();
      drop(screenOf(page), '说明.txt');
      expect(setStatus).toHaveBeenCalledWith('请拖入 DOCX 格式的文件。', 'error');
      expect(question()).toBeNull();
      expect(api.stageDroppedManuscript).not.toHaveBeenCalled();
    });

  it('stages at once, as before, on 书库 and on a Book with no manuscript yet', async () => {
    const { renderTargetChoice } = setup();
    drop(screenOf('landing'), '新稿.docx');
    await vi.waitFor(() => expect(renderTargetChoice).toHaveBeenLastCalledWith(expect.anything(), null));
    drop(screenOf('empty-book'), '新稿.docx');
    await vi.waitFor(() => expect(renderTargetChoice).toHaveBeenLastCalledWith(expect.anything(), 'existing-book:book'));
    expect(renderTargetChoice).toHaveBeenCalledTimes(2);
    expect(question()).toBeNull();
  });
});

describe('a file dropped on 衍生稿件 reaches the create form', () => {
  it('stages the dropped file, never opens the picker, then makes the same calls as the picker path', async () => {
    const file = { name: '新闻稿初稿.docx' } as File;
    const api = {
      selectAndStageManuscript: vi.fn(), abandonImportDraft: vi.fn(),
      stageDroppedManuscript: vi.fn(async () => ({ status: 'staged', staged: { draftId: 'd', draftVersion: 3, source: { format: 'DOCX', displayName: '新闻稿初稿.docx' } } })),
      prepareSourceImportReview: vi.fn(async () => ({ draftId: 'd', draftVersion: 4, reviewDigest: 'r', commitAttemptId: 'c' })),
      commitSourceImport: vi.fn(async () => ({ commitId: 'commit', sourceVersionId: 'source-9' })),
      acknowledgeImportCompletion: vi.fn(), decideProductionDocumentType: vi.fn(),
      createProductionDocument: vi.fn(async () => ({ bookId: 'book', document: { documentId: 'doc' }, documents: {}, notice: null })),
    };
    const state = droppedFileFormState(file, 'news');
    expect(state).toMatchObject({ mode: 'import', title: '新闻稿初稿', titleEdited: true });
    const outcome = await createDerivative({ api: api as never, bookId: 'book', state: { ...state, mode: 'import' },
      types: [{ typeId: 'news', label: '新闻稿', notForThisBook: false }] as never });
    expect(outcome.kind).toBe('created');
    expect(api.stageDroppedManuscript).toHaveBeenCalledWith(file);
    expect(api.selectAndStageManuscript).not.toHaveBeenCalled();
    expect(api.prepareSourceImportReview).toHaveBeenCalledWith({ draftId: 'd', expectedDraftVersion: 3,
      target: { kind: 'existing-book', bookId: 'book', relationship: 'source-only', reuseSourceVersionId: null } });
    expect(api.commitSourceImport).toHaveBeenCalledWith({ draftId: 'd', expectedDraftVersion: 4, reviewDigest: 'r', commitAttemptId: 'c' });
    expect(api.acknowledgeImportCompletion).toHaveBeenCalledWith({ commitId: 'commit' });
    expect(api.createProductionDocument).toHaveBeenCalledWith({ typeId: 'news', sourceVersionId: 'source-9', title: '新闻稿初稿' });
  });
});

describe('the words of the import entries', () => {
  it('are pinned, and the save menu says 导入新版本… the same way', () => {
    expect(IMPORT_ENTRY_WORDS).toMatchObject({
      newVersion: '导入新版本…', update: '更新稿件', asSource: '存为来源材料', asDerivative: '存为衍生稿件', cancel: '取消',
      notDocx: '请拖入 DOCX 格式的文件。', pickerCancelled: '已取消文件选择' });
    expect(IMPORT_ENTRY_WORDS.question('新稿.docx')).toBe('「新稿.docx」要怎样导入？');
    expect(SAVE_MENU_WORDS.importNewVersion).toBe(IMPORT_ENTRY_WORDS.newVersion);
  });
});
