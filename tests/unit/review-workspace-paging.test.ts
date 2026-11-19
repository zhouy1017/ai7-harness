import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewWorkspacePage, reviewWorkspaceWire } from '../../src/service/task-plan.js';
import { mountReviewWorkspace, type MountReviewWorkspaceOptions, type ReviewWorkspaceSurface } from '../../src/renderer/review-workspace.js';
import { technicalDisclosure } from '../../src/renderer/technical-layer.js';
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
const nextFrame = (): void => { const due = frames.splice(0); for (const frame of due) frame(); };
beforeEach(() => {
  restoreDom = installMiniDom();
  surfaces = [];
  frames = [];
  vi.stubGlobal('window', { setTimeout, clearTimeout, getSelection: () => null, requestAnimationFrame: (callback: () => void) => { frames.push(callback); return frames.length; } });
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
type Stub = { full: ReviewWorkspaceProjection; budget: number; refuse?: Error | null; gate?: Promise<void> | null };

function mount(state: Stub, status: StatusSetter = Object.assign(vi.fn(), { settle: vi.fn() })) {
  const root = new MiniElement('main');
  miniDocument.body.append(root);
  const inspectReviewWorkspace = vi.fn<RendererApi['inspectReviewWorkspace']>().mockImplementation(async () => {
    if (state.refuse) throw state.refuse;
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
  const calls = { inspectReviewWorkspace, getTaskPlanPage, inspectFactualVerification };
  const api = new Proxy(calls, { get: (target, key) => Reflect.get(target, key) ?? unexpected }) as unknown as MountReviewWorkspaceOptions['api'];
  const surface = mountReviewWorkspace({ root: root as unknown as HTMLElement, bookId: BOOK, bookTitle: '公开合成图书', focus: { reviewRunId: RUN, findingId: null }, api,
    awaitServiceJob: async (initial) => initial,
    technicalDetails: (_className, ...rows) => { const node = new MiniElement('dl'); node.append(...rows as unknown as MiniElement[]); return technicalDisclosure(node as unknown as HTMLElement); },
    setStatus: status, errorMessage: (error, fallback) => (error as { message?: string })?.message || fallback, errorCode: (error) => (error as { code?: string })?.code ?? null,
    openManuscript: async () => undefined, goToText: async () => undefined, openPlan: () => undefined, openSearchSettings: () => undefined, planChanged: () => undefined });
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

describe('a press on the running card while a read arrives (#1592: 查看计划 lost under the pointer)', () => {
  it('keeps the pressed control until its click, then draws the read that arrived meanwhile', async () => {
    const state: Stub = { full: workspace(3, 1, 'running'), budget: 4 * 1024 * 1024 };
    const view = mount(state); await flush();
    const opened: string[] = [];
    view.surface.destroy();
    // The same surface, with a plan opener that records what it opened.
    const root = new MiniElement('main');
    miniDocument.body.append(root);
    const status = Object.assign(vi.fn(), { settle: vi.fn() });
    const surface = mountReviewWorkspace({ root: root as unknown as HTMLElement, bookId: BOOK, bookTitle: '公开合成图书', focus: { reviewRunId: RUN, findingId: null },
      api: new Proxy({ inspectReviewWorkspace: view.inspectReviewWorkspace, getTaskPlanPage: view.getTaskPlanPage, inspectFactualVerification: view.inspectFactualVerification },
        { get: (target, key) => Reflect.get(target, key) ?? view.unexpected }) as unknown as MountReviewWorkspaceOptions['api'],
      awaitServiceJob: async (initial) => initial,
      technicalDetails: (_className, ...rows) => { const node = new MiniElement('dl'); node.append(...rows as unknown as MiniElement[]); return technicalDisclosure(node as unknown as HTMLElement); },
      setStatus: status, errorMessage: (_error, fallback) => fallback, errorCode: () => null, openManuscript: async () => undefined, goToText: async () => undefined,
      openPlan: (reviewRunId) => { opened.push(reviewRunId); }, openSearchSettings: () => undefined, planChanged: () => undefined });
    surfaces.push(surface);
    surface.start(); await flush();
    const pressed = root.querySelector('[data-review-action="view-plan"]')!;
    pressed.dispatchEvent({ type: 'pointerdown', bubbles: true, button: 0 });
    // A poll answers while the button is down: the Run moved on (its label and counts changed), so the card would be drawn again.
    state.full = { ...state.full, run: { ...state.full.run!, stateLabel: '正在审阅 · 已读完一半', findingsTotal: 2 } };
    surface.refresh(); await flush();
    expect(root.querySelector('[data-review-action="view-plan"]')).toBe(pressed);
    expect(root.querySelector('.review-workspace-card')!.textContent).not.toContain('已读完一半');
    pressed.dispatchEvent({ type: 'pointerup', bubbles: true, button: 0 });
    pressed.click(); await flush();
    expect(opened).toEqual([RUN]);
    // The frame after the release draws the held read; the button is a new one and the press acted once.
    expect(root.querySelector('[data-review-action="view-plan"]')).toBe(pressed);
    nextFrame(); await flush();
    expect(root.querySelector('.review-workspace-card')!.textContent).toContain('已读完一半');
    expect(root.querySelector('[data-review-action="view-plan"]')).not.toBe(pressed);
    expect(opened).toEqual([RUN]);
  });

  it('draws a read at once when no press is down', async () => {
    const state: Stub = { full: workspace(3, 1, 'running'), budget: 4 * 1024 * 1024 };
    const view = mount(state); await flush();
    state.full = { ...state.full, run: { ...state.full.run!, stateLabel: '正在审阅 · 已读完一半', findingsTotal: 2 } };
    view.surface.refresh(); await flush();
    expect(card(view.root).textContent).toContain('已读完一半');
    expect(frames).toHaveLength(0);
  });
});
