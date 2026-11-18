import { buildReviewReport } from '../../src/service/review/review-report.js';
import { DEFAULT_QUICK_ACTIONS } from '../../src/shared/preferences.js';
import { technicalDisclosure } from '../../src/renderer/technical-layer.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountReviewWorkspace, type MountReviewWorkspaceOptions, type ReviewWorkspaceSurface } from '../../src/renderer/review-workspace.js';
import { mountEvidenceWorkspace } from '../../src/renderer/evidence-workspace.js';
import { createCommandDispatcher } from '../../src/renderer/commands.js';
import type { EvidenceWorkspaceProjection, FactualVerificationLensProjection, FactualVerificationResultProjection, RendererApi, ReviewFindingProjection, ReviewRunCategoryState, ReviewWorkspaceProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

// #1058 / J04: mount the actual surface/loader/Workspace controls. All browser additions stay local to this test.
const BOOK = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const RESULT = '44444444-4444-4444-8444-444444444441';
const SECOND = '44444444-4444-4444-8444-444444444442';
const NEW = '44444444-4444-4444-8444-444444444443';
const STALE = '44444444-4444-4444-8444-444444444444';
const DESTROYED = '44444444-4444-4444-8444-444444444445';
const AT = '2026-10-24T00:00:00.000Z';
const PIN = { document: 'docs/policies/factual-verification-policy.md', version: '1', digest: 'a'.repeat(64) };
const COUNTS = { must: 1, should: 0, note: 0, pending: 1, handled: 0, ignored: 0 };
const MANUSCRIPT = { manuscriptId: 'manuscript-a', branchId: 'branch-a', revisionId: 'revision-a', revisionLabel: 'Revision 1', journalSequence: 0, workingDigest: 'b'.repeat(64) };
const unavailable = { available: false, unavailableReason: '未开放' };

function result(run = RUN, id = RESULT): FactualVerificationResultProjection {
  const digest = createHash('sha256').update(id).digest('hex');
  return { resultId: id, version: 3, assertionKey: digest, reviewRunId: run, reviewFindingId: `rvf_${digest.slice(0, 24)}`, findingId: `fnd_${digest.slice(0, 24)}`,
    runRecordId: run === RUN ? '55555555-5555-4555-8555-555555555551' : '55555555-5555-4555-8555-555555555552',
    taskIntentId: run === RUN ? '66666666-6666-4666-8666-666666666661' : '66666666-6666-4666-8666-666666666662',
    markId: id, blockId: 'blk_777777777777777777777777', fromGrapheme: 0, toGrapheme: 8,
    quote: '公开合成核查文字', normalizedStatement: '公开合成陈述', heading: null, category: '机构', severity: 'A', plannedLevel: 'standard', level: 'standard',
    levelLabel: '标准核查', disclosure: null, states: { referenceIntegrity: 'verified', claimSupport: '成立', factualVerification: '证据支持' },
    sourceCondition: 'checked', actionNeed: 'review', sourceCounts: { checked: 1, candidates: 0, independent: 1, reused: 0 }, limitations: [],
    policyPin: { document: PIN.document, minimumLevel: null, sha256: PIN.digest }, producer: 'synthetic', recordedAt: AT,
    anchor: { state: 'current', label: null }, decision: null, pendingReview: true, correctionAvailable: false };
}

// The category's stored finding row: the production render path lists the 事实核查 group, and its Lens, only beside it.
function finding(): ReviewFindingProjection {
  return { findingId: result().reviewFindingId!, categoryId: 'factual-review', categoryLabel: '事实核查', ordinal: 1, severity: 'must', severityLabel: '必须处理',
    output: 'annotation', riskPoint: false, status: 'pending', statusLabel: '待处理', statusDetail: '公开合成状态', blockId: 'blk_777777777777777777777777',
    fromGrapheme: 0, toGrapheme: 8, blockPosition: 0, chapterBlockId: null, chapterTitle: null, quote: '公开合成核查文字', note: '公开合成核查问题',
    replacement: null, clauseRefs: [], stateLine: '未外部复核', markId: RESULT, markStatus: 'open', anchorState: 'exact', ignoreReason: null, historicalMarker: null };
}

function workspace(id = RUN, state: ReviewRunCategoryState = 'failed', findingsCount = 1): ReviewWorkspaceProjection {
  return { bookId: BOOK, manuscript: { ...MANUSCRIPT, totalBlocks: 1 }, configuration: { schema: 'ai7.review/1', version: '1', digest: PIN.digest },
    categories: [], coverage: [], scopeOptions: { whole: unavailable, changed: unavailable, selection: unavailable, chapters: { ...unavailable, basis: 'outline', chapters: [] } },
    newReview: unavailable, runsTruncated: false,
    runs: [RUN, OTHER].map((reviewRunId, index) => ({ reviewRunId, ordinal: index + 1, label: `第 ${index + 1} 次`, createdAt: AT, scopeLabel: '全书',
      categoryLabels: ['事实核查'], state: 'partial', stateLabel: '部分完成', findingCounts: COUNTS, reportVersion: null, historicalMarker: null })),
    run: { reviewRunId: id, ordinal: 1, label: '第 1 次', createdAt: AT, state: 'partial', stateLabel: '部分完成', canContinue: false,
      scope: { kind: 'whole', label: '全书', selectedRange: null, selection: null }, manuscript: MANUSCRIPT, configurationDigest: PIN.digest,
      authorization: { authorizedAt: AT }, categories: [{ categoryId: 'factual-review', label: '事实核查', position: 1, output: 'annotation', riskPointsOnly: false,
        batchApply: false, basis: { categoryId: 'typos-and-usage', executor: 'review-category-contract', searchEngine: false, guidelineDocuments: [], procedure: { title: '审阅', version: '1' } }, state, stateLabel: state === 'failed' ? '运行失败' : '已中断', detail: '真实终态缺口说明',
        taskIntentId: null, planEnvelopeDigest: PIN.digest, modeLabel: null, plan: null, progress: null, findingsCount, excludedCount: 0 }],
      findings: findingsCount > 0 ? [finding()] : [], findingsTotal: findingsCount, findingsTruncated: false, findingCounts: COUNTS, report: null, reportVersions: [], historicalMarker: null,
      influence: [], scopeStop: null, procedure: null, capture: unavailable } };
}

function lens(run = RUN, results: FactualVerificationResultProjection[] = [result(run)], nextCursor: number | null = null): FactualVerificationLensProjection {
  return { bookId: BOOK, reviewRunId: run, results, nextCursor, total: results.length, counts: [{ outcome: '证据支持', count: results.length }], chapters: [], run: null,
    policyPin: { document: PIN.document, minimumLevel: null, sha256: PIN.digest }, statement: '公开合成核查结果' };
}

function evidence(entry: FactualVerificationResultProjection): EvidenceWorkspaceProjection {
  return { bookId: BOOK, result: entry, sources: [], nextSourceCursor: null, totalSources: 0, conflicts: [], summary: { label: '非证据', statements: [] },
    history: [{ resultId: entry.resultId, version: entry.version, outcome: entry.states.factualVerification, level: entry.level, recordedAt: AT }], decisions: [],
    decisionCard: { choices: [], recommendation: null, reasonSuggestions: [], drift: null }, matrix: { minPinned: 2, maxPinned: 4 } };
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
  setTechnicalLayerVisible(true);
  for (const surface of surfaces) surface.destroy();
  Reflect.deleteProperty(MiniElement.prototype, 'options');
  Reflect.deleteProperty(MiniElement.prototype, 'prepend');
  Reflect.deleteProperty(MiniElement.prototype, 'replaceWith');
  restoreDom();
  vi.unstubAllGlobals();
});

