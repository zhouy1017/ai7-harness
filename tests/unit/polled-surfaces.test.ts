import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGlobalAttentionReader, mountGlobalAttention } from '../../src/renderer/global-attention.js';
import { createBaselineAnalysisCard } from '../../src/renderer/baseline-analysis-card.js';
import { mountEvaluation, type MountEvaluationOptions } from '../../src/renderer/evaluation.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { pollControlEngaged } from '../../src/renderer/poll-interaction.js';
import { BUILTIN_EVALUATION_PROFILE } from '../../src/service/evaluation-records.js';
import type { EvaluationWorkspaceProjection, GlobalAttentionProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

let uninstall: () => void;
beforeEach(() => { uninstall = installMiniDom(); vi.useFakeTimers(); setTechnicalLayerVisible(false); vi.stubGlobal('window', { setTimeout, clearTimeout, setInterval, clearInterval }); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); setTechnicalLayerVisible(true); uninstall(); });
const rootNode = () => { const root = miniDocument.createElement('section'); miniDocument.body.append(root); return root; };
const details = (className: string | undefined, ...rows: HTMLElement[]) => { const node = document.createElement('details'); node.className = className ?? 'technical-details'; node.append(document.createElement('summary'), ...rows); return node; };
vi.mock('../../src/renderer/action-defaults.js', () => ({ readActionDefaults: async () => ({}), rememberActionDefaults: async () => undefined }));

it.each([false, true])('retains attention action or disclosure focus across two changed polls (developer=%s, #1375)', async (developer) => {
  setTechnicalLayerVisible(developer); const root = rootNode(); let tick = 0;
  const reader = createGlobalAttentionReader({ inspectGlobalAttention: async (): Promise<GlobalAttentionProjection> => ({
    actionableCount: 0, running: true, processing: { state: 'local' }, groups: [{ key: 'active', total: 1, items: [{
      itemId: 'task', group: 'active', state: tick === 0 ? 'analysis-running' : tick === 1 ? 'analysis-pausing' : 'analysis-paused', blocked: false, at: new Date().toISOString(), book: { bookId: 'book', title: '公开合成书' },
      object: { kind: 'analysis', mode: 'first-baseline' }, facts: { progress: { stage: 'units', unitsSettled: ++tick, unitsTotal: 10 }, categories: [], revisionOrdinal: null }, nextStep: 'view-run',
      target: { kind: 'analysis', bookId: 'book', taskIntentId: 'task' }, technical: [],
    }] }],
  }) });
  const surface = mountGlobalAttention({ root: root as unknown as HTMLElement, reader, technicalDetails: details, setStatus: vi.fn(), errorMessage: () => '', open: async () => undefined, openNetworkProxySettings: vi.fn() });
  surface.start(); await vi.advanceTimersByTimeAsync(0);
  const selector = developer ? '.global-attention-facts summary' : '[data-attention-open]';
  if (developer) root.querySelector('.global-attention-facts')!.open = true;
  root.querySelector(selector)!.focus(); root.scrollTop = 60;
  for (let cycle = 0; cycle < 2; cycle++) {
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.activeElement).toBe(root.querySelector(selector)); expect(root.scrollTop).toBe(60);
    if (developer) expect(root.querySelector('.global-attention-facts')!.open).toBe(true);
  }
  expect(tick).toBe(3); surface.destroy(); reader.interrupt();
});

