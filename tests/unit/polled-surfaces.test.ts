import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGlobalAttentionReader, mountGlobalAttention } from '../../src/renderer/global-attention.js';
import { createBaselineAnalysisCard } from '../../src/renderer/baseline-analysis-card.js';
import { mountEvaluation, type MountEvaluationOptions } from '../../src/renderer/evaluation.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
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
      itemId: 'task', group: 'active', state: 'analysis-running', blocked: false, at: new Date().toISOString(), book: { bookId: 'book', title: '公开合成书' },
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
