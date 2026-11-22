import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_QUICK_ACTIONS } from '../../src/shared/preferences.js';
import { mountReviewWorkspace, type MountReviewWorkspaceOptions, type ReviewWorkspaceSurface } from '../../src/renderer/review-workspace.js';
import { effectiveCategories, reviewSheetRequest, sheetPreparationReason, type SheetState } from '../../src/renderer/review-sheet-choices.js';
import { REVIEW_LOCAL_ONLY_LINE, REVIEW_PICK_CATEGORY } from '../../src/renderer/review-labels.js';
import type { EvidenceAssuranceLevel } from '../../src/shared/protocol/factual-verification.js';
import type { RendererApi, ReviewWorkspaceCategoryProjection, ReviewWorkspaceProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

// 新建审阅 (0.7.4, I-2): what each combination of the form's choices sends, and the form itself on the real surface.
const BOOK = '11111111-1111-4111-8111-111111111111';
const on = { available: true, unavailableReason: null };
const off = (reason: string) => ({ available: false, unavailableReason: reason });
const MANUSCRIPT = { manuscriptId: 'manuscript-a', branchId: 'branch-a', revisionId: 'revision-a', revisionLabel: 'Revision 1', journalSequence: 0, workingDigest: 'b'.repeat(64), totalBlocks: 1 };
const CHAPTERS = [{ blockId: 'c1', title: '一', position: 0, endPosition: 4, level: 1 }, { blockId: 'c2', title: '二', position: 5, endPosition: 9, level: 1 }];
const IDS = ['typos-and-usage', 'style-and-format', 'plot-consistency', 'factual-review', 'academic-integrity', 'publication-risk', 'literary-expression', 'series-consistency', 'cross-deliverable-consistency'];
const LOCAL = { punctuation: 'chinese-prose', numerals: 'off', publication: 'unknown', numeralRules: [], numeralsConfirmed: false, excludedRanges: [], doubledEllipsisBlockIds: [],
  tables: { characters: true, variantWords: true, bookTerms: [], houseWordList: null } } as const;
const WHOLE = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } as const;
const PIN = { procedureId: 'ai7-procedure/fixed', version: 2, digest: 'a'.repeat(64) };

function category(categoryId: string, extra: Partial<ReviewWorkspaceCategoryProjection> = {}): ReviewWorkspaceCategoryProjection {
  return { categoryId, label: categoryId, description: '提供审阅发现。补充说明。', output: 'annotation', riskPointsOnly: false, batchApply: false, searchEngine: categoryId === 'factual-review',
    modelFree: false, materialReferencesAllowed: false, available: true, unavailableReason: null,
    basis: { categoryId, executor: 'review-category-contract', searchEngine: false, guidelineDocuments: [], procedure: { title: '审阅工序', version: '1' } },
    guidelineDocuments: [], procedure: { title: '审阅工序', version: '1' }, scopes: { whole: on, chapters: on, changed: on, selection: on }, ...extra };
}
function workspace(over: Partial<ReviewWorkspaceProjection> = {}, categories: ReviewWorkspaceCategoryProjection[] = IDS.map((id) => category(id))): ReviewWorkspaceProjection {
  return { bookId: BOOK, manuscript: MANUSCRIPT, configuration: { schema: 'ai7.review/1', version: '1', digest: 'a'.repeat(64) }, categories, coverage: [],
    scopeOptions: { whole: on, changed: on, selection: off('没有选区'), chapters: { ...on, basis: 'outline', chapters: CHAPTERS } },
    scopeUnitCounts: { whole: 2, units: [{ startPosition: 0, endPosition: 4 }, { startPosition: 5, endPosition: 9 }] },
    newReview: on, runsTruncated: false, runs: [], run: null, connectivity: 'online', ...over };
}
function sheet(ticked: readonly string[], over: Partial<SheetState> = {}): SheetState {
  return { evidenceAssuranceLevel: 'standard', dismissed: false, houseWordListWanted: false, houseWordListRequest: 0, houseWordListLoading: false, localOptions: LOCAL,
    seriesId: null, seriesChoices: [], recommendation: null as never, materialIds: new Set(), categories: new Set(ticked), selection: null, scope: 'whole', from: null, to: null,
    problem: null, openerKey: null, launched: false, procedures: [], procedure: null, requests: { loading: false } as never, definition: null, ...over };
}
const definition = (categoryIds: string[], composite = true) => ({ composite, pin: PIN, title: '固定工序', categoryIds });
const filled = (steps: Array<{ categoryId: string; available: boolean; unavailableReason: string | null; chosenApart?: boolean }>) =>
  ({ resolved: { steps: steps.map((step) => ({ chosenApart: false, ...step })) } }) as unknown as SheetState['procedure'];