const flush = async (): Promise<void> => { for (let count = 0; count < 25; count += 1) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

function mount(state: ReviewRunCategoryState = 'failed', findingsCount = 1, procedureId: string | null = null, resume = false,
  read?: (input: Parameters<RendererApi['inspectReviewWorkspace']>[0]) => ReviewWorkspaceProjection,
  registerCommands?: MountReviewWorkspaceOptions['registerCommands']) {
  const root = new MiniElement('main');
  miniDocument.body.append(root);
  const inspectReviewWorkspace = vi.fn<RendererApi['inspectReviewWorkspace']>().mockImplementation(async (input) => read?.(input) ?? workspace(input?.reviewRunId ?? RUN, state, findingsCount));
  const inspectFactualVerification = vi.fn<RendererApi['inspectFactualVerification']>().mockImplementation(async (input) => lens(input.reviewRunId ?? RUN));
  const inspectEvidenceWorkspace = vi.fn<RendererApi['inspectEvidenceWorkspace']>().mockImplementation(async (input) => evidence(result(RUN, input.resultId)));
  const unexpected = vi.fn(async () => { throw new Error('unexpected API operation'); });
  const calls = { inspectReviewWorkspace, inspectFactualVerification, inspectEvidenceWorkspace };
  const api = new Proxy(calls, { get: (target, key) => Reflect.get(target, key) ?? unexpected }) as unknown as MountReviewWorkspaceOptions['api'];
  const status = vi.fn(); const searchSettings = vi.fn(); const goToText = vi.fn(async () => undefined);
  const surface = mountReviewWorkspace({ root: root as unknown as HTMLElement, bookId: BOOK, bookTitle: '公开合成图书', focus: resume ? null : { reviewRunId: RUN, findingId: null }, api, procedureId,
    awaitServiceJob: async (initial) => initial, technicalDetails: (_className, ...rows) => { const node = new MiniElement('dl'); node.append(...rows as unknown as MiniElement[]); return technicalDisclosure(node as unknown as HTMLElement); },
    setStatus: Object.assign(status, { settle: vi.fn() }), errorMessage: (_error, fallback) => fallback, errorCode: () => null, openManuscript: async () => undefined,
    goToText, openPlan: () => undefined, openSearchSettings: searchSettings, planChanged: () => undefined, ...(registerCommands === undefined ? {} : { registerCommands }) });
  surfaces.push(surface);
  surface.start();
  return { root, surface, status, unexpected, api, searchSettings, goToText, ...calls };
}

describe('review triage (#1525)', () => {
  it('restores the selected run and filters after the surface is left and reopened', async () => {
    const first = mount(); await flush();
    first.root.querySelectorAll('[data-review-action="open-run"]')[1]!.click(); await flush();
    first.root.querySelector('[data-review-filter="status"] [data-filter-value="pending"]')!.click(); await flush();
    first.surface.destroy(); first.root.remove();
    const returned = mount('failed', 1, null, true); await flush();
    expect(returned.inspectReviewWorkspace).toHaveBeenCalledWith(expect.objectContaining({ reviewRunId: OTHER, status: 'pending' }));
    expect(returned.root.querySelector('.review-workspace-card')!.dataset['reviewRunId']).toBe(OTHER);
  });

  it('rejects in place, focuses the next pending finding and excludes rejection from batch', async () => {
    const view = mount(); const next = workspace(RUN, 'settled', 3);
    const category = next.run!.categories[0]!;
    category.categoryId = 'typos-and-usage'; category.output = 'change-suggestion'; category.batchApply = true;
    next.run!.findings = [1, 2, 3].map((ordinal) => ({ ...finding(), findingId: `f-${ordinal}`, markId: `m-${ordinal}`,
      ordinal, categoryId: category.categoryId, output: 'change-suggestion', replacement: '公开合成替换' }));
    const reject = vi.fn().mockResolvedValue({ card: { status: 'open', suggestion: null } });
    const batch = vi.fn().mockResolvedValue({ card: null });
    Object.assign(view.api, { recordChangeSuggestionDecision: reject, applyChangeSuggestionBatch: batch });
    view.inspectReviewWorkspace.mockResolvedValue(next); view.surface.refresh(); await flush();
    const untouched = view.root.querySelector('article[data-finding-id="f-2"]');
    const control = view.root.querySelector('[data-review-action="reject"]')!; control.focus();
    view.inspectReviewWorkspace.mockClear();
    const article = view.root.querySelector('article[data-finding-id="f-1"]')!;
    article.dispatchEvent({ type: 'keydown', key: 'r', isComposing: true }); await flush();
    expect(reject).not.toHaveBeenCalled();
    article.dispatchEvent({ type: 'keydown', key: 'r' }); await flush();
    expect(reject).toHaveBeenCalledWith(expect.objectContaining({ markId: 'm-1', disposition: 'rejected' }));
    expect(view.inspectReviewWorkspace).not.toHaveBeenCalled();
    expect(view.root.querySelector('article[data-finding-id="f-2"]')).toBe(untouched);
    expect(miniDocument.activeElement).toBe(untouched);
    // A held decision key must not decide the next card after focus advances (#1523 review).
    untouched!.dispatchEvent(Object.assign({ type: 'keydown', key: 'r' }, { repeat: true }));
    untouched!.dispatchEvent(Object.assign({ type: 'keydown', key: 'Enter' }, { repeat: true }));
    await flush();
    expect(reject).toHaveBeenCalledTimes(1);
    expect(view.goToText).not.toHaveBeenCalled();
    view.root.querySelector('[data-review-action="batch-prepare"]')!.click(); await flush();
    expect(batch).toHaveBeenCalledWith(expect.objectContaining({ markIds: ['m-2', 'm-3'] }));
  });

  it('reverses a three-finding batch once and reports all three undone', async () => {
    const view = mount();
    const next = workspace(RUN, 'settled', 3);
    const category = next.run!.categories[0]!;
    category.categoryId = 'typos-and-usage'; category.output = 'change-suggestion'; category.batchApply = true;
    next.run!.findings = [1, 2, 3].map((ordinal) => ({ ...finding(), findingId: `finding-${ordinal}`, markId: `mark-${ordinal}`,
      ordinal, categoryId: category.categoryId, output: 'change-suggestion', replacement: '公开合成替换' }));
    const reverse = vi.fn().mockResolvedValueOnce({ card: null }).mockRejectedValue(new Error('already undone'));
    Object.assign(view.api, { applyChangeSuggestionBatch: vi.fn().mockResolvedValue({ card: null }),
      reverseAppliedChangeSuggestion: reverse, getManuscriptApplyOutcome: vi.fn().mockResolvedValue({ state: 'not-committed' }) });
    view.inspectReviewWorkspace.mockResolvedValue(next); view.surface.refresh(); await flush();
    view.root.querySelector('[data-review-action="batch-prepare"]')!.click(); await flush();
    view.root.querySelector('[data-review-action="batch-undo"]')!.click(); await flush();
    expect(reverse).toHaveBeenCalledTimes(1);
    expect(view.status).toHaveBeenLastCalledWith('已撤销 3 条。', 'success');
  });
});

describe('terminal factual results through the mounted review workspace (#1058 / J04)', () => {
  it('keeps exactly one flat export entry with report formats on a zero-finding run', async () => {
    const view = mount(); const next = workspace(RUN, 'settled', 0); const run = next.run!;
    run.findingCounts = { must: 0, should: 0, note: 0, pending: 0, handled: 0, ignored: 0 };
    run.report = { reportId: 'report-empty', version: 1, generatedAt: AT, digest: PIN.digest,
      record: buildReviewReport({ reviewRunId: RUN, version: 1, generatedAt: AT,
        run: { ordinal: 1, label: run.label, createdAt: AT, scopeLabel: '全书', manuscript: { revisionId: MANUSCRIPT.revisionId, revisionLabel: MANUSCRIPT.revisionLabel, journalSequence: 0 } },
        configuration: next.configuration, categories: [], findings: [] }) };
    view.inspectReviewWorkspace.mockResolvedValue(next); view.surface.refresh(); await flush();
    expect(view.root.querySelectorAll('[data-review-action="export"]')).toHaveLength(1);
    expect(view.root.querySelectorAll('[data-export-format-action]')).toHaveLength(3);
    expect(view.root.querySelectorAll('.review-header-export .export-menu')).toHaveLength(0);
  });

  it('shows the disabled export reason and empty/filter messages outside hidden headings', async () => {
    const view = mount(); const next = workspace(RUN, 'settled', 0);
    view.inspectReviewWorkspace.mockResolvedValue(next); view.surface.refresh(); await flush();
    expect(view.root.querySelectorAll('[data-review-action="export"]')).toHaveLength(1);
    expect(view.root.querySelector('[data-review-action="export-version"]')!.textContent).toContain('先生成报告，再导出');
    view.root.querySelector('[data-review-filter="severity"] [data-filter-value="must"]')!.click(); await flush();
    const message = view.root.querySelector('.review-no-findings')!;
    expect(message.textContent).toContain('没有符合筛选');
    expect(message.closest('.visually-hidden')).toBeNull();
    expect(message.closest('.review-filters')).not.toBeNull();
    expect(view.root.querySelector('.review-run-leading')).not.toBeNull();
  });

  it('does not draw empty categories before the populated category', async () => {
    const view = mount(); const next = workspace(); const category = next.run!.categories[0]!;
    next.run!.categories = [{ ...category, categoryId: 'empty', findingsCount: 0 }, category];
    view.inspectReviewWorkspace.mockResolvedValue(next); view.surface.refresh(); await flush();
    expect(view.root.querySelector('section.review-group[data-review-category="empty"]')).toBeNull();
    expect(view.root.querySelectorAll('section.review-group')).toHaveLength(1);
  });

  it.each(['ignore', 'convert'])('returns %s cancellation focus to the named visible more summary', async (kind) => {
    const view = mount(); view.inspectReviewWorkspace.mockResolvedValue(workspace());
    Object.assign(view.api, { getEditorialMarkCard: vi.fn(async () => ({ pinnedText: '公开文字', body: '备注' })) });
    view.surface.refresh(); await flush();
    view.root.querySelector(`[data-review-action="${kind === 'ignore' ? 'ignore' : 'convert-to-suggestion'}"]`)!.click(); await flush();
    view.root.querySelector(`[data-review-action="${kind}-cancel"]`)!.click(); await flush();
    const summary = view.root.querySelector('.review-card-more summary')!;
    expect(miniDocument.activeElement).toBe(summary);
    expect(summary.getAttribute('aria-label')).toBe('更多发现操作');
    expect(summary.closest('details')!.open).toBe(false);
    expect(view.root.querySelector('[data-review-action="ignore-now"]')!.closest('.review-card-more')).toBeNull();
  });

  it('keeps the reopened sheet choices when the previous native close event arrives asynchronously', async () => {
    const view = mount(); const next = workspace(); const available = { available: true, unavailableReason: null };
    next.newReview = available; next.scopeOptions.whole = available;
    next.categories = ['typos-and-usage', 'style-and-format', 'plot-consistency'].map((categoryId) => ({
      categoryId, label: categoryId, description: '提供审阅发现。', output: 'annotation', riskPointsOnly: false,
      batchApply: false, searchEngine: false, modelFree: false, available: true, unavailableReason: null,
      basis: { categoryId, executor: 'review-category-contract', searchEngine: false, guidelineDocuments: [], procedure: { title: '审阅工序', version: '1' } },
      guidelineDocuments: [], procedure: { title: '审阅工序', version: '1' }, scopes: { whole: available, chapters: available, changed: unavailable, selection: available },
    }));
    view.inspectReviewWorkspace.mockResolvedValue(next); view.surface.refresh(); await flush();
    view.root.querySelector('[data-review-action="new-review"]')!.click(); await flush();
    const sheet = view.root.querySelector('dialog')!;
    // HTMLDialogElement.close clears open synchronously and queues its close event as a task.
    sheet.close = () => { sheet.open = false; setTimeout(() => sheet.dispatchEvent({ type: 'close' }), 0); };
    sheet.close(); view.root.querySelector('[data-review-action="new-review"]')!.click(); await flush();
    await new Promise((resolve) => setTimeout(resolve, 0)); await flush();
    expect(sheet.open).toBe(true);
    expect(sheet.querySelectorAll('input').filter((input) => input.name === 'review-category')).toHaveLength(4);
    expect(sheet.querySelector('[data-review-action="prepare"]')!.disabled).toBe(false);
  });
  it('retains custom local procedure identity beside the selected local check on its sheet', async () => {
    const procedureId = 'ai7-procedure/local-custom';
    const view = mount('failed', 1, `${procedureId}@1`);
    const next = workspace(); const available = { available: true, unavailableReason: null };
    next.newReview = available; next.scopeOptions.whole = available;
    view.api.procedureLibrary = vi.fn().mockResolvedValue({ procedures: [{ procedureId, executorKind: 'local-text-check',
      versions: [{ procedureId, version: 1, digest: 'a'.repeat(64) }], documents: [{ version: 1, title: '自用离线工序' }] }] });
    view.inspectReviewWorkspace.mockResolvedValue(next); view.surface.refresh(); await flush();
    const sheet = view.root.querySelector('dialog')!;
    expect(sheet.open).toBe(true);
    expect(sheet.querySelectorAll('input').find((input) => input.value === 'local-text-check')?.checked).toBe(true);
    expect(sheet.querySelector('[data-review-action="prepare"]')!.disabled).toBe(false);
    expect(sheet.querySelector(`[data-procedure-definition="${procedureId}@1"]`)).not.toBeNull();
  });
  it.each([true, false])('shows truthful native search availability in the new-review dialog (admitted: %s)', async (admitted) => {
    setTechnicalLayerVisible(false);
    const view = mount();
    const next = workspace();
    const available = { available: true, unavailableReason: null };
    next.newReview = available; next.scopeOptions.whole = available;
    const reason = '当前模型渠道的原生搜索为候选接口 · 未实测；请前往 设置 › 联网检索 的后端列表，保存一个可用后端的密钥。';
    next.categories = [{ categoryId: 'factual-review', label: '事实核查', description: '核对公开来源', output: 'annotation', riskPointsOnly: false,
      batchApply: false, searchEngine: true, modelFree: false, materialReferencesAllowed: false,
      basis: { categoryId: 'factual-review', executor: 'factual-review-kind', searchEngine: true, guidelineDocuments: [], procedure: { title: '事实核查', version: '1' },
        ...(admitted ? { modelChannelSearchLabel: 'DeepSeek 开放平台（官方）' } : {}) },
      guidelineDocuments: [], procedure: { title: '事实核查', version: '1' }, available: admitted, unavailableReason: admitted ? null : reason, networkUnavailable: !admitted,
      scopes: { whole: available, chapters: available, changed: unavailable, selection: available } }];
    view.inspectReviewWorkspace.mockResolvedValue(next); view.surface.refresh(); await flush();
    Object.assign(view.root.querySelector('dialog')!, { showModal: vi.fn(), close: vi.fn() });
    view.root.querySelector('[data-review-action="new-review"]')!.click(); await flush();
    const option = view.root.querySelector('[data-review-category-option="factual-review"]')!;
    expect(option.querySelector('.review-category-basis')!.textContent).toBe('事实核查');
    expect(view.root.querySelector('.review-network-notice')!.hidden).toBe(true);
    if (!admitted) expect(option.querySelector('.review-category-reason')!.textContent).toBe('此类别需要联网检索。');
    const box = option.querySelector('input')!; box.checked = true; box.dispatchEvent({ type: 'change' });
    expect(view.root.querySelector('.review-network-notice')!.hidden).toBe(admitted);
    const settings = view.root.querySelector('[data-review-action="open-search-settings"]')!;
    expect(settings.hidden).toBe(false); settings.click(); expect(view.searchSettings).toHaveBeenCalledOnce();
    if (!admitted) {
      expect(view.root.querySelector('.review-network-notice')!.textContent).toBe('联网检索尚未就绪，请到设置中配置后再开始。');
      expect(view.root.querySelector('[data-review-action="start"]')!.disabled).toBe(true);
    }

  });

  it('shows each factual finding once with its Lens states and ordinary review actions (#1287)', async () => {
    const view = mount('settled'); await flush();
    expect(view.root.textContent).toContain('证据支持');
    expect(view.root.textContent).not.toContain('未外部复核');
    expect(view.root.querySelectorAll('.review-finding-quote').length).toBe(1);
    expect(view.root.querySelectorAll('.fact-lens-row .review-finding').length).toBe(1);
    expect(view.root.querySelectorAll('.fact-lens-row [data-review-action="mark-handled"]').length).toBe(1);
    view.root.querySelector('[data-fact-action="fact-workspace"]')!.click(); await flush();
    expect(view.root.querySelectorAll('.review-finding-quote')).toHaveLength(1);
    expect(view.root.querySelectorAll('.evidence-workspace')).toHaveLength(1);
  });

  it('keeps findings actionable when a partial run produced no evidence result', async () => {
    const view = mount('failed');
    view.inspectFactualVerification.mockResolvedValue(lens(RUN, [])); await flush();
    expect(view.root.querySelectorAll('.fact-lens-row').length).toBe(0);
    expect(view.root.textContent).toContain('未外部复核');
    expect(view.root.querySelectorAll('.review-finding-quote').length).toBe(1);
    expect(view.root.querySelectorAll('[data-review-action="mark-handled"]').length).toBe(1);
  });

  it.each(['failed', 'interrupted', 'settled'] as const)('reads actual %s result IDs and opens their exact Evidence Workspace', async (state) => {
    const view = mount(state);
    await flush();
    expect(view.inspectFactualVerification).toHaveBeenCalledWith(expect.objectContaining({ bookId: BOOK, reviewRunId: RUN }));
    const row = view.root.querySelector(`[data-fact-result-id="${RESULT}"]`)!;
    expect(row).not.toBeNull();
    expect(row.dataset['version']).toBe('3');
    if (state !== 'settled') expect(view.root.textContent.includes('真实终态缺口说明')).toBe(true);
    expect(view.root.querySelector('[data-review-action="continue"]')).toBeNull();
    row.querySelector('[data-fact-action="fact-workspace"]')!.click();
    await flush();
    expect(view.inspectEvidenceWorkspace).toHaveBeenCalledWith({ bookId: BOOK, resultId: RESULT, sourcesAfter: null });
    expect(view.root.querySelector('.evidence-workspace')?.dataset['resultId']).toBe(RESULT);
    expect(view.root.querySelector('.evidence-workspace')?.dataset['version']).toBe('3');
    expect(view.unexpected).not.toHaveBeenCalled();
  });

  it('pages actual results, resets paging after a filter and keeps zero-match filter controls', async () => {
    const view = mount();
    view.inspectFactualVerification.mockImplementation(async (input) => input.outcome !== null ? lens(RUN, [])
      : input.after === null ? lens(RUN, [result()], 1) : lens(RUN, [result(RUN, SECOND)]));
    await flush();
    view.root.querySelector('[data-fact-action="fact-more"]')!.click();
    await flush();
    expect(view.root.querySelectorAll('[data-fact-result-id]').map((row) => row.dataset['factResultId'])).toEqual([RESULT, SECOND]);
    const filter = view.root.querySelector('[data-fact-filter="outcome"]')!;
    filter.querySelector('[data-filter-value="待核查"]')!.click();
    await flush();
    expect(view.root.querySelectorAll('[data-fact-result-id]')).toHaveLength(0);
    const clear = view.root.querySelector('[data-fact-filter="outcome"]')!;
    expect(clear).not.toBeNull();
    clear.querySelector('[data-filter-value=""]')!.click();
    await flush();
    expect(view.root.querySelectorAll('[data-fact-result-id]')).toHaveLength(1);
    expect(view.inspectFactualVerification.mock.calls.at(-1)?.[0].after).toBeNull();
  });

  it('destroys open identity on Run switch, empty read and rejection, then reopens a fresh Workspace', async () => {
    const view = mount(); await flush();
    view.root.querySelector('[data-fact-action="fact-workspace"]')!.click(); await flush();
    const original = view.root.querySelector('.evidence-workspace');
    view.inspectFactualVerification.mockResolvedValueOnce(lens(RUN, [])); view.surface.refresh(); await flush();
    expect(original?.isConnected).toBe(false);
    expect(view.root.querySelector('.evidence-workspace')).toBeNull();
    view.surface.refresh(); await flush();
    const filter = view.root.querySelector('[data-fact-filter="outcome"]')!;
    filter.querySelector('[data-filter-value="待核查"]')!.click(); await flush();
    view.root.querySelectorAll('[data-review-action="open-run"]')[1]!.click(); await flush();
    expect(view.root.querySelector('.evidence-workspace')).toBeNull();
    expect(view.inspectFactualVerification.mock.calls.at(-1)?.[0]).toMatchObject({ reviewRunId: OTHER, after: null, outcome: null });
    view.inspectFactualVerification.mockResolvedValue(lens(OTHER, [])); view.surface.refresh(); await flush();
    expect(view.root.querySelectorAll('[data-fact-result-id]')).toHaveLength(0);
    view.inspectFactualVerification.mockRejectedValue(new Error('synthetic read failure')); view.surface.refresh(); await flush();
    expect(view.root.querySelector('[data-fact-filter]')).toBeNull();
    view.inspectFactualVerification.mockResolvedValue(lens(OTHER)); view.surface.refresh(); await flush();
    view.root.querySelector('[data-fact-action="fact-workspace"]')!.click(); await flush();
    expect(view.root.querySelector('.evidence-workspace')).not.toBe(original);
    expect(view.unexpected).not.toHaveBeenCalled();
  });

  it('withdraws the previous Run\'s Lens rows and Workspace while the next Run\'s workspace read is pending or rejected', async () => {
    const view = mount(); await flush();
    view.root.querySelector('[data-fact-action="fact-workspace"]')!.click(); await flush();
    const original = view.root.querySelector('.evidence-workspace')!;
    expect(original.dataset['resultId']).toBe(RESULT);
    const stale = '.fact-lens, [data-fact-result-id], [data-fact-action], [data-fact-filter], .evidence-workspace';
    const pending = deferred<ReviewWorkspaceProjection>();
    view.inspectReviewWorkspace.mockReturnValueOnce(pending.promise);
    view.root.querySelectorAll('[data-review-action="open-run"]')[1]!.click(); await flush();
    expect(original.isConnected).toBe(false);
    expect(view.root.querySelectorAll(stale).map((node) => node.className)).toEqual([]);
    view.inspectReviewWorkspace.mockRejectedValueOnce(new Error('synthetic workspace read failure'));
    view.surface.refresh(); await flush();
    pending.resolve(workspace(OTHER)); await flush();
    expect(view.status).toHaveBeenLastCalledWith(expect.any(String), 'error');
    expect(view.root.querySelectorAll(stale).map((node) => node.className)).toEqual([]);
    expect(view.inspectFactualVerification.mock.calls.every(([input]) => input.reviewRunId === RUN)).toBe(true);
    view.inspectFactualVerification.mockImplementation(async (input) => lens(input.reviewRunId ?? RUN, [result(input.reviewRunId ?? RUN, SECOND)]));
    view.surface.refresh(); await flush();
    expect(view.root.querySelectorAll('[data-fact-result-id]').map((row) => row.dataset['factResultId'])).toEqual([SECOND]);
    expect(view.inspectFactualVerification.mock.calls.at(-1)?.[0]).toMatchObject({ reviewRunId: OTHER, after: null });
    expect(view.unexpected).not.toHaveBeenCalled();
  });

  it('drops superseded Lens responses and responses after destroy/reopen', async () => {
    const view = mount(); await flush();
    const late = deferred<FactualVerificationLensProjection>();
    view.inspectFactualVerification.mockReturnValueOnce(late.promise);
    view.surface.refresh(); await flush();
    view.inspectFactualVerification.mockResolvedValue(lens(RUN, [result(RUN, NEW)]));
    view.surface.refresh(); await flush();
    late.resolve(lens(RUN, [result(RUN, STALE)])); await flush();
    expect(view.root.querySelectorAll('[data-fact-result-id]').map((row) => row.dataset['factResultId'])).toEqual([NEW]);
    view.root.querySelector('[data-fact-action="fact-workspace"]')!.click(); await flush();
    const open = view.root.querySelector('.evidence-workspace')!;
    const destroyed = deferred<FactualVerificationLensProjection>();
    view.inspectFactualVerification.mockReturnValueOnce(destroyed.promise); view.surface.refresh(); await flush();
    view.surface.destroy(); view.root.remove();
    expect(open.isConnected).toBe(false);
    const next = mount('interrupted'); await flush();
    destroyed.resolve(lens(RUN, [result(RUN, DESTROYED)])); await flush();
    expect(next.root.querySelectorAll('[data-fact-result-id]').map((row) => row.dataset['factResultId'])).toEqual([RESULT]);
  });

  it.each(['prepared', 'waiting', 'running', 'refused'] as const)('never admits %s from a positive category count', async (state) => {
    const view = mount(state); await flush();
    expect(view.inspectFactualVerification).not.toHaveBeenCalled();
    expect(view.root.querySelectorAll('[data-fact-result-id]')).toHaveLength(0);
  });

  it('does not fabricate from a zero count, wrong Run member or foreign Book response', async () => {
    const view = mount('failed', 0); await flush();
    expect(view.inspectFactualVerification).not.toHaveBeenCalled();
    view.inspectReviewWorkspace.mockResolvedValue(workspace());
    view.inspectFactualVerification.mockResolvedValue(lens(RUN, [result(OTHER)])); view.surface.refresh(); await flush();
    expect(view.root.querySelectorAll('[data-fact-result-id]')).toHaveLength(0);
    view.inspectFactualVerification.mockResolvedValue({ ...lens(), bookId: 'foreign-book' }); view.surface.refresh(); await flush();
    expect(view.root.querySelectorAll('[data-fact-result-id]')).toHaveLength(0);
  });
});

async function selectionSheet(composite = false) {
  setTechnicalLayerVisible(false);
  const procedureId = 'ai7-procedure/selection-memory';
  const view = mount('failed', 1, composite ? `${procedureId}@1` : null); const next = workspace(); const available = { available: true, unavailableReason: null };
  if (composite) view.api.procedureLibrary = vi.fn().mockResolvedValue({ procedures: [{ procedureId, executorKind: 'review',
    versions: [{ procedureId, version: 1, digest: 'a'.repeat(64) }], documents: [{ version: 1, title: '固定顺序工序',
      members: [{ categoryId: 'style-and-format' }, { categoryId: 'typos-and-usage' }] }] }] });
  next.newReview = available; next.scopeOptions.whole = available; next.scopeOptions.changed = available;
  next.scopeUnitCounts = { whole: 2, units: [{ startPosition: 0, endPosition: 0 }, { startPosition: 1, endPosition: 1 }] };
  next.scopeOptions.chapters = { ...available, basis: 'outline', chapters: [0, 1].map((position) => ({ blockId: `chapter-${position}`, title: `章${position}`, position, endPosition: position, level: 1 })) };
  next.categories = ['typos-and-usage', 'style-and-format'].map((categoryId) => ({ categoryId, label: categoryId, description: '审阅。', output: 'annotation', riskPointsOnly: false,
    batchApply: false, searchEngine: false, modelFree: false, changedUnits: 1, available: true, unavailableReason: null,
    basis: { categoryId, executor: 'review-category-contract', searchEngine: false, guidelineDocuments: [], procedure: { title: '审阅', version: '1' } },
    guidelineDocuments: [], procedure: { title: '审阅', version: '1' }, scopes: { whole: available, chapters: available, changed: categoryId === 'style-and-format' ? unavailable : available, selection: unavailable } }));
  const prepare = vi.fn(async () => { throw new Error('synthetic preparation refusal retains the sheet'); });
  Object.assign(view.api, { launchReviewRun: prepare });
  view.inspectReviewWorkspace.mockResolvedValue(next); view.surface.refresh(); await flush();
  view.root.querySelector('[data-review-action="new-review"]')!.click(); await flush();
  const box = (id: string) => view.root.querySelector(`[data-review-category-option="${id}"] input`)!;
  const change = (node: MiniElement, value: string | boolean) => { if (typeof value === 'boolean') node.checked = value; else node.value = value; node.dispatchEvent({ type: 'change', bubbles: true }); };
  if (!composite) change(box('style-and-format'), true);
  return { ...view, prepare, box, change, scope: (kind: string) => change(view.root.querySelector(`[data-review-scope-option="${kind}"] input`)!, true) };
}

describe('configuration selection memory (#1374)', () => {
  afterEach(() => setTechnicalLayerVisible(true));
  it('blocks an unavailable fixed member and restores the full definition order when its scope becomes available', async () => {
    const view = await selectionSheet(true);
    expect(view.root.querySelector('[data-procedure-definition="ai7-procedure/selection-memory@1"]')).not.toBeNull();
    view.scope('changed');
    expect(view.box('style-and-format').checked).toBe(true);
    expect(view.box('style-and-format').disabled).toBe(true);
    for (const action of ['prepare', 'start']) expect(view.root.querySelector(`[data-review-action="${action}"]`)!.disabled).toBe(true);
    expect(view.root.querySelector('.review-sheet-problem')!.textContent).toContain('未开放');
    view.root.querySelector('[data-review-action="start"]')!.click(); await flush(); expect(view.prepare).not.toHaveBeenCalled();
    view.scope('whole');
    expect(view.root.querySelector('.review-sheet-problem')!.hidden).toBe(true);
    expect(view.box('style-and-format').checked).toBe(true);
    expect(view.box('typos-and-usage').checked).toBe(true);
    view.root.querySelector('[data-review-action="start"]')!.click(); await flush();
    expect(view.prepare).toHaveBeenLastCalledWith(expect.objectContaining({ categoryIds: ['style-and-format', 'typos-and-usage'],
      procedureDefinition: { procedureId: 'ai7-procedure/selection-memory', version: 1, digest: 'a'.repeat(64) } }));
  });
  it('keeps scope-disabled categories while estimating and submitting only the effective set in ordinary mode', async () => {
    const view = await selectionSheet();
    const cost = () => view.root.querySelector('[data-consequence="cost"]')!.textContent;
    const wholeCost = cost(); view.scope('changed');
    expect(view.box('style-and-format').checked).toBe(false); expect(view.box('style-and-format').disabled).toBe(true);
    expect(cost()).not.toBe(wholeCost);
    view.root.querySelector('[data-review-action="start"]')!.click(); await flush();
    expect(view.prepare).toHaveBeenLastCalledWith(expect.objectContaining({ categoryIds: ['typos-and-usage'] }));
    view.scope('whole'); expect(view.box('style-and-format').checked).toBe(true); expect(cost()).toBe(wholeCost);
    view.scope('chapters'); view.change(view.root.querySelector('[data-review-chapter="from"]')!, 'chapter-1');
    view.scope('whole'); view.scope('chapters'); expect(view.root.querySelector('[data-review-chapter="from"]')!.value).toBe('chapter-1');
    view.scope('whole'); view.root.querySelector('[data-review-action="start"]')!.click(); await flush();
    expect(view.prepare).toHaveBeenLastCalledWith(expect.objectContaining({ categoryIds: ['typos-and-usage', 'style-and-format'] }));
    view.change(view.box('typos-and-usage'), false); view.scope('changed');
    expect(view.root.querySelector('[data-review-action="prepare"]')!.disabled).toBe(true);
    expect(view.root.querySelector('[data-review-action="start"]')!.disabled).toBe(true);
    expect(cost()).toBe('选好类别后显示'); view.scope('whole'); expect(view.box('style-and-format').checked).toBe(true);
  });
  it('suspends model categories during local checking and takes a chosen numeral basis as its confirmation (Issue #1410 item 16)', async () => {
    const view = await selectionSheet(); view.change(view.box('local-text-check'), true);
    expect(view.box('typos-and-usage').disabled).toBe(true); expect(view.box('typos-and-usage').checked).toBe(false);
    expect(view.root.querySelector('[data-local-check-confirmation]')).toBeNull();
    view.change(view.root.querySelector('[data-local-check-numerals]')!, 'editor-convention');
    expect(view.root.querySelector('[data-local-check-numerals-note]')!.hidden).toBe(false);
    expect(view.root.querySelector('[data-review-action="prepare"]')!.disabled).toBe(false);
    view.change(view.root.querySelector('[data-local-check-numerals]')!, 'off');
    expect(view.root.querySelector('[data-local-check-numerals-note]')!.hidden).toBe(true);
    view.root.querySelector('[data-review-action="start"]')!.click(); await flush();
    expect(view.prepare).toHaveBeenLastCalledWith(expect.objectContaining({ categoryIds: ['local-text-check'], localCheck: expect.objectContaining({ numeralsConfirmed: false }) }));
    view.change(view.root.querySelector('[data-local-check-numerals]')!, 'editor-convention');
    view.root.querySelector('[data-review-action="start"]')!.click(); await flush();
    expect(view.prepare).toHaveBeenLastCalledWith(expect.objectContaining({ localCheck: expect.objectContaining({ numeralsConfirmed: true, numeralRules: ['N01', 'N02'] }) }));
    view.change(view.box('local-text-check'), false);
    expect(view.box('typos-and-usage').checked).toBe(true); expect(view.box('style-and-format').checked).toBe(true);
  });
  it.each([true, false])('preserves house-wordlist wanted=%s after saving and submits its latest version', async (wanted) => {
    const view = await selectionSheet(); let ordinal = 1;
    const page = () => { const pin = { listId: BOOK, versionId: ordinal === 1 ? RUN : OTHER, digest: 'a'.repeat(64) }; return { current: pin,
      selected: { pin, ordinal, entryCount: 1, enabledCount: 1 }, entries: [{ entryId: RESULT, literal: '公开合成词条', note: '', enabled: true }], nextEntryOffset: null, history: [], nextHistoryOffset: null }; };
    const saveHouse = vi.fn(async () => { ordinal++; return { pin: page().current, ordinal, created: true }; });
    Object.assign(view.api, { inspectHouseWordList: vi.fn(async () => page()), saveHouseWordList: saveHouse });
    view.change(view.box('local-text-check'), true); await flush();
    let house = view.root.querySelector('[data-local-house-word-list]')!;
    house.checked = wanted; (house as unknown as { onchange(): void }).onchange();
    const details = house.closest('fieldset')!.querySelector('details')!; details.open = true; details.dispatchEvent({ type: 'toggle' }); await flush();
    view.root.querySelector('[data-house-action="edit"]')!.click(); await flush();
    view.root.querySelector('[data-house-action="save"]')!.click(); await flush();
    expect(saveHouse).toHaveBeenCalledOnce(); house = view.root.querySelector('[data-local-house-word-list]')!;
    expect(house.checked).toBe(wanted);
    view.root.querySelector('[data-review-action="start"]')!.click(); await flush();
    expect(view.prepare).toHaveBeenLastCalledWith(expect.objectContaining({ localCheck: expect.objectContaining({ tables: expect.objectContaining({ houseWordList: wanted ? page().current : null }) }) }));
  });
  it('blocks a wanted wordlist while the post-save current-version read is pending', async () => {
    const view = await selectionSheet(); let ordinal = 1; let saving = false;
    const page = () => { const pin = { listId: BOOK, versionId: ordinal === 1 ? RUN : OTHER, digest: 'a'.repeat(64) }; return { current: pin,
      selected: { pin, ordinal, entryCount: 1, enabledCount: 1 }, entries: [{ entryId: RESULT, literal: '公开合成词条', note: '', enabled: true }], nextEntryOffset: null, history: [], nextHistoryOffset: null }; };
    const refreshed = deferred<ReturnType<typeof page>>();
    Object.assign(view.api, { inspectHouseWordList: vi.fn(async (input: { versionId: string | null }) => saving && input.versionId === null ? refreshed.promise : page()),
      saveHouseWordList: vi.fn(async () => { ordinal++; saving = true; return { pin: page().current, ordinal, created: true }; }) });
    view.change(view.box('local-text-check'), true); await flush();
    const house = view.root.querySelector('[data-local-house-word-list]')!;
    house.checked = true; (house as unknown as { onchange(): void }).onchange();
    const details = house.closest('fieldset')!.querySelector('details')!; details.open = true; details.dispatchEvent({ type: 'toggle' }); await flush();
    view.root.querySelector('[data-house-action="edit"]')!.click(); await flush();
    view.root.querySelector('[data-house-action="save"]')!.click(); await flush();
    for (const action of ['prepare', 'start']) expect(view.root.querySelector(`[data-review-action="${action}"]`)!.disabled).toBe(true);
    expect(view.root.querySelector('.review-sheet-problem')!.textContent).toContain('本社词表');
    view.root.querySelector('[data-review-action="start"]')!.click(); expect(view.prepare).not.toHaveBeenCalled();
    refreshed.resolve(page()); await flush(); expect(house.checked).toBe(true);
    expect(view.root.querySelector('[data-review-action="prepare"]')!.disabled).toBe(false);
    view.root.querySelector('[data-review-action="start"]')!.click(); await flush();
    expect(view.prepare).toHaveBeenLastCalledWith(expect.objectContaining({ localCheck: expect.objectContaining({ tables: expect.objectContaining({ houseWordList: page().current }) }) }));
  });
  it('keeps excluded sources through dispositions and excludes them only from request-evidence submissions', async () => {
    const page = evidence(result()); Object.assign(page, { claimRecheckAvailable: true });
    page.decisionCard.choices = ['request-evidence', 'keep-pending'].map((disposition) => ({ disposition, label: disposition })) as typeof page.decisionCard.choices;
    page.sources = [{ cardId: RESULT, sourceRef: 'https://example.org/public', sourceKind: 'web', title: '公开合成来源', excluded: false, excerpt: null, checkState: 'candidate', relation: 'supports', limitations: [] }] as unknown as typeof page.sources;
    const record = vi.fn<RendererApi['recordVerificationReviewDecision']>(async () => { throw new Error('synthetic refusal retains form'); });
    const surface = mountEvidenceWorkspace({ bookId: BOOK, resultId: RESULT, api: { inspectEvidenceWorkspace: async () => page, recordVerificationReviewDecision: record } as unknown as Parameters<typeof mountEvidenceWorkspace>[0]['api'],
      setStatus: vi.fn(), errorMessage: (_e, fallback) => fallback, instant: (s) => s, openSource: vi.fn(), goToText: async () => undefined, changed: vi.fn() });
    const root = surface.element as unknown as MiniElement; miniDocument.body.append(root); setTechnicalLayerVisible(false); await surface.load();
    const exclude = () => root.querySelector('.evidence-card-actions input')!;
    exclude().checked = true; exclude().dispatchEvent({ type: 'change' });
    root.querySelector('[data-decision-choice="keep-pending"]')!.dispatchEvent({ type: 'change' });
    expect(exclude().checked).toBe(true); expect(exclude().disabled).toBe(true);
    root.querySelector('[data-evidence-action="record-decision"]')!.click(); await flush();
    expect(record.mock.calls[0]![0]).not.toHaveProperty('excludedSourceRefs');
    root.querySelector('[data-decision-choice="request-evidence"]')!.dispatchEvent({ type: 'change' });
    expect(exclude().checked).toBe(true); expect(exclude().disabled).toBe(false);
    root.querySelector('[data-evidence-action="record-decision"]')!.click(); await flush();
    expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ excludedSourceRefs: ['https://example.org/public'] })); surface.destroy();
  });
});