it('keeps evaluation More, summary focus and its page heading across two changed polls (#1375, #1383)', async () => {
  const root = rootNode(); let tick = 0;
  const unavailable = { allowed: false, reason: '尚未就绪' };
  const page = { bookId: 'book', bookTitle: '公开合成书', profile: BUILTIN_EVALUATION_PROFILE, record: null, records: [], recordCount: 0, unreadableRecords: [],
    initial: { task: { taskIntentId: 'task', state: 'executing', label: '运行中' }, latest: null, prepare: unavailable }, readersReport: { basis: null, task: null },
    rewrite: { task: null, proposal: null, decided: null, prepare: unavailable }, start: unavailable, market: { series: [] },
  } as unknown as EvaluationWorkspaceProjection;
  const surface = mountEvaluation({ root: root as unknown as HTMLElement, api: { inspectEvaluation: async () => ({ ...page, initial: { ...page.initial, prepare: { allowed: false, reason: `changed ${++tick}` } } }) },
    bookId: 'book', technicalDetails: details, setStatus: vi.fn(), errorMessage: () => '' } as unknown as MountEvaluationOptions);
  await surface.load(); const heading = root.querySelector('h2');
  root.querySelector('.evaluation-more')!.open = true; root.querySelector('.evaluation-more summary')!.focus();
  for (let cycle = 0; cycle < 2; cycle++) {
    await vi.advanceTimersByTimeAsync(2000);
    expect(root.querySelector('.evaluation-more')!.open).toBe(true);
    expect(document.activeElement).toBe(root.querySelector('.evaluation-more summary'));
    expect(root.querySelector('h2')).toBe(heading); expect(root.querySelectorAll('.evaluation-initial .state-term')).toHaveLength(0);
  }
  expect(tick).toBeGreaterThanOrEqual(3); expect(root.querySelector('[aria-controls="task-drawer"]')).toBeNull();
});

it('flushes a deferred terminal evaluation after a native control loses focus (#1375 F1)', async () => {
  const root = rootNode(); let state = 'executing';
  const unavailable = { allowed: false, reason: '尚未就绪' };
  const surface = mountEvaluation({ root: root as unknown as HTMLElement, api: { inspectEvaluation: async () => ({ bookId: 'book', profile: BUILTIN_EVALUATION_PROFILE, record: null, records: [], recordCount: 0, unreadableRecords: [],
    initial: { task: { taskIntentId: 'task', state, label: state }, latest: null, prepare: unavailable }, readersReport: { basis: null, task: null }, rewrite: { task: null, proposal: null, decided: null, prepare: unavailable }, start: unavailable, market: { series: [] } }) },
    bookId: 'book', technicalDetails: details, setStatus: vi.fn(), errorMessage: () => '' } as unknown as MountEvaluationOptions);
  await surface.load(); const select = miniDocument.createElement('select'); root.append(select); select.focus(); state = 'settled';
  await vi.advanceTimersByTimeAsync(2000);
  expect(root.querySelector('.evaluation-initial')?.dataset['initialState']).toBe('executing');
  expect(vi.getTimerCount()).toBe(0); // No future task poll can rescue this terminal reading.
  const outside = rootNode(); outside.focus(); root.dispatchEvent({ type: 'focusout' }); await vi.advanceTimersByTimeAsync(0);
  expect(root.querySelector('.evaluation-initial')?.dataset['initialState']).toBe('settled');
  const inline = miniDocument.createElement('button'); inline.setAttribute('aria-expanded', 'true'); root.append(inline);
  expect(pollControlEngaged(root as unknown as HTMLElement, false)).toBe(false);
});

