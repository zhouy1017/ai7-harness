import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountReviewWorkspace, type MountReviewWorkspaceOptions, type ReviewWorkspaceSurface } from '../../src/renderer/review-workspace.js';
import type { EvidenceWorkspaceProjection, FactualVerificationLensProjection, FactualVerificationResultProjection, RendererApi, ReviewRunCategoryState, ReviewWorkspaceProjection } from '../../src/shared/protocol.js';
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

function workspace(id = RUN, state: ReviewRunCategoryState = 'failed', findingsCount = 1): ReviewWorkspaceProjection {
  return { bookId: BOOK, manuscript: { ...MANUSCRIPT, totalBlocks: 1 }, configuration: { schema: 'ai7.review/1', version: '1', digest: PIN.digest },
    categories: [], coverage: [], scopeOptions: { whole: unavailable, changed: unavailable, selection: unavailable, chapters: { ...unavailable, basis: 'outline', chapters: [] } },
    newReview: unavailable, runsTruncated: false,
    runs: [RUN, OTHER].map((reviewRunId, index) => ({ reviewRunId, ordinal: index + 1, label: `第 ${index + 1} 次`, createdAt: AT, scopeLabel: '全书',
      categoryLabels: ['事实核查'], state: 'partial', stateLabel: '部分完成', findingCounts: COUNTS, reportVersion: null, historicalMarker: null })),
    run: { reviewRunId: id, ordinal: 1, label: '第 1 次', createdAt: AT, state: 'partial', stateLabel: '部分完成', canContinue: false,
      scope: { kind: 'whole', label: '全书', selectedRange: null, selection: null }, manuscript: MANUSCRIPT, configurationDigest: PIN.digest,
      authorization: { authorizedAt: AT }, categories: [{ categoryId: 'factual-review', label: '事实核查', position: 1, output: 'annotation', riskPointsOnly: false,
        batchApply: false, basisStatement: '公开合成依据', state, stateLabel: state === 'failed' ? '运行失败' : '已中断', detail: '真实终态缺口说明',
        taskIntentId: null, planEnvelopeDigest: PIN.digest, modeLabel: null, plan: null, progress: null, findingsCount, excludedCount: 0 }],
      findings: [], findingsTotal: findingsCount, findingsTruncated: false, findingCounts: COUNTS, report: null, reportVersions: [], historicalMarker: null,
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
  vi.stubGlobal('window', { setTimeout, clearTimeout });
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
  Reflect.deleteProperty(MiniElement.prototype, 'prepend');
  Reflect.deleteProperty(MiniElement.prototype, 'replaceWith');
  restoreDom();
  vi.unstubAllGlobals();
});

const flush = async (): Promise<void> => { for (let count = 0; count < 25; count += 1) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

function mount(state: ReviewRunCategoryState = 'failed', findingsCount = 1) {
  const root = new MiniElement('main');
  miniDocument.body.append(root);
  const inspectReviewWorkspace = vi.fn<RendererApi['inspectReviewWorkspace']>().mockImplementation(async (input) => workspace(input?.reviewRunId ?? RUN, state, findingsCount));
  const inspectFactualVerification = vi.fn<RendererApi['inspectFactualVerification']>().mockImplementation(async (input) => lens(input.reviewRunId ?? RUN));
  const inspectEvidenceWorkspace = vi.fn<RendererApi['inspectEvidenceWorkspace']>().mockImplementation(async (input) => evidence(result(RUN, input.resultId)));
  const unexpected = vi.fn(async () => { throw new Error('unexpected API operation'); });
  const calls = { inspectReviewWorkspace, inspectFactualVerification, inspectEvidenceWorkspace };
  const api = new Proxy(calls, { get: (target, key) => Reflect.get(target, key) ?? unexpected }) as unknown as MountReviewWorkspaceOptions['api'];
  const status = vi.fn();
  const surface = mountReviewWorkspace({ root: root as unknown as HTMLElement, bookId: BOOK, bookTitle: '公开合成图书', focus: null, api,
    awaitServiceJob: async (initial) => initial, technicalDetails: (_className, ...rows) => { const node = new MiniElement('dl'); node.append(...rows as unknown as MiniElement[]); return node as unknown as HTMLElement; },
    setStatus: status, errorMessage: (_error, fallback) => fallback, errorCode: () => null, openManuscript: async () => undefined,
    goToText: async () => undefined, openPlan: () => undefined, planChanged: () => undefined });
  surfaces.push(surface);
  surface.start();
  return { root, surface, status, unexpected, ...calls };
}

describe('terminal factual results through the mounted review workspace (#1058 / J04)', () => {
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
    filter.value = '待核查'; filter.dispatchEvent({ type: 'change' });
    await flush();
    expect(view.root.querySelectorAll('[data-fact-result-id]')).toHaveLength(0);
    const clear = view.root.querySelector('[data-fact-filter="outcome"]')!;
    expect(clear).not.toBeNull();
    clear.value = ''; clear.dispatchEvent({ type: 'change' });
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
    filter.value = '待核查'; filter.dispatchEvent({ type: 'change' }); await flush();
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