const request = (ws: ReviewWorkspaceProjection, state: SheetState, pin: { versionId: string; documentSha256: string } | null = null) => reviewSheetRequest(ws, state, pin);

describe('the request a start sends, for every control alone and every pair that interacts', () => {
  // Literal expectations, each the input without `clientCommandId`, the model choice and the remembered-choice flag.
  const cases: ReadonlyArray<readonly [string, () => ReturnType<typeof request>, unknown]> = [
    ['the default: one category, whole book', () => request(workspace(), sheet(['typos-and-usage'])), { categoryIds: ['typos-and-usage'], scope: WHOLE }],
    ['categories go out in configuration order whatever the order of the ticks', () => request(workspace(), sheet(['literary-expression', 'style-and-format', 'typos-and-usage'])),
      { categoryIds: ['typos-and-usage', 'style-and-format', 'literary-expression'], scope: WHOLE }],
    ['the switch on sends the local check alone, with its options', () => request(workspace(), sheet(['local-text-check'])), { categoryIds: ['local-text-check'], scope: WHOLE, localCheck: LOCAL }],
    ['the switch on over ticked categories keeps them out of the request', () => request(workspace(), sheet(['typos-and-usage', 'factual-review', 'local-text-check'])),
      { categoryIds: ['local-text-check'], scope: WHOLE, localCheck: LOCAL }],
    ['the switch back off sends the earlier ticks', () => request(workspace(), sheet(['typos-and-usage', 'factual-review'])),
      { categoryIds: ['typos-and-usage', 'factual-review'], scope: WHOLE, evidenceAssuranceLevel: 'standard' }],
    ['a confirmed numeral basis is sent as confirmed', () => request(workspace(), sheet(['local-text-check'], { localOptions: { ...LOCAL, numerals: 'editor-convention', numeralRules: ['N01', 'N02'], numeralsConfirmed: true } })),
      { categoryIds: ['local-text-check'], scope: WHOLE, localCheck: { ...LOCAL, numerals: 'editor-convention', numeralRules: ['N01', 'N02'], numeralsConfirmed: true } }],
    ['a confirmation left over from a basis that was switched off is not sent', () => request(workspace(), sheet(['local-text-check'], { localOptions: { ...LOCAL, numerals: 'off', numeralsConfirmed: true } })),
      { categoryIds: ['local-text-check'], scope: WHOLE, localCheck: LOCAL }],
    ['事实核查 sends its level, 标准核查 by default', () => request(workspace(), sheet(['factual-review'])), { categoryIds: ['factual-review'], scope: WHOLE, evidenceAssuranceLevel: 'standard' }],
    ['事实核查 at 快速整理', () => request(workspace(), sheet(['factual-review'], { evidenceAssuranceLevel: 'quick' })), { categoryIds: ['factual-review'], scope: WHOLE, evidenceAssuranceLevel: 'quick' }],
    ['事实核查 at 严格核查 beside another category', () => request(workspace(), sheet(['typos-and-usage', 'factual-review'], { evidenceAssuranceLevel: 'strict' })),
      { categoryIds: ['typos-and-usage', 'factual-review'], scope: WHOLE, evidenceAssuranceLevel: 'strict' }],
    ['a level is not sent when 事实核查 does not run', () => request(workspace(), sheet(['typos-and-usage'], { evidenceAssuranceLevel: 'strict' })), { categoryIds: ['typos-and-usage'], scope: WHOLE }],
    ['a level is not sent when the local check runs alone', () => request(workspace(), sheet(['factual-review', 'local-text-check'], { evidenceAssuranceLevel: 'quick' })),
      { categoryIds: ['local-text-check'], scope: WHOLE, localCheck: LOCAL }],
    ['选章 names its two chapters', () => request(workspace(), sheet(['typos-and-usage'], { scope: 'chapters', from: 'c1', to: 'c2' })),
      { categoryIds: ['typos-and-usage'], scope: { kind: 'chapters', fromChapterBlockId: 'c1', toChapterBlockId: 'c2' } }],
    ['只审改动过的章', () => request(workspace(), sheet(['typos-and-usage'], { scope: 'changed' })), { categoryIds: ['typos-and-usage'], scope: { kind: 'changed', fromChapterBlockId: null, toChapterBlockId: null } }],
    ['当前选区 with a held selection', () => request(workspace(), sheet(['typos-and-usage'], { scope: 'selection', selection: { fromBlockId: 'b1', toBlockId: 'b2' } })),
      { categoryIds: ['typos-and-usage'], scope: { kind: 'selection', fromChapterBlockId: 'b1', toChapterBlockId: 'b2' } }],
    ['the local check over 选章 and over 当前选区', () => request(workspace(), sheet(['local-text-check'], { scope: 'selection', selection: { fromBlockId: 'b1', toBlockId: 'b1' } })),
      { categoryIds: ['local-text-check'], scope: { kind: 'selection', fromChapterBlockId: 'b1', toChapterBlockId: 'b1' }, localCheck: LOCAL }],
    ['an unavailable category that stays ticked is not sent', () => request(workspace({}, IDS.map((id) => category(id, id === 'series-consistency' ? { available: false, unavailableReason: '没有系列。' } : {}))),
      sheet(['typos-and-usage', 'series-consistency'])), { categoryIds: ['typos-and-usage'], scope: WHOLE }],
    ['a category the scope refuses stays ticked and is not sent', () => request(workspace({}, IDS.map((id) => category(id, id === 'style-and-format' ? { scopes: { whole: on, chapters: on, changed: off('没有改动。'), selection: on } } : {}))),
      sheet(['typos-and-usage', 'style-and-format'], { scope: 'changed' })), { categoryIds: ['typos-and-usage'], scope: { kind: 'changed', fromChapterBlockId: null, toChapterBlockId: null } }],
    ['a 事实核查 that needs the network is still sent, with its level', () => request(workspace({}, IDS.map((id) => category(id, id === 'factual-review' ? { available: false, unavailableReason: '需要联网。', networkUnavailable: true } : {}))),
      sheet(['factual-review'], { evidenceAssuranceLevel: 'quick' })), { categoryIds: ['factual-review'], scope: WHOLE, evidenceAssuranceLevel: 'quick' }],
    ['offline: the start waits for the network', () => request(workspace({ connectivity: 'offline' }), sheet(['typos-and-usage'])), { categoryIds: ['typos-and-usage'], scope: WHOLE, startWhen: 'when-online' }],
    ['offline with the local check alone starts now', () => request(workspace({ connectivity: 'offline' }), sheet(['local-text-check'])), { categoryIds: ['local-text-check'], scope: WHOLE, localCheck: LOCAL }],
    ['online with 联网后开始 chosen', () => request(workspace(), sheet(['typos-and-usage'], { startWhen: 'when-online' })), { categoryIds: ['typos-and-usage'], scope: WHOLE, startWhen: 'when-online' }],
    ['the local check alone with 联网后开始 chosen', () => request(workspace(), sheet(['local-text-check'], { startWhen: 'when-online' })),
      { categoryIds: ['local-text-check'], scope: WHOLE, localCheck: LOCAL, startWhen: 'when-online' }],
    ['offline with 联网后开始 and 事实核查', () => request(workspace({ connectivity: 'offline' }), sheet(['factual-review'], { startWhen: 'when-online', evidenceAssuranceLevel: 'strict' })),
      { categoryIds: ['factual-review'], scope: WHOLE, evidenceAssuranceLevel: 'strict', startWhen: 'when-online' }],
    ['立即 offline over a Series', () => request(workspace({ connectivity: 'offline' }), sheet(['typos-and-usage'], { seriesId: 'series-1', startWhen: 'now' })),
      { categoryIds: ['typos-and-usage'], scope: WHOLE, seriesId: 'series-1', startWhen: 'when-online' }],
    ['a Captured Procedure keeps its series steps and sends its pin', () => request(workspace(), sheet(['typos-and-usage', 'style-and-format'], { procedure: filled([
      { categoryId: 'typos-and-usage', available: true, unavailableReason: null }, { categoryId: 'style-and-format', available: false, unavailableReason: '此书不能用。' }]) }),
      { versionId: 'v1', documentSha256: 'd'.repeat(64) }), { categoryIds: ['typos-and-usage'], scope: WHOLE, capturedProcedure: { versionId: 'v1', documentSha256: 'd'.repeat(64) } }],
    ['a composite definition with the local check sends its members in order, the local options and its pin', () => request(workspace(), sheet(['local-text-check', 'typos-and-usage'],
      { definition: definition(['local-text-check', 'typos-and-usage']) })), { categoryIds: ['local-text-check', 'typos-and-usage'], scope: WHOLE, localCheck: LOCAL, procedureDefinition: PIN }],
    ['a composite definition without the local check sends no local options', () => request(workspace(), sheet(['style-and-format', 'typos-and-usage'],
      { definition: definition(['style-and-format', 'typos-and-usage']) })), { categoryIds: ['style-and-format', 'typos-and-usage'], scope: WHOLE, procedureDefinition: PIN }],
    ['a composite definition with 事实核查 sends its level', () => request(workspace(), sheet([], { definition: definition(['typos-and-usage', 'factual-review']), evidenceAssuranceLevel: 'quick' })),
      { categoryIds: ['typos-and-usage', 'factual-review'], scope: WHOLE, evidenceAssuranceLevel: 'quick', procedureDefinition: PIN }],
    ['a single-member definition sends no definition pin', () => request(workspace(), sheet([], { definition: definition(['typos-and-usage'], false) })), { categoryIds: ['typos-and-usage'], scope: WHOLE }],
  ];
  it.each(cases)('%s', (_name, build, expected) => {
    const built = build();
    if ('problem' in built) throw new Error(`refused: ${built.problem}`);
    expect(built.launch).toEqual(expected);
    // The preparation is the same input without what only a start adds.
    const { evidenceAssuranceLevel: _level, startWhen: _when, ...preparation } = built.launch;
    expect(built.preparation).toEqual(preparation);
    expect(built.categoryIds).toEqual((expected as { categoryIds: string[] }).categoryIds);
  });

  const refused: ReadonlyArray<readonly [string, () => ReturnType<typeof request>, string]> = [
    ['nothing ticked', () => request(workspace(), sheet([])), REVIEW_PICK_CATEGORY],
    ['only an unavailable category ticked', () => request(workspace({}, IDS.map((id) => category(id, id === 'series-consistency' ? { available: false, unavailableReason: '没有系列。' } : {}))), sheet(['series-consistency'])), REVIEW_PICK_CATEGORY],
    ['the local check over 只审改动过的章', () => request(workspace(), sheet(['local-text-check'], { scope: 'changed' })), REVIEW_PICK_CATEGORY],
    ['the local check without a manuscript', () => request(workspace({ manuscript: null }), sheet(['local-text-check'])), REVIEW_PICK_CATEGORY],
    ['当前选区 without a held selection says why', () => request(workspace(), sheet(['typos-and-usage'], { scope: 'selection' })), '没有选区'],
    ['选章 without its chapters', () => request(workspace(), sheet(['typos-and-usage'], { scope: 'chapters' })), '请选择起止的章。'],
    ['选章 reversed', () => request(workspace(), sheet(['typos-and-usage'], { scope: 'chapters', from: 'c2', to: 'c1' })), '结束的章不能在开始的章之前。'],
    ['no scope', () => request(workspace(), sheet(['typos-and-usage'], { scope: null })), '请选择审阅范围。'],
  ];
  it.each(refused)('asks nothing: %s', (_name, build, reason) => {
    expect(build()).toEqual({ problem: reason });
  });

  it('names the reason a category cannot run and what blocks 先看计划', () => {
    const ws = workspace({}, IDS.map((id) => category(id, id === 'series-consistency' ? { available: false, unavailableReason: '没有系列。' } : id === 'factual-review' ? { available: false, unavailableReason: '需要联网。', networkUnavailable: true } : {})));
    expect(sheetPreparationReason(ws, sheet(['typos-and-usage']))).toBeNull();
    expect(sheetPreparationReason(ws, sheet(['local-text-check'], { houseWordListWanted: true, houseWordListLoading: true }))).toBe('正在更新本社词表，请稍候再开始审阅。');
    expect(sheetPreparationReason(ws, sheet([], { definition: definition(['local-text-check']) }))).toBeNull();
    expect(sheetPreparationReason(workspace({ manuscript: null }), sheet([], { definition: definition(['local-text-check']) }))).toBe('本地文字检查：导入稿件后即可检查。');
    expect(sheetPreparationReason(ws, sheet([], { definition: definition(['local-text-check']), scope: 'changed' }))).toBe('本地文字检查请选择全书、选章或当前选区。');
    expect(sheetPreparationReason(ws, sheet([], { definition: definition(['typos-and-usage', 'series-consistency']) }))).toBe('series-consistency：没有系列。');
    expect(sheetPreparationReason(ws, sheet([], { definition: definition(['factual-review']) }))).toBe('factual-review：需要联网。');
    const searching = workspace({}, IDS.map((id) => category(id, id === 'factual-review' ? { networkUnavailable: true } : {})));
    expect(sheetPreparationReason(searching, sheet([], { definition: definition(['factual-review']) }))).toBe('factual-review：此类别需要联网检索。');
    expect(sheetPreparationReason(ws, sheet([], { definition: definition(['plot-consistency', 'gone']) }))).toBe('固定成员已不在审阅配置中，请重新打开此工序。');
    expect(effectiveCategories(ws, sheet(['typos-and-usage', 'series-consistency', 'factual-review']))).toEqual(['typos-and-usage', 'factual-review']);
  });
});