it('scans the review results and evidence in ordinary mode (#1315)', async () => {
  setTechnicalLayerVisible(false);
  try { const view = mount('settled'); await flush(); expectNoTechnicalText(view.root); }
  finally { setTechnicalLayerVisible(true); }
});

// The real Evidence Workspace, watched so that a test can follow the jump it is given.
vi.mock('../../src/renderer/evidence-workspace.js', async (original) => {
  const actual = await original<typeof import('../../src/renderer/evidence-workspace.js')>();
  return { ...actual, mountEvidenceWorkspace: vi.fn(actual.mountEvidenceWorkspace) };
});
vi.mock('../../src/renderer/action-defaults.js', () => ({ readActionDefaults: async () => ({ ...DEFAULT_QUICK_ACTIONS }), rememberActionDefaults: async () => undefined }));

// Issue #1410 items 5 and 6: one-step batch apply with 撤销本批应用, and one-click 忽略, against the real surface.
describe('one-step review actions (#1410)', () => {
  const suggestion = (markId: string, ordinal: number): ReviewFindingProjection => ({ ...finding(), findingId: `rvf_${markId}`, categoryId: 'typos-and-usage', categoryLabel: '错别字与规范用语',
    ordinal, output: 'change-suggestion', markId, replacement: '改后', quote: '原文', blockId: `blk_${String(ordinal).repeat(24)}` });
  const annotation = (): ReviewFindingProjection => ({ ...finding(), findingId: 'rvf_note', categoryId: 'typos-and-usage', categoryLabel: '错别字与规范用语', markId: null, markStatus: null });
  function typos(findings: ReviewFindingProjection[], status: ReviewFindingProjection['status'] = 'pending'): ReviewWorkspaceProjection {
    const base = workspace(RUN, 'settled' as ReviewRunCategoryState, findings.length);
    const run = base.run!;
    return { ...base, run: { ...run, categories: [{ ...run.categories[0]!, categoryId: 'typos-and-usage', label: '错别字与规范用语', output: 'change-suggestion', batchApply: true,
      state: 'settled' as ReviewRunCategoryState, stateLabel: '已完成', findingsCount: findings.length }], findings: findings.map((entry) => ({ ...entry, status })) } };
  }
  async function view(findings: ReviewFindingProjection[], extra: Partial<Record<keyof RendererApi, unknown>>) {
    const mounted = mount();
    Object.assign(mounted.api, extra);
    mounted.inspectReviewWorkspace.mockImplementation(async () => typos(findings));
    mounted.surface.refresh(); await flush();
    return mounted;
  }
  const button = (root: MiniElement, action: string) => root.querySelector(`[data-review-action="${action}"]`) as MiniElement | null;

  it('opens a collapsed category for its batch strip and keeps undo visible after the loaded findings empty', async () => {
    const applying = deferred<{ application: { effectId: string } }>();
    const mounted = await view([suggestion('m1', 1)], { applyChangeSuggestionBatch: vi.fn(() => applying.promise) });
    const fold = mounted.root.querySelector('.review-category-fold')!;
    fold.open = false; fold.dispatchEvent({ type: 'toggle' });
    button(mounted.root, 'batch-prepare')!.click(); await flush();
    expect(mounted.root.querySelector('.review-batch-strip')!.closest('details')!.open).toBe(true);
    mounted.inspectReviewWorkspace.mockResolvedValue(typos([]));
    applying.resolve({ application: { effectId: 'effect' } }); await flush();
    expect(button(mounted.root, 'batch-undo')!.closest('details')!.open).toBe(true);
  });

  it('applies the whole batch in one click and takes it back as one Effect, with 撤销本批应用', async () => {
    const applyBatch = vi.fn(async () => ({ application: { effectId: 'effect' } }));
    const reverse = vi.fn(async (_input: { markId: string }) => ({ application: { effectId: 'reverse' } }));
    const { root, status } = await view([suggestion('m1', 1), suggestion('m2', 2)], {
      applyChangeSuggestionBatch: applyBatch, reverseAppliedChangeSuggestion: reverse, getManuscriptApplyOutcome: vi.fn(), inspectApplyReceipt: vi.fn(),
    });
    button(root, 'batch-prepare')!.click(); await flush();
    expect(applyBatch).toHaveBeenCalledOnce();
    expect(applyBatch).toHaveBeenCalledWith(expect.objectContaining({ markIds: ['m1', 'm2'] }));
    expect(button(root, 'batch-confirm')).toBeNull();
    const applied = root.querySelector('section.review-batch-applied') as MiniElement;
    expect(applied.dataset['reviewBatchState']).toBe('applied');
    expect(applied.textContent).toContain('已把 2 条修改建议写入稿件。');
    button(root, 'batch-undo')!.click(); await flush();
    expect(reverse.mock.calls.map(([input]) => input.markId)).toEqual(['m1']);
    expect(status).toHaveBeenLastCalledWith('已撤销 2 条。', 'success');
    expect(root.querySelector('section.review-batch-applied')).toBeNull();
  });

  it.each(['', '【未联网核查】'])('excludes guessed and punctuation-matched suggestions from the batch (%s)', async (disclosure) => {
    const applyBatch = vi.fn(async () => ({ application: { effectId: 'effect' } }));
    const { root, status } = await view([{ ...suggestion('guess', 1), quote: '古怪', replacement: '奇怪', note: `${disclosure}【锚点不唯一】同一段内“古怪”重复出现，可酌情替换其一。` },
      { ...suggestion('punctuation', 2), note: `${disclosure}【锚点不唯一】（标点已与原稿对齐）合成建议。` }, suggestion('pinned', 3)],
      { applyChangeSuggestionBatch: applyBatch, getManuscriptApplyOutcome: vi.fn(), inspectApplyReceipt: vi.fn() });
    button(root, 'batch-prepare')!.click(); await flush();
    expect(applyBatch).toHaveBeenCalledWith(expect.objectContaining({ markIds: ['pinned'] }));
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('另有 2 条需要逐条确认'), 'success');
    expect(root.querySelector('section.review-batch-applied')!.textContent).toContain('1 条');
  });

  it('keeps batch reversal available when the Effect cannot be reversed', async () => {
    const reverse = vi.fn(async (input: { markId: string }) => { if (input.markId === 'm1') throw new Error('anchor moved'); return { application: { effectId: 'reverse' } }; });
    const outcome = vi.fn(async () => ({ state: 'not-committed' }));
    const { root, status } = await view([suggestion('m1', 1), suggestion('m2', 2)], {
      applyChangeSuggestionBatch: vi.fn(async () => ({ application: { effectId: 'effect' } })), reverseAppliedChangeSuggestion: reverse,
      getManuscriptApplyOutcome: outcome, inspectApplyReceipt: vi.fn(),
    });
    button(root, 'batch-prepare')!.click(); await flush();
    button(root, 'batch-undo')!.click(); await flush();
    expect(reverse).toHaveBeenCalledTimes(1);
    expect(outcome).toHaveBeenCalledOnce();
    expect(status).toHaveBeenLastCalledWith('未能撤销本批应用。', 'error');
  });

  it('ignores a finding in one click with the routine reason, and keeps 忽略并备注… for a reason of the editor\'s own', async () => {
    const record = vi.fn(async () => typos([annotation()], 'ignored'));
    const { root, status } = await view([annotation()], { recordReviewFindingDisposition: record });
    expect(button(root, 'ignore-now')!.textContent).toBe('忽略');
    expect(button(root, 'ignore')!.textContent).toBe('忽略并备注…');
    button(root, 'ignore-now')!.click(); await flush();
    expect(record).toHaveBeenCalledWith({ reviewRunId: RUN, findingId: 'rvf_note', disposition: 'ignored', reason: '编辑决定忽略' });
    expect(status).toHaveBeenCalledWith(expect.any(String), 'success');
  });

  it('records the routine reason when 忽略并备注… is confirmed with the note left empty', async () => {
    const record = vi.fn(async () => typos([annotation()], 'ignored'));
    const { root } = await view([annotation()], { recordReviewFindingDisposition: record });
    button(root, 'ignore')!.click(); await flush();
    expect((root.querySelector('[data-review-field="ignore-reason"]') as MiniElement & { required?: boolean }).required).not.toBe(true);
    button(root, 'ignore-confirm')!.click(); await flush();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ disposition: 'ignored', reason: '编辑决定忽略' }));
  });
});