it('retains the same populated historical Run Report on insertion and does not transfer it when pruned (#1375 F2)', async () => {
  setTechnicalLayerVisible(true); const root = rootNode(); root.dataset['analysisBookId'] = 'book'; let ids = ['older', 'oldest']; let tick = 0;
  const report = { schema: 'ai7.analysis.run-report/1', runRecordId: 'run', taskIntentId: 'task', attemptId: null, resultSetRevisionId: null, classification: 'completed', recordedAt: '2026-11-01T00:00:00Z', stages: [], units: { submitted: 1, reused: 0, recomputed: 1, gaps: 0, retried: 0 }, unitRows: [], adaptations: [], failures: [], usagePerStage: {}, findingCounts: [], assurance: { state: 'not-run', size: 0, candidateCount: 0 }, ifRedone: { state: 'closed', items: [] }, reportDigest: 'a'.repeat(64), accountingDigest: 'b'.repeat(64) };
  const reading = () => ({ bookId: 'book', state: 'executing', stateLabel: `运行中 ${++tick}`, resultSetRevision: null, inspectedRevision: null, taskIntent: null, planEnvelope: null, planVersion: null, coverageManifest: null, run: null, checkpoint: null, actions: { canPrepare: false }, updateControls: null, listPages: {}, namedNonEffects: [],
    taskOutcome: { outcomeId: 'current', classification: 'completed', label: '完成', safeNextAction: '', report, reportAbsentReason: null },
    history: { resultSetId: 'set', latestOrdinal: ids.length, kind: 'baseline-analysis', entries: ids.map((revisionId, ordinal) => ({ revisionId, ordinal: ordinal + 1, mode: 'first-baseline', modeLabel: '基线', current: false, freshness: 'superseded', freshnessLabel: '历史', predecessor: null, manuscriptPin: { revisionLabel: 'r1', revisionId: 'revision', revisionDigest: 'c'.repeat(64) }, createdAt: report.recordedAt, counts: { reused: 0, recomputed: 1, invalidated: 0, bypassed: 0 }, unitsClosed: 1, unitsTotal: 1, gapCount: 0, conflictCount: 0, producingRun: { runRecordId: revisionId, classification: 'completed' }, usage: { requests: 1, inputTokens: 0, outputTokens: 0 }, report, reportAbsentReason: null })) },
  }) as unknown as Parameters<ReturnType<typeof createBaselineAnalysisCard>['renderBaselineAnalysis']>[1];
  Object.assign(window, { ai7: { inspectBaselineAnalysis: async () => reading(), inspectCustomAnalysisDimensions: async () => ({ dimensions: [] }) } });
  const card = createBaselineAnalysisCard({ screen: root as unknown as HTMLElement, technicalDetails: details, taskDrawer: { refresh: vi.fn() }, setStatus: vi.fn(), rendererErrorMessage: () => '' } as unknown as Parameters<typeof createBaselineAnalysisCard>[0]);
  card.renderBaselineAnalysis(root as unknown as HTMLElement, reading(), '公开合成书');
  const selector = '[data-history-revision-id="older"] .analysis-run-report'; root.querySelector(selector)!.open = true; root.querySelector(`${selector} summary`)!.focus();
  ids = ['newest', 'older', 'oldest']; await vi.advanceTimersByTimeAsync(2000);
  expect(root.querySelector(selector)!.open).toBe(true); expect(document.activeElement).toBe(root.querySelector(`${selector} summary`));
  expect(root.querySelector('.analysis-outcome .analysis-run-report')!.open).toBe(false);
  expect(root.querySelector('[data-history-revision-id="newest"] .analysis-run-report')!.open).toBe(false);
  ids = ['newest', 'oldest']; await vi.advanceTimersByTimeAsync(2000);
  expect(root.querySelector(selector)).toBeNull(); expect(root.querySelector('[data-history-revision-id="oldest"] .analysis-run-report')!.open).toBe(false);
});

it.each([false, true])('keeps baseline focus across two changed follower cycles (developer=%s, #1375)', async (developer) => {
  setTechnicalLayerVisible(developer); const root = rootNode(); root.dataset['analysisBookId'] = 'book'; let tick = 0;
  const reading = () => ({ bookId: 'book', state: 'executing', stateLabel: `运行中 ${++tick}`, resultSetRevision: null, inspectedRevision: null, taskIntent: null, planEnvelope: null,
    planVersion: null, coverageManifest: null, run: null, taskOutcome: null, checkpoint: null, history: null, actions: { canPrepare: false }, updateControls: null, listPages: {}, namedNonEffects: [],
  }) as unknown as Parameters<ReturnType<typeof createBaselineAnalysisCard>['renderBaselineAnalysis']>[1];
  Object.assign(window, { ai7: { inspectBaselineAnalysis: async () => reading(), inspectCustomAnalysisDimensions: async () => ({ dimensions: [] }) } });
  const card = createBaselineAnalysisCard({ screen: root as unknown as HTMLElement, technicalDetails: details, taskDrawer: { refresh: vi.fn() }, setStatus: vi.fn(), rendererErrorMessage: () => '' } as unknown as Parameters<typeof createBaselineAnalysisCard>[0]);
  card.renderBaselineAnalysis(root as unknown as HTMLElement, reading(), '公开合成书');
  const selector = developer ? 'details summary' : 'button[data-analysis-tab="history"]';
  if (developer) root.querySelector('details')!.open = true; root.querySelector(selector)!.focus();
  for (let cycle = 0; cycle < 2; cycle++) {
    await vi.advanceTimersByTimeAsync(2000);
    if (developer) expect(root.querySelector('details')!.open).toBe(true); expect(document.activeElement).toBe(root.querySelector(selector));
  }
  expect(tick).toBeGreaterThanOrEqual(3);
});
