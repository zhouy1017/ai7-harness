import { DEFAULT_QUICK_ACTIONS } from '../../src/shared/preferences.js';
import { technicalDisclosure } from '../../src/renderer/technical-layer.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountReviewWorkspace, type MountReviewWorkspaceOptions, type ReviewWorkspaceSurface } from '../../src/renderer/review-workspace.js';
import { mountEvidenceWorkspace } from '../../src/renderer/evidence-workspace.js';
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

function mount(state: ReviewRunCategoryState = 'failed', findingsCount = 1, procedureId: string | null = null) {
  const root = new MiniElement('main');
  miniDocument.body.append(root);
  const inspectReviewWorkspace = vi.fn<RendererApi['inspectReviewWorkspace']>().mockImplementation(async (input) => workspace(input?.reviewRunId ?? RUN, state, findingsCount));
  const inspectFactualVerification = vi.fn<RendererApi['inspectFactualVerification']>().mockImplementation(async (input) => lens(input.reviewRunId ?? RUN));
  const inspectEvidenceWorkspace = vi.fn<RendererApi['inspectEvidenceWorkspace']>().mockImplementation(async (input) => evidence(result(RUN, input.resultId)));
  const unexpected = vi.fn(async () => { throw new Error('unexpected API operation'); });
  const calls = { inspectReviewWorkspace, inspectFactualVerification, inspectEvidenceWorkspace };
  const api = new Proxy(calls, { get: (target, key) => Reflect.get(target, key) ?? unexpected }) as unknown as MountReviewWorkspaceOptions['api'];
  const status = vi.fn(); const searchSettings = vi.fn();
  const surface = mountReviewWorkspace({ root: root as unknown as HTMLElement, bookId: BOOK, bookTitle: '公开合成图书', focus: null, api, procedureId,
    awaitServiceJob: async (initial) => initial, technicalDetails: (_className, ...rows) => { const node = new MiniElement('dl'); node.append(...rows as unknown as MiniElement[]); return technicalDisclosure(node as unknown as HTMLElement); },
    setStatus: status, errorMessage: (_error, fallback) => fallback, errorCode: () => null, openManuscript: async () => undefined,
    goToText: async () => undefined, openPlan: () => undefined, openSearchSettings: searchSettings, planChanged: () => undefined });
  surfaces.push(surface);
  surface.start();
  return { root, surface, status, unexpected, api, searchSettings, ...calls };
}

describe('terminal factual results through the mounted review workspace (#1058 / J04)', () => {
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

  it('applies the whole batch in one click and takes it back, newest first, with 撤销本批应用', async () => {
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
    expect(reverse.mock.calls.map(([input]) => input.markId)).toEqual(['m2', 'm1']);
    expect(status).toHaveBeenLastCalledWith('已撤销本批应用的 2 条修改建议，原文已写回稿件。', 'success');
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

  it('stops 撤销本批应用 at the first suggestion whose words moved on, and says how far it came', async () => {
    const reverse = vi.fn(async (input: { markId: string }) => { if (input.markId === 'm1') throw new Error('anchor moved'); return { application: { effectId: 'reverse' } }; });
    const outcome = vi.fn(async () => ({ state: 'not-committed' }));
    const { root, status } = await view([suggestion('m1', 1), suggestion('m2', 2)], {
      applyChangeSuggestionBatch: vi.fn(async () => ({ application: { effectId: 'effect' } })), reverseAppliedChangeSuggestion: reverse,
      getManuscriptApplyOutcome: outcome, inspectApplyReceipt: vi.fn(),
    });
    button(root, 'batch-prepare')!.click(); await flush();
    button(root, 'batch-undo')!.click(); await flush();
    expect(reverse).toHaveBeenCalledTimes(2);
    expect(outcome).toHaveBeenCalledOnce();
    expect(status).toHaveBeenLastCalledWith('已撤销 1 条；其余 1 条的文字已经变过，不能直接撤销，可在稿件中逐条处理。', 'error');
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