// ---- The mounted sheet --------------------------------------------------------------------------------------------

const readLevel = vi.fn<() => Promise<EvidenceAssuranceLevel>>();
const rememberLevel = vi.fn(async (_level: EvidenceAssuranceLevel) => undefined);
vi.mock('../../src/renderer/action-defaults.js', () => ({
  readActionDefaults: async () => ({ ...DEFAULT_QUICK_ACTIONS }), rememberActionDefaults: async () => undefined,
  readEvidenceAssuranceLevel: () => readLevel(), rememberEvidenceAssuranceLevel: (level: EvidenceAssuranceLevel) => rememberLevel(level),
}));

let restoreDom: () => void;
let surfaces: ReviewWorkspaceSurface[];
beforeEach(() => {
  restoreDom = installMiniDom();
  surfaces = [];
  readLevel.mockReset().mockResolvedValue('standard');
  rememberLevel.mockClear();
  vi.stubGlobal('window', { setTimeout, clearTimeout, getSelection: () => null, addEventListener: () => undefined, removeEventListener: () => undefined });
  Object.defineProperty(MiniElement.prototype, 'options', { configurable: true, get(this: MiniElement) { return this.querySelectorAll('option'); } });
  vi.stubGlobal('Option', class extends MiniElement { constructor(text: string, value: string) { super('option'); this.textContent = text; this.value = value; } });
  Object.defineProperty(MiniElement.prototype, 'prepend', { configurable: true, value(this: MiniElement, ...nodes: MiniElement[]) {
    const previous = [...this.children]; this.replaceChildren(...nodes, ...previous);
  } });
  Object.defineProperty(MiniElement.prototype, 'replaceWith', { configurable: true, value(this: MiniElement, node: MiniElement) {
    const parent = this.parentElement;
    if (parent !== null) parent.replaceChildren(...parent.children.map((child) => child === this ? node : child));
  } });
});
afterEach(() => {
  for (const surface of surfaces) surface.destroy();
  Reflect.deleteProperty(MiniElement.prototype, 'options');
  Reflect.deleteProperty(MiniElement.prototype, 'prepend');
  Reflect.deleteProperty(MiniElement.prototype, 'replaceWith');
  restoreDom();
  vi.unstubAllGlobals();
});

