import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewWorkspacePage, reviewWorkspaceWire } from '../../src/service/task-plan.js';
import { mountReviewWorkspace, type MountReviewWorkspaceOptions, type ReviewWorkspaceSurface } from '../../src/renderer/review-workspace.js';
import { technicalDisclosure } from '../../src/renderer/technical-layer.js';
import type { RendererApi, ReviewReportRecord, ReviewWorkspaceProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';
import { DEFAULT_QUICK_ACTIONS } from '../../src/shared/preferences.js';

vi.mock('../../src/renderer/action-defaults.js', () => ({ readActionDefaults: async () => ({ ...DEFAULT_QUICK_ACTIONS }), rememberActionDefaults: async () => undefined }));

// #1592, renderer half: the 审阅 page reads a review workspace the service paged (its report's lists and the local check's
// 未生成批注) to the end, in order and exactly once, and a refused read is said instead of leaving the last workspace as current.
const BOOK = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
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

function report(rows: number, version = 1): ReviewReportRecord {
  return {
    schema: 'ai7.review.report/2', reviewRunId: RUN, version, generatedAt: AT,
    run: { ordinal: 1, label: '第 1 次', createdAt: AT, scopeLabel: '全书', manuscript: { revisionId: 'revision-a', revisionLabel: 'Revision 1', journalSequence: 0 } },
    overview: { title: '概览表', rows: [] },
    mustItems: { title: '必须处理的事项', items: Array.from({ length: rows }, (_, index) => ({ findingId: `must-${index}`, categoryId: 'local-text-check',
      categoryLabel: '本地文字检查', locationLabel: `第 ${index + 1} 段`, quote: filler(index), note: `v${version}`, status: 'pending', statusLabel: '待处理' })) },
    categorySummaries: { title: '各类别摘要', entries: [] },
    appendix: { title: '附录', configuration: { schema: 'ai7.review/1', version: '1', digest: DIGEST }, categories: [] },
    statistics: { title: '章节与类别统计', categories: [{ categoryId: 'local-text-check', label: '本地文字检查' }],
      rows: Array.from({ length: rows }, (_, index) => ({ label: `${filler(index)}章`, counts: [1], total: 1 })), totals: [rows], total: rows },
    findings: { title: '发现详单', omitted: 0, entries: Array.from({ length: rows }, (_, index) => ({ findingIds: [`entry-${index}`], categoryLabels: ['本地文字检查'],
      severityLabel: '必须处理', statusLabel: '待处理', chapterLabel: '第一章', locationLabel: `第 ${index + 1} 段`, quote: filler(index), suggestedText: null, reason: '公开合成理由', sources: [] })) },
  };
}

function workspace(rows: number, version = 1, state: 'partial' | 'running' = 'partial'): ReviewWorkspaceProjection {
  return { bookId: BOOK, manuscript: { ...MANUSCRIPT, totalBlocks: 1 }, configuration: { schema: 'ai7.review/1', version: '1', digest: DIGEST },
    categories: [], coverage: [], scopeOptions: { whole: unavailable, changed: unavailable, selection: unavailable, chapters: { ...unavailable, basis: 'outline', chapters: [] } },
    newReview: unavailable, runsTruncated: false,
    runs: [{ reviewRunId: RUN, ordinal: 1, label: '第 1 次', createdAt: AT, scopeLabel: '全书', categoryLabels: ['本地文字检查'], state, stateLabel: state === 'running' ? '正在审阅' : '部分完成',
      findingCounts: COUNTS, reportVersion: 1, historicalMarker: null }],
    run: { reviewRunId: RUN, ordinal: 1, label: '第 1 次', createdAt: AT, state, stateLabel: state === 'running' ? '正在审阅' : '部分完成', canContinue: false,
      scope: { kind: 'whole', label: '全书', selectedRange: null, selection: null }, manuscript: MANUSCRIPT, configurationDigest: DIGEST, authorization: { authorizedAt: AT },
      categories: [], findings: [], findingsTotal: 0, findingsTruncated: false, findingCounts: COUNTS,
      localCheck: { planDigest: DIGEST, options: { prose: true, numerals: 'off', publication: 'out-of-scope' } as never, state: 'materialized', paragraphs: rows, counts: null,
        excluded: Array.from({ length: rows }, (_, index) => ({ candidateId: `candidate-${index}`, reason: filler(index) })) },
      report: { reportId: 'report-a', version, generatedAt: AT, digest: DIGEST, record: report(rows, version) },
      reportVersions: [{ reportId: 'report-a', version, generatedAt: AT, digest: DIGEST }], historicalMarker: null, influence: [], scopeStop: null, procedure: null, capture: unavailable } };
}

let restoreDom: () => void;
let surfaces: ReviewWorkspaceSurface[];
beforeEach(() => {
  restoreDom = installMiniDom();
  surfaces = [];
  vi.stubGlobal('window', { setTimeout, clearTimeout, getSelection: () => null });
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
function mount(state: { full: ReviewWorkspaceProjection; budget: number; refuse?: Error | null }) {
  const root = new MiniElement('main');
  miniDocument.body.append(root);
  const inspectReviewWorkspace = vi.fn<RendererApi['inspectReviewWorkspace']>().mockImplementation(async () => {
    if (state.refuse) throw state.refuse;
    return reviewWorkspaceWire(structuredClone(state.full), state.budget);
  });
  const getTaskPlanPage = vi.fn<RendererApi['getTaskPlanPage']>().mockImplementation(async (input) => {
    if (input.kind !== 'review-run' || input.ref !== state.full.run?.reviewRunId) throw refusal('TASK_PLAN_PAGE_INVALID', '审阅读取范围无效。');
    try { return reviewWorkspacePage(state.full, input.path, input.afterOrdinal, input.digest); } catch (error) {
      const cause = error as { code?: string; data?: { code?: string }; message: string };
      throw refusal(cause.code ?? cause.data?.code ?? 'UNKNOWN', cause.message);
    }
  });
  const inspectFactualVerification = vi.fn(async () => { throw new Error('no factual lens here'); });
  const unexpected = vi.fn(async () => { throw new Error('unexpected API operation'); });
  const calls = { inspectReviewWorkspace, getTaskPlanPage, inspectFactualVerification };
  const api = new Proxy(calls, { get: (target, key) => Reflect.get(target, key) ?? unexpected }) as unknown as MountReviewWorkspaceOptions['api'];
  const status = vi.fn();
  const surface = mountReviewWorkspace({ root: root as unknown as HTMLElement, bookId: BOOK, bookTitle: '公开合成图书', focus: { reviewRunId: RUN, findingId: null }, api,
    awaitServiceJob: async (initial) => initial,
    technicalDetails: (_className, ...rows) => { const node = new MiniElement('dl'); node.append(...rows as unknown as MiniElement[]); return technicalDisclosure(node as unknown as HTMLElement); },
    setStatus: status, errorMessage: (error, fallback) => (error as { message?: string })?.message || fallback, errorCode: (error) => (error as { code?: string })?.code ?? null,
    openManuscript: async () => undefined, goToText: async () => undefined, openPlan: () => undefined, openSearchSettings: () => undefined, planChanged: () => undefined });
  surfaces.push(surface);
  surface.start();
  return { root, surface, status, unexpected, ...calls };
}

const card = (root: MiniElement): MiniElement => root.querySelector('.review-workspace-card')!;
const paging = (root: MiniElement, path: string): MiniElement | null => root.querySelector(`[data-review-page="${path}"]`);
const listed = (root: MiniElement, path: string, selector: string): string[] =>
  root.querySelector(`[data-review-part-path="${path}"]`)!.querySelectorAll(selector).map((node) => node.textContent);

describe('a paged review workspace on the 审阅 page (#1592)', () => {
  it('says how much of each report list is shown and reads the rest in order, exactly once', async () => {
    const view = mount({ full: workspace(360), budget: 120 * 1024 }); await flush();
    const first = view.inspectReviewWorkspace.mock.results[0]!.value as Promise<ReviewWorkspaceProjection>;
    const meta = (await first).listPages!;
    for (const path of [MUST, STATS, ENTRIES, EXCLUDED]) {
      expect(meta[path]?.nextOrdinal, path).not.toBeNull();
      expect(paging(view.root, path)!.textContent).toContain(`已显示 ${meta[path]!.shown} `);
      expect(paging(view.root, path)!.textContent).toContain(`共 360 `);
    }
    // The totals row is whole while its chapters are read in part, and says so.
    expect(paging(view.root, STATS)!.textContent).toContain('合计计入全部章节');
    expect(listed(view.root, STATS, 'tr').at(-1)).toContain('360');

    for (const path of [MUST, STATS, ENTRIES, EXCLUDED]) {
      for (let guard = 0; paging(view.root, path) !== null; guard += 1) {
        expect(guard).toBeLessThan(40);
        paging(view.root, path)!.querySelector('button')!.click(); await flush();
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

  it('reads the workspace again when a list changed between pages', async () => {
    const state = { full: workspace(360), budget: 120 * 1024 };
    const view = mount(state); await flush();
    expect(view.inspectReviewWorkspace).toHaveBeenCalledTimes(1);
    state.full = workspace(360, 2);
    paging(view.root, MUST)!.querySelector('button')!.click(); await flush();
    expect(view.getTaskPlanPage).toHaveBeenCalledTimes(1);
    expect(view.inspectReviewWorkspace).toHaveBeenCalledTimes(2);
    expect(view.status).toHaveBeenCalledWith('审阅结果已变化，已重新读取。');
    expect(listed(view.root, MUST, 'li').every((text) => text.includes('v2'))).toBe(true);
    // The next page is the changed list's, read from where its own first page ended.
    const shown = listed(view.root, MUST, 'li').length;
    paging(view.root, MUST)!.querySelector('button')!.click(); await flush();
    expect(view.getTaskPlanPage).toHaveBeenLastCalledWith(expect.objectContaining({ path: MUST, afterOrdinal: shown }));
    expect(listed(view.root, MUST, 'li').length).toBeGreaterThan(shown);
    expect(listed(view.root, MUST, 'li').every((text) => text.includes('v2'))).toBe(true);
  });

  it('says a page that failed beside its control and reads it once on the next try', async () => {
    const view = mount({ full: workspace(360), budget: 120 * 1024 }); await flush();
    const shown = listed(view.root, MUST, 'li').length;
    view.getTaskPlanPage.mockRejectedValueOnce(refusal('SERVICE_UNAVAILABLE', '服务暂时无法回答。'));
    paging(view.root, MUST)!.querySelector('button')!.click(); await flush();
    expect(paging(view.root, MUST)!.querySelector('[role="alert"]')!.textContent).toBe('服务暂时无法回答。');
    expect(view.status).toHaveBeenCalledWith('服务暂时无法回答。', 'error');
    expect(paging(view.root, MUST)!.querySelector('button')!.disabled).toBe(false);
    expect(listed(view.root, MUST, 'li')).toHaveLength(shown);
    paging(view.root, MUST)!.querySelector('button')!.click(); await flush();
    const after = listed(view.root, MUST, 'li');
    expect(after.length).toBeGreaterThan(shown);
    expect(new Set(after).size).toBe(after.length);
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
  it('stands as an error and marks the last workspace read as possibly out of date until a read succeeds', async () => {
    const state: { full: ReviewWorkspaceProjection; budget: number; refuse: Error | null } = { full: workspace(3, 1, 'running'), budget: 4 * 1024 * 1024, refuse: null };
    const view = mount(state); await flush();
    expect(card(view.root).dataset['reviewState']).toBe('running');
    state.refuse = refusal('TASK_PLAN_SUMMARY_TOO_LARGE', '审阅摘要超出可读取范围。');
    view.surface.refresh(); await flush();
    expect(view.status).toHaveBeenLastCalledWith('审阅摘要超出可读取范围。', 'error');
    expect(card(view.root).dataset['reviewRead']).toBe('failed');
    const note = card(view.root).querySelector('.review-read-failed')!;
    expect(note.getAttribute('role')).toBe('alert');
    expect(note.textContent).toBe('审阅摘要超出可读取范围。下面是上次读到的审阅，可能已经过时。');
    // Another refusal replaces the note; it never piles up.
    view.surface.refresh(); await flush();
    expect(card(view.root).querySelectorAll('.review-read-failed')).toHaveLength(1);
    state.refuse = null;
    view.surface.refresh(); await flush();
    expect(card(view.root).querySelector('.review-read-failed')).toBeNull();
    expect(card(view.root).dataset['reviewRead']).toBeUndefined();
  });

  it('says a refused first read on the card and at the bottom', async () => {
    const view = mount({ full: workspace(3), budget: 4 * 1024 * 1024, refuse: refusal('TASK_PLAN_SUMMARY_TOO_LARGE', '审阅摘要超出可读取范围。') }); await flush();
    expect(card(view.root).dataset['reviewState']).toBe('unavailable');
    expect(card(view.root).textContent).toContain('审阅摘要超出可读取范围。');
    expect(view.status).toHaveBeenCalledWith('审阅摘要超出可读取范围。', 'error');
  });
});
