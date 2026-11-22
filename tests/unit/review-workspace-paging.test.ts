import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { reviewWorkspacePage, reviewWorkspaceWire } from '../../src/service/task-plan.js';
import { mountReviewWorkspace, type MountReviewWorkspaceOptions, type ReviewWorkspaceSurface } from '../../src/renderer/review-workspace.js';
import { setTechnicalLayerVisible, technicalDisclosure, technicalLayerVisible } from '../../src/renderer/technical-layer.js';
import type { RendererApi, ReviewReportRecord, ReviewWorkspaceProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';
import { DEFAULT_QUICK_ACTIONS } from '../../src/shared/preferences.js';
import { createStatusSurface, type StatusSetter } from '../../src/renderer/notifications.js';

vi.mock('../../src/renderer/action-defaults.js', () => ({ readActionDefaults: async () => ({ ...DEFAULT_QUICK_ACTIONS }), rememberActionDefaults: async () => undefined }));

// #1592, renderer half: the 审阅 page reads a review workspace the service paged (its report's lists and the local check's
// 未生成批注) to the end, in order and exactly once, and a refused read is said instead of leaving the last workspace as current.
const BOOK = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const AT = '2026-11-18T00:00:00.000Z';
const DIGEST = 'a'.repeat(64);
const COUNTS = { must: 1, should: 0, note: 0, pending: 1, handled: 0, ignored: 0 };
const MANUSCRIPT = { manuscriptId: 'manuscript-a', branchId: 'branch-a', revisionId: 'revision-a', revisionLabel: 'Revision 1', journalSequence: 0, workingDigest: 'b'.repeat(64) };
const unavailable = { available: false, unavailableReason: '未开放' };
const MUST = 'run.report.record.mustItems.items';
const STATS = 'run.report.record.statistics.rows';
const ENTRIES = 'run.report.record.findings.entries';
const EXCLUDED = 'run.localCheck.excluded';
// Each row weighs about 400 bytes: 360 of them are several pages of every list.
const filler = (index: number): string => `公开合成第 ${index} 条`.padEnd(120, '文');

function report(rows: number, version = 1, runId = RUN): ReviewReportRecord {
  return {
    schema: 'ai7.review.report/2', reviewRunId: runId, version, generatedAt: AT,
    run: { ordinal: 1, label: '第 1 次', createdAt: AT, scopeLabel: '全书', manuscript: { revisionId: 'revision-a', revisionLabel: 'Revision 1', journalSequence: 0 } },
    overview: { title: '概览表', rows: [] },
    mustItems: { title: '必须处理的事项', items: Array.from({ length: rows }, (_, index) => ({ findingId: `must-${index}`, categoryId: 'local-text-check',
      categoryLabel: '本地文字检查', locationLabel: `第 ${index + 1} 段`, quote: filler(index), note: `v${version}`, status: 'pending', statusLabel: '待处理' })) },
    categorySummaries: { title: '各类别摘要', entries: [] },
    appendix: { title: '附录', configuration: { schema: 'ai7.review/1', version: '1', digest: DIGEST }, categories: [] },
    statistics: { title: '章节与类别统计', categories: [{ categoryId: 'local-text-check', label: '本地文字检查' }],
      rows: Array.from({ length: rows }, (_, index) => ({ label: `${filler(index)}章`, counts: [1], total: 1 })), totals: [rows], total: rows },
    findings: { title: '发现详单', omitted: 0, entries: Array.from({ length: rows }, (_, index) => ({ findingIds: [`entry-${index}`], categoryLabels: ['本地文字检查'],
      severityLabel: '必须处理', statusLabel: '待处理', chapterLabel: '第一章', locationLabel: `第 ${index + 1} 段`, quote: filler(index), suggestedText: null, reason: `公开合成理由 v${version}`, sources: [] })) },
  };
}

function workspace(rows: number, version = 1, state: 'partial' | 'running' = 'partial', runId = RUN): ReviewWorkspaceProjection {
  return { bookId: BOOK, manuscript: { ...MANUSCRIPT, totalBlocks: 1 }, configuration: { schema: 'ai7.review/1', version: '1', digest: DIGEST },
    categories: [], coverage: [], scopeOptions: { whole: unavailable, changed: unavailable, selection: unavailable, chapters: { ...unavailable, basis: 'outline', chapters: [] } },
    newReview: unavailable, runsTruncated: false,
    runs: [{ reviewRunId: runId, ordinal: 1, label: '第 1 次', createdAt: AT, scopeLabel: '全书', categoryLabels: ['本地文字检查'], state, stateLabel: state === 'running' ? '正在审阅' : '部分完成',
      findingCounts: COUNTS, reportVersion: 1, historicalMarker: null }],
    run: { reviewRunId: runId, ordinal: 1, label: '第 1 次', createdAt: AT, state, stateLabel: state === 'running' ? '正在审阅' : '部分完成', canContinue: false,
      scope: { kind: 'whole', label: '全书', selectedRange: null, selection: null }, manuscript: MANUSCRIPT, configurationDigest: DIGEST, authorization: { authorizedAt: AT },
      categories: [], findings: [], findingsTotal: 0, findingsTruncated: false, findingCounts: COUNTS,
      localCheck: { planDigest: DIGEST, options: { prose: true, numerals: 'off', publication: 'out-of-scope' } as never, state: 'materialized', paragraphs: rows, counts: null,
        excluded: Array.from({ length: rows }, (_, index) => ({ candidateId: `candidate-${index}`, reason: filler(index) })) },
      report: { reportId: 'report-a', version, generatedAt: AT, digest: DIGEST, record: report(rows, version, runId) },
      reportVersions: [{ reportId: 'report-a', version, generatedAt: AT, digest: DIGEST }], historicalMarker: null, influence: [], scopeStop: null, procedure: null, capture: unavailable } };
}

let restoreDom: () => void;
let surfaces: ReviewWorkspaceSurface[];
let frames: Array<() => void>;
let windowListeners: Map<string, Array<() => void>>;
const nextFrame = (): void => { const due = frames.splice(0); for (const frame of due) frame(); };
beforeEach(() => {
  restoreDom = installMiniDom();
  surfaces = [];
  frames = [];
  windowListeners = new Map();
  vi.stubGlobal('window', { setTimeout, clearTimeout, getSelection: () => null, requestAnimationFrame: (callback: () => void) => { frames.push(callback); return frames.length; },
    addEventListener: (type: string, listener: () => void) => { windowListeners.set(type, [...(windowListeners.get(type) ?? []), listener]); },
    removeEventListener: (type: string, listener: () => void) => { windowListeners.set(type, (windowListeners.get(type) ?? []).filter((entry) => entry !== listener)); } });
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
const refusal = (code: string, message: string): Error & { code: string } => Object.assign(new Error(message), { code });

/**
 * The service's own paging, at a budget that forces it: `inspectReviewWorkspace` answers `reviewWorkspaceWire(full)` and
 * `getTaskPlanPage` answers `reviewWorkspacePage(full, …)`, so a page of a list that changed meanwhile is refused by digest.
 */
type Stub = { full: ReviewWorkspaceProjection; budget: number; refuse?: Error | null; gate?: Promise<void> | null;
  read?: (input: Parameters<RendererApi['inspectReviewWorkspace']>[0]) => Promise<ReviewWorkspaceProjection>; focusFinding?: string; opened?: string[] };

function mount(state: Stub, status: StatusSetter = Object.assign(vi.fn(), { settle: vi.fn() })) {
  const root = new MiniElement('main');
  miniDocument.body.append(root);
  const inspectReviewWorkspace = vi.fn<RendererApi['inspectReviewWorkspace']>().mockImplementation(async (input) => {
    if (state.refuse) throw state.refuse;
    if (state.read) return state.read(input);
    return reviewWorkspaceWire(structuredClone(state.full), state.budget);
  });
  // A page is computed from the list as it stood when it was asked, and answered when the gate opens.
  const getTaskPlanPage = vi.fn<RendererApi['getTaskPlanPage']>().mockImplementation(async (input) => {
    const full = state.full;
    const gate = state.gate;
    if (gate) await gate;
    if (input.kind !== 'review-run' || input.ref !== full.run?.reviewRunId) throw refusal('TASK_PLAN_PAGE_INVALID', '审阅读取范围无效。');
    try { return reviewWorkspacePage(full, input.path, input.afterOrdinal, input.digest); } catch (error) {
      const cause = error as { code?: string; data?: { code?: string }; message: string };
      throw refusal(cause.code ?? cause.data?.code ?? 'UNKNOWN', cause.message);
    }
  });
  const inspectFactualVerification = vi.fn(async () => { throw new Error('no factual lens here'); });
  const unexpected = vi.fn(async () => { throw new Error('unexpected API operation'); });
  // The steps Ctrl+Z would take (Issue #1654): none in these cases.
  const inspectEditorHistory = vi.fn(async (input: { branchId: string }) => ({ branchId: input.branchId, undo: null, redo: null }));
  const calls = { inspectReviewWorkspace, getTaskPlanPage, inspectFactualVerification, inspectEditorHistory };
  const api = new Proxy(calls, { get: (target, key) => Reflect.get(target, key) ?? unexpected }) as unknown as MountReviewWorkspaceOptions['api'];
  const surface = mountReviewWorkspace({ root: root as unknown as HTMLElement, bookId: BOOK, bookTitle: '公开合成图书', focus: { reviewRunId: RUN, findingId: state.focusFinding ?? null }, api,
    awaitServiceJob: async (initial) => initial,
    technicalDetails: (_className, ...rows) => { const node = new MiniElement('dl'); node.append(...rows as unknown as MiniElement[]); return technicalDisclosure(node as unknown as HTMLElement); },
    setStatus: status, errorMessage: (error, fallback) => (error as { message?: string })?.message || fallback, errorCode: (error) => (error as { code?: string })?.code ?? null,
    openManuscript: async () => undefined, goToText: async () => undefined, openPlan: (reviewRunId) => { state.opened?.push(reviewRunId); }, openSearchSettings: () => undefined, planChanged: () => undefined });
  surfaces.push(surface);
  surface.start();
  return { root, surface, api, status: status as StatusSetter & ReturnType<typeof vi.fn>, unexpected, ...calls };
}

const card = (root: MiniElement): MiniElement => root.querySelector('.review-workspace-card')!;
const paging = (root: MiniElement, path: string): MiniElement | null => root.querySelector(`[data-review-page="${path}"]`);
const more = (root: MiniElement, path: string): MiniElement => paging(root, path)!.querySelector('button')!;
const listed = (root: MiniElement, path: string, selector: string): string[] =>
  root.querySelector(`[data-review-part-path="${path}"]`)!.querySelectorAll(selector).map((node) => node.textContent);
const PAGED = (): Stub => ({ full: workspace(360), budget: 120 * 1024 });
function gate(state: Stub): () => void {
  let open!: () => void;
  state.gate = new Promise<void>((resolve) => { open = resolve; });
  return () => { state.gate = null; open(); };
}

describe('a paged review workspace on the 审阅 page (#1592)', () => {
  it('says how much of each report list is shown and reads the rest in order, exactly once', async () => {
    const view = mount(PAGED()); await flush();
    const first = view.inspectReviewWorkspace.mock.results[0]!.value as Promise<ReviewWorkspaceProjection>;
    const meta = (await first).listPages!;
    for (const path of [MUST, STATS, ENTRIES, EXCLUDED]) {
      expect(meta[path]?.nextOrdinal, path).not.toBeNull();
      expect(paging(view.root, path)!.textContent).toContain(`已显示 ${meta[path]!.shown} / 360 条。`);
    }
    // Each list's control names its list; the totals row is whole while its chapters are read in part, and says so.
    expect(more(view.root, MUST).getAttribute('aria-label')).toBe('显示更多必须处理的事项');
    expect(more(view.root, EXCLUDED).getAttribute('aria-label')).toBe('显示更多未生成批注');
    expect(paging(view.root, STATS)!.textContent).toContain('合计计入全部章节。');
    expect(listed(view.root, STATS, 'tr').at(-1)).toContain('360');

    for (const path of [MUST, STATS, ENTRIES, EXCLUDED]) {
      for (let guard = 0; paging(view.root, path) !== null; guard += 1) {
        expect(guard).toBeLessThan(40);
        more(view.root, path).focus();
        more(view.root, path).click(); await flush();
      }
      expect(miniDocument.activeElement?.dataset['reviewPartPath']).toBe(path);
    }
    const full = workspace(360).run!;
    expect(listed(view.root, MUST, 'li')).toHaveLength(360);
    expect(listed(view.root, MUST, 'li').every((text, index) => text.includes(full.report!.record.mustItems.items[index]!.quote))).toBe(true);
    expect(listed(view.root, STATS, 'tbody tr').slice(0, -1).map((text) => text.slice(0, filler(0).length))).toEqual(full.report!.record.statistics!.rows.map((row) => row.label.slice(0, filler(0).length)));
    expect(view.root.querySelector(`[data-review-part-path="${ENTRIES}"]`)!.querySelectorAll('li').map((node) => node.dataset['findingIds'])).toEqual(full.report!.record.findings!.entries.map((entry) => entry.findingIds[0]));
    expect(listed(view.root, EXCLUDED, 'li').map((text) => text.slice(0, filler(0).length))).toEqual(full.localCheck!.excluded.map((entry) => entry.reason));
    // Each page was asked once, from where the last ended, with the opened Run's identity.
    for (const path of [MUST, STATS, ENTRIES, EXCLUDED]) {
      const asked = view.getTaskPlanPage.mock.calls.map(([input]) => input).filter((input) => input.path === path);
      expect(asked.every((input) => input.kind === 'review-run' && input.ref === RUN && input.digest === meta[path]!.digest)).toBe(true);
      expect(new Set(asked.map((input) => input.afterOrdinal)).size).toBe(asked.length);
      expect(asked[0]!.afterOrdinal).toBe(meta[path]!.nextOrdinal);
    }
    // A live read of the same lists keeps what was read.
    view.surface.refresh(); await flush();
    expect(listed(view.root, MUST, 'li')).toHaveLength(360);
    expect(paging(view.root, MUST)).toBeNull();
  });

  it('appends a page that arrives after a poll repainted the card, and frees its control', async () => {
    const state = PAGED();
    const view = mount(state); await flush();
    const shown = listed(view.root, MUST, 'li').length;
    const open = gate(state);
    more(view.root, MUST).click(); await flush();
    expect(more(view.root, MUST).disabled).toBe(true);
    // A poll answers meanwhile with the same lists: the card is drawn again and the control stays held.
    view.surface.refresh(); await flush();
    expect(more(view.root, MUST).disabled).toBe(true);
    open(); await flush();
    expect(listed(view.root, MUST, 'li').length).toBeGreaterThan(shown);
    expect(more(view.root, MUST).disabled).toBe(false);
    expect(view.getTaskPlanPage).toHaveBeenCalledTimes(1);
  });

  it('reads two lists pressed one after the other, each once', async () => {
    const state = PAGED();
    const view = mount(state); await flush();
    const before = { must: listed(view.root, MUST, 'li').length, entries: listed(view.root, ENTRIES, 'li').length };
    const open = gate(state);
    more(view.root, MUST).click();
    more(view.root, ENTRIES).click(); await flush();
    // A second press of a list already being read asks nothing more.
    more(view.root, MUST).click(); await flush();
    expect(view.getTaskPlanPage.mock.calls.map(([input]) => input.path)).toEqual([MUST, ENTRIES]);
    open(); await flush();
    expect(listed(view.root, MUST, 'li').length).toBeGreaterThan(before.must);
    expect(listed(view.root, ENTRIES, 'li').length).toBeGreaterThan(before.entries);
    expect(new Set(listed(view.root, MUST, 'li')).size).toBe(listed(view.root, MUST, 'li').length);
  });

  it('drops a page that no longer continues the list on screen', async () => {
    const state = PAGED();
    const view = mount(state); await flush();
    const open = gate(state);
    more(view.root, MUST).click(); await flush();
    // The report was generated again before the page came back; the editor's next read shows the new one.
    state.full = workspace(360, 2);
    view.surface.refresh(); await flush();
    open(); await flush();
    const rows = listed(view.root, MUST, 'li');
    expect(rows.every((text) => text.includes('v2'))).toBe(true);
    expect(paging(view.root, MUST)!.textContent).toContain(`已显示 ${rows.length} / 360 条。`);
    expect(more(view.root, MUST).disabled).toBe(false);
  });

  it('drops a page of the Run that was open when another Run with the same lists is opened meanwhile', async () => {
    const state = PAGED();
    const view = mount(state); await flush();
    const shown = listed(view.root, MUST, 'li').length;
    const open = gate(state);
    more(view.root, MUST).click(); await flush();
    state.full = workspace(360, 1, 'partial', OTHER);
    view.surface.refresh(); await flush();
    expect(card(view.root).dataset['reviewRunId']).toBe(OTHER);
    open(); await flush();
    expect(listed(view.root, MUST, 'li')).toHaveLength(shown);
    expect(more(view.root, MUST).disabled).toBe(false);
  });

  it('reads the workspace again when a list changed between pages, keeps focus on that list and says so afterwards', async () => {
    const state = PAGED();
    const view = mount(state); await flush();
    expect(view.inspectReviewWorkspace).toHaveBeenCalledTimes(1);
    state.full = workspace(360, 2);
    more(view.root, ENTRIES).focus();
    more(view.root, ENTRIES).click(); await flush();
    expect(view.getTaskPlanPage).toHaveBeenCalledTimes(1);
    expect(view.inspectReviewWorkspace).toHaveBeenCalledTimes(2);
    expect(miniDocument.activeElement?.closest('[data-review-page]')?.dataset['reviewPage']).toBe(ENTRIES);
    expect(miniDocument.querySelector('[data-toast]')?.textContent).toBe('审阅结果已变化，已重新读取，从第一页显示。');
    expect(listed(view.root, MUST, 'li').every((text) => text.includes('v2'))).toBe(true);
    // The next page is the changed list's, read from where its own first page ended.
    const shown = listed(view.root, MUST, 'li').length;
    more(view.root, MUST).click(); await flush();
    expect(view.getTaskPlanPage).toHaveBeenLastCalledWith(expect.objectContaining({ path: MUST, afterOrdinal: shown }));
    expect(listed(view.root, MUST, 'li').length).toBeGreaterThan(shown);
    expect(listed(view.root, MUST, 'li').every((text) => text.includes('v2'))).toBe(true);
  });

  it('says a page that failed beside its control, keeps saying it through a repaint, and reads it once on the next try', async () => {
    const view = mount(PAGED()); await flush();
    const shown = listed(view.root, MUST, 'li').length;
    view.getTaskPlanPage.mockRejectedValueOnce(refusal('SERVICE_UNAVAILABLE', '服务暂时无法回答。'));
    more(view.root, MUST).click(); await flush();
    expect(paging(view.root, MUST)!.querySelector('[role="alert"]')!.textContent).toBe('服务暂时无法回答。');
    expect(view.status).toHaveBeenCalledWith('服务暂时无法回答。', 'error');
    view.surface.refresh(); await flush();
    expect(paging(view.root, MUST)!.querySelector('[role="alert"]')!.textContent).toBe('服务暂时无法回答。');
    expect(more(view.root, MUST).disabled).toBe(false);
    expect(listed(view.root, MUST, 'li')).toHaveLength(shown);
    more(view.root, MUST).click(); await flush();
    const after = listed(view.root, MUST, 'li');
    expect(after.length).toBeGreaterThan(shown);
    expect(new Set(after).size).toBe(after.length);
    expect(paging(view.root, MUST)!.querySelector('[role="alert"]')).toBeNull();
  });

  it('says a failed page in its own words when the service gives none', async () => {
    const view = mount(PAGED()); await flush();
    view.getTaskPlanPage.mockRejectedValueOnce(Object.assign(new Error(''), { code: 'X' }));
    more(view.root, MUST).click(); await flush();
    expect(paging(view.root, MUST)!.querySelector('[role="alert"]')!.textContent).toBe('无法读取更多审阅内容，请稍后再试。');
  });

  it('asks for nothing more when the workspace fits one reply', async () => {
    const view = mount({ full: workspace(3), budget: 4 * 1024 * 1024 }); await flush();
    view.surface.refresh(); await flush();
    expect(view.getTaskPlanPage).not.toHaveBeenCalled();
    expect(view.unexpected).not.toHaveBeenCalled();
    expect(view.inspectReviewWorkspace.mock.calls).toEqual([
      [{ reviewRunId: RUN, categoryId: null, severity: null, status: null, chapterBlockId: null }],
      [{ reviewRunId: RUN, categoryId: null, severity: null, status: null, chapterBlockId: null }],
    ]);
    expect(view.root.querySelectorAll('[data-review-page]')).toHaveLength(0);
    expect(listed(view.root, MUST, 'li')).toHaveLength(3);
  });
});

describe('a refused workspace read on the 审阅 page (#1592)', () => {
  const TOO_LARGE = '审阅摘要超出可读取范围。';
  it('stands once in the bar and on the card through refused polls and repaints, and a read that succeeds ends it', async () => {
    const bar = new MiniElement('div');
    const real = createStatusSurface(bar as unknown as HTMLElement);
    const status = Object.assign(vi.fn((message: string, tone?: 'busy' | 'success' | 'error') => real(message, tone)), { settle: vi.fn((message: string) => real.settle(message)) });
    const state: Stub = { ...PAGED(), refuse: null };
    state.full = workspace(360, 1, 'running');
    const view = mount(state, status); await flush();
    expect(card(view.root).dataset['reviewState']).toBe('running');
    state.refuse = refusal('TASK_PLAN_SUMMARY_TOO_LARGE', TOO_LARGE);
    for (let poll = 0; poll < 3; poll += 1) { view.surface.refresh(); await flush(); }
    expect(status.mock.calls.filter(([, tone]) => tone === 'error')).toEqual([[TOO_LARGE, 'error']]);
    expect(bar.textContent).toContain(TOO_LARGE);
    expect(card(view.root).dataset['reviewRead']).toBe('failed');
    const note = card(view.root).querySelector('.review-read-failed')!;
    expect(note.getAttribute('role')).toBe('alert');
    expect(note.textContent).toBe(`${TOO_LARGE}下面是上次读到的审阅，可能已经过时。`);
    // A repaint of the card on screen — a page of a list read meanwhile — keeps the note, once.
    more(view.root, MUST).click(); await flush();
    expect(card(view.root).querySelectorAll('.review-read-failed')).toHaveLength(1);
    expect(card(view.root).dataset['reviewRead']).toBe('failed');
    state.refuse = null;
    view.surface.refresh(); await flush();
    expect(card(view.root).querySelector('.review-read-failed')).toBeNull();
    expect(card(view.root).dataset['reviewRead']).toBeUndefined();
    expect(status.settle).toHaveBeenCalledWith(TOO_LARGE);
    expect(bar.textContent).not.toContain(TOO_LARGE);
  });

  it('leaves a different standing error alone when its read recovers', async () => {
    const bar = new MiniElement('div');
    const real = createStatusSurface(bar as unknown as HTMLElement);
    const status = Object.assign(vi.fn((message: string, tone?: 'busy' | 'success' | 'error') => real(message, tone)), { settle: vi.fn((message: string) => real.settle(message)) });
    const state: Stub = { full: workspace(3, 1, 'running'), budget: 4 * 1024 * 1024, refuse: null };
    const view = mount(state, status); await flush();
    state.refuse = refusal('TASK_PLAN_SUMMARY_TOO_LARGE', TOO_LARGE);
    view.surface.refresh(); await flush();
    real('无法保存这次修改。', 'error');
    state.refuse = null;
    view.surface.refresh(); await flush();
    expect(bar.textContent).toContain('无法保存这次修改。');
    expect(card(view.root).querySelector('.review-read-failed')).toBeNull();
  });

  it('says a refused first read on the card and at the bottom, and 重新读取 asks again', async () => {
    const state: Stub = { full: workspace(3), budget: 4 * 1024 * 1024, refuse: refusal('TASK_PLAN_SUMMARY_TOO_LARGE', TOO_LARGE) };
    const view = mount(state); await flush();
    expect(card(view.root).dataset['reviewState']).toBe('unavailable');
    expect(card(view.root).textContent).toContain(TOO_LARGE);
    expect(view.status).toHaveBeenCalledWith(TOO_LARGE, 'error');
    state.refuse = null;
    card(view.root).querySelector('[data-review-action="reread"]')!.click(); await flush();
    expect(card(view.root).dataset['reviewState']).toBe('partial');
    expect(view.status.settle).toHaveBeenCalledWith(TOO_LARGE);
  });
});

describe('a failed page of a review list (#1592 re-check)', () => {
  const FAILED = '服务暂时无法回答。';
  const realStatus = () => {
    const bar = new MiniElement('div');
    const real = createStatusSurface(bar as unknown as HTMLElement);
    return { bar, real, status: Object.assign(vi.fn((message: string, tone?: 'busy' | 'success' | 'error') => real(message, tone)), { settle: vi.fn((message: string) => real.settle(message)) }) };
  };

  it('ends its error in the bar once the retry reads the page', async () => {
    const { bar, status } = realStatus();
    const view = mount(PAGED(), status); await flush();
    view.getTaskPlanPage.mockRejectedValueOnce(refusal('SERVICE_UNAVAILABLE', FAILED));
    more(view.root, MUST).click(); await flush();
    expect(bar.textContent).toContain(FAILED);
    more(view.root, MUST).click(); await flush();
    expect(status.settle).toHaveBeenCalledWith(FAILED);
    expect(bar.textContent).not.toContain(FAILED);
    view.surface.refresh(); await flush();
    expect(bar.textContent).not.toContain(FAILED);
  });

  it('frees its control when a decision on a finding that was in flight settles in place', async () => {
    const state = PAGED();
    const run = state.full.run!;
    const category = { categoryId: 'typos-and-usage', label: '错别字与用法', position: 1, output: 'change-suggestion', riskPointsOnly: false, batchApply: true,
      basis: { categoryId: 'typos-and-usage', executor: 'review-category-contract', searchEngine: false, guidelineDocuments: [], procedure: { title: '审阅', version: '1' } },
      state: 'settled', stateLabel: '已完成', detail: null, taskIntentId: null, planEnvelopeDigest: DIGEST, modeLabel: null, plan: null, progress: null, findingsCount: 1, excludedCount: 0 };
    const finding = { findingId: 'f-1', categoryId: 'typos-and-usage', categoryLabel: '错别字与用法', ordinal: 1, severity: 'must', severityLabel: '必须处理',
      output: 'change-suggestion', riskPoint: false, status: 'pending', statusLabel: '待处理', statusDetail: '公开合成状态', blockId: 'blk_777777777777777777777777',
      fromGrapheme: 0, toGrapheme: 8, blockPosition: 0, chapterBlockId: null, chapterTitle: null, quote: '公开合成文字', note: '公开合成问题',
      replacement: '公开合成替换', clauseRefs: [], stateLine: null, markId: 'm-1', markStatus: 'open', anchorState: 'exact', ignoreReason: null, historicalMarker: null };
    state.full = { ...state.full, run: { ...run, categories: [category], findings: [finding], findingsTotal: 1 } } as ReviewWorkspaceProjection;
    const view = mount(state); await flush();
    let decide!: (value: unknown) => void;
    const reject = vi.fn(() => new Promise((resolve) => { decide = resolve; }));
    let failPage!: () => void;
    view.getTaskPlanPage.mockImplementationOnce(() => new Promise((_resolve, reject) => { failPage = () => reject(refusal('SERVICE_UNAVAILABLE', FAILED)); }));
    Object.assign(view.api, { recordChangeSuggestionDecision: reject });
    more(view.root, MUST).click(); await flush();
    view.root.querySelector('article[data-finding-id="f-1"]')!.dispatchEvent({ type: 'keydown', key: 'r' }); await flush();
    expect(reject).toHaveBeenCalledTimes(1);
    failPage(); await flush();
    expect(paging(view.root, MUST)!.querySelector('[role="alert"]')!.textContent).toBe(FAILED);
    decide({ card: { status: 'open', suggestion: null } }); await flush();
    expect(view.inspectReviewWorkspace).toHaveBeenCalledTimes(1);
    expect(more(view.root, MUST).disabled).toBe(false);
  });

  it('draws a category waiting for its place, and the report row of one, in the words of the editor (Issue #1531)', async () => {
    const was = technicalLayerVisible;
    setTechnicalLayerVisible(false);
    onTestFinished(() => setTechnicalLayerVisible(was));
    const full = workspace(1, 1, 'running');
    const run = full.run!;
    const category = { categoryId: 'typos-and-usage', label: '错别字与用法', position: 1, output: 'change-suggestion', riskPointsOnly: false, batchApply: true,
      basis: { categoryId: 'typos-and-usage', executor: 'review-category-contract', searchEngine: false, guidelineDocuments: [], procedure: { title: '审阅', version: '1' } },
      taskIntentId: null, planEnvelopeDigest: DIGEST, modeLabel: null, plan: null, progress: null, findingsCount: 0, excludedCount: 0, state: 'waiting', stateLabel: '等待运行名额',
      detail: '运行名额已满：等待运行名额的任务先开始，有名额空出时这一类接着审；在此之前这一类什么都没有发送。' };
    const record = { ...run.report!.record, overview: { title: '概览表' as const, rows: [{ categoryId: 'typos-and-usage', label: '错别字与用法', state: 'waiting' as const, stateLabel: '等待运行名额', counts: COUNTS }] } };
    const view = mount({ full: { ...full, run: { ...run, categories: [category], report: { ...run.report!, record } } } as ReviewWorkspaceProjection, budget: 120 * 1024 }); await flush();
    const pill = view.root.querySelector('li[data-review-category="typos-and-usage"]');
    expect(pill?.textContent).toContain('排队中');
    const row = view.root.querySelector('tr[data-review-category="typos-and-usage"]');
    expect(row?.textContent).toContain('排队中');
    expect(`${pill?.textContent}${row?.textContent}`).not.toContain('运行名额');
  });

  it('is not said beside the list of a Run opened afterwards', async () => {
    const state = PAGED();
    const view = mount(state); await flush();
    view.getTaskPlanPage.mockRejectedValueOnce(refusal('SERVICE_UNAVAILABLE', FAILED));
    more(view.root, MUST).click(); await flush();
    expect(paging(view.root, MUST)!.querySelector('[role="alert"]')).not.toBeNull();
    state.full = workspace(360, 1, 'partial', OTHER);
    view.surface.refresh(); await flush();
    expect(card(view.root).dataset['reviewRunId']).toBe(OTHER);
    expect(paging(view.root, MUST)!.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('重新读取 after the bar was dismissed (#1592 re-check)', () => {
  it('says the same refusal again when the editor asks', async () => {
    const bar = new MiniElement('div');
    const real = createStatusSurface(bar as unknown as HTMLElement);
    const status = Object.assign(vi.fn((message: string, tone?: 'busy' | 'success' | 'error') => real(message, tone)), { settle: vi.fn((message: string) => real.settle(message)) });
    const TOO_LARGE = '审阅摘要超出可读取范围。';
    const view = mount({ full: workspace(3), budget: 4 * 1024 * 1024, refuse: refusal('TASK_PLAN_SUMMARY_TOO_LARGE', TOO_LARGE) }, status); await flush();
    bar.querySelector('.status-dismiss')!.click();
    expect(bar.textContent).not.toContain(TOO_LARGE);
    card(view.root).querySelector('[data-review-action="reread"]')!.click(); await flush();
    expect(bar.textContent).toContain(TOO_LARGE);
    expect(card(view.root).querySelector('[data-review-action="reread"]')!.disabled).toBe(false);
  });
});

describe('a press on the review card while a read arrives (#1592: 查看计划 lost under the pointer)', () => {
  const MOVED = '正在审阅 · 已读完一半';
  const running = (): Stub => ({ full: workspace(3, 1, 'running'), budget: 4 * 1024 * 1024, opened: [] });
  const moved = (state: Stub, label = MOVED): void => { state.full = { ...state.full, run: { ...state.full.run!, stateLabel: label, findingsTotal: 2 } }; };
  const viewPlan = (root: MiniElement): MiniElement => root.querySelector('[data-review-action="view-plan"]')!;
  const pointer = (node: MiniElement, type: string, button = 0): void => { node.dispatchEvent(Object.assign({ type, bubbles: true }, { button })); };
  const key = (node: MiniElement, type: string, name = ' '): void => { node.dispatchEvent(Object.assign({ type, bubbles: true }, { key: name })); };
  const shown = (root: MiniElement): string => card(root).textContent;

  it('keeps the pressed control until its click, then draws the read that arrived meanwhile, once', async () => {
    const state = running();
    const view = mount(state); await flush();
    const pressed = viewPlan(view.root);
    pointer(pressed, 'pointerdown');
    // Two reads answer while the button is down: the Run moved on, so each would draw the card again.
    moved(state, '正在审阅 · 第一次');
    view.surface.refresh(); await flush();
    moved(state);
    view.surface.refresh(); await flush();
    expect(viewPlan(view.root)).toBe(pressed);
    expect(shown(view.root)).not.toContain('第一次');
    expect(shown(view.root)).not.toContain(MOVED);
    pointer(pressed, 'pointerup');
    pressed.click(); await flush();
    expect(state.opened).toEqual([RUN]);
    // Until the frame after the release the pressed button is still the one on screen; that frame draws the newest read, once.
    expect(viewPlan(view.root)).toBe(pressed);
    expect(frames).toHaveLength(1);
    nextFrame(); await flush();
    expect(shown(view.root)).toContain(MOVED);
    expect(shown(view.root)).not.toContain('第一次');
    expect(viewPlan(view.root)).not.toBe(pressed);
    expect(state.opened).toEqual([RUN]);
  });

  it('holds through the unforced poll of a running Run as well', async () => {
    const state = running();
    const view = mount(state); await flush();
    const pressed = viewPlan(view.root);
    pointer(pressed, 'pointerdown');
    moved(state);
    const reads = view.inspectReviewWorkspace.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 300)); await flush();
    expect(view.inspectReviewWorkspace.mock.calls.length).toBeGreaterThan(reads);
    expect(viewPlan(view.root)).toBe(pressed);
    pointer(pressed, 'pointerup'); nextFrame(); await flush();
    expect(shown(view.root)).toContain(MOVED);
  });

  it('ends the hold on a release outside the card, a cancelled press and the window losing focus', async () => {
    for (const end of ['outside', 'cancel', 'blur'] as const) {
      const state = running();
      const view = mount(state); await flush();
      pointer(viewPlan(view.root), 'pointerdown');
      moved(state);
      view.surface.refresh(); await flush();
      expect(shown(view.root), end).not.toContain(MOVED);
      if (end === 'outside') pointer(miniDocument.body, 'pointerup');
      else if (end === 'cancel') pointer(miniDocument.body, 'pointercancel');
      else for (const listener of windowListeners.get('blur') ?? []) listener();
      nextFrame(); await flush();
      expect(shown(view.root), end).toContain(MOVED);
      view.surface.destroy(); view.root.remove();
    }
  });

  it('holds nothing for a press of another button, or with no press at all', async () => {
    const state = running();
    const view = mount(state); await flush();
    pointer(viewPlan(view.root), 'pointerdown', 2);
    moved(state);
    view.surface.refresh(); await flush();
    expect(shown(view.root)).toContain(MOVED);
    expect(frames).toHaveLength(0);
  });

  it('holds a Space key on a control of the card from its keydown to its keyup', async () => {
    const state = running();
    const view = mount(state); await flush();
    const pressed = viewPlan(view.root);
    key(pressed, 'keydown');
    moved(state);
    view.surface.refresh(); await flush();
    expect(viewPlan(view.root)).toBe(pressed);
    key(pressed, 'keyup');
    pressed.click(); await flush();
    expect(state.opened).toEqual([RUN]);
    nextFrame(); await flush();
    expect(shown(view.root)).toContain(MOVED);
  });

  it('holds a page appended to a report list while 查看计划 is pressed, like any other whole-card draw', async () => {
    const state: Stub = { full: workspace(360, 1, 'running'), budget: 120 * 1024, opened: [] };
    const view = mount(state); await flush();
    const rows = listed(view.root, MUST, 'li').length;
    const open = gate(state);
    more(view.root, MUST).click(); await flush();
    const pressed = viewPlan(view.root);
    pointer(pressed, 'pointerdown');
    open(); await flush();
    expect(viewPlan(view.root)).toBe(pressed);
    expect(listed(view.root, MUST, 'li')).toHaveLength(rows);
    pointer(pressed, 'pointerup'); nextFrame(); await flush();
    expect(listed(view.root, MUST, 'li').length).toBeGreaterThan(rows);
  });

  it('brings 查看任务\'s finding into view after the held draw, not against the card under the press', async () => {
    const category = { categoryId: 'typos-and-usage', label: '错别字与用法', position: 1, output: 'change-suggestion', riskPointsOnly: false, batchApply: true,
      basis: { categoryId: 'typos-and-usage', executor: 'review-category-contract', searchEngine: false, guidelineDocuments: [], procedure: { title: '审阅', version: '1' } },
      state: 'settled', stateLabel: '已完成', detail: null, taskIntentId: null, planEnvelopeDigest: DIGEST, modeLabel: null, plan: null, progress: null, findingsCount: 2, excludedCount: 0 };
    const finding = (id: string, ordinal: number) => ({ findingId: id, categoryId: 'typos-and-usage', categoryLabel: '错别字与用法', ordinal, severity: 'must', severityLabel: '必须处理',
      output: 'change-suggestion', riskPoint: false, status: 'pending', statusLabel: '待处理', statusDetail: '公开合成状态', blockId: 'blk_777777777777777777777777',
      fromGrapheme: 0, toGrapheme: 2, blockPosition: 0, chapterBlockId: null, chapterTitle: null, quote: '公开', note: '公开合成问题',
      replacement: '公开合成', clauseRefs: [], stateLine: null, markId: `m-${id}`, markStatus: 'open', anchorState: 'exact', ignoreReason: null, historicalMarker: null });
    const base = workspace(3);
    const page = (findings: ReturnType<typeof finding>[], truncated: boolean) =>
      ({ ...base, run: { ...base.run!, categories: [category], findings, findingsTotal: 2, findingsTruncated: truncated } }) as ReviewWorkspaceProjection;
    let release!: () => void;
    const second = new Promise<void>((resolve) => { release = resolve; });
    const state: Stub = { full: base, budget: 4 * 1024 * 1024, focusFinding: 'f-2',
      read: async (input) => {
        if (input?.findingsAfterOrdinal == null) return page([finding('f-1', 1)], true);
        await second;
        return page([finding('f-2', 2)], false);
      } };
    const view = mount(state); await flush();
    // The first page holds f-1 only, so 审阅 reads the next page for f-2; that answer arrives while 查看计划 is pressed.
    expect(view.root.querySelector('article[data-finding-id="f-2"]')).toBeNull();
    const pressed = viewPlan(view.root);
    pointer(pressed, 'pointerdown');
    release(); await flush();
    expect(view.root.querySelector('article[data-finding-id="f-2"]')).toBeNull();
    pointer(pressed, 'pointerup'); nextFrame(); await flush();
    const target = view.root.querySelector('article[data-finding-id="f-2"]');
    expect(target).not.toBeNull();
    expect(miniDocument.activeElement).toBe(target);
  });

  it('lets a press that is down when the page is left hold nothing afterwards', async () => {
    const state = running();
    const view = mount(state); await flush();
    pointer(viewPlan(view.root), 'pointerdown');
    moved(state);
    view.surface.refresh(); await flush();
    view.surface.destroy();
    pointer(miniDocument.body, 'pointerup');
    expect(() => nextFrame()).not.toThrow();
    expect(view.unexpected).not.toHaveBeenCalled();
  });
});

describe('the new-review sheet over a paged workspace (#1526)', () => {
  it('keeps the chapters already read after a model choice in the sheet', async () => {
    const available = { available: true, unavailableReason: null };
    const full = workspace(1);
    full.newReview = available; full.scopeOptions.whole = available;
    full.scopeOptions.chapters = { ...available, basis: 'outline', chapters: Array.from({ length: 600 }, (_, position) => ({
      blockId: `chapter-${position}`, title: filler(position), position, endPosition: position, level: 1 })) };
    const view = mount({ full, budget: 120 * 1024 }); await flush();
    view.root.querySelector('[data-review-action="new-review"]')!.click(); await flush();
    const choices = (): number => view.root.querySelector('[data-review-chapter="from"]')!.querySelectorAll('option').length;
    const first = choices();
    view.root.querySelector('[data-review-chapter-page]')!.click(); await flush();
    const read = choices();
    expect(read).toBeGreaterThan(first);
    view.inspectReviewWorkspace.mockClear();
    view.root.querySelector('dialog .dispatch-chooser button')!.click(); await flush();
    expect(view.inspectReviewWorkspace).toHaveBeenCalledWith(expect.objectContaining({ executionConfig: {} }));
    expect(choices()).toBe(read);
  });
});

describe('the control under a resting pointer stays where it stands when the card is drawn again (#1526 J-04, 1 of 4 at 1008×681)', () => {
  const category = (settled: number, count: number) => ({ categoryId: 'typos-and-usage', label: '错别字与用法', position: 1, output: 'change-suggestion', riskPointsOnly: false, batchApply: true,
    basis: { categoryId: 'typos-and-usage', executor: 'review-category-contract', searchEngine: false, guidelineDocuments: [], procedure: { title: '审阅', version: '1' } },
    state: 'settled', stateLabel: '已完成', detail: null, taskIntentId: null, planEnvelopeDigest: DIGEST, modeLabel: null, plan: null, findingsCount: count, excludedCount: 0,
    progress: { unitsTotal: 7, unitsSettled: settled, currentUnitOrdinal: null, currentUnitStartedAt: null, attemptState: null, stage: 'units', longestSettledUnitMs: null } });
  const finding = (id: string, ordinal: number) => ({ findingId: id, categoryId: 'typos-and-usage', categoryLabel: '错别字与用法', ordinal, severity: 'must', severityLabel: '必须处理',
    output: 'change-suggestion', riskPoint: false, status: 'pending', statusLabel: '待处理', statusDetail: '公开合成状态', blockId: 'blk_777777777777777777777777',
    fromGrapheme: 0, toGrapheme: 2, blockPosition: 0, chapterBlockId: null, chapterTitle: null, quote: '公开', note: '公开合成问题',
    replacement: '公开合成', clauseRefs: [], stateLine: null, markId: `m-${id}`, markStatus: 'open', anchorState: 'exact', ignoreReason: null, historicalMarker: null });
  const reading = (ids: string[], settled = 1): ReviewWorkspaceProjection => {
    const base = workspace(3, 1, 'running');
    return { ...base, run: { ...base.run!, categories: [category(settled, ids.length)], findings: ids.map((id, index) => finding(id, index + 1)), findingsTotal: ids.length, findingsTruncated: false,
      findingCounts: { ...COUNTS, must: ids.length, pending: ids.length } } } as never;
  };
  const viewPlan = (root: MiniElement): MiniElement => root.querySelector('[data-review-action="view-plan"]')!;
  const inFinding = (root: MiniElement, id: string): MiniElement => root.querySelector(`article[data-finding-id="${id}"] button`)!;
  const rest = (node: MiniElement): void => { node.dispatchEvent(Object.assign({ type: 'pointermove', bubbles: true }, { clientX: 300, clientY: 400 })); };
  const poll = async (): Promise<void> => { await new Promise((resolve) => setTimeout(resolve, 300)); await flush(); };

  /**
   * A page that lays out like an engine, in one column: finding cards from 100 px, 200 px apart; 查看计划 300 px further down for
   * each card above it; then the progress list (100 px tall while the Run reads, 54 px once its last part is read, never less than
   * its own min-height) and 600 px more. The window is 800 px tall and the scroll is clamped to [0, page − window], also when the
   * page gets shorter. `under` names what lies under the pointer's last position.
   */
  type Layout = { scrollTop: number; width: number };
  async function laidOut(body: (view: ReturnType<typeof mount>, state: Stub, scroller: Layout, under: (find: () => MiniElement | null) => void) => Promise<void>): Promise<void> {
    const root = miniDocument.body;
    // The list's rows: 100 px at 600 px wide, 130 px when the page is narrower and they wrap; 54 px once the last part is read.
    const natural = (): number => root.querySelector('ol.review-progress li')?.dataset['reviewProgress'] === '7/7' ? 54 : scroller.width < 600 ? 130 : 100;
    const progressHeight = (): number => Math.max(natural(), Number.parseFloat(root.querySelector('ol.review-progress')?.style['minHeight'] || '0'));
    const findings = (): MiniElement[] => root.querySelectorAll('article.review-finding');
    // A failed read's note at the card's top pushes everything down by 46 px.
    const noted = (): number => root.querySelector('.review-read-failed') === null ? 0 : 46;
    const planTop = (): number => 400 + 300 * findings().length + noted();
    const max = (): number => Math.max(0, planTop() + 34 + progressHeight() + 600 - 800);
    let stored = 0;
    const scroller = { width: 600, get scrollTop() { return Math.min(stored, max()); }, set scrollTop(value: number) { stored = Math.max(0, Math.min(value, max())); } };
    const empty = Object.getOwnPropertyDescriptor(MiniElement.prototype, 'getBoundingClientRect')!;
    let pointed: () => MiniElement | null = () => null;
    Object.defineProperty(miniDocument, 'scrollingElement', { configurable: true, value: scroller });
    Object.defineProperty(miniDocument, 'elementFromPoint', { configurable: true, value: () => pointed() });
    Object.assign(window, { innerHeight: 800 });
    Object.defineProperty(MiniElement.prototype, 'getBoundingClientRect', { configurable: true, value(this: MiniElement) {
      const article = this.closest('article.review-finding');
      const list = this.tagName === 'OL' && this.className === 'review-progress';
      const row = this.parentElement?.tagName === 'OL' && this.parentElement.className === 'review-progress';
      const height = list ? progressHeight() : row ? natural() : 34;
      const place = article !== null ? 100 + noted() + 200 * findings().indexOf(article) : list || row ? planTop() + 34 : planTop();
      const top = place - scroller.scrollTop;
      const width = list ? scroller.width : 80;
      return { top, bottom: top + height, left: 0, right: width, width, height };
    } });
    const state: Stub = { full: reading([]), budget: 4 * 1024 * 1024, opened: [] };
    try { await body(mount(state), state, scroller, (find) => { pointed = find; }); } finally {
      Reflect.deleteProperty(miniDocument, 'scrollingElement');
      Reflect.deleteProperty(miniDocument, 'elementFromPoint');
      Object.defineProperty(MiniElement.prototype, 'getBoundingClientRect', empty);
    }
  }

  it('keeps 查看计划 under the resting pointer while findings arrive above it, with the page at its end', async () => {
    await laidOut(async (view, state, scroller, under) => {
      await flush();
      scroller.scrollTop = 1e6;
      expect(scroller.scrollTop).toBe(334);
      under(() => viewPlan(view.root)); rest(viewPlan(view.root));
      const before = viewPlan(view.root).getBoundingClientRect().top;
      state.full = reading(['f-1', 'f-2']);
      view.surface.refresh(); await flush();
      expect(view.root.querySelectorAll('article.review-finding')).toHaveLength(2);
      expect(viewPlan(view.root).getBoundingClientRect().top).toBe(before);
    });
  });

  it('never lets the running progress pull the page down at its end: alone, or with findings arriving above', async () => {
    await laidOut(async (view, state, scroller, under) => {
      await flush();
      scroller.scrollTop = 1e6;
      const before = viewPlan(view.root).getBoundingClientRect().top;
      // The Run's own poll with only its progress moved on: the list is drawn again, shorter, and keeps its height.
      state.full = reading([], 7);
      await poll();
      expect(view.root.querySelector('ol.review-progress li')!.dataset['reviewProgress']).toBe('7/7');
      expect(viewPlan(view.root).getBoundingClientRect().top).toBe(before);
      // Then findings above it while the progress list is drawn anew: 查看计划 stays under the resting pointer.
      under(() => viewPlan(view.root)); rest(viewPlan(view.root));
      state.full = reading(['f-1'], 7);
      view.surface.refresh(); await flush();
      expect(viewPlan(view.root).getBoundingClientRect().top).toBe(before);
    });
  });

  it('lets the last input win: a key or the wheel disarms the pointer\'s place until the pointer moves again', async () => {
    await laidOut(async (view, state, scroller, under) => {
      await flush();
      under(() => viewPlan(view.root)); rest(viewPlan(view.root));
      miniDocument.body.dispatchEvent({ type: 'keydown', key: 'j' });
      state.full = reading(['f-1']);
      view.surface.refresh(); await flush();
      expect(scroller.scrollTop).toBe(0);
      rest(viewPlan(view.root));
      state.full = reading(['f-1', 'f-2']);
      view.surface.refresh(); await flush();
      expect(scroller.scrollTop).toBe(300);
      miniDocument.body.dispatchEvent({ type: 'wheel' });
      state.full = reading(['f-1', 'f-2', 'f-3']);
      view.surface.refresh(); await flush();
      expect(scroller.scrollTop).toBe(300);
      // A still pointer receives pointerover when what lies under it changes: that is no move, and arms nothing.
      miniDocument.body.dispatchEvent({ type: 'keydown', key: 'j' });
      scroller.scrollTop = 900;
      expect(viewPlan(view.root).getBoundingClientRect().top).toBe(400);
      viewPlan(view.root).dispatchEvent(Object.assign({ type: 'pointerover', bubbles: true }, { clientX: 300, clientY: 400 }));
      state.full = reading(['f-1', 'f-2', 'f-3', 'f-4']);
      view.surface.refresh(); await flush();
      expect(scroller.scrollTop).toBe(900);
    });
  });

  it('keeps whatever control lies under the pointer\'s last position at the draw', async () => {
    await laidOut(async (view, state, scroller, under) => {
      await flush();
      state.full = reading(['f-1']);
      view.surface.refresh(); await flush();
      under(() => viewPlan(view.root)); rest(viewPlan(view.root));
      // The pointer has not moved, but the page has: f-1's control is under it now.
      under(() => inFinding(view.root, 'f-1'));
      const before = inFinding(view.root, 'f-1').getBoundingClientRect().top;
      state.full = reading(['f-0', 'f-1']);
      view.surface.refresh(); await flush();
      expect(inFinding(view.root, 'f-1').getBoundingClientRect().top).toBe(before);
      expect(scroller.scrollTop).toBe(200);
    });
  });

  it('scrolls nothing when the pointer left the card, rests on text, or on a control the draw removed, hid or made one of several', async () => {
    await laidOut(async (view, state, scroller, under) => {
      await flush();
      under(() => viewPlan(view.root)); rest(viewPlan(view.root));
      view.root.querySelector('.review-host')!.dispatchEvent({ type: 'pointerleave' });
      state.full = reading(['f-1']);
      view.surface.refresh(); await flush();
      expect(scroller.scrollTop).toBe(0);
      // On f-1's words, not a control.
      under(() => view.root.querySelector('article[data-finding-id="f-1"] blockquote, article[data-finding-id="f-1"] p'));
      rest(view.root.querySelector('article[data-finding-id="f-1"]')!);
      state.full = reading(['f-0', 'f-1']);
      view.surface.refresh(); await flush();
      expect(scroller.scrollTop).toBe(0);
      // On f-1's own control, and the next read no longer has f-1.
      under(() => inFinding(view.root, 'f-1')); rest(inFinding(view.root, 'f-1'));
      state.full = reading(['f-2', 'f-3']);
      view.surface.refresh(); await flush();
      expect(view.root.querySelector('article[data-finding-id="f-1"]')).toBeNull();
      expect(scroller.scrollTop).toBe(0);
      // On f-2's control, and after the draw two controls answer to it.
      under(() => inFinding(view.root, 'f-2')); rest(inFinding(view.root, 'f-2'));
      state.full = reading(['f-1', 'f-2', 'f-2']);
      view.surface.refresh(); await flush();
      expect(scroller.scrollTop).toBe(0);
      // On 查看计划, on screen, which the draw leaves hidden.
      scroller.scrollTop = 900;
      expect(viewPlan(view.root).getBoundingClientRect().top).toBe(400);
      under(() => viewPlan(view.root)); rest(viewPlan(view.root));
      const shown = Object.getOwnPropertyDescriptor(MiniElement.prototype, 'checkVisibility')!;
      Object.defineProperty(MiniElement.prototype, 'checkVisibility', { configurable: true, value(this: MiniElement) { return this.dataset['reviewAction'] !== 'view-plan'; } });
      try {
        state.full = reading(['f-0', 'f-1', 'f-2', 'f-3']);
        view.surface.refresh(); await flush();
        expect(view.root.querySelectorAll('article.review-finding')).toHaveLength(4);
        expect(scroller.scrollTop).toBe(900);
      } finally { Object.defineProperty(MiniElement.prototype, 'checkVisibility', shown); }
      // On a control that is already one of several before the draw.
      miniDocument.body.dispatchEvent({ type: 'wheel' });
      state.full = reading(['f-1', 'f-1']);
      view.surface.refresh(); await flush();
      scroller.scrollTop = 0;
      under(() => inFinding(view.root, 'f-1')); rest(inFinding(view.root, 'f-1'));
      // After the draw f-1's control is the only one, 200 px lower: only its being one of two before the draw keeps the page still.
      state.full = reading(['f-0', 'f-1']);
      view.surface.refresh(); await flush();
      expect(scroller.scrollTop).toBe(0);
    });
  });

  it('still holds the draw while 查看计划 is pressed, then draws it once with the button where the pointer rests', async () => {
    await laidOut(async (view, state, scroller, under) => {
      await flush();
      under(() => viewPlan(view.root)); rest(viewPlan(view.root));
      const pressed = viewPlan(view.root);
      const before = pressed.getBoundingClientRect().top;
      pressed.dispatchEvent(Object.assign({ type: 'pointerdown', bubbles: true }, { button: 0 }));
      state.full = reading(['f-1']);
      view.surface.refresh(); await flush();
      expect(viewPlan(view.root)).toBe(pressed);
      expect(scroller.scrollTop).toBe(0);
      pressed.dispatchEvent(Object.assign({ type: 'pointerup', bubbles: true }, { button: 0 }));
      pressed.click(); await flush();
      expect(state.opened).toEqual([RUN]);
      nextFrame(); await flush();
      expect(view.root.querySelectorAll('article.review-finding')).toHaveLength(1);
      expect(viewPlan(view.root).getBoundingClientRect().top).toBe(before);
      expect(scroller.scrollTop).toBe(300);
    });
  });

  it('keeps 查看计划 in place while the note of a failed read comes and goes at the top of the card', async () => {
    await laidOut(async (view, state, scroller, under) => {
      await flush();
      scroller.scrollTop = 200;
      under(() => viewPlan(view.root)); rest(viewPlan(view.root));
      const before = viewPlan(view.root).getBoundingClientRect().top;
      state.refuse = refusal('SERVICE_UNAVAILABLE', '服务暂时无法回答。');
      view.surface.refresh(); await flush();
      expect(view.root.querySelector('.review-read-failed')).not.toBeNull();
      expect(viewPlan(view.root).getBoundingClientRect().top).toBe(before);
      state.refuse = null;
      view.surface.refresh(); await flush();
      expect(view.root.querySelector('.review-read-failed')).toBeNull();
      expect(viewPlan(view.root).getBoundingClientRect().top).toBe(before);
      expect(scroller.scrollTop).toBe(200);
    });
  });

  it('keeps the progress floor through a whole-card draw that arrives before any progress-only poll, at the page end', async () => {
    await laidOut(async (view, state, scroller, under) => {
      await flush();
      scroller.scrollTop = 1e6;
      under(() => viewPlan(view.root)); rest(viewPlan(view.root));
      const before = viewPlan(view.root).getBoundingClientRect().top;
      state.full = reading(['f-1'], 7);
      view.surface.refresh(); await flush();
      expect(view.root.querySelector('ol.review-progress')!.style['minHeight']).toBe('100px');
      expect(viewPlan(view.root).getBoundingClientRect().top).toBe(before);
    });
  });

  it('starts the progress floor again when the width of the list changes, as when the Task Drawer opens or closes', async () => {
    await laidOut(async (view, state, scroller) => {
      await flush();
      const floor = (): string => view.root.querySelector('ol.review-progress')!.style['minHeight'] ?? '';
      await poll();
      expect(floor()).toBe('100px');
      scroller.width = 400;
      await poll();
      expect(floor()).toBe('130px');
      scroller.width = 600;
      await poll();
      expect(floor()).toBe('100px');
    });
  });
});