const flush = async (): Promise<void> => { for (let count = 0; count < 25; count += 1) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

async function openSheet(launch: (input: unknown) => Promise<unknown> = async () => { throw new Error('synthetic refusal keeps the sheet'); }) {
  const root = new MiniElement('main');
  miniDocument.body.append(root);
  const ws = workspace({}, ['typos-and-usage', 'style-and-format', 'factual-review'].map((id) => category(id)));
  const launchReviewRun = vi.fn(launch);
  const unexpected = vi.fn(async () => { throw new Error('unexpected API operation'); });
  const calls = { inspectReviewWorkspace: vi.fn(async () => ws), launchReviewRun };
  const api = new Proxy(calls, { get: (target, key) => Reflect.get(target, key) ?? unexpected }) as unknown as MountReviewWorkspaceOptions['api'];
  const surface = mountReviewWorkspace({ root: root as unknown as HTMLElement, bookId: BOOK, bookTitle: '公开合成图书', focus: null, api, procedureId: null,
    awaitServiceJob: async (initial) => initial, technicalDetails: () => miniDocument.createElement('div') as unknown as HTMLElement,
    setStatus: Object.assign(vi.fn(), { settle: vi.fn() }), errorMessage: (_error, fallback) => fallback, errorCode: () => null, openManuscript: async () => undefined,
    goToText: async () => undefined, openPlan: () => undefined, openSearchSettings: () => undefined, planChanged: () => undefined });
  surfaces.push(surface);
  surface.start(); await flush();
  const dialog = () => root.querySelector('dialog')!;
  const press = async (selector: string) => { root.querySelector(selector)!.click(); await flush(); };
  const box = (id: string) => root.querySelector(id === 'local-text-check' ? '[data-review-local-switch] input' : `[data-review-category-option="${id}"] input`)!;
  const change = async (node: MiniElement, value: boolean | string) => { if (typeof value === 'boolean') node.checked = value; else node.value = value; node.dispatchEvent({ type: 'change', bubbles: true }); await flush(); };
  const level = () => root.querySelector('[data-review-field="evidenceAssuranceLevel"]') as MiniElement | null;
  return { root, surface, dialog, press, box, change, level, launchReviewRun, open: () => press('[data-review-action="new-review"]') };
}

describe('the mounted new-review form', () => {
  it('puts the local check in a switch above the categories and brings the earlier ticks back when it is switched off', async () => {
    const view = await openSheet(); await view.open();
    const body = view.dialog();
    const switchInput = body.querySelector('[data-review-local-switch] input')!;
    expect(switchInput.getAttribute('role')).toBe('switch');
    expect(switchInput.closest('fieldset') === null).toBe(true);
    expect(body.querySelectorAll('input').filter((input) => input.name === 'review-category')[0] === switchInput).toBe(true);
    await view.change(view.box('style-and-format'), true);
    const line = () => body.querySelector('.review-local-only-line')!;
    expect(line().hidden).toBe(true); expect(line().textContent).toBe(REVIEW_LOCAL_ONLY_LINE);
    await view.change(view.box('local-text-check'), true);
    expect(body.querySelector('.review-category-options')!.hidden).toBe(true); expect(line().hidden).toBe(false);
    for (const id of ['typos-and-usage', 'style-and-format', 'factual-review']) { expect(view.box(id).disabled).toBe(true); expect(view.box(id).checked).toBe(false); }
    await view.change(view.box('local-text-check'), false);
    expect(body.querySelector('.review-category-options')!.hidden).toBe(false); expect(line().hidden).toBe(true);
    expect(view.box('typos-and-usage').checked).toBe(true); expect(view.box('style-and-format').checked).toBe(true); expect(view.box('factual-review').checked).toBe(false);
  });

  it('starts the local check alone when the switch is on', async () => {
    const view = await openSheet(); await view.open();
    await view.change(view.box('local-text-check'), true);
    await view.press('[data-review-action="start"]');
    expect(view.launchReviewRun).toHaveBeenCalledTimes(1);
    expect(view.launchReviewRun.mock.calls[0]![0]).toMatchObject({ categoryIds: ['local-text-check'], localCheck: expect.objectContaining({ punctuation: 'chinese-prose' }) });
  });

  it('draws 核查力度 directly under the 事实核查 row, and only while 事实核查 will run', async () => {
    const view = await openSheet(); await view.open();
    // The sheet is drawn again after a tick, so the row is read afresh each time.
    const under = () => {
      const row = view.root.querySelector('[data-review-category-option="factual-review"]')!;
      const siblings = row.parentElement!.children.filter((child) => child.tagName !== '#TEXT');
      return siblings[siblings.indexOf(row) + 1]!;
    };
    expect(under().className).toBe('review-evidence-assurance');
    expect(under().contains(view.level()!)).toBe(true);
    expect(under().hidden).toBe(true);
    await view.change(view.box('factual-review'), true);
    expect(under().hidden).toBe(false);
    await view.change(view.box('local-text-check'), true);
    expect(under().hidden).toBe(true);
  });

  it('gives every category row its description in the detail beside the basis words, not on its face', async () => {
    const view = await openSheet(); await view.open();
    const row = view.root.querySelector('[data-review-category-option="typos-and-usage"]')!;
    const detail = row.querySelector('.review-category-basis-detail')!;
    expect(detail.hidden).toBe(true);
    expect(detail.querySelector('.review-category-description')!.textContent).toBe('提供审阅发现。');
    expect(row.querySelector('.review-category-text')!.querySelector('.review-category-description')).toBeNull();
    row.querySelector('.review-category-basis')!.click();
    expect(detail.hidden).toBe(false);
  });

  it('reads the remembered level before the first paint, so the control never changes after the sheet shows', async () => {
    const read = deferred<EvidenceAssuranceLevel>(); readLevel.mockReturnValue(read.promise);
    const view = await openSheet();
    await view.press('[data-review-action="new-review"]');
    expect(view.dialog().open).toBe(false); expect(view.level()).toBeNull();
    read.resolve('strict'); await flush();
    expect(view.dialog().open).toBe(true);
    expect(view.level()!.value).toBe('strict');
    await view.change(view.box('factual-review'), true); await flush();
    expect(view.level()!.value).toBe('strict');
  });

  it('paints nothing when the preference answers after the surface is gone', async () => {
    const read = deferred<EvidenceAssuranceLevel>(); readLevel.mockReturnValue(read.promise);
    const view = await openSheet();
    await view.press('[data-review-action="new-review"]');
    view.surface.destroy();
    read.resolve('quick'); await flush();
    expect(view.dialog().open).toBe(false); expect(view.level()).toBeNull();
  });

  it('keeps the level once for 先看计划 and once for 开始审阅, and nothing for 取消', async () => {
    const view = await openSheet(); await view.open();
    await view.change(view.box('factual-review'), true);
    await view.change(view.level()!, 'quick');
    await view.press('[data-review-action="close-sheet"]');
    expect(rememberLevel).not.toHaveBeenCalled();
    await view.open();
    expect(view.level()!.value).toBe('standard');
    await view.change(view.box('factual-review'), true);
    await view.change(view.level()!, 'strict');
    await view.press('[data-review-action="prepare"]');
    expect(rememberLevel.mock.calls).toEqual([['strict']]);
    await view.press('[data-review-action="start"]');
    expect(rememberLevel.mock.calls).toEqual([['strict'], ['strict']]);
  });

  it('keeps no level when 事实核查 does not run', async () => {
    const view = await openSheet(); await view.open();
    await view.press('[data-review-action="start"]');
    expect(rememberLevel).not.toHaveBeenCalled();
  });

  it('sends a double press on 开始审阅 once', async () => {
    const launching = deferred<unknown>();
    const view = await openSheet(() => launching.promise); await view.open();
    const start = view.root.querySelector('[data-review-action="start"]')!;
    start.click(); start.click(); await flush();
    expect(view.launchReviewRun).toHaveBeenCalledTimes(1);
    launching.resolve({ run: null }); await flush();
  });
});