// Issue #1525 review: decisions in place keep the Fact-check Lens, release what an action held, re-read what did not settle,
// decide only from the card itself, and leave no stale way back.
describe('review triage in place (#1525)', () => {
  const suggestion = (ordinal: number): ReviewFindingProjection => ({ ...finding(), findingId: `rvf_s${ordinal}`, categoryId: 'typos-and-usage', categoryLabel: '错别字与规范用语',
    ordinal, output: 'change-suggestion', markId: `m${ordinal}`, replacement: '改后', quote: '原文', blockId: `blk_${String(ordinal).repeat(24)}` });
  function typos(findings: ReviewFindingProjection[], truncated = false): ReviewWorkspaceProjection {
    const base = workspace(RUN, 'settled', findings.length);
    const run = base.run!;
    return { ...base, run: { ...run, findingsTruncated: truncated, categories: [{ ...run.categories[0]!, categoryId: 'typos-and-usage', label: '错别字与规范用语', output: 'change-suggestion',
      batchApply: true, state: 'settled', stateLabel: '已完成', findingsCount: findings.length }], findings: findings.map((entry) => ({ ...entry })) } };
  }
  async function view(findings: ReviewFindingProjection[], extra: Partial<Record<keyof RendererApi, unknown>>, truncated = false) {
    const mounted = mount();
    Object.assign(mounted.api, extra);
    mounted.inspectReviewWorkspace.mockImplementation(async () => typos(findings, truncated));
    mounted.surface.refresh(); await flush();
    return mounted;
  }
  const article = (root: MiniElement, id: string) => root.querySelector(`article[data-finding-id="${id}"]`)!;
  const inCard = (root: MiniElement, id: string, action: string) => root.querySelector(`article[data-finding-id="${id}"] [data-review-action="${action}"]`)!;
  const rejected = (decisionId: string | null = null) => ({ card: { status: 'open', suggestion: decisionId === null ? null : { decision: { decisionId } } } });

  it('keeps a fact-lens row whole when one of its actions repaints it in place', async () => {
    const view = mount('settled'); await flush();
    Object.assign(view.api, { updateEditorialMark: vi.fn(async () => ({ card: { status: 'resolved' } })) });
    const row = () => view.root.querySelector('li.fact-lens-row')!;
    row().querySelector('[data-review-action="ignore"]')!.click(); await flush();
    row().querySelector('[data-review-action="ignore-cancel"]')!.click(); await flush();
    for (const selector of ['.fact-lens-states', '.fact-lens-level', '.fact-lens-decision', '[data-fact-action="fact-workspace"]', '[data-fact-action="fact-go-to-text"]']) {
      expect(row().querySelector(selector)).not.toBeNull();
    }
    expect(view.root.textContent).not.toContain('未外部复核');
    view.inspectReviewWorkspace.mockClear();
    row().querySelector('[data-review-action="mark-handled"]')!.click(); await flush();
    expect(view.inspectReviewWorkspace).not.toHaveBeenCalled();
    expect(row().querySelector('article.review-finding')!.dataset['status']).toBe('handled');
    expect(row().querySelector('.fact-lens-states')).not.toBeNull();
    expect(view.root.textContent).not.toContain('未外部复核');
  });

  it('enables a card painted while another decision was in flight once that decision ends', async () => {
    const second = deferred<ReturnType<typeof rejected>>();
    const ask = deferred<unknown>();
    const reject = vi.fn().mockResolvedValueOnce(rejected('decision-1')).mockReturnValueOnce(second.promise);
    const { root } = await view([suggestion(1), suggestion(2), suggestion(3)], {
      recordChangeSuggestionDecision: reject, recordLearningReasonAsk: vi.fn(() => ask.promise) });
    article(root, 'rvf_s1').focus();
    article(root, 'rvf_s1').dispatchEvent({ type: 'keydown', key: 'r' }); await flush();
    expect(miniDocument.activeElement).toBe(article(root, 'rvf_s2'));
    article(root, 'rvf_s2').dispatchEvent({ type: 'keydown', key: 'r' }); await flush();
    // Card 1's reason ask lands while card 2's decision is still in flight: card 1 is painted with its controls held.
    ask.resolve({ askId: 'ask-1', decisionId: 'decision-1', question: '为什么拒绝？', options: [] }); await flush();
    expect(root.querySelector('article[data-finding-id="rvf_s1"] .learning-reason-ask')).not.toBeNull();
    expect((inCard(root, 'rvf_s1', 'go-to-text') as MiniElement).disabled).toBe(true);
    second.resolve(rejected()); await flush();
    expect((inCard(root, 'rvf_s1', 'go-to-text') as MiniElement).disabled).toBe(false);
    expect(root.querySelectorAll('[data-work-held]')).toHaveLength(0);
  });

  it('enables every control of a full repaint drawn while a decision was in flight', async () => {
    const pending = deferred<ReturnType<typeof rejected>>();
    const { root, surface } = await view([suggestion(1), suggestion(2)], { recordChangeSuggestionDecision: vi.fn(() => pending.promise) });
    const enabled = () => root.querySelectorAll('button').filter((node) => !node.disabled).length;
    const before = enabled();
    inCard(root, 'rvf_s1', 'reject').click(); await flush();
    surface.refresh(); await flush();
    expect(root.querySelector('[data-review-action="batch-prepare"]')!.disabled).toBe(true);
    pending.resolve(rejected()); await flush();
    expect(root.querySelectorAll('[data-work-held]')).toHaveLength(0);
    expect(root.querySelector('[data-review-action="batch-prepare"]')!.disabled).toBe(false);
    expect(root.querySelectorAll('[data-review-filter] button').every((node) => !node.disabled)).toBe(true);
    expect((inCard(root, 'rvf_s2', 'reject') as MiniElement).disabled).toBe(false);
    // Card 1 is decided, so it no longer offers 接受并应用 and 拒绝; nothing else stays disabled.
    expect(enabled()).toBe(before - 2);
  });

  it('reads the Run again when a decision fails', async () => {
    const { root, inspectReviewWorkspace, status } = await view([suggestion(1)], { recordChangeSuggestionDecision: vi.fn(async () => { throw new Error('refused'); }) });
    inspectReviewWorkspace.mockClear();
    inCard(root, 'rvf_s1', 'reject').click(); await flush();
    expect(inspectReviewWorkspace).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith('未能拒绝这条修改建议。', 'error');
  });

  it('reads the Run again for an ignored finding beyond the page the service answers with', async () => {
    const note: ReviewFindingProjection = { ...finding(), findingId: 'rvf_far', categoryId: 'typos-and-usage', ordinal: 301 };
    // The service answers with the Run's first findings page, which does not hold finding 301.
    const record = vi.fn(async () => typos([]));
    const { root, inspectReviewWorkspace } = await view([note], { recordReviewFindingDisposition: record });
    inspectReviewWorkspace.mockClear();
    inspectReviewWorkspace.mockImplementation(async () => typos([{ ...note, status: 'ignored', statusLabel: '已忽略', statusDetail: '已忽略并说明原因' }]));
    inCard(root, 'rvf_far', 'ignore-now').click(); await flush();
    expect(inspectReviewWorkspace).toHaveBeenCalledTimes(1);
    expect(article(root, 'rvf_far').dataset['status']).toBe('ignored');
  });

  it('decides only while the card itself has focus, never from one of its controls', async () => {
    const reject = vi.fn(async () => rejected());
    const apply = vi.fn();
    const { root, goToText } = await view([suggestion(1)], { recordChangeSuggestionDecision: reject, applyChangeSuggestion: apply });
    const card = article(root, 'rvf_s1');
    const inner = [inCard(root, 'rvf_s1', 'go-to-text'), inCard(root, 'rvf_s1', 'reject'), inCard(root, 'rvf_s1', 'accept-apply'), card.querySelector('.review-card-more > summary')];
    for (const target of inner.filter((node): node is MiniElement => node !== null)) {
      for (const key of ['a', 'r', 'Enter']) card.dispatchEvent({ type: 'keydown', key, target });
    }
    await flush();
    expect(reject).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(goToText).not.toHaveBeenCalled();
    // Enter goes back to the text only from the card, and not while an input method composes or a modifier is held.
    for (const event of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) card.dispatchEvent({ type: 'keydown', key: 'Enter', ...event });
    await flush();
    expect(goToText).not.toHaveBeenCalled();
    card.dispatchEvent({ type: 'keydown', key: 'Enter' }); await flush();
    expect(goToText).toHaveBeenCalledWith(expect.objectContaining({ ordinal: 1, blockId: suggestion(1).blockId }));
  });

  it('keeps 拒绝 direct on a 修改建议, 忽略 direct on one whose words changed, and 知道了 only folds the batch line', async () => {
    const changed = { ...suggestion(2), markId: null, markStatus: null };
    const { root } = await view([suggestion(1), changed], { applyChangeSuggestionBatch: vi.fn(async () => ({ application: { effectId: 'effect' } })) });
    expect(inCard(root, 'rvf_s1', 'reject').closest('.review-card-more') === null).toBe(true);
    expect(inCard(root, 'rvf_s2', 'ignore-now').closest('.review-card-more') === null).toBe(true);
    expect((inCard(root, 'rvf_s2', 'accept-apply') as MiniElement).disabled).toBe(true);
    root.querySelector('[data-review-action="batch-prepare"]')!.click(); await flush();
    const done = root.querySelector('section.review-batch-applied [data-review-action="batch-cancel"]')!;
    expect(done.textContent).toBe('知道了');
  });

  it('offers 撤销 after 拒绝, which withdraws that decision and makes the finding pending again', async () => {
    const decide = vi.fn().mockResolvedValueOnce(rejected()).mockResolvedValueOnce({ card: { status: 'open', suggestion: null } });
    const { root, inspectReviewWorkspace } = await view([suggestion(1)], { recordChangeSuggestionDecision: decide });
    inCard(root, 'rvf_s1', 'reject').click(); await flush();
    expect(article(root, 'rvf_s1').dataset['status']).toBe('handled');
    expect(article(root, 'rvf_s1').textContent).toContain('已拒绝这条修改建议');
    inspectReviewWorkspace.mockClear();
    const undo = miniDocument.body.querySelector('[data-toast] button')!;
    expect(undo.textContent).toBe('撤销');
    undo.click(); await flush();
    expect(decide).toHaveBeenLastCalledWith(expect.objectContaining({ markId: 'm1', disposition: 'withdrawn' }));
    expect(inspectReviewWorkspace).not.toHaveBeenCalled();
    expect(article(root, 'rvf_s1').dataset['status']).toBe('pending');
  });

  it('draws no heading for a category with no finding on show under a filter', async () => {
    const mounted = await view([suggestion(1)], {});
    mounted.inspectReviewWorkspace.mockImplementation(async () => { const next = typos([]); next.run!.categories[0]!.findingsCount = 3; return next; });
    mounted.root.querySelector('[data-review-filter="status"] [data-filter-value="ignored"]')!.click(); await flush();
    expect(mounted.root.querySelectorAll('section.review-group')).toHaveLength(0);
  });

  it('says only that an unfiltered empty Run has no findings', async () => {
    const view = mount('settled', 0); await flush();
    expect(view.root.querySelector('.review-no-findings')!.textContent).toBe('这次审阅还没有发现。');
  });

  it('closes the card\'s ⋯ menu once one of its entries was chosen, in a list and in the fact lens', async () => {
    const note: ReviewFindingProjection = { ...finding(), findingId: 'rvf_note', categoryId: 'typos-and-usage', markId: 'm-note' };
    const { root } = await view([note], { getEditorialMarkCard: vi.fn(async () => ({ pinnedText: '原文', body: '批注' })) });
    const menu = () => root.querySelector('article[data-finding-id="rvf_note"] details.review-card-more')!;
    for (const [open, cancel] of [['ignore', 'ignore-cancel'], ['convert-to-suggestion', 'convert-cancel']] as const) {
      menu().open = true;
      inCard(root, 'rvf_note', open).click(); await flush();
      expect(menu().open).toBe(false);
      menu().open = true;
      inCard(root, 'rvf_note', cancel).click(); await flush();
      expect(menu().open).toBe(false);
    }
    const lens = mount('settled'); await flush();
    const lensMenu = () => lens.root.querySelector('li.fact-lens-row details.review-card-more')!;
    lensMenu().open = true;
    lens.root.querySelector('li.fact-lens-row [data-review-action="ignore"]')!.click(); await flush();
    expect(lensMenu().open).toBe(false);
  });

  it('reads again when a read begun before a decision would land after it', async () => {
    const { root, inspectReviewWorkspace, surface } = await view([suggestion(1), suggestion(2)], { recordChangeSuggestionDecision: vi.fn(async () => rejected()) });
    const stale = deferred<ReviewWorkspaceProjection>();
    inspectReviewWorkspace.mockImplementationOnce(() => stale.promise);
    surface.refresh(); await flush();
    const decided = { ...suggestion(1), status: 'handled' as const, statusLabel: '已处理', statusDetail: '已拒绝这条修改建议' };
    inspectReviewWorkspace.mockImplementation(async () => typos([decided, suggestion(2)]));
    const calls = inspectReviewWorkspace.mock.calls.length;
    inCard(root, 'rvf_s1', 'reject').click(); await flush();
    expect(inspectReviewWorkspace.mock.calls.length).toBe(calls + 1);
    stale.resolve(typos([suggestion(1), suggestion(2)])); await flush();
    expect(article(root, 'rvf_s1').dataset['status']).toBe('handled');
    expect(root.querySelector('article[data-finding-id="rvf_s1"] [data-review-action="reject"]')).toBeNull();
  });

  it('moves focus only to a pending card on show, never into a collapsed category', async () => {
    const note: ReviewFindingProjection = { ...finding(), findingId: 'rvf_n2', categoryId: 'local-text-check', ordinal: 2, markId: 'm-n2' };
    const projection = () => {
      const next = typos([suggestion(1), note]);
      const run = next.run!;
      return { ...next, run: { ...run, categories: [...run.categories, { ...run.categories[0]!, categoryId: 'local-text-check', label: '本地文字检查', output: 'annotation' as const, batchApply: false, findingsCount: 1 }] } };
    };
    const view0 = mount(); Object.assign(view0.api, { recordChangeSuggestionDecision: vi.fn(async () => rejected()) });
    view0.inspectReviewWorkspace.mockImplementation(async () => projection()); view0.surface.refresh(); await flush();
    const fold = view0.root.querySelector('section.review-group[data-review-category="local-text-check"] details.review-category-fold')!;
    fold.open = false; fold.dispatchEvent({ type: 'toggle' });
    article(view0.root, 'rvf_s1').focus();
    article(view0.root, 'rvf_s1').dispatchEvent({ type: 'keydown', key: 'r' }); await flush();
    expect(miniDocument.activeElement).toBe(article(view0.root, 'rvf_s1'));
  });

  it('says nothing and offers no 撤销 for a 拒绝 answered after the editor left 审阅, and takes its toast away on leaving', async () => {
    const late = deferred<ReturnType<typeof rejected>>();
    const first = await view([suggestion(1)], { recordChangeSuggestionDecision: vi.fn(() => late.promise) });
    inCard(first.root, 'rvf_s1', 'reject').click(); await flush();
    first.surface.destroy();
    late.resolve(rejected()); await flush();
    expect(first.status).not.toHaveBeenCalledWith('已拒绝这条修改建议；原文保留。', 'success');
    expect(miniDocument.body.querySelector('[data-toast]')?.hidden ?? true).toBe(true);
    const second = await view([suggestion(1)], { recordChangeSuggestionDecision: vi.fn(async () => rejected()) });
    inCard(second.root, 'rvf_s1', 'reject').click(); await flush();
    expect(miniDocument.body.querySelector('[data-toast]')!.hidden).toBe(false);
    second.surface.destroy();
    expect(miniDocument.body.querySelector('[data-toast]')!.hidden).toBe(true);
  });

  it('keeps focus on the page after 导出审阅报告（DOCX）, after 「全部类别」 and after a filter pill', async () => {
    const view0 = mount('settled'); await flush();
    const summary = view0.root.querySelector('.review-header-export summary')!;
    view0.root.querySelector('.review-header-export')!.open = true;
    view0.root.querySelector('[data-review-action="export-docx-report"]')!.click();
    expect(miniDocument.activeElement).toBe(summary);
    await flush();
    const pending = () => view0.root.querySelector('[data-review-filter="status"] [data-filter-value="pending"]')!;
    pending().focus(); pending().click(); await flush();
    expect(miniDocument.activeElement).toBe(pending());
    view0.root.querySelector('section.review-group .review-group-heading button.quiet')!.click(); await flush();
    const all = view0.root.querySelector('[data-review-action="all-categories"]')!;
    all.focus(); all.click(); await flush();
    expect(view0.root.querySelector('[data-review-action="all-categories"]')).toBeNull();
    expect(miniDocument.activeElement?.closest('.review-filters')).not.toBeNull();
    expect(miniDocument.activeElement?.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the empty destination as title, pill, sentence and 新建审阅 only', async () => {
    const view0 = mount(); await flush();
    view0.inspectReviewWorkspace.mockImplementation(async () => ({ ...workspace(), runs: [], run: null }));
    view0.surface.refresh(); await flush();
    const card = view0.root.querySelector('.review-workspace-card')!;
    expect(card.dataset['reviewState']).toBe('empty');
    expect(card.querySelector('.review-header-export')).toBeNull();
    expect(card.querySelector('[data-review-action="new-review"]')).not.toBeNull();
  });
});

describe('the way back from a finding (#1525)', () => {
  const jump = { manuscriptId: 'manuscript-a', branchId: 'branch-a', ordinal: 4 };

  it('is cleared by going back, and by opening 审阅 for that Book another way', async () => {
    const { leaveReviewReturn, reviewReturnButton } = await import('../../src/renderer/review-return.js');
    const back = vi.fn();
    leaveReviewReturn(BOOK, jump, back);
    const chip = reviewReturnButton('manuscript-a', 'branch-a')!;
    expect(chip.textContent).toBe('回到审阅 · 第 4 条');
    chip.click();
    expect(back).toHaveBeenCalledOnce();
    expect(reviewReturnButton('manuscript-a', 'branch-a')).toBeNull();
    leaveReviewReturn(BOOK, jump, vi.fn());
    mount(); await flush();
    expect(reviewReturnButton('manuscript-a', 'branch-a')).toBeNull();
  });

  it('names the row\'s finding for a jump from a fact-lens row', async () => {
    const view = mount('settled'); await flush();
    view.root.querySelector('[data-fact-action="fact-go-to-text"]')!.click(); await flush();
    expect(view.goToText).toHaveBeenCalledWith(expect.objectContaining({ ordinal: 1, blockId: result().blockId }));
  });
  it('names the row\'s finding for a jump from the Evidence Workspace and from the synthesis evidence', async () => {
    const view = mount('settled'); await flush();
    view.root.querySelector('[data-fact-action="fact-workspace"]')!.click(); await flush();
    const workspaceOptions = vi.mocked(mountEvidenceWorkspace).mock.calls.at(-1)![0];
    await workspaceOptions.goToText({ blockId: result().blockId, markId: null });
    expect(view.goToText).toHaveBeenLastCalledWith(expect.objectContaining({ ordinal: 1, blockId: result().blockId }));
    const synthesis = mount();
    synthesis.inspectReviewWorkspace.mockImplementation(async () => {
      const next = workspace(RUN, 'settled');
      next.run!.synthesis = { state: 'completed', detail: '', missingCategories: [], omissionLabel: null,
        summary: { overallAssessment: '公开合成总体评价', recurringProblems: [{ title: '公开合成问题', explanation: '公开合成说明', evidenceRefs: ['E1'], priority: '' }], contextualExplanations: [], priorities: [] },
        evidence: [{ ref: 'E1', findingId: finding().findingId, chapterLabel: '第一章', quote: '公开合成核查文字', status: 'pending', blockId: finding().blockId }] };
      return next;
    });
    synthesis.surface.refresh(); await flush();
    synthesis.root.querySelector('[data-synthesis-evidence="E1"]')!.click(); await flush();
    expect(synthesis.goToText).toHaveBeenLastCalledWith(expect.objectContaining({ ordinal: 1, blockId: finding().blockId }));
  });

  it('leaves no numbered way back for a jump that came from no finding', async () => {
    const { leaveReviewReturn, reviewReturnButton } = await import('../../src/renderer/review-return.js');
    leaveReviewReturn(BOOK, jump, vi.fn());
    leaveReviewReturn(BOOK, { manuscriptId: jump.manuscriptId, branchId: jump.branchId }, vi.fn());
    expect(reviewReturnButton(jump.manuscriptId, jump.branchId)).toBeNull();
  });
});

describe('the round trip through 回到原文 (#1525)', () => {
  const typo = (ordinal: number): ReviewFindingProjection => ({ ...finding(), findingId: `rvf_t${ordinal}`, categoryId: 'typos-and-usage', categoryLabel: '错别字与规范用语',
    ordinal, output: 'change-suggestion', markId: `m${ordinal}`, replacement: '改后', quote: '原文', blockId: `blk_${String(ordinal).repeat(24)}` });
  const note = (ordinal: number): ReviewFindingProjection => ({ ...finding(), findingId: `rvf_n${ordinal}`, categoryId: 'local-text-check', categoryLabel: '本地文字检查',
    ordinal, markId: `m${ordinal}`, blockId: `blk_${String(ordinal).repeat(24)}` });

  it('comes back to the same Run, filters, pages, groups, 历史 and finding, with a finding handled meanwhile', async () => {
    // Page 1: 批注 1 and 修改建议 2 (typos), 批注 3 (local); page 2: 批注 4 (local). The jump is from 3, on page 1, so only the
    // kept page count can bring 4 back.
    const findings = [{ ...note(1), categoryId: 'typos-and-usage', categoryLabel: '错别字与规范用语' }, typo(2), note(3), note(4)];
    const page = (input: Parameters<RendererApi['inspectReviewWorkspace']>[0]): ReviewWorkspaceProjection => {
      const base = workspace(RUN, 'settled', findings.length);
      const run = base.run!;
      const category = run.categories[0]!;
      const second = input?.findingsAfterOrdinal != null;
      return { ...base, run: { ...run, findingsTruncated: !second, findingsTotal: findings.length,
        categories: [
          { ...category, categoryId: 'typos-and-usage', label: '错别字与规范用语', output: 'change-suggestion', batchApply: false, state: 'settled', findingsCount: 2 },
          { ...category, categoryId: 'local-text-check', label: '本地文字检查', output: 'annotation', batchApply: false, state: 'settled', findingsCount: 2 },
        ],
        findings: (second ? findings.slice(3) : findings.slice(0, 3)).map((entry) => ({ ...entry })) } };
    };
    const scroller = { scrollTop: 0 };
    Object.defineProperty(miniDocument, 'scrollingElement', { configurable: true, value: scroller });
    try {
      const first = mount();
      first.inspectReviewWorkspace.mockImplementation(async (input) => page(input));
      first.surface.refresh(); await flush();
      first.root.querySelector('[data-review-filter="status"] [data-filter-value="pending"]')!.click(); await flush();
      first.root.querySelector('[data-review-action="more-findings"]')!.click(); await flush();
      expect(first.root.querySelector('article[data-finding-id="rvf_n4"]')).not.toBeNull();
      const typos = first.root.querySelector('section.review-group[data-review-category="typos-and-usage"] details.review-category-fold')!;
      typos.open = false; typos.dispatchEvent({ type: 'toggle' });
      const history = first.root.querySelector('details.review-history-fold')!;
      // Opened with no toggle event delivered: what the fold shows is what is kept.
      history.open = true;
      scroller.scrollTop = 420;
      first.root.querySelector('article[data-finding-id="rvf_n3"] [data-review-action="go-to-text"]')!.click(); await flush();
      expect(first.goToText).toHaveBeenCalledWith(expect.objectContaining({ ordinal: 3 }));
      first.surface.destroy(); first.root.remove();
      scroller.scrollTop = 0;
      // Handled in the manuscript meanwhile: 批注 1 no longer has its ⋯ menu, so every fold after it stands one place earlier.
      findings[0] = { ...findings[0]!, status: 'handled', statusLabel: '已处理', statusDetail: '已标记为已处理', markStatus: 'resolved' };
      const back = mount('failed', 1, null, true, page);
      await flush();
      const asked = back.inspectReviewWorkspace.mock.calls.map(([input]) => input);
      expect(asked[0]).toEqual(expect.objectContaining({ reviewRunId: RUN, status: 'pending' }));
      expect(asked).toContainEqual(expect.objectContaining({ findingsAfterOrdinal: 3, status: 'pending' }));
      expect(back.root.querySelector('article[data-finding-id="rvf_n4"]')).not.toBeNull();
      expect(back.root.querySelector('section.review-group[data-review-category="typos-and-usage"] details.review-category-fold')!.open).toBe(false);
      expect(back.root.querySelector('section.review-group[data-review-category="local-text-check"] details.review-category-fold')!.open).toBe(true);
      expect(back.root.querySelectorAll('details.review-card-more').filter((node) => node.open)).toHaveLength(0);
      expect(miniDocument.activeElement).toBe(back.root.querySelector('article[data-finding-id="rvf_n3"]'));
      expect(back.root.querySelector('details.review-history-fold')!.open).toBe(true);
    } finally { Reflect.deleteProperty(miniDocument, 'scrollingElement'); }
  });

  it('puts the card the editor left back at its place on screen, even when the page above it grows after the return', async () => {
    const findings = [typo(1), note(2)];
    const page = (): ReviewWorkspaceProjection => {
      const base = workspace(RUN, 'settled', findings.length);
      const run = base.run!;
      return { ...base, run: { ...run, findingsTotal: findings.length, categories: [{ ...run.categories[0]!, categoryId: 'typos-and-usage', label: '错别字与规范用语',
        output: 'change-suggestion', batchApply: false, state: 'settled', findingsCount: 1 }, { ...run.categories[0]!, categoryId: 'local-text-check', label: '本地文字检查',
        output: 'annotation', batchApply: false, state: 'settled', findingsCount: 1 }], findings: findings.map((entry) => ({ ...entry })) } };
    };
    // A page with no layout of its own: each card stands at a fixed place on the page, below whatever has grown above it.
    const scroller = { scrollTop: 0 };
    let above = 0;
    const placeOf: Record<string, number> = { rvf_t1: 300, rvf_n2: 1000 };
    Object.defineProperty(miniDocument, 'scrollingElement', { configurable: true, value: scroller });
    const empty = Object.getOwnPropertyDescriptor(MiniElement.prototype, 'getBoundingClientRect')!;
    Object.defineProperty(MiniElement.prototype, 'getBoundingClientRect', { configurable: true, value(this: MiniElement) {
      const top = (placeOf[this.dataset['findingId'] ?? ''] ?? 0) + above - scroller.scrollTop;
      return { top, bottom: top + 120, left: 0, right: 800, width: 800, height: 120 };
    } });
    try {
      const first = mount('failed', 1, null, false, page); await flush();
      scroller.scrollTop = 420;
      first.root.querySelector('article[data-finding-id="rvf_n2"] [data-review-action="go-to-text"]')!.click(); await flush();
      // The page moves while the manuscript is drawn; what counts is where the card stood when 回到原文 was pressed.
      scroller.scrollTop = 0;
      first.surface.destroy(); first.root.remove();
      const back = mount('failed', 1, null, true, page); await flush();
      const top = () => back.root.querySelector('article[data-finding-id="rvf_n2"]')!.getBoundingClientRect().top;
      expect(top()).toBe(580);
      // A part of the page above the card arrives after the first paint and is painted in: the card stays where it was left.
      above = 39;
      back.surface.refresh(); await flush();
      expect(top()).toBe(580);
      expect(scroller.scrollTop).toBe(459);
      // A scroll no hand of the editor's made — a focus move, a late scrollIntoView — is undone as well.
      scroller.scrollTop += 39;
      miniDocument.body.dispatchEvent({ type: 'scroll' });
      expect(top()).toBe(580);
      // Once the editor scrolls, the page is theirs again.
      miniDocument.body.dispatchEvent({ type: 'wheel' });
      above = 80;
      back.surface.refresh(); await flush();
      expect(top()).toBe(621);
    } finally {
      Reflect.deleteProperty(miniDocument, 'scrollingElement');
      Object.defineProperty(MiniElement.prototype, 'getBoundingClientRect', empty);
    }
  });
});

describe('生成统合总结 on the mounted review workspace (#1506)', () => {
  it('enables the offer again after a failed call and after another action, and a retry repeats the same command', async () => {
    const view = mount();
    const next = workspace();
    next.run!.synthesis = { state: 'missing', detail: '统合总结暂缺，逐条发现仍可处理；可单独生成统合总结。', summary: null, missingCategories: [],
      omissionLabel: null, evidence: [], canGenerate: true };
    view.inspectReviewWorkspace.mockResolvedValue(next);
    const generateReviewSynthesis = vi.fn<RendererApi['generateReviewSynthesis']>().mockRejectedValueOnce(new Error('captured failure')).mockResolvedValue(next);
    const generateReviewReport = vi.fn<RendererApi['generateReviewReport']>().mockResolvedValue(next);
    Object.assign(view.api, { generateReviewSynthesis, generateReviewReport });
    view.surface.refresh(); await flush();
    const offer = () => view.root.querySelector('[data-review-action="generate-synthesis"]')!;
    offer().click(); await flush();
    expect(generateReviewSynthesis).toHaveBeenCalledTimes(1);
    expect(offer().disabled).toBe(false);
    offer().click(); await flush();
    expect(generateReviewSynthesis).toHaveBeenCalledTimes(2);
    expect(generateReviewSynthesis.mock.calls[1]![0].clientCommandId).toBe(generateReviewSynthesis.mock.calls[0]![0].clientCommandId);
    view.root.querySelector('[data-review-action="generate-report"]')!.click(); await flush();
    expect(generateReviewReport).toHaveBeenCalledTimes(1);
    expect(offer().disabled).toBe(false);
  });
});

describe('上一条 / 下一条待处理 across a round trip through 审阅 (#1525)', () => {
  it('leaves the manuscript handlers in place, whichever screen is set up or taken down first', async () => {
    for (const enter of ['review-first', 'manuscript-first'] as const) {
      for (const leave of ['manuscript-first', 'review-first'] as const) {
        const dispatcher = createCommandDispatcher({ platform: 'win32', bindings: () => ({}), composing: () => false, announce: () => undefined });
        const ran: string[] = [];
        // The manuscript screen registers its two handlers when it is set up and takes them away when it is taken down.
        const manuscript = (name: string) => dispatcher.register({ 'view.previousPending': () => { ran.push(`${name}:previous`); }, 'view.nextPending': () => { ran.push(`${name}:next`); } });
        let offFirst: (() => void) | null = manuscript('first');
        let review: ReturnType<typeof mount> | null = null;
        const openReview = async () => { review = mount('settled', 1, null, false, undefined, (handlers) => dispatcher.register(handlers)); await flush(); };
        if (enter === 'review-first') { await openReview(); offFirst!(); } else { offFirst!(); await openReview(); }
        offFirst = null;
        if (leave === 'manuscript-first') { manuscript('second'); review!.surface.destroy(); } else { review!.surface.destroy(); manuscript('second'); }
        dispatcher.execute('view.previousPending');
        dispatcher.execute('view.nextPending');
        expect(ran, `${enter} / ${leave}`).toEqual(['second:previous', 'second:next']);
      }
    }
  });
});
